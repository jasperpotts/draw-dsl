# draw-dsl

A compact, coordinate-based DSL for [draw.io](https://draw.io) diagrams — designed for AI generation and editing.

**Why?** AI models need a token-efficient, text-friendly format for creating and editing architecture diagrams. Auto-layout tools like Mermaid are limiting; raw draw.io XML is verbose and fragile. draw-dsl sits in the sweet spot: compact enough for an LLM context window, expressive enough for precise, creative layouts.

**How it works:**

```
diagram DSL (compact, human/LLM editable)
    ↕  round-trip via CLI
.drawio.svg (viewable on GitHub + editable in draw.io)
```

Diagrams are authored in DSL, rendered to `.drawio.svg` for storage in repos, and can be round-tripped back to DSL for editing. A shared CSS-subset stylesheet enforces consistent styling across all diagrams in a project.

---

## Architecture

Three layers:

1. **CLI tool** (`diagram-tool`) — the core engine that parses, renders, and validates
2. **MCP server** — thin wrapper exposing the CLI as structured tools for Claude Code
3. **CLAUDE.md** — workflow instructions and condensed DSL reference so Claude knows when/how to use the tools

---

## DSL Reference

### File Structure

A `.dsl` file has three sections: header, stylesheet reference, and body.

```
diagram "Service Architecture"
stylesheet "diagram-styles.css"

# shapes, connections, groups, text...
```

- One element per line
- `#` line comments
- Blank lines for readability (ignored by parser)
- All coordinates are in draw.io units (1 unit = 1 pixel at 100% zoom)

### Coordinate System

- Origin `0,0` is **top-left**
- X increases rightward, Y increases downward
- Coordinates use the `@X,Y` syntax: `@100,200`
- Optional size override: `[WxH]` after coordinates

### Shapes

```
SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
```

| Field | Required | Description |
|-------|----------|-------------|
| `SHAPE` | yes | Shape keyword (see table below) |
| `ID` | yes | Unique identifier (`[a-zA-Z][a-zA-Z0-9_-]*`) |
| `"label"` | yes | Display text (quoted string, can be `""` for no label) |
| `@X,Y` | yes | Position (top-left corner of shape) |
| `[WxH]` | no | Size override (default per shape type) |
| `c=C` | no | Color token (`c0`–`c9`) |
| `text=CLASS` | no | Text style class (`h1`–`h4`, `b1`–`b6`) |
| `in=GROUP` | no | Parent group ID |

#### Shape Vocabulary (17 shapes)

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

### Connections

Connections use bare arrow syntax — no keyword prefix needed:

```
SOURCE ARROW TARGET ["label"] [c=C] [text=CLASS] [imp=N] [via X1,Y1 X2,Y2 ...]
```

| Field | Required | Description |
|-------|----------|-------------|
| `SOURCE` | yes | Source shape ID |
| `ARROW` | yes | Arrow type (see table below) |
| `TARGET` | yes | Target shape ID |
| `"label"` | no | Connection label (quoted string) |
| `c=C` | no | Color token (`c0`–`c9`) |
| `text=CLASS` | no | Text style class (`ct1`, `ct2`) |
| `imp=N` | no | Importance level (`1`–`4`, see stylesheet) |
| `via X1,Y1 ...` | no | Waypoints for routing |

#### Arrow Types

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
| `*->` | Composition | Filled diamond → arrow |
| `o->` | Aggregation | Open diamond → arrow |
| `#->` | Inheritance | Triangle arrowhead |
| `~->` | Realization | Dashed + triangle arrowhead |
| `+->` | Dependency | Dashed arrow |

**Terminal markers (append to any arrow):**

| Suffix | Description |
|--------|-------------|
| `-x` | Cross/rejection terminal |
| `-o` | Open circle terminal |

#### Connection Routing with `via`

Use waypoints to route connections through specific coordinates, avoiding overlaps:

```
api -> db "query" via 200,300 400,300
```

Waypoints are listed as space-separated `X,Y` pairs after the `via` keyword. The connection will pass through each waypoint in order from source to target.

### Groups & Containers

Groups are shapes that contain other shapes. Define the group first, then assign children with `in=`:

```
rbox infra "Infrastructure" @50,50 [500x400] c=c7

cyl db "Postgres" @100,100 c=c0 in=infra
rbox cache "Redis" @300,100 c=c3 in=infra
```

- Any shape can be a group/container
- Children use `in=GROUP_ID` to declare membership
- Group membership is **flat** — no nested brace syntax
- The group shape defines the container boundary; children are positioned in absolute coordinates within it

### Text Elements

Standalone text labels (no shape border):

```
text ID "label" @X,Y [text=CLASS]
```

Text style classes control font size, weight, and color via the stylesheet.

### Notes

Notes use the `note` shape with automatic sticky-note styling:

```
note n1 "This service handles\nauthentication" @400,50 c=c2
```

- Multi-line text uses `\n` within the quoted string
- Notes use the handwriting font defined in the stylesheet
- The `note` shape always renders with a folded corner

---

## Stylesheet Reference

The stylesheet uses a **CSS-subset** syntax with custom properties. It defines colors, fonts, text styles, and connection styles that the DSL references by token.

### File Format

```css
/* diagram-styles.css */
@theme light {
  /* color palette, fonts, styles for light theme */
}

@theme dark {
  /* overrides for dark theme */
}
```

### Color Palette (`c0`–`c9`)

Ten color tokens — **pure colors with no semantic meaning**. The AI/user picks colors for visual clarity, not because a specific color implies a specific purpose. This keeps the palette flexible across different diagram types.

Each color defines a fill (light pastel), stroke (vivid), and font color:

```css
@theme light {
  --c0-fill: #EFF6FF;    --c0-stroke: #3b82f6;   --c0-font: #1e40af;   /* Blue */
  --c1-fill: #ECFDF5;    --c1-stroke: #10b981;   --c1-font: #065f46;   /* Green */
  --c2-fill: #FEF3C7;    --c2-stroke: #f59e0b;   --c2-font: #92400e;   /* Amber */
  --c3-fill: #FEE2E2;    --c3-stroke: #ef4444;   --c3-font: #991b1b;   /* Red */
  --c4-fill: #F3E8FF;    --c4-stroke: #a855f7;   --c4-font: #6b21a8;   /* Purple */
  --c5-fill: #E0E7FF;    --c5-stroke: #6366f1;   --c5-font: #4338ca;   /* Indigo */
  --c6-fill: #FCE7F3;    --c6-stroke: #ec4899;   --c6-font: #9d174d;   /* Pink */
  --c7-fill: #F8FAFC;    --c7-stroke: #94a3b8;   --c7-font: #334155;   /* Slate */
  --c8-fill: #FFF7ED;    --c8-stroke: #f97316;   --c8-font: #c2410c;   /* Orange */
  --c9-fill: #F0FDFA;    --c9-stroke: #14b8a6;   --c9-font: #115e59;   /* Teal */
}
```

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

**No raw hex colors are allowed in DSL files.** The validator rejects any hex color literal — all coloring must go through `c0`–`c9` tokens.

### Font Definitions

Three font stacks, using only system-available fonts (required for self-contained GitHub SVG rendering):

```css
:root {
  --font-default: "Arial Narrow", Arial, "Helvetica Neue", Helvetica, sans-serif;
  --font-notes: "Comic Sans MS", "Comic Sans", "Marker Felt", cursive;
  --font-mono: "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace;
}
```

| Stack | Usage |
|-------|-------|
| `--font-default` | All shapes, connections, headings, body text |
| `--font-notes` | `note` shapes (handwriting style) |
| `--font-mono` | Code snippets within labels |

### Text Style Classes

**Headings** (`h1`–`h4`) — for titles and section headers:

```css
.h1 { font-size: 24px; font-weight: bold; }
.h2 { font-size: 20px; font-weight: bold; }
.h3 { font-size: 16px; font-weight: bold; }
.h4 { font-size: 14px; font-weight: bold; }
```

**Body** (`b1`–`b6`) — for shape labels and general text:

```css
.b1 { font-size: 16px; }   /* Large body */
.b2 { font-size: 14px; }   /* Default shape label */
.b3 { font-size: 12px; }   /* Small */
.b4 { font-size: 11px; }   /* Smaller */
.b5 { font-size: 10px; }   /* Fine print */
.b6 { font-size: 9px; }    /* Micro */
```

**Connection text** (`ct1`, `ct2`) — for connection labels:

```css
.ct1 { font-size: 12px; }  /* Default connection label */
.ct2 { font-size: 10px; }  /* Secondary/minor connection label */
```

### Connection Importance Levels

The `imp=` attribute on connections maps to visual weight:

```css
.imp1 { stroke-width: 3px; }                          /* Bold — critical path */
.imp2 { stroke-width: 2px; }                          /* Normal (default) */
.imp3 { stroke-width: 1px; }                          /* Thin — secondary */
.imp4 { stroke-width: 1px; stroke-dasharray: 4 2; }   /* Thin dashed — minor */
```

### Note Style

Notes automatically receive the handwriting font and a warm post-it appearance:

```css
.note {
  font-family: var(--font-notes);
  fill: var(--c2-fill);      /* Amber background */
  stroke: var(--c2-stroke);
  border-radius: 0;
  /* Folded corner rendered by shape geometry */
}
```

### Dark Theme

The dark theme overrides only the color palette — font sizes, weights, and importance levels stay the same:

```css
@theme dark {
  --c0-fill: #1e3a5f;    --c0-stroke: #60a5fa;   --c0-font: #bfdbfe;   /* Blue */
  --c1-fill: #1a3a2a;    --c1-stroke: #34d399;   --c1-font: #a7f3d0;   /* Green */
  --c2-fill: #3d2e0a;    --c2-stroke: #fbbf24;   --c2-font: #fde68a;   /* Amber */
  --c3-fill: #3b1c1c;    --c3-stroke: #f87171;   --c3-font: #fecaca;   /* Red */
  --c4-fill: #2e1a47;    --c4-stroke: #c084fc;   --c4-font: #e9d5ff;   /* Purple */
  --c5-fill: #1e1b4b;    --c5-stroke: #818cf8;   --c5-font: #c7d2fe;   /* Indigo */
  --c6-fill: #3b1a2e;    --c6-stroke: #f472b6;   --c6-font: #fbcfe8;   /* Pink */
  --c7-fill: #1e293b;    --c7-stroke: #64748b;   --c7-font: #cbd5e1;   /* Slate */
  --c8-fill: #3b1f0a;    --c8-stroke: #fb923c;   --c8-font: #fed7aa;   /* Orange */
  --c9-fill: #0f2a2a;    --c9-stroke: #2dd4bf;   --c9-font: #99f6e4;   /* Teal */
}
```

---

## CLI Usage

```bash
diagram-tool parse <file.drawio.svg>        # .drawio.svg → DSL (stdout)
diagram-tool render <file.dsl>              # DSL → .drawio.svg (stdout)
diagram-tool render <file.dsl> -o out.svg   # DSL → file
diagram-tool validate <file.dsl>            # Check DSL against rules
```

### Stylesheet Resolution

The tool resolves the stylesheet in this order:

1. `--stylesheet <path>` CLI flag
2. `stylesheet` directive in the DSL file
3. Search for `diagram-styles.css` in the input file's directory, then parent directories

### Piping

All commands support stdin/stdout for piping:

```bash
cat arch.dsl | diagram-tool render > arch.drawio.svg
diagram-tool parse arch.drawio.svg | diagram-tool validate
```

### Supported Formats

| Format | Read | Write | Notes |
|--------|------|-------|-------|
| `.drawio.svg` | yes | yes | **Default.** SVG with embedded draw.io XML. Renders on GitHub. |
| `.drawio.png` | yes | yes | PNG with embedded draw.io XML metadata |
| `.drawio` | yes | yes | Raw draw.io XML |

---

## MCP Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `diagram_parse` | file path | DSL text | Convert .drawio.svg → DSL |
| `diagram_render` | DSL text, output path | writes file | Convert DSL → .drawio.svg |
| `diagram_validate` | DSL text | errors or OK | Check DSL against rules |
| `edit_diagram` | file path, edit instructions | writes file | **Primary tool** — parse, edit, render in one step |

`edit_diagram` is the main tool for Claude Code. It handles the full round-trip: parse the existing diagram, apply edits to the DSL, validate, and render back to `.drawio.svg`.

---

## Example Diagrams

### Microservices Architecture

```
diagram "Order Service Architecture"
stylesheet "diagram-styles.css"

# External
cloud inet "Internet" @10,10 [140x80] c=c7
actor user "Customer" @50,120 c=c7

# API Gateway
rbox gw "API Gateway" @200,50 c=c0

# Services
rbox orders "Order\nService" @100,200 c=c0
rbox payments "Payment\nService" @300,200 c=c1
rbox notify "Notification\nService" @500,200 c=c4

# Data
cyl ordersDb "Orders DB" @100,350 c=c0
cyl paymentsDb "Payments DB" @300,350 c=c1
queue events "Event Bus" @350,100 c=c8

# Connections
user -> gw "HTTPS" imp=1
gw -> orders "REST"
gw -> payments "REST"
orders -> ordersDb "query" imp=2
payments -> paymentsDb "query" imp=2
orders -> events "publish"
events -> notify "subscribe"
payments -> events "publish"

# Notes
note n1 "All services use\nmTLS internally" @500,350 c=c2
```

### CI/CD Pipeline

```
diagram "CI/CD Pipeline"
stylesheet "diagram-styles.css"

# Trigger
circle start "Push" @10,100 c=c0

# Build stages
step build "Build" @100,90 c=c0
step test "Test" @240,90 c=c1
step scan "Security\nScan" @380,90 c=c4

# Decision
dia gate "Pass?" @530,80 c=c2

# Deploy stages
step staging "Deploy\nStaging" @660,40 c=c8
step prod "Deploy\nProd" @810,40 c=c1

# Failure path
box fail "Notify\nFailure" @660,160 c=c3

# Flow
start -> build
build -> test
test -> scan
scan -> gate
gate -> staging "yes"
gate -> fail "no"
staging -> prod "approved" imp=1

# Artifacts
cyl registry "Container\nRegistry" @240,220 c=c5
build -> registry "push image" imp=3
staging -> registry "pull" imp=3 -->
```

### AWS Deployment Infrastructure

```
diagram "AWS Production Infrastructure"
stylesheet "diagram-styles.css"

# VPC container
rbox vpc "VPC (10.0.0.0/16)" @20,20 [760x500] c=c7

# Public subnet
rbox pubSub "Public Subnet" @40,60 [340x200] c=c0 in=vpc
rbox alb "Application\nLoad Balancer" @60,110 c=c0 in=pubSub
rbox nat "NAT Gateway" @240,110 c=c0 in=pubSub
rbox bastion "Bastion\nHost" @240,180 c=c7 in=pubSub

# Private subnet
rbox privSub "Private Subnet" @420,60 [340x200] c=c1 in=vpc
rbox ecs1 "ECS Task" @440,110 c=c1 in=privSub
rbox ecs2 "ECS Task" @570,110 c=c1 in=privSub
rbox ecs3 "ECS Task" @440,180 c=c1 in=privSub

# Data layer
rbox dataSub "Data Subnet" @420,280 [340x220] c=c4 in=vpc
cyl rds "RDS\nPostgres" @440,330 c=c4 in=dataSub
cyl redis "ElastiCache\nRedis" @590,330 c=c3 in=dataSub
queue sqs "SQS Queue" @440,430 c=c8 in=dataSub

# External
cloud cf "CloudFront\nCDN" @60,350 c=c8
cloud inet "Internet" @60,460 c=c7

# Connections
inet -> cf "HTTPS" imp=1
cf -> alb "origin" imp=1
alb -> ecs1 imp=2
alb -> ecs2 imp=2
alb -> ecs3 imp=2
ecs1 -> rds "query" via 440,250 440,320
ecs2 -> redis "cache"
ecs1 -> sqs "enqueue" imp=3
nat -> inet "outbound" -->
bastion -> ecs1 "SSH" --> imp=4
```

---

## Workflow (CLAUDE.md Snippet)

This condensed reference goes in your project's `CLAUDE.md` for Claude Code:

````markdown
## Diagrams

Use `edit_diagram` tool to create/edit diagrams. Diagrams use draw-dsl format stored as `.drawio.svg`.

### DSL Quick Reference

```
diagram "Title"
stylesheet "diagram-styles.css"

SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
SOURCE -> TARGET ["label"] [c=C] [imp=N] [via X,Y ...]
text ID "label" @X,Y [text=CLASS]
```

**Shapes:** box rbox dia circle ellipse cyl cloud para hex trap tri note doc actor queue step card
**Arrows:** -> --> => ==> -- --- <-> <--> <=> *-> o-> #-> ~-> +->
**Colors:** c0(blue) c1(green) c2(amber) c3(red) c4(purple) c5(indigo) c6(pink) c7(slate) c8(orange) c9(teal)
**Text:** h1-h4 (headings) b1-b6 (body) ct1-ct2 (connections)
**Importance:** imp=1(bold) imp=2(normal) imp=3(thin) imp=4(thin-dashed)

### Workflow
1. Use `edit_diagram` for existing diagrams (handles parse → edit → render)
2. Use `diagram_render` for new diagrams from DSL
3. Use `diagram_validate` to check DSL before rendering
4. Commit only the `.drawio.svg` file (DSL is transient)
```
````

---

## Validation Rules

The validator checks:

| Rule | Description |
|------|-------------|
| **Unique IDs** | All shape/text IDs must be unique within a diagram |
| **Valid shape keywords** | Only the 17 recognized shape types |
| **Valid arrow syntax** | Only recognized arrow operators |
| **No raw hex colors** | `c=` must use `c0`–`c9` tokens only; hex literals are rejected |
| **Valid text classes** | `text=` must be `h1`–`h4`, `b1`–`b6`, or `ct1`–`ct2` |
| **Valid importance** | `imp=` must be `1`–`4` |
| **Valid coordinates** | `@X,Y` must be non-negative integers |
| **Valid sizes** | `WxH` must be positive integers |
| **Group references** | `in=GROUP` must reference an existing shape ID |
| **Connection endpoints** | Source and target IDs must exist |
| **Waypoint format** | `via` coordinates must be valid `X,Y` pairs |
| **Quoted strings** | Labels must be properly quoted |

---

## Future Plans

- **Custom draw.io UI** — minimal, cleaned-up version of draw.io with built-in DSL/stylesheet support for human hand-editing in an easy round-trip workflow
- **Auto-layout hints** — optional `layout=lr` / `layout=tb` directives for simple diagrams that don't need manual positioning
- **Playwright renderer** — headless browser-based rendering as an alternative to the draw.io Desktop CLI, for CI/headless environments
- **Shape libraries** — cloud provider icon packs (AWS, GCP, Azure) as importable shape sets with their own keywords
- **Live preview** — file watcher that re-renders on DSL changes
