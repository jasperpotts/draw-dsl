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
            "<mxGraphModel>" +
            "<root>" +
            "<mxCell id=\"0\"/>" +
            "<mxCell id=\"1\" parent=\"0\"/>" +
            "</root>" +
            "</mxGraphModel>";

    private final Project project;
    private final VirtualFile file;
    private final JSplitPane mainPanel;
    private final DrawDslBrowserPanel browserPanel;
    /** Original file content, used to re-embed XML on save for .drawio.svg files */
    private String originalFileContent;

    public DrawDslEditor(@NotNull Project project, @NotNull VirtualFile file) {
        this.project = project;
        this.file = file;

        browserPanel = new DrawDslBrowserPanel();
        Disposer.register(this, browserPanel);

        DrawDslSidePanel sidePanel = new DrawDslSidePanel(browserPanel);

        mainPanel = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, browserPanel, sidePanel);
        mainPanel.setResizeWeight(0.75);
        mainPanel.setDividerSize(4);

        // Load file content into the browser
        Document document = FileDocumentManager.getInstance().getDocument(file);
        if (document != null) {
            originalFileContent = document.getText();
            browserPanel.loadDiagramXml(extractXml(originalFileContent));
        }

        // On diagram change: re-embed XML into the original SVG wrapper (for .drawio.svg)
        // or write raw XML (for .drawio files)
        browserPanel.setDiagramChangeListener(xml -> ApplicationManager.getApplication().invokeLater(() -> {
            Document doc = FileDocumentManager.getInstance().getDocument(file);
            if (doc != null && doc.isWritable()) {
                String output = embedXml(xml);
                WriteCommandAction.runWriteCommandAction(
                        project,
                        DrawDslBundle.message("editor.command.update"),
                        null,
                        () -> doc.setText(output)
                );
            }
        }));
    }

    /**
     * Extracts the draw.io XML from file content.
     * Priority: content attribute (SVG wrapper) → raw mxfile/mxGraphModel → fallback.
     */
    private static String extractXml(String content) {
        // .drawio.svg: XML is HTML-entity-encoded in the content attribute on <svg>
        // Check this FIRST — the SVG body may also contain literal <mxGraphModel
        // in comments or foreignObject, and we want the full encoded source.
        int cStart = content.indexOf("content=\"");
        if (cStart >= 0) {
            cStart += "content=\"".length();
            int cEnd = content.indexOf("\"", cStart);
            if (cEnd > cStart) {
                String encoded = content.substring(cStart, cEnd);
                return encoded
                        .replace("&lt;", "<")
                        .replace("&gt;", ">")
                        .replace("&amp;", "&")
                        .replace("&quot;", "\"")
                        .replace("&#10;", "\n")
                        .replace("&#xa;", "\n");
            }
        }

        // Raw mxGraphModel or mxfile XML (e.g. .drawio files)
        int idx = content.indexOf("<mxGraphModel");
        if (idx >= 0) {
            return content.substring(idx);
        }
        idx = content.indexOf("<mxfile");
        if (idx >= 0) {
            return content.substring(idx);
        }

        return EMPTY_DIAGRAM;
    }

    /**
     * Re-embeds draw.io XML into the original file format.
     * For .drawio.svg files, updates the content attribute in the SVG wrapper.
     * For raw XML files, returns the XML as-is.
     */
    private String embedXml(String xml) {
        if (originalFileContent != null && originalFileContent.contains("content=\"")) {
            // Re-encode and replace the content attribute in the original SVG
            String encoded = xml
                    .replace("&", "&amp;")
                    .replace("\"", "&quot;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\n", "&#10;");
            return originalFileContent.replaceFirst(
                    "content=\"[^\"]*\"",
                    "content=\"" + encoded + "\"");
        }
        // Raw XML file — write as-is
        return xml;
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
