package com.jasperpotts.drawdsl.editor.browser;

import com.intellij.ide.ui.LafManagerListener;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.util.Disposer;
import com.intellij.util.messages.MessageBusConnection;
import com.intellij.ui.jcef.JBCefApp;
import com.intellij.ui.jcef.JBCefBrowser;
import com.intellij.ui.jcef.JBCefBrowserBase;
import com.intellij.ui.jcef.JBCefJSQuery;
import com.jasperpotts.drawdsl.editor.DrawDslBundle;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefCallback;
import org.cef.handler.CefCookieAccessFilter;
import org.cef.handler.CefLoadHandlerAdapter;
import org.cef.handler.CefRequestHandlerAdapter;
import org.cef.handler.CefResourceHandler;
import org.cef.handler.CefResourceRequestHandler;
import org.cef.misc.BoolRef;
import org.cef.misc.IntRef;
import org.cef.misc.StringRef;
import org.cef.network.CefRequest;
import org.cef.network.CefResponse;
import org.cef.network.CefURLRequest;

import javax.swing.*;
import java.awt.*;
import java.io.IOException;
import java.io.InputStream;

public class DrawDslBrowserPanel extends JPanel implements Disposable {

    private static final Logger LOG = Logger.getInstance(DrawDslBrowserPanel.class);

    public interface DiagramChangeListener {
        void onDiagramChanged(String xml);
    }

    // Fake origin used as base URL for loadHTML — lets CEF route relative script
    // requests through our request handler without any real network call.
    private static final String BASE_ORIGIN = "http://drawio-local";

    /**
     * JavaScript injected after page load to configure the canvas.
     * Injected from Java (not editor.html) so it works regardless of JCEF caching.
     */
    private static final String CANVAS_CONFIG_JS = """
            (function() {
                // Infinite canvas — disable the white page overlay that hides the grid
                graph.defaultPageVisible = false;
                graph.pageVisible = false;
                graph.pageBreaksVisible = false;

                // Grid
                graph.setGridEnabled(true);
                graph.setGridSize(10);

                // Pan: middle-mouse drag
                graph.panningHandler.panningEnabled = true;
                graph.panningHandler.useLeftButtonForPanning = false;

                // Spacebar grab-hand pan (Figma/Illustrator style)
                var container = graph.container;
                var spaceDown = false;
                document.addEventListener('keydown', function(evt) {
                    if (evt.code === 'Space' && !evt.repeat && !spaceDown) {
                        var tag = evt.target && evt.target.tagName;
                        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                        spaceDown = true;
                        graph.panningHandler.useLeftButtonForPanning = true;
                        container.style.cursor = 'grab';
                        evt.preventDefault();
                    }
                });
                document.addEventListener('keyup', function(evt) {
                    if (evt.code === 'Space') {
                        spaceDown = false;
                        graph.panningHandler.useLeftButtonForPanning = false;
                        container.style.cursor = '';
                    }
                });
                container.addEventListener('mousedown', function() {
                    if (spaceDown) container.style.cursor = 'grabbing';
                });
                container.addEventListener('mouseup', function() {
                    if (spaceDown) container.style.cursor = 'grab';
                });

                // Zoom: Ctrl/Cmd + scroll wheel
                container.addEventListener('wheel', function(evt) {
                    if (evt.ctrlKey || evt.metaKey) {
                        evt.preventDefault();
                        if (evt.deltaY < 0) graph.zoomIn();
                        else graph.zoomOut();
                    }
                }, { passive: false });

                // Override loadDiagramXml to handle <mxfile> (compressed) format
                window.loadDiagramXml = function(xml) {
                    var doc = mxUtils.parseXml(xml);
                    var node = Editor.extractGraphModel(doc.documentElement, true);
                    if (node == null) node = doc.documentElement;
                    editor.setGraphXml(node);
                    // Force our canvas settings after resetGraph() overrides them
                    graph.pageVisible = false;
                    graph.pageBreaksVisible = false;
                    graph.gridEnabled = true;
                    graph.defaultParent = null;
                    graph.fit();
                };

                // Theme support — called from Java
                window.applyTheme = function(isDark) {
                    var bg = isDark ? '#1e1e1e' : '#ffffff';
                    var gridColor = isDark ? '#424242' : '#d0d0d0';
                    document.body.style.background = bg;
                    graph.container.style.background = bg;
                    graph.view.gridColor = gridColor;
                    graph.view.defaultGridColor = gridColor;
                    graph.refresh();
                };

                console.log('[draw-dsl] canvas config injected');
            })();
            """;

    private JBCefBrowser browser;
    private JBCefJSQuery saveQuery;
    private DiagramChangeListener changeListener;
    private volatile boolean pageLoaded = false;
    private String pendingXml;

