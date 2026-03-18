package com.jasperpotts.drawdsl.editor.panels;

import com.jasperpotts.drawdsl.editor.DrawDslBundle;

import javax.swing.*;
import javax.swing.border.TitledBorder;
import java.awt.*;

public class ConnectionStylePanel extends JPanel {
    public ConnectionStylePanel() {
        setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createEtchedBorder(),
                DrawDslBundle.message("panel.connections.title"),
                TitledBorder.LEFT, TitledBorder.TOP));
        setLayout(new FlowLayout(FlowLayout.LEFT));

        add(new JLabel("Arrow types and importance — coming soon"));

        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));
    }
}
