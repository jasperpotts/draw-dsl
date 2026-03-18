package com.jasperpotts.drawdsl.editor.editor;

import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.fileEditor.FileEditorState;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.util.UserDataHolderBase;
import com.intellij.openapi.vfs.VirtualFile;
import com.jasperpotts.drawdsl.editor.DrawDslBundle;
import com.jasperpotts.drawdsl.editor.browser.DrawDslBrowserPanel;
import com.jasperpotts.drawdsl.editor.panels.DrawDslSidePanel;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.*;
import java.beans.PropertyChangeListener;

public class DrawDslEditor extends UserDataHolderBase implements FileEditor {
    private final VirtualFile file;
    private final JSplitPane mainPanel;
    private final DrawDslBrowserPanel browserPanel;

    public DrawDslEditor(@SuppressWarnings("unused") @NotNull Project project, @NotNull VirtualFile file) {
        this.file = file;

        browserPanel = new DrawDslBrowserPanel();
        Disposer.register(this, browserPanel);

        DrawDslSidePanel sidePanel = new DrawDslSidePanel();

        mainPanel = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, browserPanel, sidePanel);
        mainPanel.setResizeWeight(0.75);
        mainPanel.setDividerSize(4);
    }

    @Override
    public @NotNull JComponent getComponent() {
        return mainPanel;
    }

    @Override
    public @Nullable JComponent getPreferredFocusedComponent() {
        return browserPanel;
    }

    @Override
    public @NotNull String getName() {
        return DrawDslBundle.message("editor.drawdsl.name");
    }

    @Override
    public void setState(@NotNull FileEditorState state) {
    }

    @Override
    public boolean isModified() {
        return false;
    }

    @Override
    public boolean isValid() {
        return file.isValid();
    }

    @Override
    public @NotNull VirtualFile getFile() {
        return file;
    }

    @Override
    public void addPropertyChangeListener(@NotNull PropertyChangeListener listener) {
    }

    @Override
    public void removePropertyChangeListener(@NotNull PropertyChangeListener listener) {
    }

    @Override
    public void dispose() {
    }
}
