package com.jasperpotts.drawdsl.editor.panels;

import com.jasperpotts.drawdsl.editor.DrawDslBundle;

import com.intellij.ui.JBColor;

import javax.swing.*;
import javax.swing.border.TitledBorder;
import java.awt.*;

public class ColorPalettePanel extends JPanel {
    private static final JBColor[] COLORS = {
            new JBColor(0x4A90D9, 0x4A90D9), // c0
            new JBColor(0xD94A4A, 0xD94A4A), // c1
            new JBColor(0x4AD97A, 0x4AD97A), // c2
            new JBColor(0xD9C84A, 0xD9C84A), // c3
            new JBColor(0x9B59B6, 0x9B59B6), // c4
            new JBColor(0xE67E22, 0xE67E22), // c5
            new JBColor(0x1ABC9C, 0x1ABC9C), // c6
            new JBColor(0xE84393, 0xE84393), // c7
            new JBColor(0x636E72, 0x636E72), // c8
            new JBColor(0x2D3436, 0x2D3436), // c9
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
