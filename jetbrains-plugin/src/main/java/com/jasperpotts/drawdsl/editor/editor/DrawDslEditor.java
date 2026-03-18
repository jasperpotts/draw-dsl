package com.jasperpotts.drawdsl.editor.editor;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.fileEditor.FileDocumentManager;
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
    private static final String EMPTY_DIAGRAM =
            "<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel>";

    private final Project project;
    private final VirtualFile file;
    private final JSplitPane mainPanel;
    private final DrawDslBrowserPanel browserPanel;

    public DrawDslEditor(@NotNull Project project, @NotNull VirtualFile file) {
        this.project = project;
        this.file = file;

        browserPanel = new DrawDslBrowserPanel();
        Disposer.register(this, browserPanel);

        DrawDslSidePanel sidePanel = new DrawDslSidePanel();

        mainPanel = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, browserPanel, sidePanel);
        mainPanel.setResizeWeight(0.75);
        mainPanel.setDividerSize(4);

        // Load file content into the browser
        Document document = FileDocumentManager.getInstance().getDocument(file);
        if (document != null) {
            browserPanel.loadDiagramXml(extractXml(document.getText()));
        }

        // On diagram change: write back to the document so Ctrl+S / auto-save work normally
        browserPanel.setDiagramChangeListener(xml -> ApplicationManager.getApplication().invokeLater(() -> {
            Document doc = FileDocumentManager.getInstance().getDocument(file);
            if (doc != null && doc.isWritable()) {
                WriteCommandAction.runWriteCommandAction(
                        project,
                        DrawDslBundle.message("editor.command.update"),
                        null,
                        () -> doc.setText(xml)
                );
            }
        }));
    }

    /**
     * Extracts the mxGraphModel XML from file content.
     * Handles both raw mxGraphModel XML and SVG files with embedded diagram data.
     */
    private static String extractXml(String content) {
        int idx = content.indexOf("<mxGraphModel");
        if (idx >= 0) {
            return content.substring(idx);
        }
        return EMPTY_DIAGRAM;
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
        Document document = FileDocumentManager.getInstance().getDocument(file);
        return document != null && FileDocumentManager.getInstance().isDocumentUnsaved(document);
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
