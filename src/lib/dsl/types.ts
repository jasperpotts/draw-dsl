/**
 * AST types for the draw-dsl v2 language.
 *
 * The v2 DSL is a thin layer over draw.io's native style format.
 * Style properties pass through as a flat key-value map (StyleMap),
 * with optional theme variable substitution ($c0, $font.mono, etc.).
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Canvas position (absolute coordinates). */
export interface Position {
  x: number;
  y: number;
}

/** Element size override. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Flat map of draw.io style properties.
 *
 * Keys are mxGraph style property names (shape, fillColor, strokeColor, etc.).
 * Values are either:
 *   - literal values ("cylinder3", "#ff0000", "1")
 *   - theme variable references ("$c0.fill", "$c1.stroke", "$font.mono")
 *
 * Value-less keys (e.g., "rounded", "ellipse", "text", "swimlane") are stored
 * with value "" to indicate presence-only flags in the draw.io style string.
 */
export type StyleMap = Record<string, string>;

/** Arrow operators recognised by the parser (convenience shortcuts). */
export type ArrowOperator =
  | "->"
  | "-->"
  | "=>"
  | "==>"
  | "--"
  | "---"
  | "<->"
  | "<-->"
  | "<=>"
  | "*->"
  | "o->"
  | "#->"
  | "~->"
  | "+->";

/** Terminal markers that can be appended to non-bidirectional arrows. */
export type TerminalMarker = "-x" | "-o";

// ---------------------------------------------------------------------------
// Diagram elements
// ---------------------------------------------------------------------------

/** A vertex (shape, text, stencil, table, swimlane — anything). */
export interface Node {
  kind: "node";
  id: string;
  label: string;
  position: Position;
  size?: Size;
  /**
   * Full draw.io style properties.
   * Theme variables ($c0.fill, $font.mono, etc.) are resolved at build time.
   * All other properties pass through verbatim to the mxCell style string.
   */
  style: StyleMap;
  /** Parent container node ID. */
  parent?: string;
  /** Source line number (1-based). */
  line?: number;
}

/** An edge (connection between nodes). */
export interface Edge {
  kind: "edge";
  source: string;
  target: string;
  label?: string;
  /**
   * Full draw.io edge style properties.
   * Arrow operators set defaults (endArrow, startArrow, etc.) that can be
   * overridden by explicit properties in the style block.
   */
  style: StyleMap;
  /** The arrow operator used in DSL syntax (for serialization). */
  arrow?: ArrowOperator;
  /** Terminal marker (for serialization). */
  terminal?: TerminalMarker;
  /** Parent container node ID (for edges inside groups/swimlanes). */
  parent?: string;
  /** Waypoints for routing. */
  waypoints?: Position[];
  /** Floating source point (when source is empty). */
  sourcePoint?: Position;
  /** Floating target point (when target is empty). */
  targetPoint?: Position;
  /** Source line number (1-based). */
  line?: number;
}

export type DiagramElement = Node | Edge;

export interface Diagram {
  title?: string;
  elements: DiagramElement[];
}

// ---------------------------------------------------------------------------
// Theme variable helpers
// ---------------------------------------------------------------------------

/** Check if a style value is a theme variable reference. */
export function isThemeVar(value: string): boolean {
  return value.startsWith("$");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ParseError {
  line: number;
  message: string;
}

export interface ValidationError {
  line?: number;
  message: string;
}
