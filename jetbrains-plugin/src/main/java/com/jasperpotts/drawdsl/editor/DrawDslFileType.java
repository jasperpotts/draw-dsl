package com.jasperpotts.drawdsl.editor;

import com.intellij.openapi.fileTypes.FileType;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;

import javax.swing.*;

public final class DrawDslFileType implements FileType {
    @SuppressWarnings("unused") // referenced by fieldName="INSTANCE" in plugin.xml
    public static final DrawDslFileType INSTANCE = new DrawDslFileType();

    private DrawDslFileType() {
    }

    @Override
    public @NotNull String getName() {
        return "DrawDSL Diagram";
    }

    @Override
    public @NotNull @Nls String getDescription() {
        return DrawDslBundle.message("filetype.drawdsl.description");
    }

    @Override
    public @NotNull String getDefaultExtension() {
        return "drawio.svg";
    }

    @Override
    public @NotNull Icon getIcon() {
        return DrawDslIcons.FILE;
    }

    @Override
    public boolean isBinary() {
        return false;
    }
}
