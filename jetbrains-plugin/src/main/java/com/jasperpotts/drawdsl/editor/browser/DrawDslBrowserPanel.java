package com.jasperpotts.drawdsl.editor.browser;

import com.intellij.openapi.Disposable;
import com.intellij.openapi.util.Disposer;
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

    public interface DiagramChangeListener {
        void onDiagramChanged(String xml);
    }

    // Fake origin used as base URL for loadHTML — lets CEF route relative script
    // requests through our request handler without any real network call.
    private static final String BASE_ORIGIN = "http://drawio-local";

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

        // Set up JS→Java save callback
        saveQuery = JBCefJSQuery.create((JBCefBrowserBase) browser);
        saveQuery.addHandler((xml) -> {
            if (changeListener != null) changeListener.onDiagramChanged(xml);
            return null;
        });

        // On page load: inject callback, then flush any pending XML
        browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadEnd(CefBrowser cefBrowser, CefFrame frame, int statusCode) {
                if (!frame.isMain()) return;
                pageLoaded = true;
                String inject = "window.__javaSaveCallback = function(xml) { "
                        + saveQuery.inject("xml") + " };";
                cefBrowser.executeJavaScript(inject, cefBrowser.getURL(), 0);
                if (pendingXml != null) {
                    cefBrowser.executeJavaScript(
                            "loadDiagramXml(" + jsonString(pendingXml) + ");",
                            cefBrowser.getURL(), 0);
                    pendingXml = null;
                }
            }
        }, browser.getCefBrowser());

        // Load via our intercepted scheme so the page URL is http://drawio-local/editor.html
        // (not the virtual file:///jbcefbrowser/ URL that loadHTML produces, which breaks
        // JCEF's GPU compositing and prevents SVG content from painting).
        browser.loadURL(BASE_ORIGIN + "/editor.html");
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
