# DSL v2 Reference

> Back to [README](../README.md) | [Architecture](architecture.md) | [Stylesheet](stylesheet-reference.md)

## Design Philosophy

The DSL is a **thin, readable layer over draw.io's native style format**. Style properties pass through verbatim — if draw.io supports it, the DSL supports it. The DSL adds:

- Compact positioning syntax (`@X,Y [WxH]`)
- Theme variable substitution (`$c0`, `$font.mono`)
- Arrow operator shortcuts (`->`, `-->`, `<->`)
- Readable element structure (`node`, `edge`)

## File Structure

```
diagram "Service Architecture"

# Nodes (shapes, text, stencils, swimlanes — any vertex)
node api "API Gateway" @100,200 [160x60] { rounded=1; $c0 }
node db "Database" @350,200 [80x80] { shape=cylinder3; $c1 }

# Edges (connections between nodes)
edge api -> db "queries"
```

- One element per line
- `#` line comments
- Blank lines for readability (ignored by parser)

## Coordinate System

- Origin `0,0` is **top-left**
- X increases rightward, Y increases downward
- All coordinates are **absolute canvas coordinates** — even for shapes inside groups
- Position syntax: `@X,Y` (e.g., `@100,200`)
- Size syntax: `[WxH]` (e.g., `[120x60]`)

## Nodes

Everything that isn't an edge is a `node` — shapes, text labels, stencils, tables, swimlanes:

```
node ID "label" @X,Y [WxH] [in=PARENT] { style-props }
```

| Field | Required | Description |
|-------|----------|-------------|
| `node` | yes | Element keyword |
| `ID` | yes | Unique identifier |
| `"label"` | yes | Display text (see Labels section) |
| `@X,Y` | yes | Position (absolute canvas coordinates) |
| `[WxH]` | no | Size override |
| `in=PARENT` | no | Parent container node ID |
| `{ ... }` | no | Style block (see below) |

### Examples

```
# Basic shapes
node svc "Service A" @100,100 [120x60] { rounded=1; $c0 }
node db "PostgreSQL" @300,100 [80x80] { shape=cylinder3; $c1 }
node doc "Report" @500,100 [120x80] { shape=document; $c2 }

# Text label (no shape border)
node note1 "Important!" @100,300 { text; fillColor=none; strokeColor=none; fontSize=16; fontStyle=1 }

# Swimlane container
node pool "Services" @50,50 [500x400] { swimlane; startSize=23; container=1; $c7 }
node auth "Auth" @70,90 [120x60] in=pool { rounded=1; $c0 }

# UML actor
node user "User" @20,100 [30x55] { shape=umlActor; verticalLabelPosition=bottom; verticalAlign=top }

# Stencil (preserved from Visio imports)
node icon "Server" @400,100 [76x76] { shape=stencil(base64...); strokeWidth=2 }
```

## Style Blocks `{ ... }`

The style block contains **draw.io native style properties** in `key=value;` format:

```
{ rounded=1; fillColor=#EFF6FF; strokeColor=#3b82f6; fontSize=14; fontStyle=1 }
```

Any draw.io style property works:
- **Shape type**: `shape=cylinder3`, `shape=document`, `shape=flexArrow`, `swimlane`, `rhombus`, `ellipse`
- **Colors**: `fillColor=#hex`, `strokeColor=#hex`, `fontColor=#hex`
- **Text**: `fontSize=14`, `fontStyle=1` (1=bold, 2=italic, 3=both), `fontFamily=Arial`, `align=left`, `verticalAlign=top`
- **Border**: `strokeWidth=2`, `rounded=1`, `dashed=1`, `arcSize=15`
- **Container**: `container=1`, `collapsible=0`
- **Flags**: `aspect=fixed` (circle), `boundedLbl=1`

Value-less flags use just the key: `{ rounded; text; swimlane }`

### Theme Variables `$token`

Colors and fonts use `$token` references resolved from `diagram-styles.css` at build time:

#### Color tokens

| Variable | Resolves to | Example |
|----------|-------------|---------|
| `$c0` | shorthand: sets fillColor + strokeColor + fontColor from c0 | `{ rounded=1; $c0 }` |
| `$c0.fill` | `--c0-fill` hex value | `fillColor=$c0.fill` |
| `$c0.stroke` | `--c0-stroke` hex value | `strokeColor=$c0.stroke` |
| `$c0.font` | `--c0-font` hex value | `fontColor=$c0.font` |
| `$default` | default fill/stroke/font | `{ $default }` |

The 10 color tokens (light theme): c0=Blue, c1=Green, c2=Amber, c3=Red, c4=Purple, c5=Indigo, c6=Pink, c7=Slate, c8=Orange, c9=Teal.

#### Font tokens

| Variable | Resolves to |
|----------|-------------|
| `$font` | `--font-default` (Arial, Helvetica, etc.) |
| `$font.mono` | `--font-mono` (SF Mono, Consolas, etc.) |
| `$font.notes` | `--font-notes` (Comic Sans, etc.) |

#### Literal values

