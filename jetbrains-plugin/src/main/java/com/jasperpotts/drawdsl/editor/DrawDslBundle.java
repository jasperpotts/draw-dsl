package com.jasperpotts.drawdsl.editor;

import com.intellij.DynamicBundle;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.PropertyKey;

public final class DrawDslBundle {
    private static final String BUNDLE = "messages.DrawDslBundle";
    private static final DynamicBundle INSTANCE = new DynamicBundle(DrawDslBundle.class, BUNDLE);

    private DrawDslBundle() {
    }

    public static @Nls String message(@NotNull @PropertyKey(resourceBundle = BUNDLE) String key, Object... params) {
        return INSTANCE.getMessage(key, params);
    }

}
