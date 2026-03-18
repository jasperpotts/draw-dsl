package com.jasperpotts.drawdsl.editor.editor;

import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.fileEditor.FileEditorPolicy;
import com.intellij.openapi.fileEditor.FileEditorProvider;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;
import org.jetbrains.annotations.NonNls;
import org.jetbrains.annotations.NotNull;

public final class DrawDslEditorProvider implements FileEditorProvider, DumbAware {
    private static final String EDITOR_TYPE_ID = "drawdsl-editor";

    @Override
    public boolean accept(@NotNull Project project, @NotNull VirtualFile file) {
        String name = file.getName();
        return name.endsWith(".drawio.svg") || name.endsWith(".drawio.png");
    }

    @Override
    public @NotNull FileEditor createEditor(@NotNull Project project, @NotNull VirtualFile file) {
        return new DrawDslEditor(project, file);
    }

    @Override
    public @NotNull @NonNls String getEditorTypeId() {
        return EDITOR_TYPE_ID;
    }

    @Override
    public @NotNull FileEditorPolicy getPolicy() {
        return FileEditorPolicy.HIDE_DEFAULT_EDITOR;
    }
}
