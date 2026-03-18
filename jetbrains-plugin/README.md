# draw-dsl JetBrains Plugin

A JetBrains IDE plugin for editing `.drawio.svg` and `.drawio.png` diagrams — built on [draw.io](https://github.com/jgraph/drawio) as the rendering engine, with custom native JetBrains UI panels tailored to the [draw-dsl](../README.md) subset.

## Motivation

draw-dsl is a compact, coordinate-based DSL for creating draw.io diagrams — designed primarily for AI generation and editing. The DSL round-trips to `.drawio.svg` files that are viewable on GitHub and editable in draw.io.

While the DSL-to-SVG workflow is optimized for AI (via CLI and MCP tools), **human hand-editing** of these diagrams needs a better experience than raw draw.io. The full draw.io editor exposes hundreds of shapes, styles, and formatting options that are outside the draw-dsl subset and would produce diagrams that can't cleanly round-trip back to DSL.

This plugin solves that by:

- **Embedding draw.io** as the main editor canvas (via JCEF/webview) for visual drag-and-drop editing
- **Replacing the default draw.io side panels** ("Shapes" and "Format") with native JetBrains UI panels scoped to the draw-dsl vocabulary
- **Enforcing the draw-dsl subset** — only the 17 supported shapes, 10 color tokens, and defined text/connection styles are exposed in the UI
- **Preserving round-trip fidelity** — diagrams edited in the plugin remain valid draw-dsl and can be parsed back to DSL text

## Design Goals

### draw.io as Rendering Engine Only

The plugin uses the [jgraph/drawio](https://github.com/jgraph/drawio) project as a library for the main editor panel — the interactive canvas where shapes are positioned, connected, and visually arranged. All other UI chrome (panels, toolbars, menus) is replaced with native JetBrains components.

### Custom Side Panels (Replacing draw.io Defaults)

| Panel | Replaces | Purpose |
|-------|----------|---------|
| **Shape Palette** | draw.io "Shapes" panel | Exposes only the 17 draw-dsl shapes: `box`, `rbox`, `dia`, `circle`, `ellipse`, `cyl`, `cloud`, `para`, `hex`, `trap`, `tri`, `note`, `doc`, `actor`, `queue`, `step`, `card` |
| **Color Picker** | draw.io format color options | 10 color tokens (`c0`–`c9`) with theme-aware swatches — no raw hex input |
| **Text Styles** | draw.io text formatting | Headings (`h1`–`h4`), body (`b1`–`b6`), connection text (`ct1`–`ct2`) |
| **Connection Styles** | draw.io line formatting | Arrow types (`->`, `-->`, `=>`, `<->`, `*->`, etc.) and importance levels (`imp=1`–`4`) |
| **Properties** | draw.io format panel | Shape ID, label, position (`@X,Y`), size (`WxH`), group membership (`in=`), color, text class |

### Stylesheet Integration

The plugin reads the project's `diagram-styles.css` (resolved the same way as the CLI tool — search up from the file's directory) and uses it to:

- Render color token swatches with actual theme colors
- Apply correct fonts, sizes, and weights in the editor
- Support light/dark theme switching
- Display importance levels with correct stroke widths and dash patterns

### File Format Support

| Format | Description |
|--------|-------------|
| `.drawio.svg` | **Primary.** SVG with embedded draw.io XML — renders on GitHub |
| `.drawio.png` | PNG with embedded draw.io XML metadata |

## draw-dsl Quick Reference

The plugin UI is built around this subset:

### Shapes (17 types)

| Keyword | Shape | Default Size | Typical Use |
|---------|-------|-------------|-------------|
| `box` | Rectangle | 120x60 | Generic component |
| `rbox` | Rounded rectangle | 120x60 | Service, microservice |
| `dia` | Diamond | 80x80 | Decision point |
| `circle` | Circle | 60x60 | Start/end, event |
| `ellipse` | Ellipse | 120x60 | Process, action |
| `cyl` | Cylinder | 80x80 | Database, data store |
| `cloud` | Cloud | 120x80 | Cloud provider, external |
| `para` | Parallelogram | 120x60 | Input/output |
| `hex` | Hexagon | 120x60 | Complex process |
| `trap` | Trapezoid | 120x60 | Transform |
| `tri` | Triangle | 80x80 | Merge point |
| `note` | Sticky note | 120x80 | Annotation, comment |
| `doc` | Document | 120x80 | Document, file |
| `actor` | Stick figure | 40x60 | Person, user |
| `queue` | Horizontal cylinder | 120x60 | Message queue |
| `step` | Chevron | 120x60 | Pipeline stage |
| `card` | Clipped corner rect | 120x80 | Card, ticket |

### Colors (10 tokens)

| Token | Color | Token | Color |
|-------|-------|-------|-------|
| `c0` | Blue | `c5` | Indigo |
| `c1` | Green | `c6` | Pink |
| `c2` | Amber | `c7` | Slate |
| `c3` | Red | `c8` | Orange |
| `c4` | Purple | `c9` | Teal |

No raw hex colors — all coloring goes through these tokens, ensuring stylesheet consistency.

### Arrow Types

| Type | Arrows |
|------|--------|
| **Basic** | `->` `-->` `=>` `==>` `--` `---` |
| **Bidirectional** | `<->` `<-->` `<=>` |
| **UML** | `*->` (composition) `o->` (aggregation) `#->` (inheritance) `~->` (realization) `+->` (dependency) |

### Text Styles

- **Headings:** `h1` (24px) `h2` (20px) `h3` (16px) `h4` (14px) — all bold
- **Body:** `b1` (16px) `b2` (14px, default) `b3` (12px) `b4` (11px) `b5` (10px) `b6` (9px)
- **Connection:** `ct1` (12px, default) `ct2` (10px)

### Connection Importance

| Level | Visual | Usage |
|-------|--------|-------|
| `imp=1` | 3px solid | Critical path |
| `imp=2` | 2px solid | Normal (default) |
| `imp=3` | 1px solid | Secondary |
| `imp=4` | 1px dashed | Minor/optional |

## Architecture

```
┌─────────────────────────────────────────────┐
│  JetBrains IDE                              │
│  ┌───────────────────────────────────────┐  │
│  │  Plugin Editor Tab (.drawio.svg)      │  │
│  │  ┌─────────┐  ┌───────────────────┐   │  │
│  │  │ Custom  │  │  draw.io Canvas   │   │  │
│  │  │ Side    │  │  (JCEF Webview)   │   │  │
│  │  │ Panels  │  │                   │   │  │
│  │  │         │  │  - Drag & drop    │   │  │
│  │  │ - Shape │  │  - Select & move  │   │  │
│  │  │ - Color │  │  - Connect       │   │  │
│  │  │ - Text  │  │  - Resize        │   │  │
│  │  │ - Props │  │                   │   │  │
│  │  └─────────┘  └───────────────────┘   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  diagram-styles.css ◄── Stylesheet resolver │
└─────────────────────────────────────────────┘
```

- **JCEF Webview** — Hosts the draw.io editor as an embedded browser component
- **Bridge Layer** — JavaScript ↔ Java communication for syncing selection, applying styles, and reading/writing diagram XML
- **Custom Panels** — Native Swing/JetBrains UI components that communicate with the draw.io canvas via the bridge
- **File Handling** — Reads/writes `.drawio.svg` and `.drawio.png` formats, extracting/embedding draw.io XML from the container format

## Project Structure

```
jetbrains-plugin/
├── src/main/
│   ├── java/                Java plugin sources
│   └── resources/
│       └── META-INF/
│           └── plugin.xml   Plugin descriptor
├── build.gradle.kts         Gradle build (IntelliJ Platform Plugin)
├── gradle.properties        Plugin version, platform targets
└── settings.gradle.kts      Gradle settings
```

> **Note:** This plugin uses **Java** (not Kotlin) for all plugin source code. The IntelliJ Platform SDK is fully accessible from Java with no limitations. The only Kotlin in the project is the Gradle build scripts (`.gradle.kts`), which is standard for IntelliJ plugin projects.

## Development

### Prerequisites

- JDK 17+
- IntelliJ IDEA (for running/debugging the plugin)

### Run the Plugin

```bash
./gradlew runIde
```

This launches a sandboxed IDE instance with the plugin installed.

### Build

```bash
./gradlew buildPlugin
```

### Test

```bash
./gradlew test
```

## Related

- [draw-dsl README](../README.md) — Parent project overview, CLI usage, MCP tools
- [DSL Reference](../docs/dsl-reference.md) — Complete shape, connection, group, and text specification
- [Stylesheet Reference](../docs/stylesheet-reference.md) — CSS subset, theme system, color palette, text styles
- [draw.io](https://github.com/jgraph/drawio) — The diagram editor used as the rendering engine
