# Stylesheet Reference

> Back to [README](../README.md) | [Architecture](architecture.md) | [DSL Reference](dsl-reference.md) | Default stylesheet: [`diagram-styles.css`](../diagram-styles.css)

The stylesheet uses a **CSS-subset** syntax with custom properties. It defines colors, fonts, text styles, and connection styles that the DSL references by token.

---

## CSS Subset Specification

The stylesheet parser is purpose-built — it is **not** a browser CSS parser. Only the constructs and properties listed below are recognized. Unknown properties or constructs are **parse errors** (strict mode — no silent failures).

### Supported Constructs

| Construct | Syntax | Purpose |
|-----------|--------|---------|
| Custom properties | `--name: value;` | The primary mechanism for defining tokens |
| `:root { ... }` | Standard | Theme-independent defaults (fonts, sizes, weights) |
| `@theme <name> { ... }` | Custom at-rule | Theme-specific values (colors). Not standard CSS. |
| Class selectors | `.className { ... }` | Text styles, importance levels, shape defaults |
| `var(--name)` | Single-level | Reference a custom property. Resolved by the tool at render time. No nesting. |
| Comments | `/* ... */` | Block comments |

### Construct Rules

- **Class selectors are always top-level.** They cannot appear inside `:root` or `@theme` blocks.
- **`var()` is single-level only.** `var(--font-notes)` is valid; `var(var(--x))` is not.
- **`@theme` blocks contain only custom properties.** No class selectors or nested blocks inside `@theme`.
- To make class properties vary by theme, use `var()` referencing a custom property that differs per theme (e.g., `.h1 { color: var(--default-font); }`).

### NOT Supported

The following CSS features are **not** recognized and will cause parse errors:

- Nested selectors, combinators (`.a .b`, `.a > .b`)
- Pseudo-classes (`:hover`, `:first-child`) and pseudo-elements (`::before`)
- `@media`, `@import`, `@keyframes`, `@supports`, or any standard at-rules
- Shorthand properties (`border`, `font`, `background`)
- Nested `var()` references (`var(var(--x))`)
- `calc()` or any other CSS functions besides `var()`
- Any properties beyond the recognized set below

### Recognized CSS Properties

Only these properties are parsed and applied:

| Property | Applies to | Example values |
|----------|------------|----------------|
| `font-family` | Text styling | `"Arial Narrow", Arial, sans-serif` |
| `font-size` | Text styling | `14px`, `24px` |
| `font-weight` | Text styling | `bold`, `normal` |
| `font-style` | Text styling | `italic`, `normal` |
| `fill` | Shape background | `#EFF6FF`, `var(--c0-fill)` |
| `stroke` | Shape/connection border/line | `#3b82f6`, `var(--c0-stroke)` |
| `stroke-width` | Connection weight | `1px`, `2px`, `3px` |
| `stroke-dasharray` | Connection dash pattern | `4 2` |
| `color` | Font color | `#1e40af`, `var(--c0-font)` |
| `opacity` | Transparency | `0.5`, `1` |
| `border-radius` | Shape corner rounding | `0`, `8px` |

---

## Theme System

### Automatic Light/Dark Switching (SVG)

For `.drawio.svg` output, the tool embeds **both** light and dark theme values in the SVG using `@media (prefers-color-scheme: dark)`. The diagram automatically adapts to the viewer's OS/browser theme setting. This works in GitHub markdown, browsers, and any SVG viewer that respects `prefers-color-scheme`.

No theme selection is needed for SVG — both themes are always included.

### Forced Theme (PNG/PDF)

For `.drawio.png` and `.drawio` output, use the `--theme` CLI flag to select a single theme:

```bash
diagram-tool render arch.dsl -o arch.drawio.png --theme dark
```

Default is `light` when `--theme` is not specified.

### Stylesheet Structure

The stylesheet has three layers:

#### 1. `:root { ... }` — Theme-Independent Defaults

Structural styles that stay the same regardless of theme: font families, font sizes, font weights, dash patterns. Defined once, inherited by all themes.

#### 2. `@theme light { ... }` — Light Theme Colors