Literal hex colors and raw values are allowed — they won't change with the theme:
```
node custom "Custom" @100,100 { fillColor=#ff6600; strokeColor=#cc4400; fontFamily=Georgia }
```

## Labels

Labels support both plain text and HTML:

- **Plain text**: `"Hello World"` — simple labels
- **Line breaks**: `"Line 1\nLine 2"` — `\n` converts to `<br>` in draw.io
- **HTML formatting**: `"<b>Bold</b> and <font color='red'>red</font>"` — preserved when present
- **Escaped quotes**: `"He said \"hello\""` — use `\"` for literal quotes

When parsing draw.io files, the DSL automatically:
- Preserves HTML formatting tags (`<b>`, `<i>`, `<font>`, `<u>`, etc.)
- Converts structural tags (`<div>`, `<p>`, `<br>`) to `\n`
- Strips other HTML tags (layout wrappers, spans without formatting)

This means simple labels stay readable while complex formatting survives the round-trip.

## Edges

```
edge SOURCE ARROW TARGET ["label"] [in=PARENT] [via X1,Y1 ...] { style-props }
```

| Field | Required | Description |
|-------|----------|-------------|
| `edge` | yes | Element keyword |
| `SOURCE` | yes | Source node ID, or `@X,Y` for floating endpoint |
| `ARROW` | yes | Arrow operator (see table) |
| `TARGET` | yes | Target node ID, or `@X,Y` for floating endpoint |
| `"label"` | no | Connection label |
| `in=PARENT` | no | Parent container (for edges inside groups/swimlanes) |
| `via X,Y ...` | no | Waypoints |
| `{ ... }` | no | Style overrides |

### Arrow Operators

Convenience shortcuts that set default edge style properties:

| Arrow | Sets | Visual |
|-------|------|--------|
| `->` | `endArrow=classic;endFill=1` | solid arrow |
| `-->` | same + `dashed=1` | dashed arrow |
| `=>` | same + `strokeWidth=2` | thick arrow |
| `==>` | same + `dashed=1;strokeWidth=2` | thick dashed |
| `--` | `endArrow=none;endFill=0` | plain line |
| `---` | same + `dashed=1` | dashed line |
| `<->` | both start + end arrows | bidirectional |
| `<-->` | same + `dashed=1` | dashed bidirectional |
| `<=>` | both arrows + `strokeWidth=2` | thick bidirectional |
| `*->` | `startArrow=diamond;startFill=1` | UML composition |
| `o->` | `startArrow=diamond;startFill=0` | UML aggregation |
| `#->` | `endArrow=block;endFill=0` | UML inheritance |
| `~->` | `endArrow=block;endFill=0;dashed=1` | UML realization |
| `+->` | `endArrow=open;endFill=0;dashed=1` | UML dependency |

**Terminal markers** (append to non-bidirectional arrows): `-x` (cross), `-o` (circle)

Explicit `{ }` properties **override** arrow defaults:
```
edge a -> b { endArrow=block; strokeWidth=3; strokeColor=#ff0000 }
```

### Floating Edges

Edges without node endpoints use `@X,Y` coordinates:
```
edge @100,200 -> @300,400 { strokeWidth=2 }
```

### Waypoints

Route edges through specific points:
```
edge a -> b "data flow" via 200,300 400,300
```

## Groups & Containers

Define a container node, then assign children with `in=`:

```
node vpc "VPC" @20,20 [760x500] { rounded=1; container=1; $c7 }
node subnet "Public Subnet" @40,60 [340x200] in=vpc { rounded=1; container=1; $c0 }
node alb "ALB" @60,110 [120x60] in=subnet { rounded=1; $c0 }
```

- All positions use **absolute canvas coordinates** (converted to parent-relative in XML)
- Edges inside containers use `in=PARENT` to track their parent
- The builder handles absolute→relative coordinate conversion automatically

## Complete Example

```
diagram "Microservices Architecture"

# Infrastructure container
node vpc "AWS VPC" @20,20 [700x400] { rounded=1; container=1; $c7 }

# Services
node api "API Gateway" @60,80 [140x50] in=vpc { rounded=1; $c0 }
node auth "Auth Service" @60,180 [140x50] in=vpc { rounded=1; $c4 }
node db "PostgreSQL" @350,180 [80x80] in=vpc { shape=cylinder3; $c1 }
node cache "Redis" @350,80 [80x60] in=vpc { shape=cylinder3; $c3 }

# External
node user "User" @-60,100 [30x55] { shape=umlActor; verticalLabelPosition=bottom; verticalAlign=top }
node cdn "CloudFront" @-60,250 [120x80] { shape=mxgraph.aws4.cloudfront; $c8 }

# Connections
edge user -> api "HTTPS"
edge api -> auth "validate" { edgeStyle=orthogonalEdgeStyle }
edge api -> cache "session"
edge auth -> db "query" { edgeStyle=orthogonalEdgeStyle }

# Annotations
node note1 "<b>Note:</b> All traffic encrypted in transit" @500,350 { text; fillColor=none; strokeColor=none; fontSize=10 }
```
