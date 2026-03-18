# DSL Reference

> Back to [README](../README.md) | [Architecture](architecture.md) | [Stylesheet](stylesheet-reference.md)

## File Structure

A `.dsl` file has a header line followed by the diagram body.

```
diagram "Service Architecture"

# shapes, connections, groups, text...
```

- One element per line
- `#` line comments
- Blank lines for readability (ignored by parser)
- All coordinates are in draw.io units (1 unit = 1 pixel at 100% zoom)

## Coordinate System

- Origin `0,0` is **top-left**
- X increases rightward, Y increases downward
- All coordinates are **absolute canvas coordinates** — even for shapes inside groups
- Coordinates use the `@X,Y` syntax: `@100,200`
- Optional size override: `[WxH]` after coordinates

## Shapes

```
SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
```

| Field | Required | Description |
|-------|----------|-------------|
| `SHAPE` | yes | Shape keyword (see table below) |
| `ID` | yes | Unique identifier (`[a-zA-Z][a-zA-Z0-9_-]*`) |
| `"label"` | yes | Display text (quoted string; `\n` for multi-line, `""` for no label) |
| `@X,Y` | yes | Position (top-left corner, absolute canvas coordinates) |
| `[WxH]` | no | Size override (default per shape type) |
| `c=C` | no | Color token (`c0`–`c9`) |
| `text=CLASS` | no | Text style class (`h1`–`h4`, `b1`–`b6`, `ct1`–`ct2`, `mono`, or a comma pair like `b1,mono`). Default: `b3` |
| `in=GROUP` | no | Parent group ID |

### Shape Vocabulary (16 shapes)

| Keyword | Shape | Default Size | Typical Use |
|---------|-------|-------------|-------------|
| `box` | Rectangle | 120x60 | Generic component |
| `rbox` | Rounded rectangle | 120x60 | Service, microservice |
| `diamond` | Diamond | 80x80 | Decision point |
| `circle` | Circle | 60x60 | Start/end, event |
| `ellipse` | Ellipse | 120x60 | Process, action |
| `cylinder` | Cylinder | 80x80 | Database, data store |
| `cloud` | Cloud | 120x80 | Cloud provider, external |
| `parallelogram` | Parallelogram | 120x60 | Input/output |
| `hexagon` | Hexagon | 120x60 | Complex process |
| `trapezoid` | Trapezoid | 120x60 | Transform |
| `triangle` | Triangle | 80x80 | Merge point |
| `note` | Sticky note | 120x80 | Annotation, comment |
| `document` | Document | 120x80 | Document, file |
| `person` | Person/stick figure | 40x60 | Person, user |
| `step` | Chevron | 120x60 | Pipeline stage |
| `card` | Clipped corner rect | 120x80 | Card, ticket |

### Naming Scheme

Shape keywords follow these rules:

**Rule 1:** If draw.io uses `shape=X`, the DSL keyword is `X` (e.g., `hexagon`, `step`, `card`, `note`, `document`, `parallelogram`, `trapezoid`, `process`).

**Rule 2:** A small alias table maps readable names for shapes that don't have a clean `shape=` property:

| DSL Alias | draw.io Reality | Why |
|-----------|----------------|-----|
| `box` | (no `shape=`, base rect) | No shape property |
| `rbox` | (base rect + `rounded=1`) | No shape property |
| `ellipse` | (built-in, no `shape=`) | No shape property |
| `circle` | (ellipse + `aspect=fixed`) | Convenience |
| `diamond` | (built-in `rhombus`) | `rhombus` is obscure |
| `triangle` | (built-in, no `shape=`) | No shape property |
| `cylinder` | `shape=cylinder3` | `cylinder3` is ugly |
| `cloud` | `ellipse;shape=cloud` | Compound style |
| `person` | `shape=mxgraph.basic.person` | Namespace prefix |

**Rule 3:** Any unrecognized shape keyword is tried as `shape=<keyword>`. This means any draw.io shape works without code changes (e.g., `process`, `delay`, `callout`, `cross`, etc.).

### IDs — No Reserved Words