Defines all color values: fill backgrounds, stroke colors, font colors, and diagram background for each color token.

#### 3. `@theme dark { ... }` — Dark Theme Colors

Override theme. Only redefines color values — all structural styles (fonts, sizes, weights, dasharray) inherit from `:root`.

At render time, the tool merges `:root` + the selected `@theme` block. Properties in the `@theme` block override those in `:root`.

### Diagram Background

SVG output uses a **transparent background** — the diagram inherits the page/viewer background, which works naturally with GitHub's light/dark modes.

For PNG/PDF output, each theme defines `--diagram-background` to provide an opaque canvas:

```css
@theme light { --diagram-background: #ffffff; }
@theme dark  { --diagram-background: #1e1e2e; }
```

### Missing Stylesheet Behavior

If no stylesheet is found (CLI flag, DSL directive, and directory search all fail), the tool uses **built-in defaults** matching the default `diagram-styles.css` and emits a warning. Diagrams always render — a missing stylesheet is not a fatal error.

---

## Color Palette (`c0`–`c9`)

Ten color tokens — **pure colors with no semantic meaning**. The AI/user picks colors for visual clarity, not because a specific color implies a specific purpose. This keeps the palette flexible across different diagram types.

Each color defines three custom properties: fill (light pastel background), stroke (vivid border), and font color.

**No raw hex colors are allowed in DSL files.** The validator rejects any hex color literal — all coloring must go through `c0`–`c9` tokens.

### How `c=` Applies

| Element | Fill (`--cN-fill`) | Stroke (`--cN-stroke`) | Font (`--cN-font`) |
|---------|-------------------|----------------------|-------------------|
| Shapes | background | border | label text |
| Connections | not used | line color | label text |
| Notes | background | border | label text |

### Light Theme

| Token | Color | Fill | Stroke | Font |
|-------|-------|------|--------|------|
| `c0` | Blue | `#EFF6FF` | `#3b82f6` | `#1e40af` |
| `c1` | Green | `#ECFDF5` | `#10b981` | `#065f46` |
| `c2` | Amber | `#FEF3C7` | `#f59e0b` | `#92400e` |
| `c3` | Red | `#FEE2E2` | `#ef4444` | `#991b1b` |
| `c4` | Purple | `#F3E8FF` | `#a855f7` | `#6b21a8` |
| `c5` | Indigo | `#E0E7FF` | `#6366f1` | `#4338ca` |
| `c6` | Pink | `#FCE7F3` | `#ec4899` | `#9d174d` |
| `c7` | Slate | `#F8FAFC` | `#94a3b8` | `#334155` |
| `c8` | Orange | `#FFF7ED` | `#f97316` | `#c2410c` |
| `c9` | Teal | `#F0FDFA` | `#14b8a6` | `#115e59` |

### Dark Theme

| Token | Color | Fill | Stroke | Font |
|-------|-------|------|--------|------|
| `c0` | Blue | `#1e3a5f` | `#60a5fa` | `#bfdbfe` |
| `c1` | Green | `#1a3a2a` | `#34d399` | `#a7f3d0` |
| `c2` | Amber | `#3d2e0a` | `#fbbf24` | `#fde68a` |
| `c3` | Red | `#3b1c1c` | `#f87171` | `#fecaca` |
| `c4` | Purple | `#2e1a47` | `#c084fc` | `#e9d5ff` |
| `c5` | Indigo | `#1e1b4b` | `#818cf8` | `#c7d2fe` |
| `c6` | Pink | `#3b1a2e` | `#f472b6` | `#fbcfe8` |
| `c7` | Slate | `#1e293b` | `#64748b` | `#cbd5e1` |
| `c8` | Orange | `#3b1f0a` | `#fb923c` | `#fed7aa` |
| `c9` | Teal | `#0f2a2a` | `#2dd4bf` | `#99f6e4` |

---

## Font Definitions

Three font stacks, using only system-available fonts (required for self-contained GitHub SVG rendering):

