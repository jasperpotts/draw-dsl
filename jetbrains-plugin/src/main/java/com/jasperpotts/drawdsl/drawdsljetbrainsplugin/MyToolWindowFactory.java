package com.jasperpotts.drawdsl.drawdsljetbrainsplugin;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import org.jetbrains.annotations.NotNull;

import javax.swing.*;
import java.awt.*;
import java.util.Random;

public class MyToolWindowFactory implements ToolWindowFactory {
    @Override
    public boolean shouldBeAvailable(@NotNull Project project) {
        return true;
    }

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        JPanel panel = new JPanel(new BorderLayout(0, 8));
        panel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        JLabel label = new JLabel("The random number is: ?");
        panel.add(label, BorderLayout.NORTH);

        JButton button = new JButton("Shuffle");
        button.addActionListener(e -> {
            int number = new Random().nextInt(1000);
            label.setText("The random number is: " + number);
        });

        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        buttonPanel.add(button);
        panel.add(buttonPanel, BorderLayout.CENTER);

        Content content = ContentFactory.getInstance().createContent(panel, "My Tool Window", false);
        toolWindow.getContentManager().addContent(content);
    }
}
