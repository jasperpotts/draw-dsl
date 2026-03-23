/**
 * AST normalization and comparison utilities for round-trip tests.
 *
 * Key challenge: after XML round-trip, element IDs change (DSL IDs → mxCell numeric IDs).
 * Normalization resolves IDs to labels so comparisons work across ID schemes.
 */

import type { Diagram, DiagramElement, Shape, Connection, TextElement } from "../../src/lib/dsl/types.js";
import { DEFAULT_SIZES } from "../../src/lib/drawio/shape-map.js";
import { expect } from "vitest";

interface NormalizedShape {
  kind: "shape";
  shapeType: string;
  label: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
  textClass?: { size?: string; mono?: boolean; italic?: boolean };
  align?: string;
  verticalAlign?: string;
  container?: boolean;
  groupLabel?: string; // resolved from group ID → parent label
}

interface NormalizedConnection {
  kind: "connection";
  sourceLabel: string; // resolved from source ID → label
  arrow: string;
  targetLabel: string; // resolved from target ID → label
  terminal?: string;
  label?: string;
  color?: string;
  textClass?: { size?: string; mono?: boolean; italic?: boolean };
  importance?: number;
  route?: string;
  waypoints?: { x: number; y: number }[];
  entryX?: number;
  entryY?: number;
  exitX?: number;
  exitY?: number;
}

interface NormalizedText {
  kind: "text";
  label: string;
  position: { x: number; y: number };
  color?: string;
  textClass?: { size?: string; mono?: boolean; italic?: boolean };
}

type NormalizedElement = NormalizedShape | NormalizedConnection | NormalizedText;

interface NormalizedDiagram {
  title?: string;
  shapes: NormalizedShape[];
  connections: NormalizedConnection[];
  texts: NormalizedText[];
}

/**
 * Normalize a diagram for comparison. Resolves all ID references to labels.
 */
