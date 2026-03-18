# draw-dsl

A compact, coordinate-based DSL for [draw.io](https://draw.io) diagrams — designed for AI generation and editing.

## What is draw-dsl?

AI models need a token-efficient, text-friendly format for creating and editing architecture diagrams. Auto-layout tools like Mermaid are limiting; raw draw.io XML is verbose and fragile. draw-dsl sits in the sweet spot: compact enough for an LLM context window, expressive enough for precise, creative layouts.

```
diagram DSL (compact, human/LLM editable)
    ↕  round-trip via CLI
.drawio.svg (viewable on GitHub + editable in draw.io)
```

Diagrams are authored in DSL, rendered to `.drawio.svg` for storage in repos, and can be round-tripped back to DSL for editing. A shared CSS-subset stylesheet enforces consistent styling across all diagrams in a project.

**Key benefits:**
- **AI-friendly** — compact token footprint, easy for LLMs to read and write
- **GitHub-renderable** — `.drawio.svg` files display inline in markdown and PRs
- **Consistent styling** — shared stylesheet with 10 color tokens and automatic light/dark theme switching

---

## Getting Started

### Prerequisites

- **Node.js** (for running the CLI)
- **draw.io Desktop** (for rendering — the CLI shells out to draw.io for SVG/PNG generation)

### Your First Diagram

1. Create a file called `example.dsl`:

```
diagram "My First Diagram"
stylesheet "diagram-styles.css"

rbox api "API Gateway" @100,50 c=c0
rbox svc "Order Service" @100,180 c=c1
cyl db "Postgres" @100,310 c=c4

api -> svc "REST"
svc -> db "query"
```

2. Render it:

```bash
diagram-tool render example.dsl -o example.drawio.svg
```

3. Open the `.drawio.svg` in a browser, or commit it to GitHub where it renders inline.

---

## Quick DSL Reference

```
SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
SOURCE -> TARGET ["label"] [c=C] [imp=N] [via X,Y ...]
text ID "label" @X,Y [text=CLASS]
```

**Shapes:** `box` `rbox` `dia` `circle` `ellipse` `cyl` `cloud` `para` `hex` `trap` `tri` `note` `doc` `actor` `queue` `step` `card`
**Arrows:** `->` `-->` `=>` `==>` `--` `---` `<->` `<-->` `<=>` `*->` `o->` `#->` `~->` `+->`
**Colors:** `c0`(blue) `c1`(green) `c2`(amber) `c3`(red) `c4`(purple) `c5`(indigo) `c6`(pink) `c7`(slate) `c8`(orange) `c9`(teal)

Full specification: [docs/dsl-reference.md](docs/dsl-reference.md)

---

## Styling

Diagrams use a shared stylesheet (`diagram-styles.css`) with:

- **10 color tokens** (`c0`–`c9`) — no raw hex colors allowed
- **Text classes** — `h1`–`h4` (headings), `b1`–`b6` (body), `ct1`–`ct2` (connections), `mono` (code)
- **Importance levels** — `imp=1`(bold) `imp=2`(normal) `imp=3`(thin) `imp=4`(thin-dashed)
- **Automatic light/dark theme** — SVG embeds both themes with `prefers-color-scheme` switching

Full specification: [docs/stylesheet-reference.md](docs/stylesheet-reference.md) | Default stylesheet: [`diagram-styles.css`](diagram-styles.css)

---

## Tools & Integrations

### CLI

The `diagram-tool` CLI parses, renders, and validates diagrams. Supports piping, multiple output formats (`.drawio.svg`, `.drawio.png`, `.drawio`), and automatic stylesheet resolution.

See [docs/architecture.md](docs/architecture.md) for full CLI usage, supported formats, and stylesheet resolution order.

### MCP Server (Claude Code)

An MCP server wraps the CLI as structured tools (`diagram_parse`, `diagram_render`, `diagram_validate`) so Claude Code can create and edit diagrams directly. Add the CLAUDE.md snippet to your project and Claude handles the full workflow.

See [docs/architecture.md](docs/architecture.md) for MCP tool details and the CLAUDE.md snippet.

### JetBrains Plugin

A JetBrains IDE plugin for visual editing of `.drawio.svg` diagrams. Embeds draw.io as the canvas with custom side panels scoped to the draw-dsl subset — only the 17 shapes, 10 color tokens, and defined styles are exposed.

See [jetbrains-plugin/README.md](jetbrains-plugin/README.md) for setup and architecture.

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

## Documentation

| Document | Description |
|----------|-------------|
| [DSL Reference](docs/dsl-reference.md) | Complete shape, connection, group, and text specification |
| [Stylesheet Reference](docs/stylesheet-reference.md) | CSS subset, theme system, color palette, text styles |
| [Architecture & Technical Reference](docs/architecture.md) | CLI usage, MCP tools, validation rules, CLAUDE.md snippet |
| [JetBrains Plugin](jetbrains-plugin/README.md) | Visual editor plugin for JetBrains IDEs |

---

## Future Plans

- **Custom draw.io UI** — minimal, cleaned-up version of draw.io with built-in DSL/stylesheet support for human hand-editing in an easy round-trip workflow
- **Auto-layout hints** — optional `layout=lr` / `layout=tb` directives for simple diagrams that don't need manual positioning
- **Playwright renderer** — headless browser-based rendering as an alternative to the draw.io Desktop CLI, for CI/headless environments
- **Shape libraries** — cloud provider icon packs (AWS, GCP, Azure) as importable shape sets with their own keywords
- **Live preview** — file watcher that re-renders on DSL changes
