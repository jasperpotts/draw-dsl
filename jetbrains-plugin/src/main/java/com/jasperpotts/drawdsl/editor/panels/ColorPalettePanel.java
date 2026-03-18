package com.jasperpotts.drawdsl.editor.panels;

import com.jasperpotts.drawdsl.editor.DrawDslBundle;

import javax.swing.*;
import javax.swing.border.TitledBorder;
import java.awt.*;

public class ColorPalettePanel extends JPanel {
    private static final Color[] COLORS = {
            new Color(0x4A90D9), // c0
            new Color(0xD94A4A), // c1
            new Color(0x4AD97A), // c2
            new Color(0xD9C84A), // c3
            new Color(0x9B59B6), // c4
            new Color(0xE67E22), // c5
            new Color(0x1ABC9C), // c6
            new Color(0xE84393), // c7
            new Color(0x636E72), // c8
            new Color(0x2D3436), // c9
    };

    public ColorPalettePanel() {
        setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createEtchedBorder(),
                DrawDslBundle.message("panel.colors.title"),
                TitledBorder.LEFT, TitledBorder.TOP));
        setLayout(new GridLayout(2, 5, 4, 4));

        for (int i = 0; i < COLORS.length; i++) {
            JButton swatch = new JButton();
            swatch.setBackground(COLORS[i]);
            swatch.setOpaque(true);
            swatch.setPreferredSize(new Dimension(28, 28));
            swatch.setToolTipText("c" + i);
            add(swatch);
        }

        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));
    }
}
