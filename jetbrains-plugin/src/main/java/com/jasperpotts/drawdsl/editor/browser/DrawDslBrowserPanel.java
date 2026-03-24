package com.jasperpotts.drawdsl.editor.browser;

import com.intellij.ide.ui.LafManagerListener;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.util.Disposer;
import com.intellij.util.messages.MessageBusConnection;
import com.intellij.ui.JBColor;
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

/**
 * Embeds the full draw.io editor via JCEF using draw.io's embed protocol.
 * <p>
 * Communication uses the standard embed protocol (proto=json):
 * <ul>
 *   <li>draw.io → Java: {@code {event: 'init'}}, {@code {event: 'autosave', xml: '...'}}, {@code {event: 'save', xml: '...'}}</li>
 *   <li>Java → draw.io: {@code {action: 'load', xml: '...', autosave: 1}}</li>
 * </ul>
 * <p>
 * The trick: editor.html sets {@code window.opener = window} before draw.io loads.
 * draw.io sends messages to {@code window.opener.postMessage(...)}, which becomes
 * {@code window.postMessage(...)} — so messages stay in-page where our listener catches them.
 */
public class DrawDslBrowserPanel extends JPanel implements Disposable {

    private static final Logger LOG = Logger.getInstance(DrawDslBrowserPanel.class);

    public interface DiagramChangeListener {
        void onDiagramChanged(String xml);
    }

    private static final String BASE_ORIGIN = "http://drawio-local";

    // Bridge JS is now in editor.html (must run before draw.io scripts).
    // Java only needs to set __javaSaveCallback and __pendingLoadXml.

    private JBCefBrowser browser;
    private JBCefJSQuery saveQuery;
    private DiagramChangeListener changeListener;
    private volatile boolean pageLoaded = false;
    private String pendingXml;

    public DrawDslBrowserPanel() {
        super(new BorderLayout());

        boolean isDark = !JBColor.isBright();
        setBackground(isDark ? new Color(0x1e1e1e) : Color.WHITE);

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

        // Route JS console to IntelliJ log
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

        // JS→Java bridge for save callbacks
        saveQuery = JBCefJSQuery.create((JBCefBrowserBase) browser);
        saveQuery.addHandler((xml) -> {
            if (changeListener != null) changeListener.onDiagramChanged(xml);
            return null;
        });

        // On page load: wire up the Java←JS save callback and queue pending XML.
        // The embed protocol bridge (message listener, __loadDiagram) is already
        // in editor.html so it's ready before draw.io sends {event: 'init'}.
        browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadEnd(CefBrowser cefBrowser, CefFrame frame, int statusCode) {
                if (!frame.isMain()) return;
                pageLoaded = true;

                // Wire up JS→Java save callback
                String inject = "window.__javaSaveCallback = function(xml) { "
                        + saveQuery.inject("xml") + " };";
                cefBrowser.executeJavaScript(inject, cefBrowser.getURL(), 0);

                // Queue pending diagram XML via the reactive property in editor.html.
                // The setter triggers __loadDiagram immediately if draw.io is ready,
                // or holds it until the 'init' event fires — no race condition.
                if (pendingXml != null) {
                    cefBrowser.executeJavaScript(
                            "window.__pendingLoadXml = " + jsonString(pendingXml) + ";",
                            cefBrowser.getURL(), 0);
                    pendingXml = null;
                }
            }
        }, browser.getCefBrowser());

        // Live theme switching
        MessageBusConnection conn = ApplicationManager.getApplication()
                .getMessageBus().connect();
        Disposer.register(this, conn);
        conn.subscribe(LafManagerListener.TOPIC, new LafManagerListener() {
            @Override
            public void lookAndFeelChanged(@org.jetbrains.annotations.NotNull com.intellij.ide.ui.LafManager manager) {
                if (browser != null) {
                    reloadWithCurrentTheme();
                }
            }
        });

        // Load draw.io with embed protocol params
        browser.loadURL(buildEditorUrl(isDark));
        add(browser.getComponent(), BorderLayout.CENTER);
    }

    private String buildEditorUrl(boolean isDark) {
        return BASE_ORIGIN + "/editor.html"
                + "?embed=1"
                + "&proto=json"
                + "&spin=1"
                + "&libraries=1"
                + "&dark=" + (isDark ? "1" : "0")
                + "&v=" + System.currentTimeMillis();
    }

    /**
     * Reload the editor with the current IDE theme.
     * draw.io's dark mode is set via URL param at load time.
     */
    private void reloadWithCurrentTheme() {
        boolean isDark = !JBColor.isBright();
        setBackground(isDark ? new Color(0x1e1e1e) : Color.WHITE);
        // TODO: investigate if draw.io has a runtime dark mode toggle to avoid full reload
        // For now, we don't reload — the user can reopen the file.
        // A full reload would lose unsaved changes.
    }

    public void setDiagramChangeListener(DiagramChangeListener listener) {
        this.changeListener = listener;
    }

    public void loadDiagramXml(String xml) {
        if (browser == null) return;
        if (pageLoaded) {
            // Reactive property in editor.html handles the timing
            browser.getCefBrowser().executeJavaScript(
                    "window.__pendingLoadXml = " + jsonString(xml) + ";",
                    browser.getCefBrowser().getURL(), 0);
        } else {
            pendingXml = xml;
        }
    }

    public void insertShape(String style, int x, int y, int w, int h, String label) {
        // Not applicable in full draw.io UI mode — shapes are added via draw.io's own sidebar
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
