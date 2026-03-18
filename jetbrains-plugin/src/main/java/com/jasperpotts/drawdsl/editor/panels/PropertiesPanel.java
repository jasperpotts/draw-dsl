package com.jasperpotts.drawdsl.editor.panels;

import com.jasperpotts.drawdsl.editor.DrawDslBundle;

import com.intellij.util.ui.JBUI;

import javax.swing.*;
import javax.swing.border.TitledBorder;
import java.awt.*;

public class PropertiesPanel extends JPanel {
    public PropertiesPanel() {
        setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createEtchedBorder(),
                DrawDslBundle.message("panel.properties.title"),
                TitledBorder.LEFT, TitledBorder.TOP));
        setLayout(new GridBagLayout());

        GridBagConstraints labelC = new GridBagConstraints();
        labelC.anchor = GridBagConstraints.WEST;
        labelC.insets = JBUI.insets(2, 4);

        GridBagConstraints fieldC = new GridBagConstraints();
        fieldC.fill = GridBagConstraints.HORIZONTAL;
        fieldC.weightx = 1.0;
        fieldC.gridwidth = GridBagConstraints.REMAINDER;
        fieldC.insets = JBUI.insets(2, 0, 2, 4);

        String[] labels = {"ID:", "Label:", "Color:", "X:", "Y:"};
        for (String label : labels) {
            add(new JLabel(label), labelC);
            JTextField field = new JTextField();
            field.setEnabled(false);
            add(field, fieldC);
        }

        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));
    }
}
