plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.10.2"
}

group = "com.jasperpotts.drawdsl"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

// Read more: https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html
dependencies {
    intellijPlatform {
        intellijIdea("2025.2.4")
        testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "252.25557"
        }

        changeNotes = """
            Initial version
        """.trimIndent()
    }
}

val copyDrawIo = tasks.register<Copy>("copyDrawIo") {
    from("${rootDir}/../drawio/src/main/webapp") {
        exclude("stencils/**")
        exclude("shapes/**")
        exclude("plugins/**")
        exclude("*.jsp")
        exclude("WEB-INF/**")
        exclude("META-INF/**")
    }
    into("${projectDir}/src/main/resources/drawio")
    // Preserve our custom editor.html; don't overwrite it from the webapp
    exclude("editor.html")
}

tasks.named("processResources") {
    dependsOn(copyDrawIo)
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "21"
        targetCompatibility = "21"
    }
}