Shape keywords and other DSL keywords are **not** reserved — they can be used as node IDs. The parser resolves by position, so `box box "A Box" @0,0` is valid (shape keyword `box`, ID `box`).

### Shape Defaults

- **Font:** `--font-default` for all shapes except `note` (which uses `--font-notes`)
- **Text class:** `b3` (12px) when no `text=` specified
- **Color:** `--default-fill`, `--default-stroke`, `--default-font` when no `c=` specified

### Note Behavior

Notes always render with the handwriting font (`--font-notes`) and folded corner geometry, regardless of other attributes. When no `c=` is specified, notes default to amber (`c2`). When `c=` is specified, the note changes color but keeps its distinctive note appearance (handwriting font, folded corner, no border radius).

## Connections

Connections use bare arrow syntax — no keyword prefix needed:

```
SOURCE ARROW TARGET ["label"] [c=C] [text=CLASS] [imp=N] [route=R] [via X1,Y1 X2,Y2 ...]
```

| Field | Required | Description |
|-------|----------|-------------|
| `SOURCE` | yes | Source shape ID |
| `ARROW` | yes | Arrow type (see table below) |
| `TARGET` | yes | Target shape ID |
| `"label"` | no | Connection label (quoted string; `\n` for multi-line) |
| `c=C` | no | Color token — stroke uses `--cN-stroke`, label uses `--cN-font` |
| `text=CLASS` | no | Text style class (any class: `ct1`, `ct2`, `b1`–`b6`, `h1`–`h4`, `mono`, or a comma pair like `ct1,mono`). Default: `ct1` |
| `imp=N` | no | Importance level (`1`–`4`, see stylesheet). Default: `3` (1px) |
| `route=R` | no | Connection routing: `ortho` (default), `straight`, `curved`, `elbow`, `er`, `iso` |
| `via X1,Y1 ...` | no | Waypoints for routing |

### Arrow Types

**Basic arrows:**

| Syntax | Description |
|--------|-------------|
| `->` | Solid arrow (default) |
| `-->` | Dashed arrow |
| `=>` | Thick/bold arrow |
| `==>` | Thick dashed arrow |
| `--` | Solid line (no arrowhead) |
| `---` | Dashed line (no arrowhead) |

**Bidirectional:**

| Syntax | Description |
|--------|-------------|
| `<->` | Solid bidirectional |
| `<-->` | Dashed bidirectional |
| `<=>` | Thick bidirectional |

**UML relationships:**

| Syntax | Description | Visual |
|--------|-------------|--------|
| `*->` | Composition | Filled diamond -> arrow |
| `o->` | Aggregation | Open diamond -> arrow |
| `#->` | Inheritance | Triangle arrowhead |
| `~->` | Realization | Dashed + triangle arrowhead |
| `+->` | Dependency | Dashed arrow |

**Terminal markers (append to any non-bidirectional arrow):**

| Suffix | Description | Examples |
|--------|-------------|----------|
| `-x` | Cross/rejection terminal | `->-x`, `-->-x`, `=>-x`, `*->-x`, `#->-x` |
| `-o` | Open circle terminal | `->-o`, `-->-o`, `=>-o`, `o->-o`, `~->-o` |

Terminal markers replace the arrowhead on the target end. They work on ALL non-bidirectional arrows including UML arrows. They are not valid on bidirectional arrows (`<->`, `<-->`, `<=>`).

### Arrow → mxGraph Style Mapping

