/**
 * Bidirectional mapping between DSL shape keywords and mxGraph style strings.
 */

import type { ShapeKeyword, Size } from "../dsl/types.js";

// ---------------------------------------------------------------------------
// Known shapes
// ---------------------------------------------------------------------------

export const KNOWN_SHAPES: ReadonlySet<string> = new Set<ShapeKeyword>([
  "box", "rbox", "diamond", "circle", "ellipse", "cylinder", "cloud",
  "parallelogram", "hexagon", "trapezoid", "triangle", "note", "document",
  "person", "step", "card",
]);

// ---------------------------------------------------------------------------
// Forward mapping: DSL keyword → mxGraph style string
// ---------------------------------------------------------------------------

export const SHAPE_TO_STYLE: Record<string, string> = {
  box: "whiteSpace=wrap;html=1;",
  rbox: "rounded=1;whiteSpace=wrap;html=1;",
  diamond: "rhombus;whiteSpace=wrap;html=1;",
  circle: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;",
  ellipse: "ellipse;whiteSpace=wrap;html=1;",
  cylinder: "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;",
  cloud: "ellipse;shape=cloud;whiteSpace=wrap;html=1;",
  parallelogram: "shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;size=20;",
  hexagon: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;size=15;",
  trapezoid: "shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;fixedSize=1;size=15;",
  triangle: "triangle;whiteSpace=wrap;html=1;",
  note: "shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=15;",
  document: "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=0.27;",
  person: "shape=mxgraph.basic.person;whiteSpace=wrap;html=1;",
  step: "shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;fixedSize=1;size=20;",
  card: "shape=card;whiteSpace=wrap;html=1;size=20;",
};

// ---------------------------------------------------------------------------
// Default sizes per shape
// ---------------------------------------------------------------------------

export const DEFAULT_SIZES: Record<string, Size> = {
  box: { width: 120, height: 60 },
  rbox: { width: 120, height: 60 },
  diamond: { width: 80, height: 80 },
  circle: { width: 60, height: 60 },
  ellipse: { width: 120, height: 60 },
  cylinder: { width: 80, height: 80 },
  cloud: { width: 120, height: 80 },
  parallelogram: { width: 120, height: 60 },
  hexagon: { width: 120, height: 60 },
  trapezoid: { width: 120, height: 60 },
  triangle: { width: 80, height: 80 },
  note: { width: 120, height: 80 },
  document: { width: 120, height: 80 },
  person: { width: 40, height: 60 },
  step: { width: 120, height: 60 },
  card: { width: 120, height: 80 },
};

/** Default size for unknown Rule 3 shapes. */
export const DEFAULT_SIZE: Size = { width: 120, height: 60 };

// ---------------------------------------------------------------------------
// Reverse mapping: mxGraph style → DSL keyword
// ---------------------------------------------------------------------------

/** Ordered list of patterns to try when reverse-mapping a style string. */
const STYLE_TO_SHAPE_PATTERNS: Array<{ test: (s: string) => boolean; keyword: ShapeKeyword }> = [
  // Must test specific shapes before generic ones
  { test: (s) => /shape=mxgraph\.basic\.person/.test(s), keyword: "person" },
  { test: (s) => /shape=cloud/.test(s), keyword: "cloud" },
  { test: (s) => /shape=cylinder3/.test(s), keyword: "cylinder" },
  { test: (s) => /shape=note/.test(s), keyword: "note" },
  { test: (s) => /shape=document/.test(s), keyword: "document" },
  { test: (s) => /shape=step/.test(s), keyword: "step" },
  { test: (s) => /shape=card/.test(s), keyword: "card" },
  { test: (s) => /shape=parallelogram/.test(s), keyword: "parallelogram" },
  { test: (s) => /shape=hexagon/.test(s), keyword: "hexagon" },
  { test: (s) => /shape=trapezoid/.test(s), keyword: "trapezoid" },
  { test: (s) => /\brhombus\b/.test(s), keyword: "diamond" },
  { test: (s) => /\btriangle\b/.test(s), keyword: "triangle" },
  { test: (s) => /\bellipse\b/.test(s) && /aspect=fixed/.test(s), keyword: "circle" },
  { test: (s) => /\bellipse\b/.test(s), keyword: "ellipse" },
  { test: (s) => /rounded=1/.test(s), keyword: "rbox" },
];

/**
 * Reverse-map an mxGraph style string to a DSL shape keyword.
 * Returns the keyword, or the raw `shape=X` value for Rule 3, or `"box"` as fallback.
 */
export function styleToShape(style: string): string {
  for (const { test, keyword } of STYLE_TO_SHAPE_PATTERNS) {
    if (test(style)) return keyword;
  }

  // Rule 3: extract shape=X
  const m = style.match(/shape=([^;]+)/);
  if (m) return m[1];

  return "box";
}

/** Check if a string is one of the 16 known shape keywords. */
export function isKnownShape(s: string): s is ShapeKeyword {
  return KNOWN_SHAPES.has(s);
}

/**
 * Get the mxGraph style string for a shape keyword.
 * Known shapes use the lookup table; unknown shapes use Rule 3.
 */
export function getShapeStyle(shapeType: string): string {
  return SHAPE_TO_STYLE[shapeType] ?? `shape=${shapeType};whiteSpace=wrap;html=1;`;
}

/**
 * Get the default size for a shape keyword.
 */
export function getDefaultSize(shapeType: string): Size {
  return DEFAULT_SIZES[shapeType] ?? DEFAULT_SIZE;
}
