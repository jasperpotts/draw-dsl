/**
 * DSL Parser: text → AST
 *
 * Parses the draw-dsl text format into a Diagram AST.
 * Collects errors with line numbers and continues parsing.
 */

import type {
  Diagram, DiagramElement, Shape, Connection, TextElement,
  ArrowOperator, TerminalMarker, ColorToken, TextClass,
  TextSizeClass, RouteType, ImportanceLevel, Position, Size,
  ParseError, HAlign, VAlign,
} from "./types.js";
import { ALL_ARROW_OPERATORS, BIDIRECTIONAL_ARROWS } from "../drawio/arrow-map.js";
import { KNOWN_SHAPES } from "../drawio/shape-map.js";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface Token {
  type: "string" | "word";
  value: string;
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1] !== undefined) {
      tokens.push({ type: "string", value: m[1] });
    } else {
      tokens.push({ type: "word", value: m[2] });
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_COLOR_TOKENS = new Set<string>([
  "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9",
]);

const VALID_SIZE_CLASSES = new Set<string>([
  "h1", "h2", "h3", "h4",
  "b1", "b2", "b3", "b4", "b5", "b6",
  "ct1", "ct2",
]);

const VALID_ROUTES = new Set<string>([
  "ortho", "straight", "curved", "elbow", "er", "iso",
]);

function isColorToken(s: string): s is ColorToken {
  return VALID_COLOR_TOKENS.has(s);
}

function parseTextClass(value: string): TextClass | null {
  const parts = value.split(",").map((p) => p.trim());
  const result: TextClass = {};
  for (const part of parts) {
    if (part === "mono") {
      result.mono = true;
    } else if (part === "italic") {
      result.italic = true;
    } else if (VALID_SIZE_CLASSES.has(part)) {
      result.size = part as TextSizeClass;
    } else {
      return null;
    }
  }
  return result;
}

function parsePosition(token: string): Position | null {
  // @X,Y format
  if (!token.startsWith("@")) return null;
  const coords = token.slice(1).split(",");
  if (coords.length !== 2) return null;
  const x = Number(coords[0]);
  const y = Number(coords[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseSizeToken(token: string): Size | null {
  // [WxH] format — token includes brackets
  const m = token.match(/^\[(\d+)x(\d+)\]$/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function parseKeyValue(token: string): { key: string; value: string } | null {
  const idx = token.indexOf("=");
  if (idx <= 0) return null;
  return { key: token.slice(0, idx), value: token.slice(idx + 1) };
}

/**
 * Try to match an arrow operator at the given token.
 * Returns the arrow, terminal marker, and whether it's the full token.
 */
function matchArrow(token: string): { arrow: ArrowOperator; terminal?: TerminalMarker } | null {
  // Try each arrow operator (longest first)
  for (const op of ALL_ARROW_OPERATORS) {
    if (token === op) {
      return { arrow: op as ArrowOperator };
    }
    // Check for terminal markers on non-bidirectional arrows
    if (token.startsWith(op) && !BIDIRECTIONAL_ARROWS.has(op as ArrowOperator)) {
      const rest = token.slice(op.length);
      if (rest === "-x" || rest === "-o") {
        return { arrow: op as ArrowOperator, terminal: rest as TerminalMarker };
      }
    }
  }
  return null;
}

/**
 * Determine if a word token could be a shape keyword.
 * Known shapes are always shape keywords. Unknown words are shape keywords
 * if the line structure matches the shape pattern (ID, label, @position follow).
 */
function isShapeLine(tokens: Token[]): boolean {
  if (tokens.length < 4) return false;
  const first = tokens[0].value;

  // "diagram" and "text" are handled before this check
  // Known shape keyword
  if (KNOWN_SHAPES.has(first)) return true;

  // Unknown word — check if followed by ID pattern + quoted string + @position
  // i.e., tokens: SHAPE_WORD ID "label" @X,Y ...
  if (tokens[0].type !== "word") return false;
  if (tokens[1].type !== "word") return false;
  if (tokens[2].type !== "string") return false;
  if (tokens[3].type !== "word" || !tokens[3].value.startsWith("@")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Line parsers
// ---------------------------------------------------------------------------

function parseShapeLine(
  tokens: Token[],
  lineNum: number,
  errors: ParseError[],
): Shape | null {
  // SHAPE ID "label" @X,Y [WxH] [c=C] [text=CLASS] [in=GROUP]
  const shapeType = tokens[0].value;
  const id = tokens[1]?.value;
  if (!id) {
    errors.push({ line: lineNum, message: "Shape missing ID" });
    return null;
  }

  const labelToken = tokens[2];
  if (!labelToken || labelToken.type !== "string") {
    errors.push({ line: lineNum, message: `Shape '${id}' missing quoted label` });
    return null;
  }

  const posToken = tokens[3];
  if (!posToken) {
    errors.push({ line: lineNum, message: `Shape '${id}' missing position (@X,Y)` });
    return null;
  }
  const position = parsePosition(posToken.value);
  if (!position) {
    errors.push({ line: lineNum, message: `Shape '${id}' has invalid position: ${posToken.value}` });
    return null;
  }

  const shape: Shape = {
    kind: "shape",
    shapeType,
    id,
    label: labelToken.value,
    position,
    line: lineNum,
  };

  // Parse remaining tokens (optional attributes)
  for (let i = 4; i < tokens.length; i++) {
    const tok = tokens[i].value;

    // Size override [WxH]
    const size = parseSizeToken(tok);
    if (size) {
      shape.size = size;
      continue;
    }

    // Key=value attributes
    const kv = parseKeyValue(tok);
    if (kv) {
      if (kv.key === "c") {
        if (isColorToken(kv.value)) {
          shape.color = kv.value;
        } else {
          errors.push({ line: lineNum, message: `Invalid color token '${kv.value}'` });
        }
      } else if (kv.key === "text") {
        const tc = parseTextClass(kv.value);
        if (tc) {
          shape.textClass = tc;
        } else {
          errors.push({ line: lineNum, message: `Invalid text class '${kv.value}'` });
        }
      } else if (kv.key === "align") {
        if (kv.value === "left" || kv.value === "center" || kv.value === "right") {
          shape.align = kv.value as HAlign;
        } else {
          errors.push({ line: lineNum, message: `Invalid align value '${kv.value}'` });
        }
      } else if (kv.key === "valign") {
        if (kv.value === "top" || kv.value === "middle" || kv.value === "bottom") {
          shape.verticalAlign = kv.value as VAlign;
        } else {
          errors.push({ line: lineNum, message: `Invalid valign value '${kv.value}'` });
        }
      } else if (kv.key === "container") {
        shape.container = kv.value === "true";
      } else if (kv.key === "in") {
        shape.group = kv.value;
      } else {
        errors.push({ line: lineNum, message: `Unknown shape attribute '${kv.key}'` });
      }
      continue;
    }
  }

  return shape;
}

function parseConnectionLine(
  tokens: Token[],
  lineNum: number,
  errors: ParseError[],
): Connection | null {
  // SOURCE ARROW TARGET ["label"] [c=C] [text=CLASS] [imp=N] [route=R] [via X,Y ...]
  if (tokens.length < 3) {
    errors.push({ line: lineNum, message: "Connection requires SOURCE ARROW TARGET" });
    return null;
  }

  const sourceToken = tokens[0].value;
  const arrowMatch = matchArrow(tokens[1].value);
  if (!arrowMatch) {
    errors.push({ line: lineNum, message: `Unknown arrow operator '${tokens[1].value}'` });
    return null;
  }

  const targetToken = tokens[2].value;

  // Parse floating edge endpoints: @X,Y means no cell ID, just absolute coordinates
  let source = sourceToken;
  let sourcePoint: Position | undefined;
  if (sourceToken.startsWith("@")) {
    const pos = parsePosition(sourceToken);
    if (pos) {
      sourcePoint = pos;
      source = "";
    }
  }

  let target = targetToken;
  let targetPoint: Position | undefined;
  if (targetToken.startsWith("@")) {
    const pos = parsePosition(targetToken);
    if (pos) {
      targetPoint = pos;
      target = "";
    }
  }

  const connection: Connection = {
    kind: "connection",
    source,
    arrow: arrowMatch.arrow,
    target,
    line: lineNum,
  };

  if (sourcePoint) connection.sourcePoint = sourcePoint;
  if (targetPoint) connection.targetPoint = targetPoint;

  if (arrowMatch.terminal) {
    connection.terminal = arrowMatch.terminal;
  }

  // Parse remaining tokens
  let inVia = false;
  const waypoints: Position[] = [];

  for (let i = 3; i < tokens.length; i++) {
    const tok = tokens[i];

    // Via waypoints
    if (tok.value === "via") {
      inVia = true;
      continue;
    }

    if (inVia) {
      // Parse X,Y waypoint
      const parts = tok.value.split(",");
      if (parts.length === 2) {
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          waypoints.push({ x, y });
          continue;
        }
      }
      // Not a valid waypoint — stop parsing via
      inVia = false;
    }

    if (tok.type === "string") {
      connection.label = tok.value;
      continue;
    }

    const kv = parseKeyValue(tok.value);
    if (kv) {
      if (kv.key === "c") {
        if (isColorToken(kv.value)) {
          connection.color = kv.value;
        } else {
          errors.push({ line: lineNum, message: `Invalid color token '${kv.value}'` });
        }
      } else if (kv.key === "text") {
        const tc = parseTextClass(kv.value);
        if (tc) {
          connection.textClass = tc;
        } else {
          errors.push({ line: lineNum, message: `Invalid text class '${kv.value}'` });
        }
      } else if (kv.key === "imp") {
        const imp = Number(kv.value);
        if (imp >= 1 && imp <= 4) {
          connection.importance = imp as ImportanceLevel;
        } else {
          errors.push({ line: lineNum, message: `Invalid importance level '${kv.value}'` });
        }
      } else if (kv.key === "route") {
        if (VALID_ROUTES.has(kv.value)) {
          connection.route = kv.value as RouteType;
        } else {
          errors.push({ line: lineNum, message: `Invalid route type '${kv.value}'` });
        }
      } else if (kv.key === "entry") {
        const parts = kv.value.split(",");
        if (parts.length === 2) {
          connection.entryX = Number(parts[0]);
          connection.entryY = Number(parts[1]);
        }
      } else if (kv.key === "exit") {
        const parts = kv.value.split(",");
        if (parts.length === 2) {
          connection.exitX = Number(parts[0]);
          connection.exitY = Number(parts[1]);
        }
      } else {
        errors.push({ line: lineNum, message: `Unknown connection attribute '${kv.key}'` });
      }
      continue;
    }
  }

  if (waypoints.length > 0) {
    connection.waypoints = waypoints;
  }

  return connection;
}

function parseTextLine(
  tokens: Token[],
  lineNum: number,
  errors: ParseError[],
): TextElement | null {
  // text ID "label" @X,Y [c=C] [text=CLASS]
  const id = tokens[1]?.value;
  if (!id) {
    errors.push({ line: lineNum, message: "Text element missing ID" });
    return null;
  }

  const labelToken = tokens[2];
  if (!labelToken || labelToken.type !== "string") {
    errors.push({ line: lineNum, message: `Text '${id}' missing quoted label` });
    return null;
  }

  const posToken = tokens[3];
  if (!posToken) {
    errors.push({ line: lineNum, message: `Text '${id}' missing position (@X,Y)` });
    return null;
  }
  const position = parsePosition(posToken.value);
  if (!position) {
    errors.push({ line: lineNum, message: `Text '${id}' has invalid position: ${posToken.value}` });
    return null;
  }

  const textEl: TextElement = {
    kind: "text",
    id,
    label: labelToken.value,
    position,
    line: lineNum,
  };

  for (let i = 4; i < tokens.length; i++) {
    const kv = parseKeyValue(tokens[i].value);
    if (kv) {
      if (kv.key === "c") {
        if (isColorToken(kv.value)) {
          textEl.color = kv.value;
        } else {
          errors.push({ line: lineNum, message: `Invalid color token '${kv.value}'` });
        }
      } else if (kv.key === "text") {
        const tc = parseTextClass(kv.value);
        if (tc) {
          textEl.textClass = tc;
        } else {
          errors.push({ line: lineNum, message: `Invalid text class '${kv.value}'` });
        }
      }
    }
  }

  return textEl;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface ParseResult {
  diagram: Diagram;
  errors: ParseError[];
}

export function parseDsl(dsl: string): ParseResult {
  const diagram: Diagram = { elements: [] };
  const errors: ParseError[] = [];
  const lines = dsl.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();

    // Skip blank lines and comments
    if (!line || line.startsWith("#")) continue;

    const tokens = tokenizeLine(line);
    if (tokens.length === 0) continue;

    const keyword = tokens[0].value;

    // Diagram title
    if (keyword === "diagram") {
      if (tokens[1]?.type === "string") {
        diagram.title = tokens[1].value;
      } else if (tokens[1]) {
        diagram.title = tokens[1].value;
      }
      continue;
    }

    // Text element
    if (keyword === "text") {
      const textEl = parseTextLine(tokens, lineNum, errors);
      if (textEl) diagram.elements.push(textEl);
      continue;
    }

    // Shape line: known shape keyword OR Rule 3 shape pattern
    if (isShapeLine(tokens)) {
      const shape = parseShapeLine(tokens, lineNum, errors);
      if (shape) diagram.elements.push(shape);
      continue;
    }

    // Connection line: try to match SOURCE ARROW TARGET
    if (tokens.length >= 3 && tokens[1].type === "word") {
      const arrowMatch = matchArrow(tokens[1].value);
      if (arrowMatch) {
        const conn = parseConnectionLine(tokens, lineNum, errors);
        if (conn) diagram.elements.push(conn);
        continue;
      }
    }

    errors.push({ line: lineNum, message: `Unrecognized line: ${line}` });
  }

  return { diagram, errors };
}
