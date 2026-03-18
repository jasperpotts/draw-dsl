package com.jasperpotts.drawdsl.editor.panels;

import com.jasperpotts.drawdsl.editor.DrawDslBundle;
import java.awt.Dimension;
import java.awt.GridLayout;
import java.awt.Insets;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JPanel;
import javax.swing.border.TitledBorder;

public class ShapePalettePanel extends JPanel {
    private static final String[] SHAPES = {
            "rect", "roundrect", "circle", "ellipse", "diamond",
            "parallelogram", "hexagon", "triangle", "cylinder",
            "cloud", "star", "arrow", "callout", "document",
            "actor", "database", "component"
    };

    public ShapePalettePanel() {
        setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createEtchedBorder(),
                DrawDslBundle.message("panel.shapes.title"),
                TitledBorder.LEFT, TitledBorder.TOP));
        setLayout(new GridLayout(0, 4, 4, 4));

        for (String shape : SHAPES) {
            JButton btn = new JButton(shape);
            btn.setFont(btn.getFont().deriveFont(10f));
            btn.setMargin(new Insets(2, 2, 2, 2));
            btn.setToolTipText("Insert " + shape);
            add(btn);
        }

        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));
    }
}
