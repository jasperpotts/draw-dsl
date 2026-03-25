# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

draw-dsl is a thin, readable DSL layer over draw.io's native style format, designed for AI generation and editing of diagrams. Three components:

1. **TypeScript CLI & Library** (`src/`) — parses, renders, and validates DSL ↔ .drawio.svg
2. **MCP Server** (`src/mcp/`) — exposes CLI as `diagram_parse`, `diagram_render`, `diagram_validate` tools
3. **JetBrains Plugin** (`jetbrains-plugin/`) — visual IDE editor embedding draw.io via JCEF with custom Swing panels

## Build & Run Commands

### TypeScript (root)
```bash
npm run build              # tsc → dist/
npm run build:watch        # tsc --watch
npm run typecheck          # tsc --noEmit (type check without emitting)
npm run dev:cli            # Run CLI without building: tsx src/cli/index.ts
npm run dev:mcp            # Run MCP server dev: tsx src/mcp/server.ts
```

### JetBrains Plugin
```bash
cd jetbrains-plugin
./gradlew runIde           # Launch sandboxed IDE with plugin
./gradlew buildPlugin      # Build distributable
./gradlew test             # Run tests
```

The `copyDrawIo` Gradle task copies draw.io webapp files from the `drawio/` git submodule into `jetbrains-plugin/src/main/resources/drawio/`, excluding `editor.html` (which is our custom file, not draw.io's).

## Architecture

### DSL v2 Design Philosophy

The DSL is a **thin layer over draw.io's native style format**. Instead of abstracting draw.io's style system into a limited vocabulary (which loses information), the DSL passes through draw.io style properties verbatim with an optional theme overlay for colors and fonts.

- **`node`** — any vertex (shape, text, stencil, table, swimlane)
- **`edge`** — any connection between nodes
- **`{ style-block }`** — draw.io native style properties, with `$token` theme variables
- **Labels** — plain text for simple labels, HTML preserved when formatting (bold, font color/size) is present

### TypeScript Pipeline
- **Parser** (`src/lib/dsl/parser.ts`) — `.dsl` text → AST (Node/Edge elements with StyleMap)
- **Serializer** (`src/lib/dsl/serializer.ts`) — AST → `.dsl` text
- **XML Builder** (`src/lib/drawio/xml-builder.ts`) — AST → draw.io mxGraphModel XML (resolves `$` theme variables)
- **XML Parser** (`src/lib/drawio/xml-parser.ts`) — draw.io XML → AST (preserves style properties, optional color theme-ification)
- **Format handlers** (`src/lib/formats/`) — extract/embed draw.io XML in SVG or PNG containers
- **Stylesheet** (`src/lib/stylesheet/`) — resolves `diagram-styles.css` upward from file, parses CSS subset with 10 color tokens and light/dark themes
- **Validator** (`src/lib/validator/rules.ts`) — validates unique IDs, coordinates, parent refs, theme variable refs
- **Renderer** (`src/lib/renderer/playwright.ts`) — headless Chrome via Playwright for PNG output

### JetBrains Plugin (Java 21, IntelliJ Platform 2025.2)
- **DrawDslBrowserPanel** — JCEF webview serving draw.io from classpath via fake `http://drawio-local` origin
- **editor.html** — custom page that creates `Graph` + `Editor` instances, wires JS↔Java bridge for save callbacks and XML loading
- **DrawDslEditor** — split-pane editor: draw.io canvas (left) + custom Swing side panel (right)
- **panels/** — `ShapePalettePanel`, `ColorPalettePanel`, `ConnectionStylePanel`, `PropertiesPanel`, `TextStylePanel`
- **plugin.xml** registers `*.drawio.svg` and `*.drawio.png` file type mappings

### draw.io Integration
- The `drawio/` submodule is the full jgraph/drawio repo
- `app.min.js` (8.7MB minified) bundles the entire draw.io app including `Graph`, `Editor`, `mxGraph` classes
- Our `editor.html` uses `Graph` and `Editor` directly (not `EditorUi`) for a lightweight embedded canvas
- `Graph.prototype.defaultPageVisible` defaults to `true` in draw.io — set to `false` for infinite-canvas behavior
- `Editor.setGraphXml()` calls `resetGraph()` which resets `gridEnabled`, `pageVisible`, etc. from XML attributes — re-apply overrides after each call

## DSL v2 Syntax

### Elements

Everything is either a **`node`** (vertex) or an **`edge`** (connection):

```
diagram "Architecture"

# Nodes with draw.io style properties in { } blocks
node api "API Gateway" @100,200 [160x60] { rounded=1; $c0 }
node db "Database" @350,200 [80x80] { shape=cylinder3; $c1 }

# Edges with arrow operators + optional style overrides
edge api -> db "queries"
edge api --> db "async" { strokeColor=#666666 }
```

### Style Blocks `{ ... }`

The `{ }` block contains **draw.io native style properties** — if draw.io supports it, the DSL supports it:
- Shapes: `{ shape=cylinder3; rounded=1; strokeWidth=2 }`
- Stencils: `{ shape=stencil(base64...); strokeWidth=2 }`
- Swimlanes: `{ swimlane; startSize=23; container=1 }`
- Text: `{ text; fillColor=none; strokeColor=none }`

### Theme Variables `$token`

Colors and fonts use `$token` references resolved from `diagram-styles.css`:

| Variable | Resolves to |
|----------|-------------|
| `$c0` | shorthand: sets fillColor, strokeColor, fontColor from c0 |
| `$c0.fill` / `$c0.stroke` / `$c0.font` | individual color channels |
| `$default` | default fill/stroke/font colors |
| `$font` / `$font.mono` / `$font.notes` | font families from stylesheet |

Literal hex colors are also allowed: `{ fillColor=#ff6600 }`

### Labels

- **Plain text**: `"Hello World"` — for simple labels
- **HTML preserved**: `"<b>Bold Title</b>"` — when original has formatting (`<b>`, `<font>`, etc.)
- **Line breaks**: `\n` in labels converts to `<br>` in draw.io
- **Escaped quotes**: `\"` inside labels

### Arrow Operators

| Arrow | Visual |
|-------|--------|
| `->` | solid arrow |
| `-->` | dashed arrow |
| `=>` | thick arrow |
| `--` | plain line |
| `<->` | bidirectional |

Explicit `{ }` properties override arrow defaults: `edge a -> b { endArrow=block }`

### 10 Color Tokens (c0–c9)

Defined in `diagram-styles.css` with light/dark theme variants:
- c0=Blue, c1=Green, c2=Amber, c3=Red, c4=Purple
- c5=Indigo, c6=Pink, c7=Slate, c8=Orange, c9=Teal

### Groups/Containers

```
node pool "Services" @50,50 [500x400] { swimlane; container=1; $c7 }
node svc1 "Auth" @70,90 [120x60] in=pool { rounded=1; $c0 }
```

## Key Files

| File | Why |
|------|-----|
| `src/lib/dsl/types.ts` | AST types: Node, Edge, StyleMap, Diagram |
| `src/lib/drawio/xml-parser.ts` | draw.io XML → AST (style passthrough + optional theme-ification) |
| `src/lib/drawio/xml-builder.ts` | AST → draw.io XML (resolves $token theme variables) |
| `src/lib/dsl/parser.ts` | DSL text → AST |
| `src/lib/dsl/serializer.ts` | AST → DSL text |
| `src/lib/drawio/arrow-map.ts` | Arrow operator → draw.io edge style defaults (forward mapping only) |
| `diagram-styles.css` | Theme stylesheet: 10 color tokens, fonts, light/dark themes |
| `docs/dsl-reference.md` | Complete DSL syntax specification |
| `jetbrains-plugin/src/main/resources/drawio/editor.html` | Custom draw.io editor (not from draw.io repo) |

## How to create PNG from ".drawio" or ".drawio.svg" files
Use drawio cli command to convert, example below for converting `diagram.drawio` into `output.png`
```bash
drawio -x -f png -o output.png diagram.drawio
```
The flags break down as: -x for export mode, -f png for the format, and -o for the output path.

## Diagram Round Trip Fidelity Fix Workflow
This to make sure round trip of loading a drawio file, converting to DSL and back to drawio file looks visually very
similar. The v2 DSL preserves draw.io style properties verbatim, so the main sources of difference are:
- Color theme-ification (original hex → nearest theme token, only when within distance 30)
- HTML label simplification (structural tags stripped, formatting tags preserved)
- Coordinate rounding

To test fidelity:
1. Generate reference PNGs: for each file in `drawio-created-samples`, create a PNG in `test-output/reference` using `drawio` CLI
2. Run `npm test` to process all samples into `test-output/fidelity`
3. For each `.roundtrip.drawio` in `test-output/fidelity`, convert to PNG using `drawio` CLI
4. Visually compare reference vs roundtrip PNGs, identify differences
5. Edit source code to fix issues, repeat
6. Check fidelity scores in `.fidelity.txt` files (target: structural 95%+, stylistic 90%+)
