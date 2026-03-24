# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

draw-dsl is a compact, coordinate-based DSL for draw.io diagrams designed for AI generation. Three components:

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

### TypeScript Pipeline
- **Parser** (`src/lib/dsl/parser.ts`) — `.dsl` text → AST
- **Serializer** (`src/lib/dsl/serializer.ts`) — AST → `.dsl` text
- **XML Builder** (`src/lib/drawio/xml-builder.ts`) — AST → draw.io mxGraphModel XML
- **XML Parser** (`src/lib/drawio/xml-parser.ts`) — draw.io XML → AST (best-effort reverse: hex→closest color token, font-size→text class)
- **Format handlers** (`src/lib/formats/`) — extract/embed draw.io XML in SVG or PNG containers
- **Stylesheet** (`src/lib/stylesheet/`) — resolves `diagram-styles.css` upward from file, parses CSS subset with 10 color tokens and light/dark themes
- **Validator** (`src/lib/validator/rules.ts`) — 13 rules (unique IDs, valid shapes, no raw hex, etc.)
- **Renderer** (`src/lib/renderer/playwright.ts`) — headless Chrome via Playwright for PNG output

### JetBrains Plugin (Java 21, IntelliJ Platform 2025.2)
- **DrawDslBrowserPanel** — JCEF webview serving draw.io from classpath via fake `http://drawio-local` origin
- **editor.html** — custom page that creates `Graph` + `Editor` instances, wires JS↔Java bridge for save callbacks and XML loading
- **DrawDslEditor** — split-pane editor: draw.io canvas (left) + custom Swing side panel (right)
- **panels/** — `ShapePalettePanel` (16 shapes), `ColorPalettePanel` (10 tokens), `ConnectionStylePanel`, `PropertiesPanel`, `TextStylePanel`
- **plugin.xml** registers `*.drawio.svg` and `*.drawio.png` file type mappings

### draw.io Integration
- The `drawio/` submodule is the full jgraph/drawio repo
- `app.min.js` (8.7MB minified) bundles the entire draw.io app including `Graph`, `Editor`, `mxGraph` classes
- Our `editor.html` uses `Graph` and `Editor` directly (not `EditorUi`) for a lightweight embedded canvas
- `Graph.prototype.defaultPageVisible` defaults to `true` in draw.io — set to `false` for infinite-canvas behavior
- `Editor.setGraphXml()` calls `resetGraph()` which resets `gridEnabled`, `pageVisible`, etc. from XML attributes — re-apply overrides after each call

## Key DSL Constraints

- **16 shape keywords only**: box, rbox, diamond, circle, ellipse, cylinder, cloud, parallelogram, hexagon, trapezoid, triangle, note, document, person, step, card
- **10 color tokens only** (c0–c9): no raw hex colors allowed anywhere in DSL
- **Absolute coordinates**: all positions are `@X,Y` on the canvas, even within groups
- **Stylesheet**: `diagram-styles.css` resolved upward from file directory; defines color values, text sizes, themes

## Files You Should Know About

| File | Why |
|------|-----|
| `jetbrains-plugin/src/main/resources/drawio/editor.html` | Custom (not from draw.io). All JS-side canvas behavior lives here. |
| `diagram-styles.css` | The single stylesheet governing all diagram styling |
| `src/lib/dsl/types.ts` | Shape keywords, arrow operators, color tokens, text classes — the DSL vocabulary |
| `src/lib/drawio/shape-map.ts` | Shape keyword ↔ draw.io style bidirectional mapping |
| `src/lib/drawio/arrow-map.ts` | Arrow operator ↔ draw.io edge style mapping |
| `docs/dsl-reference.md` | Complete DSL syntax specification |

## How to create PNG from ".drawio" or ".drawio.svg" files
Use drawio cli command to convert, example below for converting `diagram.drawio` into `output.png`
```bash 
drawio -x -f png -o output.png diagram.drawio
```
The flags break down as: -x for export mode, -f png for the format, and -o for the output path.

## Diagram Round Trip Fidelity Fix Workflow
This to make sure round trip of loading a drawio file, converting to DSL and back to drawio file looks visually very 
similar. We expect minor color, text style or line style changes due to only using theme colors, text and line styles. 
But in general the diagram should look the same with matching symbols, shapes, text, connections etc. Shapes that are a 
circle or file icon in input should be a circle or file icon in output. If a symbol is a yellow-ish filled rounded 
rectangle in input it should be a yellow-ish filled rounded rectangle in output. You can start with generating PNG files 
for comparison in the `test-output/reference` directory if they don't exist already. For each source reference file in 
`drawio-created-samples` create a png in reference using `drawio` cli command. Then follow these steps 
1. Run `npm test` to process all samples in `test-output/samples`
2. For each file in `test-output/samples` ending in `.roundtrip.drawio` convert to png using `drawio` cli
3. Visually compare for each sample the reference png file and generated round trip png file. Identify differences and edit the source code to make them match better
4. Repeat until measured fidelity > 95% or images visually match
5. Do at least 5 iterations before stopping