| DSL | mxGraph Style Properties |
|-----|------------------------|
| `->` | `endArrow=classic;endFill=1;` |
| `-->` | `endArrow=classic;endFill=1;dashed=1;` |
| `=>` | `endArrow=classic;endFill=1;` (+ 2x stroke multiplier) |
| `==>` | `endArrow=classic;endFill=1;dashed=1;` (+ 2x stroke multiplier) |
| `--` | `endArrow=none;endFill=0;` |
| `---` | `endArrow=none;endFill=0;dashed=1;` |
| `<->` | `endArrow=classic;endFill=1;startArrow=classic;startFill=1;` |
| `<-->` | `endArrow=classic;endFill=1;startArrow=classic;startFill=1;dashed=1;` |
| `<=>` | `endArrow=classic;endFill=1;startArrow=classic;startFill=1;` (+ 2x stroke multiplier) |
| `*->` | `endArrow=classic;endFill=1;startArrow=diamond;startFill=1;` |
| `o->` | `endArrow=classic;endFill=1;startArrow=diamond;startFill=0;` |
| `#->` | `endArrow=block;endFill=0;` |
| `~->` | `endArrow=block;endFill=0;dashed=1;` |
| `+->` | `endArrow=open;endFill=0;dashed=1;` |

**Terminal marker overrides (replace target end):**

| Suffix | Override |
|--------|---------|
| `-x` | replace endArrow with `endArrow=cross;endFill=0;` |
| `-o` | replace endArrow with `endArrow=oval;endFill=0;` |

### Importance × Arrow Type — Multiplicative Stroke Width

Thick arrows (`=>`, `==>`, `<=>`) have a **2x stroke width multiplier**. The effective stroke width is:

```
effective_stroke = arrow_multiplier × imp_stroke_width
```

| Example | Calculation | Result |
|---------|------------|--------|
| `->` with default `imp=3` | 1 × 1px | 1px |
| `=>` with default `imp=3` | 2 × 1px | 2px |
| `=>` with `imp=1` | 2 × 3px | 6px |
| `->` with `imp=1` | 1 × 3px | 3px |

### Connection Defaults

- **Font:** `--font-default` for labels
- **Text class:** `ct1` (10px) when no `text=` specified
- **Label rendering:** no background behind labels — label color must be readable against the diagram background
- **Color:** when `c=` is set, stroke uses `--cN-stroke` and label text uses `--cN-font`. Fill is not applicable to connections.
- **Routing:** `ortho` (orthogonal) when no `route=` specified

### Connection Routing with `via`

Use waypoints to route connections through specific coordinates, avoiding overlaps:

```
api -> db "query" via 200,300 400,300
```

Waypoints are listed as space-separated `X,Y` pairs after the `via` keyword. The connection will pass through each waypoint in order from source to target.

## Groups & Containers

Groups are shapes that contain other shapes. Define the group first, then assign children with `in=`:

```
rbox infra "Infrastructure" @50,50 [500x400] c=c7

cylinder db "Postgres" @100,100 c=c0 in=infra
rbox cache "Redis" @300,100 c=c3 in=infra
```

- Any shape can be a group/container
- Children use `in=GROUP_ID` to declare their direct parent
- Multi-level nesting is supported (groups can contain other groups)
- All positions use **absolute canvas coordinates**, even for nested children
- The group shape defines the visual container boundary

```
# Multi-level nesting example
rbox vpc "VPC" @20,20 [760x500] c=c7
rbox subnet "Public Subnet" @40,60 [340x200] c=c0 in=vpc
rbox alb "ALB" @60,110 c=c0 in=subnet    # alb → subnet → vpc
```

## Text Elements

Standalone text labels (no shape border):

```
text ID "label" @X,Y [c=C] [text=CLASS]
```

| Field | Required | Description |
|-------|----------|-------------|
| `ID` | yes | Unique identifier |
| `"label"` | yes | Display text (quoted string; `\n` for multi-line) |
| `@X,Y` | yes | Position |
| `c=C` | no | Color token |
| `text=CLASS` | no | Text style class (any class, or a comma pair like `b1,mono`). Default: `b2` (14px) |

- Font: `--font-default`
- Text style classes control font size, weight, and color via the stylesheet

## Notes

Notes use the `note` shape with automatic sticky-note styling:

```
note n1 "This service handles\nauthentication" @400,50 c=c2
```

- Multi-line text uses `\n` within the quoted string (this works in **all** quoted labels: shapes, connections, text elements, and notes)
- Notes always use the handwriting font (`--font-notes`) — `c=` only changes colors, not the font
- The `note` shape always renders with a folded corner
- Default color is amber (`c2`) when no `c=` specified