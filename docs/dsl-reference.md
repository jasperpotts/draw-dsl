# DSL Reference

> Back to [README](../README.md)

## File Structure

A `.dsl` file has two sections: header and body.

```
diagram "Service Architecture"
stylesheet "diagram-styles.css"

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
| `"label"` | yes | Display text (quoted string, can be `""` for no label) |
| `@X,Y` | yes | Position (top-left corner, absolute canvas coordinates) |
| `[WxH]` | no | Size override (default per shape type) |
| `c=C` | no | Color token (`c0`–`c9`) |
| `text=CLASS` | no | Text style class (`h1`–`h4`, `b1`–`b6`, `mono`). Default: `b3` |
| `in=GROUP` | no | Parent group ID |

### Shape Vocabulary (17 shapes)

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

### Shape Defaults

- **Font:** `--font-default` for all shapes except `note` (which uses `--font-notes`)
- **Text class:** `b3` (12px) when no `text=` specified
- **Color:** `--default-fill`, `--default-stroke`, `--default-font` when no `c=` specified

### Note Behavior

Notes always render with the handwriting font (`--font-notes`) and folded corner geometry, regardless of other attributes. When no `c=` is specified, notes default to amber (`c2`). When `c=` is specified, the note changes color but keeps its distinctive note appearance (handwriting font, folded corner, no border radius).

## Connections

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
| `c=C` | no | Color token — stroke uses `--cN-stroke`, label uses `--cN-font` |
| `text=CLASS` | no | Text style class (`ct1`, `ct2`). Default: `ct1` |
| `imp=N` | no | Importance level (`1`–`4`, see stylesheet) |
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
| `-x` | Cross/rejection terminal | `->-x`, `-->-x`, `=>-x` |
| `-o` | Open circle terminal | `->-o`, `-->-o`, `=>-o` |

Terminal markers replace the arrowhead on the target end. They are not valid on bidirectional arrows (`<->`, `<-->`, `<=>`).

### Connection Defaults

- **Font:** `--font-default` for labels
- **Text class:** `ct1` (10px) when no `text=` specified
- **Label rendering:** no background behind labels — label color must be readable against the diagram background
- **Color:** when `c=` is set, stroke uses `--cN-stroke` and label text uses `--cN-font`. Fill is not applicable to connections.

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

cyl db "Postgres" @100,100 c=c0 in=infra
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
text ID "label" @X,Y [text=CLASS]
```

- Default text class: `b2` (14px) when no `text=` specified
- Font: `--font-default`
- Text style classes control font size, weight, and color via the stylesheet

## Notes

Notes use the `note` shape with automatic sticky-note styling:

```
note n1 "This service handles\nauthentication" @400,50 c=c2
```

- Multi-line text uses `\n` within the quoted string
- Notes always use the handwriting font (`--font-notes`) — `c=` only changes colors, not the font
- The `note` shape always renders with a folded corner
- Default color is amber (`c2`) when no `c=` specified