export function normalizeDiagram(diagram: Diagram): NormalizedDiagram {
  const shapes = diagram.elements.filter((e): e is Shape => e.kind === "shape");
  const connections = diagram.elements.filter((e): e is Connection => e.kind === "connection");
  const texts = diagram.elements.filter((e): e is TextElement => e.kind === "text");

  // Build ID → label map
  const idToLabel = new Map<string, string>();
  for (const s of shapes) {
    idToLabel.set(s.id, s.label);
  }
  for (const t of texts) {
    idToLabel.set(t.id, t.label);
  }

  return {
    title: diagram.title,
    shapes: shapes.map((s) => normalizeShape(s, idToLabel)).sort((a, b) => a.label.localeCompare(b.label)),
    connections: connections.map((c) => normalizeConnection(c, idToLabel)).sort((a, b) =>
      `${a.sourceLabel}->${a.targetLabel}`.localeCompare(`${b.sourceLabel}->${b.targetLabel}`)
    ),
    texts: texts.map((t) => normalizeText(t)).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function normalizeShape(shape: Shape, idToLabel: Map<string, string>): NormalizedShape {
  const result: NormalizedShape = {
    kind: "shape",
    shapeType: shape.shapeType,
    label: shape.label,
    position: { ...shape.position },
  };

  // Only include size if it differs from default
  if (shape.size) {
    const defaultSize = DEFAULT_SIZES[shape.shapeType] ?? { width: 120, height: 60 };
    if (shape.size.width !== defaultSize.width || shape.size.height !== defaultSize.height) {
      result.size = { ...shape.size };
    }
  }

  if (shape.color) result.color = shape.color;

  // Normalize textClass: b3 is default for shapes (12px), gets elided
  if (shape.textClass) {
    const tc = { ...shape.textClass };
    if (tc.size === "b3") delete tc.size;
    if (tc.size || tc.mono || tc.italic) result.textClass = tc;
  }

  // Alignment
  if (shape.align && shape.align !== "center") result.align = shape.align;
  if (shape.verticalAlign && shape.verticalAlign !== "middle") result.verticalAlign = shape.verticalAlign;
  if (shape.container) result.container = true;

  // Resolve group ID to parent label
  if (shape.group) {
    result.groupLabel = idToLabel.get(shape.group) ?? shape.group;
  }

  return result;
}

function normalizeConnection(conn: Connection, idToLabel: Map<string, string>): NormalizedConnection {
  const result: NormalizedConnection = {
    kind: "connection",
    sourceLabel: idToLabel.get(conn.source) ?? conn.source,
    arrow: conn.arrow,
    targetLabel: idToLabel.get(conn.target) ?? conn.target,
  };

  if (conn.terminal) result.terminal = conn.terminal;
  if (conn.label) result.label = conn.label;
  if (conn.color) result.color = conn.color;

  // Normalize textClass: ct1 is default for connections (10px), gets elided
  if (conn.textClass) {
    const tc = { ...conn.textClass };
    if (tc.size === "ct1") delete tc.size;
    if (tc.size || tc.mono || tc.italic) result.textClass = tc;
  }

  // Normalize importance: 3 is default, gets elided
  if (conn.importance !== undefined && conn.importance !== 3) {
    result.importance = conn.importance;
  }

  // Normalize route: ortho is default, gets elided
  if (conn.route && conn.route !== "ortho") {
    result.route = conn.route;
  }

  if (conn.waypoints && conn.waypoints.length > 0) {
    result.waypoints = conn.waypoints.map((wp) => ({ ...wp }));
  }

  if (conn.entryX !== undefined) result.entryX = conn.entryX;
  if (conn.entryY !== undefined) result.entryY = conn.entryY;
  if (conn.exitX !== undefined) result.exitX = conn.exitX;
  if (conn.exitY !== undefined) result.exitY = conn.exitY;

  return result;
}

function normalizeText(text: TextElement): NormalizedText {
  const result: NormalizedText = {
    kind: "text",
    label: text.label,
    position: { ...text.position },
  };

  if (text.color) result.color = text.color;

  if (text.textClass) {
    const tc = { ...text.textClass };
    if (tc.size || tc.mono) result.textClass = tc;
  }

  return result;
}

/**
 * Assert full semantic equality between two ASTs after normalization.
 * Used for DSL round-trip tests where all features should be preserved.
 */
export function assertSemanticMatch(ast1: Diagram, ast2: Diagram): void {
  const n1 = normalizeDiagram(ast1);
  const n2 = normalizeDiagram(ast2);
  expect(n2).toEqual(n1);
}

/**
 * Assert structural match between two ASTs.
 * Used for sample file round-trips where colors/fonts may change but structure must be preserved.
 */
export function assertStructuralMatch(original: Diagram, roundTripped: Diagram): void {
  const shapes1 = original.elements.filter((e): e is Shape => e.kind === "shape");
  const shapes2 = roundTripped.elements.filter((e): e is Shape => e.kind === "shape");
  const conns1 = original.elements.filter((e): e is Connection => e.kind === "connection");
  const conns2 = roundTripped.elements.filter((e): e is Connection => e.kind === "connection");
  const texts1 = original.elements.filter((e): e is TextElement => e.kind === "text");
  const texts2 = roundTripped.elements.filter((e): e is TextElement => e.kind === "text");

  // Build ID→label maps for both
  const idToLabel1 = new Map<string, string>();
  for (const s of shapes1) idToLabel1.set(s.id, s.label);
  for (const t of texts1) idToLabel1.set(t.id, t.label);

  const idToLabel2 = new Map<string, string>();
  for (const s of shapes2) idToLabel2.set(s.id, s.label);
  for (const t of texts2) idToLabel2.set(t.id, t.label);

  // Shape count
  expect(shapes2.length).toBe(shapes1.length);
  // Connection count
  expect(conns2.length).toBe(conns1.length);
  // Text element count
  expect(texts2.length).toBe(texts1.length);

  // Shape types preserved (match by label)
  const shapeTypeByLabel1 = new Map(shapes1.map((s) => [s.label, s.shapeType]));
  for (const s2 of shapes2) {
    const expected = shapeTypeByLabel1.get(s2.label);
    if (expected) {
      expect(s2.shapeType, `Shape "${s2.label}" type mismatch`).toBe(expected);
    }
  }

  // Connection topology preserved (match by source/target labels)
  const topoSet1 = new Set(conns1.map((c) => {
    const sLabel = idToLabel1.get(c.source) ?? c.source;
    const tLabel = idToLabel1.get(c.target) ?? c.target;
    return `${sLabel}->${tLabel}`;
  }));
  const topoSet2 = new Set(conns2.map((c) => {
    const sLabel = idToLabel2.get(c.source) ?? c.source;
    const tLabel = idToLabel2.get(c.target) ?? c.target;
    return `${sLabel}->${tLabel}`;
  }));
  expect(topoSet2).toEqual(topoSet1);

  // Group parent-child relationships preserved (by label)
  const groups1 = new Map<string, string[]>();
  for (const s of shapes1) {
    if (s.group) {
      const parentLabel = idToLabel1.get(s.group) ?? s.group;
      const children = groups1.get(parentLabel) ?? [];
      children.push(s.label);
      groups1.set(parentLabel, children);
    }
  }
  const groups2 = new Map<string, string[]>();
  for (const s of shapes2) {
    if (s.group) {
      const parentLabel = idToLabel2.get(s.group) ?? s.group;
      const children = groups2.get(parentLabel) ?? [];
      children.push(s.label);
      groups2.set(parentLabel, children);
    }
  }
  expect(groups2.size).toBe(groups1.size);
  for (const [parentLabel, children1] of groups1) {
    const children2 = groups2.get(parentLabel);
    expect(children2?.sort(), `Group "${parentLabel}" children mismatch`).toEqual(children1.sort());
  }

  // Positions approximately preserved (within ±2px tolerance)
  // Match by label since IDs differ
  const posByLabel1 = new Map(shapes1.map((s) => [s.label, s.position]));
  for (const s2 of shapes2) {
    const pos1 = posByLabel1.get(s2.label);
    if (pos1) {
      expect(Math.abs(s2.position.x - pos1.x), `Position X for "${s2.label}"`).toBeLessThanOrEqual(2);
      expect(Math.abs(s2.position.y - pos1.y), `Position Y for "${s2.label}"`).toBeLessThanOrEqual(2);
    }
  }
}
