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
