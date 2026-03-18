package com.jasperpotts.drawdsl.editor.panels;

import com.intellij.ui.components.JBScrollPane;
import com.jasperpotts.drawdsl.editor.browser.DrawDslBrowserPanel;

import javax.swing.*;

public class DrawDslSidePanel extends JBScrollPane {
    public DrawDslSidePanel(DrawDslBrowserPanel browserPanel) {
        JPanel content = new JPanel();
        content.setLayout(new BoxLayout(content, BoxLayout.Y_AXIS));

        content.add(new ShapePalettePanel(browserPanel));
        content.add(new ColorPalettePanel());
        content.add(new ConnectionStylePanel());
        content.add(new PropertiesPanel());

        setViewportView(content);
        setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
    }
}
