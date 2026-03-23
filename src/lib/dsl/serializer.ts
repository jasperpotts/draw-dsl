/**
 * DSL Serializer: AST → text
 *
 * Converts a Diagram AST back into the draw-dsl text format.
 */

import type { Diagram, Shape, Connection, TextElement, TextClass } from "./types.js";

function serializeTextClass(tc: TextClass): string {
  const parts: string[] = [];
  if (tc.size) parts.push(tc.size);
  if (tc.mono) parts.push("mono");
  if (tc.italic) parts.push("italic");
  return parts.join(",");
}

function serializeShape(shape: Shape): string {
  const parts: string[] = [
    shape.shapeType,
    shape.id,
    `"${shape.label}"`,
    `@${shape.position.x},${shape.position.y}`,
  ];
  if (shape.size) {
    parts.push(`[${shape.size.width}x${shape.size.height}]`);
  }
  if (shape.color) {
    parts.push(`c=${shape.color}`);
  }
  if (shape.textClass) {
    const tc = serializeTextClass(shape.textClass);
    if (tc) parts.push(`text=${tc}`);
  }
  if (shape.align && shape.align !== "center") {
    parts.push(`align=${shape.align}`);
  }
  if (shape.verticalAlign && shape.verticalAlign !== "middle") {
    parts.push(`valign=${shape.verticalAlign}`);
  }
  if (shape.container) {
    parts.push(`container=true`);
  }
  if (shape.group) {
    parts.push(`in=${shape.group}`);
  }
  return parts.join(" ");
}

function serializeConnection(conn: Connection): string {
  const arrow = conn.terminal ? `${conn.arrow}${conn.terminal}` : conn.arrow;
  const parts: string[] = [conn.source, arrow, conn.target];
  if (conn.label) {
    parts.push(`"${conn.label}"`);
  }
  if (conn.color) {
    parts.push(`c=${conn.color}`);
  }
  if (conn.textClass) {
    const tc = serializeTextClass(conn.textClass);
    if (tc) parts.push(`text=${tc}`);
  }
  // Only emit non-default importance (default is 3)
  if (conn.importance !== undefined && conn.importance !== 3) {
    parts.push(`imp=${conn.importance}`);
  }
  // Only emit non-default route (default is ortho)
  if (conn.route && conn.route !== "ortho") {
    parts.push(`route=${conn.route}`);
  }
  if (conn.entryX !== undefined && conn.entryY !== undefined) {
    parts.push(`entry=${conn.entryX},${conn.entryY}`);
  }
  if (conn.exitX !== undefined && conn.exitY !== undefined) {
    parts.push(`exit=${conn.exitX},${conn.exitY}`);
  }
  if (conn.waypoints && conn.waypoints.length > 0) {
    parts.push("via");
    for (const wp of conn.waypoints) {
      parts.push(`${wp.x},${wp.y}`);
    }
  }
  return parts.join(" ");
}

function serializeText(text: TextElement): string {
  const parts: string[] = [
    "text",
    text.id,
    `"${text.label}"`,
    `@${text.position.x},${text.position.y}`,
  ];
  if (text.color) {
    parts.push(`c=${text.color}`);
  }
  if (text.textClass) {
    const tc = serializeTextClass(text.textClass);
    if (tc) parts.push(`text=${tc}`);
  }
  return parts.join(" ");
}

export function serializeDiagram(diagram: Diagram): string {
  const lines: string[] = [];

  if (diagram.title) {
    lines.push(`diagram "${diagram.title}"`);
    lines.push("");
  }

  for (const element of diagram.elements) {
    switch (element.kind) {
      case "shape":
        lines.push(serializeShape(element));
        break;
      case "connection":
        lines.push(serializeConnection(element));
        break;
      case "text":
        lines.push(serializeText(element));
        break;
    }
  }

  return lines.join("\n");
}
