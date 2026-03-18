package com.jasperpotts.drawdsl.editor.panels;

import com.intellij.util.ui.JBUI;
import com.jasperpotts.drawdsl.editor.DrawDslBundle;
import com.jasperpotts.drawdsl.editor.browser.DrawDslBrowserPanel;

import java.awt.Dimension;
import java.awt.GridLayout;
import java.util.Map;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JPanel;
import javax.swing.border.TitledBorder;

public class ShapePalettePanel extends JPanel {

    private static final Map<String, String> SHAPE_STYLES = Map.ofEntries(
            Map.entry("rect",          "rounded=0;whiteSpace=wrap;"),
            Map.entry("roundrect",     "rounded=1;whiteSpace=wrap;arcSize=10;"),
            Map.entry("circle",        "ellipse;whiteSpace=wrap;aspect=fixed;"),
            Map.entry("ellipse",       "ellipse;whiteSpace=wrap;"),
            Map.entry("diamond",       "rhombus;whiteSpace=wrap;"),
            Map.entry("parallelogram", "shape=parallelogram;whiteSpace=wrap;"),
            Map.entry("hexagon",       "shape=hexagon;whiteSpace=wrap;"),
            Map.entry("triangle",      "triangle;whiteSpace=wrap;"),
            Map.entry("cylinder",      "shape=cylinder;whiteSpace=wrap;"),
            Map.entry("cloud",         "shape=cloud;whiteSpace=wrap;"),
            Map.entry("star",          "shape=mxgraph.basic.star;whiteSpace=wrap;"),
            Map.entry("arrow",         "shape=mxgraph.arrows2.arrow;whiteSpace=wrap;"),
            Map.entry("callout",       "shape=callout;whiteSpace=wrap;"),
            Map.entry("document",      "shape=document;whiteSpace=wrap;"),
            Map.entry("actor",         "shape=mxgraph.flowchart.start_2;whiteSpace=wrap;"),
            Map.entry("database",      "shape=cylinder;whiteSpace=wrap;"),
            Map.entry("component",     "shape=component;whiteSpace=wrap;")
    );

    public ShapePalettePanel(DrawDslBrowserPanel browserPanel) {
        setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createEtchedBorder(),
                DrawDslBundle.message("panel.shapes.title"),
                TitledBorder.LEFT, TitledBorder.TOP));
        setLayout(new GridLayout(0, 4, 4, 4));

        for (Map.Entry<String, String> entry : SHAPE_STYLES.entrySet()) {
            String name = entry.getKey();
            String style = entry.getValue();
            JButton btn = new JButton(name);
            btn.setFont(btn.getFont().deriveFont(10f));
            btn.setMargin(JBUI.insets(2));
            btn.setToolTipText("Insert " + name);
            btn.addActionListener(e -> browserPanel.insertShape(style, 80, 80, 120, 60, name));
            add(btn);
        }

        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));
    }
}
