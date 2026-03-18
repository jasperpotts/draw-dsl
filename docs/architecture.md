# Architecture & Technical Reference

> Back to [README](../README.md) | [DSL Reference](dsl-reference.md) | [Stylesheet](stylesheet-reference.md)

---

## Architecture

Three layers:

1. **CLI tool** (`draw-dsl`) — the core engine that parses, renders, and validates
2. **MCP server** — thin wrapper exposing the CLI as structured tools for Claude Code
3. **CLAUDE.md** — workflow instructions and condensed DSL reference so Claude knows when/how to use the tools

---

## CLI Usage

```bash
draw-dsl parse <file.drawio.svg>        # .drawio.svg → DSL (stdout)
draw-dsl render <file.dsl>              # DSL → .drawio.svg (stdout)
draw-dsl render <file.dsl> -o out.svg   # DSL → file
draw-dsl validate <file.dsl>            # Check DSL against rules
```

### Stylesheet Resolution

The tool resolves the stylesheet in this order:

1. `--stylesheet <path>` CLI flag
2. Search for `diagram-styles.css` upward from the input/output file's directory
3. If not found, use built-in defaults

### Piping

All commands support stdin/stdout for piping:

```bash
cat arch.dsl | draw-dsl render > arch.drawio.svg
draw-dsl parse arch.drawio.svg | draw-dsl validate
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

### Parse — Best-Effort Smart Reverse Mapping

The `parse` command (and `diagram_parse` MCP tool) does **best-effort reverse mapping** from draw.io XML back to DSL. This includes:
- Closest color distance for hex values → `c0`–`c9` token
- Nearest font-size match → text class (`h1`–`h4`, `b1`–`b6`, `ct1`–`ct2`)
- Shape style → DSL shape keyword (using the alias table in reverse)

The result is a valid DSL file that approximates the original diagram. Some precision loss is expected when round-tripping diagrams that were hand-edited in draw.io.

---

## Validation Rules

The validator checks:

| Rule | Description |
|------|-------------|
| **Unique IDs** | All shape/text IDs must be unique within a diagram |
| **Valid shape keywords** | Only the 16 recognized shape types (unrecognized keywords are tried as `shape=<keyword>`) |
| **Valid arrow syntax** | Only recognized arrow operators |
| **No raw hex colors** | `c=` must use `c0`–`c9` tokens only; hex literals are rejected |
| **Valid text classes** | `text=` must be `h1`–`h4`, `b1`–`b6`, `ct1`–`ct2`, `mono`, or a comma pair (e.g. `b1,mono`) |
| **Valid importance** | `imp=` must be `1`–`4` |
| **Valid routing** | `route=` must be `ortho`, `straight`, `curved`, `elbow`, `er`, or `iso` |
| **Valid coordinates** | `@X,Y` must be non-negative integers |
| **Valid sizes** | `WxH` must be positive integers |
| **Group references** | `in=GROUP` must reference an existing shape ID |
| **Connection endpoints** | Source and target IDs must exist |
| **Waypoint format** | `via` coordinates must be valid `X,Y` pairs |
| **Quoted strings** | Labels must be properly quoted |

---

## Workflow (CLAUDE.md Snippet)

This condensed reference goes in your project's `CLAUDE.md` for Claude Code:

````markdown
## Diagrams

Use `diagram_parse`, `diagram_validate`, and `diagram_render` MCP tools to create/edit diagrams. Diagrams use draw-dsl format stored as `.drawio.svg`.

### DSL Quick Reference

```
diagram "Title"

SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
SOURCE -> TARGET ["label"] [c=C] [text=CLASS] [imp=N] [route=R] [via X,Y ...]
text ID "label" @X,Y [c=C] [text=CLASS]
```

**Shapes (16):** box rbox diamond circle ellipse cylinder cloud parallelogram hexagon trapezoid triangle note document person step card
**Arrows:** -> --> => ==> -- --- <-> <--> <=> *-> o-> #-> ~-> +->
**Colors:** c0(blue) c1(green) c2(amber) c3(red) c4(purple) c5(indigo) c6(pink) c7(slate) c8(orange) c9(teal)
**Text:** h1-h4 (headings) b1-b6 (body) ct1-ct2 (connections) mono (font-family, combinable: text=b1,mono)
**Importance:** imp=1(3px) imp=2(2px) imp=3(1px, default) imp=4(1px dashed) — thick arrows (=> ==> <=>) apply 2x multiplier
**Routing:** route=ortho(default) route=straight route=curved route=elbow route=er route=iso

### Workflow
1. Use `diagram_parse` to read existing .drawio.svg → DSL
2. Edit the DSL text directly
3. Use `diagram_validate` to check DSL before rendering
4. Use `diagram_render` to write DSL → .drawio.svg
5. Commit only the `.drawio.svg` file (DSL is transient)
```
````
