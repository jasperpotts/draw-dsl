/**
 * Core DSL types representing a draw.io diagram in a simplified, AI-friendly format.
 *
 * Design goals:
 *   - Minimal surface area — only expose properties that matter for diagram meaning
 *   - Text-friendly — easy to read and edit in plain text
 *   - Lossless for structure — all nodes/edges are preserved
 *   - Lossy for style — styles are simplified to a small set of named options
 */

export type NodeShape =
  | "box"
  | "rounded-box"
  | "diamond"
  | "ellipse"
  | "cylinder"
  | "parallelogram"
  | "hexagon"
  | "actor"
  | "cloud"
  | "note"
  | "document"
  | "process";

export type EdgeStyle = "straight" | "curved" | "orthogonal" | "isometric";

export type ArrowType = "none" | "open" | "block" | "classic" | "diamond" | "oval";

export interface DslNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Named color token (e.g. "blue", "red") or hex string */
  fillColor?: string;
  strokeColor?: string;
  fontColor?: string;
  /** Width in points */
  width?: number;
  /** Height in points */
  height?: number;
}

export interface DslEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: EdgeStyle;
  startArrow?: ArrowType;
  endArrow?: ArrowType;
  dashed?: boolean;
}

export interface DslDiagram {
  name?: string;
  nodes: DslNode[];
  edges: DslEdge[];
}
