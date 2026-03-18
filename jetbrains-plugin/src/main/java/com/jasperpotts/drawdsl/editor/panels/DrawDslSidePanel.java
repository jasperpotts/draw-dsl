package com.jasperpotts.drawdsl.editor.panels;

import com.intellij.ui.components.JBScrollPane;

import javax.swing.*;

public class DrawDslSidePanel extends JBScrollPane {
    public DrawDslSidePanel() {
        JPanel content = new JPanel();
        content.setLayout(new BoxLayout(content, BoxLayout.Y_AXIS));

        content.add(new ShapePalettePanel());
        content.add(new ColorPalettePanel());
        content.add(new ConnectionStylePanel());
        content.add(new PropertiesPanel());

        setViewportView(content);
        setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
    }
}
