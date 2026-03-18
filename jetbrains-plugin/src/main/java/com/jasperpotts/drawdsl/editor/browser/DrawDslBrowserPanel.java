package com.jasperpotts.drawdsl.editor.browser;

import com.intellij.openapi.Disposable;
import com.intellij.openapi.util.Disposer;
import com.intellij.ui.jcef.JBCefApp;
import com.intellij.ui.jcef.JBCefBrowser;
import com.jasperpotts.drawdsl.editor.DrawDslBundle;

import javax.swing.*;
import java.awt.*;

public class DrawDslBrowserPanel extends JPanel implements Disposable {
    private JBCefBrowser browser;

    public DrawDslBrowserPanel() {
        super(new BorderLayout());

        if (JBCefApp.isSupported()) {
            browser = new JBCefBrowser();
            browser.loadHTML(getPlaceholderHtml());
            add(browser.getComponent(), BorderLayout.CENTER);
        } else {
            JLabel fallback = new JLabel(DrawDslBundle.message("browser.fallback.text"));
            fallback.setHorizontalAlignment(SwingConstants.CENTER);
            add(fallback, BorderLayout.CENTER);
        }
    }

    private String getPlaceholderHtml() {
        return """
                <!DOCTYPE html>
                <html>
                <head>
                <style>
                    body {
                        margin: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        font-family: system-ui, sans-serif;
                        background: #2b2b2b;
                        color: #a9b7c6;
                    }
                    .container { text-align: center; }
                    h2 { color: #6b9fff; margin-bottom: 8px; }
                    p { color: #808080; }
                </style>
                </head>
                <body>
                    <div class="container">
                        <h2>Draw DSL Canvas</h2>
                        <p>draw.io integration will be loaded here</p>
                    </div>
                </body>
                </html>
                """;
    }

    @Override
    public void dispose() {
        if (browser != null) {
            Disposer.dispose(browser);
            browser = null;
        }
    }
}
