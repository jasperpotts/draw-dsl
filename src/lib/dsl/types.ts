/**
 * AST types for the draw-dsl language.
 *
 * These types represent the parsed structure of a .dsl file. They are the
 * shared contract between parser, serializer, validator, and XML builder.
 */

// ---------------------------------------------------------------------------
// Scalar tokens
// ---------------------------------------------------------------------------

/** The 16 built-in shape keywords. Unknown keywords are allowed via Rule 3. */
export type ShapeKeyword =
  | "box"
  | "rbox"
  | "diamond"
  | "circle"
  | "ellipse"
  | "cylinder"
  | "cloud"
  | "parallelogram"
  | "hexagon"
  | "trapezoid"
  | "triangle"
  | "note"
  | "document"
  | "person"
  | "step"
  | "card";

/** Arrow operators recognised by the parser. */
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

/** Color tokens c0–c9. */
export type ColorToken =
  | "c0" | "c1" | "c2" | "c3" | "c4"
  | "c5" | "c6" | "c7" | "c8" | "c9";

/** Text size classes. */
export type TextSizeClass =
  | "h1" | "h2" | "h3" | "h4"
  | "b1" | "b2" | "b3" | "b4" | "b5" | "b6"
  | "ct1" | "ct2";

/** Parsed text class attribute (e.g. `text=b1,mono`). */
export interface TextClass {
  size?: TextSizeClass;
  mono?: boolean;
}

/** Connection routing styles. */
export type RouteType = "ortho" | "straight" | "curved" | "elbow" | "er" | "iso";

/** Importance levels 1–4. */
export type ImportanceLevel = 1 | 2 | 3 | 4;

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

// ---------------------------------------------------------------------------
// Diagram elements
// ---------------------------------------------------------------------------

export interface Shape {
  kind: "shape";
  /** Shape keyword — one of 16 known, or any string for Rule 3 shapes. */
  shapeType: string;
  id: string;
  label: string;
  position: Position;
  size?: Size;
  color?: ColorToken;
  textClass?: TextClass;
  /** Parent group shape ID. */
  group?: string;
  /** Source line number (1-based). */
  line?: number;
}

export interface Connection {
  kind: "connection";
  source: string;
  arrow: ArrowOperator;
  terminal?: TerminalMarker;
  target: string;
  label?: string;
  color?: ColorToken;
  textClass?: TextClass;
  importance?: ImportanceLevel;
  route?: RouteType;
  waypoints?: Position[];
  /** Source line number (1-based). */
  line?: number;
}

export interface TextElement {
  kind: "text";
  id: string;
  label: string;
  position: Position;
  color?: ColorToken;
  textClass?: TextClass;
  /** Source line number (1-based). */
  line?: number;
}

export type DiagramElement = Shape | Connection | TextElement;

export interface Diagram {
  title?: string;
  elements: DiagramElement[];
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
