# Architecture & Technical Reference

> Back to [README](../README.md) | [DSL Reference](dsl-reference.md) | [Stylesheet](stylesheet-reference.md)

---

## Architecture

Three layers:

1. **CLI tool** (`diagram-tool`) — the core engine that parses, renders, and validates
2. **MCP server** — thin wrapper exposing the CLI as structured tools for Claude Code
3. **CLAUDE.md** — workflow instructions and condensed DSL reference so Claude knows when/how to use the tools

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
**Importance:** imp=1(3px) imp=2(2px, default) imp=3(1px) imp=4(1px dashed)

### Workflow
1. Use `diagram_parse` to read existing .drawio.svg → DSL
2. Edit the DSL text directly
3. Use `diagram_validate` to check DSL before rendering
4. Use `diagram_render` to write DSL → .drawio.svg
5. Commit only the `.drawio.svg` file (DSL is transient)
```
````