| Custom Property | Stack | Usage |
|-----------------|-------|-------|
| `--font-default` | `"Arial Narrow", Arial, "Helvetica Neue", Helvetica, sans-serif` | All shapes, connections, headings, body text |
| `--font-notes` | `"Comic Sans MS", "Comic Sans", "Marker Felt", cursive` | `note` shapes (handwriting style, always applied) |
| `--font-mono` | `"SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace` | Code/monospace text via `text=mono` class |

---

## Text Style Classes

### Headings (`h1`–`h4`)

For titles and section headers within diagrams:

| Class | Font Size | Font Weight |
|-------|-----------|-------------|
| `h1` | 24px | bold |
| `h2` | 20px | bold |
| `h3` | 16px | bold |
| `h4` | 14px | bold |

### Body (`b1`–`b6`)

For shape labels and general text:

| Class | Font Size | Usage |
|-------|-----------|-------|
| `b1` | 16px | Large body |
| `b2` | 14px | Default text element |
| `b3` | 12px | Default shape label |
| `b4` | 10px | Small |
| `b5` | 9px | Fine print |
| `b6` | 8px | Micro |

### Connection Text (`ct1`, `ct2`)

For connection labels:

| Class | Font Size | Usage |
|-------|-----------|-------|
| `ct1` | 10px | Default connection label |
| `ct2` | 9px | Secondary/minor connection label |

### Monospace (`mono`)

For code snippets and technical labels:

| Class | Font Size | Font Family |
|-------|-----------|-------------|
| `mono` | 12px | `--font-mono` |

### Implicit Defaults

| Element | Default Class | Font |
|---------|--------------|------|
| Shapes | `b3` (12px) | `--font-default` |
| Connections | `ct1` (10px) | `--font-default` |
| Text elements | `b2` (14px) | `--font-default` |
| Notes | `b3` (12px) | `--font-notes` (always) |

---

## Connection Importance Levels

The `imp=` attribute on connections maps to visual weight:

| Level | Stroke Width | Dash Pattern | Usage |
|-------|-------------|--------------|-------|
| `imp=1` | 3px | solid | Critical path |
| `imp=2` | 2px | solid | Normal (default) |
| `imp=3` | 1px | solid | Secondary |
| `imp=4` | 1px | `4 2` | Minor/optional |

---

## Note Style

Notes automatically receive the handwriting font and a warm post-it appearance:

- Font: `--font-notes` (Comic Sans / Marker Felt / cursive) — always applied, `c=` does not change this
- Default color: `c2` (amber) when no `c=` specified
- When `c=` is specified: colors change (fill/stroke/font) but the note retains its distinctive appearance
- Border radius: `0` (folded corner rendered by shape geometry)

---

## Shape Defaults

When no `c=` token is specified on a shape, the tool applies these defaults:

- Fill: `--default-fill` (white in light theme, dark gray in dark theme)
- Stroke: `--default-stroke` (gray)
- Font color: `--default-font` (dark text in light, light text in dark)

---

## Customization Guide

To create a project-specific stylesheet:

1. **Copy** `diagram-styles.css` to your project root
2. **Modify** color values, font stacks, or text sizes as needed
3. The tool finds stylesheets by searching up the directory tree from the DSL file, so place it at the appropriate level
4. Reference it explicitly in DSL files: `stylesheet "my-styles.css"` or let the tool find `diagram-styles.css` automatically

### Adding a Custom Theme

Add a new `@theme` block:

```css
@theme high-contrast {
  --diagram-background: #000000;
  --default-fill: #000000;
  --default-stroke: #ffffff;
  --default-font: #ffffff;
  --c0-fill: #000000;    --c0-stroke: #ffffff;   --c0-font: #ffffff;
  /* ... define all 10 color tokens ... */
}
```

Then select it with `--theme high-contrast` for PNG/PDF export. Custom themes are also embedded in SVG output if present.

### Overriding Text Styles

Modify class definitions at the top level of the stylesheet:

```css
.h1 { font-size: 28px; font-weight: bold; font-style: italic; }
```

### Overriding Importance Levels

```css
.imp1 { stroke-width: 4px; }
.imp4 { stroke-width: 1px; stroke-dasharray: 2 1; }
```
