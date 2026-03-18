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
import org.cef.handler.CefLoadHandlerAdapter;
import org.cef.handler.CefRequestHandlerAdapter;
import org.cef.handler.CefResourceHandler;
import org.cef.handler.CefResourceRequestHandler;
import org.cef.handler.CefCookieAccessFilter;
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

        // 1. Register custom scheme handler BEFORE loading any URL
        browser.getJBCefClient().addRequestHandler(
                new DrawIoSchemeHandler(), browser.getCefBrowser());

        // 2. Set up JS→Java save callback
        saveQuery = JBCefJSQuery.create((JBCefBrowserBase) browser);
        saveQuery.addHandler((xml) -> {
            if (changeListener != null) {
                changeListener.onDiagramChanged(xml);
            }
            return null;
        });

        // 3. On page load: inject the callback reference, then send pending XML
        browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadEnd(CefBrowser cefBrowser, CefFrame frame, int statusCode) {
                if (!frame.isMain()) return;
                pageLoaded = true;
                // Inject save callback as a named JS function
                String inject = "window.__javaSaveCallback = function(xml) { "
                        + saveQuery.inject("xml") + " };";
                cefBrowser.executeJavaScript(inject, cefBrowser.getURL(), 0);
                // Send any diagram XML that arrived before page was ready
                if (pendingXml != null) {
                    String load = "loadDiagramXml(" + jsonString(pendingXml) + ");";
                    cefBrowser.executeJavaScript(load, cefBrowser.getURL(), 0);
                    pendingXml = null;
                }
            }
        }, browser.getCefBrowser());

        // 4. Load our custom editor page
        browser.loadURL("drawio://app/editor.html");
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
    // Scheme handler: intercepts drawio://app/... and serves from classpath
    // -------------------------------------------------------------------------

    private static class DrawIoSchemeHandler extends CefRequestHandlerAdapter {
        @Override
        public CefResourceRequestHandler getResourceRequestHandler(
                CefBrowser browser,
                CefFrame frame,
                CefRequest request,
                boolean isNavigation,
                boolean isDownload,
                String requestInitiator,
                BoolRef disableDefaultHandling) {

            String url = request.getURL();
            if (!url.startsWith("drawio://app/")) return null;

            // Extract file path (strip scheme+host, strip query string)
            String path = url.substring("drawio://app".length());
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            if (path.isEmpty() || path.equals("/")) path = "/editor.html";

            InputStream stream = DrawDslBrowserPanel.class
                    .getResourceAsStream("/drawio" + path);
            if (stream == null) return null;

            return new ClasspathResourceRequestHandler(stream, mimeTypeFor(path));
        }

        private String mimeTypeFor(String path) {
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
    }

    // -------------------------------------------------------------------------
    // CefResourceRequestHandler backed by a classpath InputStream
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
                CefBrowser browser, CefFrame frame, CefRequest request) {
            return null;
        }

        @Override
        public boolean onBeforeResourceLoad(
                CefBrowser browser, CefFrame frame, CefRequest request) {
            return false;
        }

        @Override
        public CefResourceHandler getResourceHandler(
                CefBrowser browser, CefFrame frame, CefRequest request) {
            return new InputStreamResourceHandler(stream, mimeType);
        }

        @Override
        public void onResourceRedirect(
                CefBrowser browser, CefFrame frame,
                CefRequest request, CefResponse response, StringRef newUrl) {
        }

        @Override
        public boolean onResourceResponse(
                CefBrowser browser, CefFrame frame,
                CefRequest request, CefResponse response) {
            return false;
        }

        @Override
        public void onResourceLoadComplete(
                CefBrowser browser, CefFrame frame,
                CefRequest request, CefResponse response,
                CefURLRequest.Status status, long receivedContentLength) {
        }

        @Override
        public void onProtocolExecution(
                CefBrowser browser, CefFrame frame,
                CefRequest request, BoolRef allowOsExecution) {
        }
    }

    // -------------------------------------------------------------------------
    // CefResourceHandler that streams data from an InputStream
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
            responseLength.set(-1); // unknown length; stream until exhausted
        }

        @Override
        public boolean readResponse(
                byte[] dataOut, int bytesToRead, IntRef bytesRead, CefCallback callback) {
            try {
                int read = stream.read(dataOut, 0, bytesToRead);
                if (read > 0) {
                    bytesRead.set(read);
                    return true;
                } else {
                    bytesRead.set(0);
                    stream.close();
                    return false;
                }
            } catch (IOException e) {
                bytesRead.set(0);
                return false;
            }
        }

        @Override
        public void cancel() {
            try {
                stream.close();
            } catch (IOException ignored) {
            }
        }
    }
}