    public DrawDslBrowserPanel() {
        super(new BorderLayout());

        if (!JBCefApp.isSupported()) {
            JLabel fallback = new JLabel(DrawDslBundle.message("browser.fallback.text"));
            fallback.setHorizontalAlignment(SwingConstants.CENTER);
            add(fallback, BorderLayout.CENTER);
            return;
        }

        browser = new JBCefBrowser();

        // Intercept http://drawio-local/... and serve from classpath /drawio/...
        browser.getJBCefClient().addRequestHandler(
                new DrawIoRequestHandler(), browser.getCefBrowser());

        // Route JS console.log/warn/error to the IntelliJ log (Help → Show Log in Finder)
        browser.getJBCefClient().addDisplayHandler(
                new org.cef.handler.CefDisplayHandlerAdapter() {
                    @Override
                    public boolean onConsoleMessage(CefBrowser b,
                            org.cef.CefSettings.LogSeverity level,
                            String message, String source, int line) {
                        String tag = "[JCEF:" + line + "] " + message;
                        switch (level) {
                            case LOGSEVERITY_ERROR -> LOG.error(tag);
                            case LOGSEVERITY_WARNING -> LOG.warn(tag);
                            default -> LOG.info(tag);
                        }
                        return false;
                    }
                }, browser.getCefBrowser());

        // Set up JS→Java save callback
        saveQuery = JBCefJSQuery.create((JBCefBrowserBase) browser);
        saveQuery.addHandler((xml) -> {
            if (changeListener != null) changeListener.onDiagramChanged(xml);
            return null;
        });

        // On page load: inject callback, canvas config, and flush any pending XML.
        // All JS configuration is injected here (not in editor.html) so it works
        // even when JCEF serves a cached version of the HTML.
        browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadEnd(CefBrowser cefBrowser, CefFrame frame, int statusCode) {
                if (!frame.isMain()) return;
                pageLoaded = true;

                // 1. Save callback bridge
                String inject = "window.__javaSaveCallback = function(xml) { "
                        + saveQuery.inject("xml") + " };";
                cefBrowser.executeJavaScript(inject, cefBrowser.getURL(), 0);

                // 2. Canvas configuration: infinite canvas, grid, zoom, pan
                cefBrowser.executeJavaScript(CANVAS_CONFIG_JS, cefBrowser.getURL(), 0);

                // 3. Load pending diagram XML
                if (pendingXml != null) {
                    cefBrowser.executeJavaScript(
                            "loadDiagramXml(" + jsonString(pendingXml) + ");",
                            cefBrowser.getURL(), 0);
                    pendingXml = null;
                }

                // 4. Apply IDE theme
                applyCurrentTheme(cefBrowser);
            }
        }, browser.getCefBrowser());

        // Live theme switching
        MessageBusConnection conn = ApplicationManager.getApplication()
                .getMessageBus().connect();
        Disposer.register(this, conn);
        conn.subscribe(LafManagerListener.TOPIC, new LafManagerListener() {
            @Override
            public void lookAndFeelChanged(@org.jetbrains.annotations.NotNull com.intellij.ide.ui.LafManager manager) {
                if (pageLoaded && browser != null) {
                    applyCurrentTheme(browser.getCefBrowser());
                }
            }
        });

        // Load via our intercepted scheme so the page URL is http://drawio-local/editor.html
        // (not the virtual file:///jbcefbrowser/ URL that loadHTML produces, which breaks
        // JCEF's GPU compositing and prevents SVG content from painting).
        browser.loadURL(BASE_ORIGIN + "/editor.html?v=" + System.currentTimeMillis());
        add(browser.getComponent(), BorderLayout.CENTER);
    }

    public void setDiagramChangeListener(DiagramChangeListener listener) {
        this.changeListener = listener;
    }

    public void loadDiagramXml(String xml) {
        if (browser == null) return;
        if (pageLoaded) {
            browser.getCefBrowser().executeJavaScript(
                    "loadDiagramXml(" + jsonString(xml) + ");",
                    browser.getCefBrowser().getURL(), 0);
        } else {
            pendingXml = xml;
        }
    }

    public void insertShape(String style, int x, int y, int w, int h, String label) {
        if (browser == null || !pageLoaded) return;
        browser.getCefBrowser().executeJavaScript(
                "insertShape(" + jsonString(style) + "," + x + "," + y + "," + w + "," + h + "," + jsonString(label) + ");",
                browser.getCefBrowser().getURL(), 0);
    }

    private void applyCurrentTheme(CefBrowser cefBrowser) {
        var laf = javax.swing.UIManager.getLookAndFeel();
        boolean isDark = laf != null &&
                (laf.getName().contains("Dark") || laf.getName().contains("Darcula"));
        cefBrowser.executeJavaScript(
                "applyTheme(" + isDark + ");",
                cefBrowser.getURL(), 0);
    }

    private static String jsonString(String v) {
        return "\"" + v
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
                + "\"";
    }

    @Override
    public void dispose() {
        if (saveQuery != null) {
            Disposer.dispose(saveQuery);
            saveQuery = null;
        }
        if (browser != null) {
            Disposer.dispose(browser);
            browser = null;
        }
    }

    // -------------------------------------------------------------------------
    // Intercept http://drawio-local/... → serve from classpath /drawio/...
    // CEF calls getResourceRequestHandler before any DNS/network operation,
    // so the unresolvable host never causes a network error.
    // -------------------------------------------------------------------------

    private static class DrawIoRequestHandler extends CefRequestHandlerAdapter {
        @Override
        public CefResourceRequestHandler getResourceRequestHandler(
                CefBrowser browser, CefFrame frame, CefRequest request,
                boolean isNavigation, boolean isDownload,
                String requestInitiator, BoolRef disableDefaultHandling) {

            String url = request.getURL();
            if (!url.startsWith(BASE_ORIGIN + "/")) return null;

            String path = url.substring(BASE_ORIGIN.length());
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);

            InputStream stream = DrawDslBrowserPanel.class.getResourceAsStream("/drawio" + path);
            if (stream == null) return null;

            return new ClasspathResourceRequestHandler(stream, mimeTypeFor(path));
        }
    }

    private static String mimeTypeFor(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js"))   return "application/javascript";
        if (path.endsWith(".css"))  return "text/css";
        if (path.endsWith(".svg"))  return "image/svg+xml";
        if (path.endsWith(".png"))  return "image/png";
        if (path.endsWith(".gif"))  return "image/gif";
        if (path.endsWith(".ico"))  return "image/x-icon";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".xml"))  return "application/xml";
        if (path.endsWith(".txt"))  return "text/plain";
        return "application/octet-stream";
    }

    // -------------------------------------------------------------------------
    // CefResourceRequestHandler — wraps a classpath InputStream
    // -------------------------------------------------------------------------

    private static class ClasspathResourceRequestHandler implements CefResourceRequestHandler {
        private final InputStream stream;
        private final String mimeType;

        ClasspathResourceRequestHandler(InputStream stream, String mimeType) {
            this.stream = stream;
            this.mimeType = mimeType;
        }

        @Override
        public CefCookieAccessFilter getCookieAccessFilter(
                CefBrowser b, CefFrame f, CefRequest r) { return null; }

        @Override
        public boolean onBeforeResourceLoad(
                CefBrowser b, CefFrame f, CefRequest r) { return false; }

        @Override
        public CefResourceHandler getResourceHandler(
                CefBrowser b, CefFrame f, CefRequest r) {
            return new InputStreamResourceHandler(stream, mimeType);
        }

        @Override
        public void onResourceRedirect(
                CefBrowser b, CefFrame f, CefRequest req,
                CefResponse res, StringRef newUrl) {}

        @Override
        public boolean onResourceResponse(
                CefBrowser b, CefFrame f, CefRequest req, CefResponse res) { return false; }

        @Override
        public void onResourceLoadComplete(
                CefBrowser b, CefFrame f, CefRequest req, CefResponse res,
                CefURLRequest.Status status, long receivedContentLength) {}

        @Override
        public void onProtocolExecution(
                CefBrowser b, CefFrame f, CefRequest req, BoolRef allowOsExecution) {}
    }

    // -------------------------------------------------------------------------
    // CefResourceHandler — streams data from an InputStream
    // -------------------------------------------------------------------------

    private static class InputStreamResourceHandler implements CefResourceHandler {
        private final InputStream stream;
        private final String mimeType;

        InputStreamResourceHandler(InputStream stream, String mimeType) {
            this.stream = stream;
            this.mimeType = mimeType;
        }

        @Override
        public boolean processRequest(CefRequest request, CefCallback callback) {
            callback.Continue();
            return true;
        }

        @Override
        public void getResponseHeaders(
                CefResponse response, IntRef responseLength, StringRef redirectUrl) {
            response.setMimeType(mimeType);
            response.setStatus(200);
            response.setHeaderByName("Cache-Control", "no-store", true);
            responseLength.set(-1);
        }

        @Override
        public boolean readResponse(
                byte[] dataOut, int bytesToRead, IntRef bytesRead, CefCallback callback) {
            try {
                int n = stream.read(dataOut, 0, bytesToRead);
                if (n > 0) { bytesRead.set(n); return true; }
                bytesRead.set(0);
                stream.close();
                return false;
            } catch (IOException e) {
                bytesRead.set(0);
                return false;
            }
        }

        @Override
        public void cancel() {
            try { stream.close(); } catch (IOException ignored) {}
        }
    }
}
