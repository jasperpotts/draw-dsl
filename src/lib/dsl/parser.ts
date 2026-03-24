/**
 * DSL Parser v2: text → AST
 *
 * Parses the v2 draw-dsl text format into a Diagram AST.
 * Supports `node` and `edge` elements with { style-block } syntax.
 */

import type {
  Diagram, Node, Edge, ArrowOperator, TerminalMarker,
  StyleMap, Position, Size, ParseError,
} from "./types.js";
import { ALL_ARROW_OPERATORS, BIDIRECTIONAL_ARROWS } from "../drawio/arrow-map.js";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface Token {
  type: "string" | "word" | "styleBlock";
  value: string;
}

/**
 * Tokenize a line, handling quoted strings and { } style blocks.
 */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip whitespace
    if (/\s/.test(line[i])) { i++; continue; }

    // Quoted string
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\') j++; // skip escaped char
        j++;
      }
      const raw = line.slice(i + 1, j);
      tokens.push({ type: "string", value: raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\') });
      i = j + 1;
      continue;
    }

    // Style block { ... }
    if (line[i] === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < line.length && depth > 0) {
        if (line[j] === '{') depth++;
        if (line[j] === '}') depth--;
        j++;
      }
      // Content between { and }
      const content = line.slice(i + 1, j - 1).trim();
      tokens.push({ type: "styleBlock", value: content });
      i = j;
      continue;
    }

    // Word (non-whitespace, non-quote, non-brace)
    let j = i;
    while (j < line.length && !/[\s"{}]/.test(line[j])) {
      j++;
    }
    tokens.push({ type: "word", value: line.slice(i, j) });
    i = j;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePosition(token: string): Position | null {
  if (!token.startsWith("@")) return null;
  const coords = token.slice(1).split(",");
  if (coords.length !== 2) return null;
  const x = Number(coords[0]);
  const y = Number(coords[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseSizeToken(token: string): Size | null {
  const m = token.match(/^\[([0-9.]+)x([0-9.]+)\]$/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Parse a style block string into a StyleMap.
 * Handles key=value pairs separated by ; and shorthand tokens like $c0.
 */
function parseStyleBlock(content: string): StyleMap {
  const style: StyleMap = {};
  if (!content) return style;

  const parts = content.split(";").map((p) => p.trim()).filter((p) => p !== "");

  for (const part of parts) {
    // Shorthand color token: $c0 → expand to fill/stroke/font
    if (/^\$\w+$/.test(part) && !part.includes(".")) {
      // e.g., "$c0" → fillColor=$c0.fill; strokeColor=$c0.stroke; fontColor=$c0.font
      const token = part; // e.g., "$c0"
      style["fillColor"] = `${token}.fill`;
      style["strokeColor"] = `${token}.stroke`;
      style["fontColor"] = `${token}.font`;
      continue;
    }

    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) {
      // Value-less flag (e.g., "rounded", "text", "swimlane")
      style[part] = "";
    } else {
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (key) style[key] = value;
    }
  }

  return style;
}

/**
 * Try to match an arrow operator at the given token.
 */
function matchArrow(token: string): { arrow: ArrowOperator; terminal?: TerminalMarker } | null {
  for (const op of ALL_ARROW_OPERATORS) {
    if (token === op) {
      return { arrow: op as ArrowOperator };
    }
    if (token.startsWith(op) && !BIDIRECTIONAL_ARROWS.has(op as ArrowOperator)) {
      const rest = token.slice(op.length);
      if (rest === "-x" || rest === "-o") {
        return { arrow: op as ArrowOperator, terminal: rest as TerminalMarker };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Line parsers
// ---------------------------------------------------------------------------

function parseNodeLine(
  tokens: Token[],
  lineNum: number,
  errors: ParseError[],
): Node | null {
  // node ID "label" @X,Y [WxH] [in=PARENT] { style-props }
  let idx = 1; // skip "node" keyword

  const id = tokens[idx]?.value;
  if (!id) { errors.push({ line: lineNum, message: "Node missing ID" }); return null; }
  idx++;

  const labelToken = tokens[idx];
  if (!labelToken || labelToken.type !== "string") {
    errors.push({ line: lineNum, message: `Node '${id}' missing quoted label` });
    return null;
  }
  idx++;

  const posToken = tokens[idx];
  if (!posToken) {
    errors.push({ line: lineNum, message: `Node '${id}' missing position (@X,Y)` });
    return null;
  }
  const position = parsePosition(posToken.value);
  if (!position) {
    errors.push({ line: lineNum, message: `Node '${id}' has invalid position: ${posToken.value}` });
    return null;
  }
  idx++;

  const node: Node = {
    kind: "node",
    id,
    label: labelToken.value,
    position,
    style: {},
    line: lineNum,
  };

  // Parse optional attributes
  while (idx < tokens.length) {
    const tok = tokens[idx];

    // Size [WxH]
    if (tok.type === "word") {
      const size = parseSizeToken(tok.value);
      if (size) { node.size = size; idx++; continue; }

      // in=PARENT
      if (tok.value.startsWith("in=")) {
        node.parent = tok.value.slice(3);
        idx++;
        continue;
      }
    }

    // Style block { ... }
    if (tok.type === "styleBlock") {
      node.style = parseStyleBlock(tok.value);
      idx++;
      continue;
    }

    idx++;
  }

  return node;
}

function parseEdgeLine(
  tokens: Token[],
  lineNum: number,
  errors: ParseError[],
): Edge | null {
  // edge SOURCE ARROW TARGET ["label"] [via X,Y ...] { style-props }
  let idx = 1; // skip "edge" keyword

  if (tokens.length < 4) {
    errors.push({ line: lineNum, message: "Edge requires SOURCE ARROW TARGET" });
    return null;
  }

  const sourceToken = tokens[idx].value;
  idx++;

  const arrowMatch = matchArrow(tokens[idx].value);
  if (!arrowMatch) {
    errors.push({ line: lineNum, message: `Unknown arrow operator '${tokens[idx].value}'` });
    return null;
  }
  idx++;

  const targetToken = tokens[idx].value;
  idx++;

  // Parse floating endpoints
  let source = sourceToken;
  let sourcePoint: Position | undefined;
  if (sourceToken.startsWith("@")) {
    const pos = parsePosition(sourceToken);
    if (pos) { sourcePoint = pos; source = ""; }
  }

  let target = targetToken;
  let targetPoint: Position | undefined;
  if (targetToken.startsWith("@")) {
    const pos = parsePosition(targetToken);
    if (pos) { targetPoint = pos; target = ""; }
  }

  const edge: Edge = {
    kind: "edge",
    source,
    target,
    arrow: arrowMatch.arrow,
    style: {},
    line: lineNum,
  };

  if (sourcePoint) edge.sourcePoint = sourcePoint;
  if (targetPoint) edge.targetPoint = targetPoint;
  if (arrowMatch.terminal) edge.terminal = arrowMatch.terminal;

  // Parse remaining tokens
  let inVia = false;
  const waypoints: Position[] = [];

  while (idx < tokens.length) {
    const tok = tokens[idx];

    // Label
    if (tok.type === "string") {
      edge.label = tok.value;
      idx++;
      continue;
    }

    // Style block
    if (tok.type === "styleBlock") {
      edge.style = parseStyleBlock(tok.value);
      idx++;
      continue;
    }

    // in=PARENT
    if (tok.type === "word" && tok.value.startsWith("in=")) {
      edge.parent = tok.value.slice(3);
      idx++;
      continue;
    }

    // Via waypoints
    if (tok.value === "via") {
      inVia = true;
      idx++;
      continue;
    }

    if (inVia && tok.type === "word") {
      const parts = tok.value.split(",");
      if (parts.length === 2) {
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          waypoints.push({ x, y });
          idx++;
          continue;
        }
      }
      inVia = false;
    }

    idx++;
  }

  if (waypoints.length > 0) {
    edge.waypoints = waypoints;
  }

  return edge;
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

    // Node element
    if (keyword === "node") {
      const node = parseNodeLine(tokens, lineNum, errors);
      if (node) diagram.elements.push(node);
      continue;
    }

    // Edge element
    if (keyword === "edge") {
      const edge = parseEdgeLine(tokens, lineNum, errors);
      if (edge) diagram.elements.push(edge);
      continue;
    }

    errors.push({ line: lineNum, message: `Unrecognized line: ${line}` });
  }

  return { diagram, errors };
}
