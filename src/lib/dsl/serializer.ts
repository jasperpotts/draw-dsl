/**
 * DSL Serializer v2: AST → text
 *
 * Converts a Diagram AST into the v2 draw-dsl text format.
 * Style properties are emitted in { } blocks using draw.io's native format
 * with theme variable references ($c0, $font.mono, etc.).
 */

import type { Diagram, Node, Edge, StyleMap } from "./types.js";

// ---------------------------------------------------------------------------
// Style serialization
// ---------------------------------------------------------------------------

/** Escape double quotes in labels for DSL serialization. */
function escapeLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Properties that don't need to be serialized (draw.io defaults). */
const OMIT_DEFAULTS: Record<string, string> = {
  html: "1",
  whiteSpace: "wrap",
};

/**
 * Detect if fill/stroke/font all use the same color token shorthand.
 * Returns e.g. "$c0" if all three match, or undefined.
 */
function detectColorShorthand(style: StyleMap): string | undefined {
  const fill = style["fillColor"];
  const stroke = style["strokeColor"];
  const font = style["fontColor"];

  if (!fill || !stroke || !font) return undefined;
  if (!fill.startsWith("$") || !stroke.startsWith("$") || !font.startsWith("$")) return undefined;

  // Extract token: "$c0.fill" → "c0", "$default.fill" → "default"
  const fillMatch = fill.match(/^\$(\w+)\.fill$/);
  const strokeMatch = stroke.match(/^\$(\w+)\.stroke$/);
  const fontMatch = font.match(/^\$(\w+)\.font$/);

  if (!fillMatch || !strokeMatch || !fontMatch) return undefined;
  if (fillMatch[1] === strokeMatch[1] && strokeMatch[1] === fontMatch[1]) {
    return `$${fillMatch[1]}`;
  }
  return undefined;
}

/**
 * Serialize a StyleMap to a compact string for the { } block.
 * Uses $token shorthand when possible.
 */
function serializeStyleBlock(style: StyleMap): string {
  const entries = { ...style };

  // Remove default properties that don't need serializing
  for (const [key, defaultVal] of Object.entries(OMIT_DEFAULTS)) {
    if (entries[key] === defaultVal) {
      delete entries[key];
    }
  }

  // Check for color shorthand
  const shorthand = detectColorShorthand(entries);
  if (shorthand) {
    delete entries["fillColor"];
    delete entries["strokeColor"];
    delete entries["fontColor"];
  }

  const parts: string[] = [];

  // Emit shorthand first if present
  if (shorthand) {
    parts.push(shorthand);
  }

  for (const [key, value] of Object.entries(entries)) {
    if (value === "") {
      parts.push(key);
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Element serialization
// ---------------------------------------------------------------------------

function serializeNode(node: Node): string {
  const parts: string[] = [
    "node",
    node.id,
    `"${escapeLabel(node.label)}"`,
    `@${node.position.x},${node.position.y}`,
  ];

  if (node.size) {
    parts.push(`[${node.size.width}x${node.size.height}]`);
  }

  if (node.parent) {
    parts.push(`in=${node.parent}`);
  }

  // Style block
  const styleStr = serializeStyleBlock(node.style);
  if (styleStr) {
    parts.push(`{ ${styleStr} }`);
  }

  return parts.join(" ");
}

function serializeEdge(edge: Edge): string {
  const arrow = edge.arrow ?? "->";
  const arrowStr = edge.terminal ? `${arrow}${edge.terminal}` : arrow;

  // Floating edge endpoints
  const sourceToken = (!edge.source && edge.sourcePoint)
    ? `@${edge.sourcePoint.x},${edge.sourcePoint.y}`
    : edge.source;
  const targetToken = (!edge.target && edge.targetPoint)
    ? `@${edge.targetPoint.x},${edge.targetPoint.y}`
    : edge.target;

  const parts: string[] = ["edge", sourceToken, arrowStr, targetToken];

  if (edge.label) {
    parts.push(`"${escapeLabel(edge.label)}"`);
  }

  if (edge.parent) {
    parts.push(`in=${edge.parent}`);
  }

  // Waypoints
  if (edge.waypoints && edge.waypoints.length > 0) {
    parts.push("via");
    for (const wp of edge.waypoints) {
      parts.push(`${wp.x},${wp.y}`);
    }
  }

  // Style block
  const styleStr = serializeStyleBlock(edge.style);
  if (styleStr) {
    parts.push(`{ ${styleStr} }`);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Main serializer
// ---------------------------------------------------------------------------

export function serializeDiagram(diagram: Diagram): string {
  const lines: string[] = [];

  if (diagram.title) {
    lines.push(`diagram "${diagram.title}"`);
    lines.push("");
  }

  for (const element of diagram.elements) {
    switch (element.kind) {
      case "node":
        lines.push(serializeNode(element));
        break;
      case "edge":
        lines.push(serializeEdge(element));
        break;
    }
  }

  return lines.join("\n");
}
