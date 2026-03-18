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

See [docs/dsl-reference.md](docs/dsl-reference.md) for the complete DSL specification — shapes, connections, groups, text, notes, and coordinate system.

**Quick syntax:**

```
SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
SOURCE -> TARGET ["label"] [c=C] [imp=N] [via X,Y ...]
text ID "label" @X,Y [text=CLASS]
```

**Shapes:** `box` `rbox` `dia` `circle` `ellipse` `cyl` `cloud` `para` `hex` `trap` `tri` `note` `doc` `actor` `queue` `step` `card`
**Arrows:** `->` `-->` `=>` `==>` `--` `---` `<->` `<-->` `<=>` `*->` `o->` `#->` `~->` `+->`
**Colors:** `c0`(blue) `c1`(green) `c2`(amber) `c3`(red) `c4`(purple) `c5`(indigo) `c6`(pink) `c7`(slate) `c8`(orange) `c9`(teal)

---

## Stylesheet Reference

See [docs/stylesheet-reference.md](docs/stylesheet-reference.md) for the complete stylesheet specification — CSS subset definition, theme system, all style definitions, and customization guide.

**Default stylesheet:** [`diagram-styles.css`](diagram-styles.css)

**Quick reference:**
- **Text:** `h1`–`h4` (headings), `b1`–`b6` (body), `ct1`–`ct2` (connections), `mono` (code)
- **Importance:** `imp=1`(bold) `imp=2`(normal) `imp=3`(thin) `imp=4`(thin-dashed)
- **Themes:** SVG embeds both light + dark with automatic `prefers-color-scheme` switching. `--theme` flag forces a single theme for PNG/PDF export.

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

Claude Code is the edit engine — it calls `diagram_parse` to read an existing diagram, edits the DSL directly, validates with `diagram_validate`, and renders with `diagram_render`.

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
staging --> registry "pull" imp=3
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

Use `diagram_parse`, `diagram_validate`, and `diagram_render` MCP tools to create/edit diagrams. Diagrams use draw-dsl format stored as `.drawio.svg`.

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
**Text:** h1-h4 (headings) b1-b6 (body) ct1-ct2 (connections) mono (code)
**Importance:** imp=1(bold) imp=2(normal) imp=3(thin) imp=4(thin-dashed)

### Workflow
1. Use `diagram_parse` to read existing .drawio.svg → DSL
2. Edit the DSL text directly
3. Use `diagram_validate` to check DSL before rendering
4. Use `diagram_render` to write DSL → .drawio.svg
5. Commit only the `.drawio.svg` file (DSL is transient)
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
| **Valid text classes** | `text=` must be `h1`–`h4`, `b1`–`b6`, `ct1`–`ct2`, or `mono` |
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
