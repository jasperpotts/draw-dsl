/**
 * Generator: drawio XML (mxGraphModel) → DSL string
 *
 * Parses the mxGraphModel XML and produces a human/AI-readable DSL representation.
 *
 * DSL format example:
 *
 *   diagram "My Diagram"
 *
 *   node 1 "Web Server" box fill=blue
 *   node 2 "Database" cylinder fill=gray
 *   node 3 "Client" rounded-box
 *
 *   edge 4 1->2 "SQL Query" orthogonal
 *   edge 5 3->1 "HTTP" dashed
 */

import { parseStringPromise } from "xml2js";
import type { DslDiagram, DslNode, DslEdge, NodeShape, EdgeStyle } from "./types.js";

// Map draw.io style strings to DSL shape names
const STYLE_TO_SHAPE: Array<[RegExp, NodeShape]> = [
  [/shape=mxgraph\.flowchart\.start_1|ellipse/, "ellipse"],
  [/rhombus|diamond/, "diamond"],
  [/shape=cylinder|cylinder/, "cylinder"],
  [/parallelogram/, "parallelogram"],
  [/hexagon/, "hexagon"],
  [/shape=mxgraph\.flowchart\.actor|actor/, "actor"],
  [/cloud/, "cloud"],
  [/shape=note|note/, "note"],
  [/document/, "document"],
  [/shape=process|process/, "process"],
  [/rounded=1/, "rounded-box"],
];

function parseShape(style: string): NodeShape {
  const lower = style.toLowerCase();
  for (const [pattern, shape] of STYLE_TO_SHAPE) {
    if (pattern.test(lower)) return shape;
  }
  return "box";
}

function parseColor(style: string, key: string): string | undefined {
  const match = style.match(new RegExp(`${key}=#?([^;]+)`));
  return match ? `#${match[1].replace(/^#/, "")}` : undefined;
}

function parseEdgeStyle(style: string): EdgeStyle {
  if (/curved=1/.test(style)) return "curved";
  if (/edgeStyle=orthogonalEdgeStyle/.test(style)) return "orthogonal";
  if (/edgeStyle=isometricEdgeStyle/.test(style)) return "isometric";
  return "straight";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCell(cell: any): { node?: DslNode; edge?: DslEdge } {
  const style: string = cell.$.style ?? "";
  const id: string = cell.$.id;
  const label: string = cell.$.value ?? "";
  const source: string | undefined = cell.$.source;
  const target: string | undefined = cell.$.target;

  if (source !== undefined || target !== undefined) {
    // It's an edge
    const edge: DslEdge = {
      id,
      source: source ?? "",
      target: target ?? "",
      label: label || undefined,
      style: parseEdgeStyle(style),
      dashed: /dashed=1/.test(style) ? true : undefined,
    };
    return { edge };
  }

  if (cell.$.vertex === "1" && cell.$.parent !== undefined && id !== "0" && id !== "1") {
    const node: DslNode = {
      id,
      label,
      shape: parseShape(style),
      fillColor: parseColor(style, "fillColor"),
      strokeColor: parseColor(style, "strokeColor"),
      fontColor: parseColor(style, "fontColor"),
    };

    const geom = cell.mxGeometry?.[0];
    if (geom) {
      node.width = geom.$.width ? Number(geom.$.width) : undefined;
      node.height = geom.$.height ? Number(geom.$.height) : undefined;
    }

    return { node };
  }

  return {};
}

export async function generateDsl(drawioXml: string): Promise<DslDiagram> {
  const parsed = await parseStringPromise(drawioXml, { explicitArray: true });

  // Support both <mxfile><diagram>...</diagram></mxfile> and bare <mxGraphModel>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let root: any;
  if (parsed.mxfile) {
    const diagramContent = parsed.mxfile.diagram?.[0];
    if (typeof diagramContent === "string") {
      // Content may be XML-encoded or URI-encoded — re-parse
      const inner = await parseStringPromise(decodeURIComponent(diagramContent), {
        explicitArray: true,
      });
      root = inner.mxGraphModel?.root?.[0];
    } else {
      root = diagramContent?.mxGraphModel?.[0]?.root?.[0];
    }
  } else if (parsed.mxGraphModel) {
    root = parsed.mxGraphModel.root?.[0];
  }

  if (!root) {
    throw new Error("Could not find mxGraphModel root in drawio XML.");
  }

  const cells: unknown[] = root.mxCell ?? [];
  const nodes: DslNode[] = [];
  const edges: DslEdge[] = [];

  for (const cell of cells) {
    const { node, edge } = parseCell(cell);
    if (node) nodes.push(node);
    if (edge) edges.push(edge);
  }

  return { nodes, edges };
}

/** Serialize a DslDiagram to the text DSL format */
export function serializeDsl(diagram: DslDiagram): string {
  const lines: string[] = [];

  if (diagram.name) {
    lines.push(`diagram "${diagram.name}"`);
    lines.push("");
  }

  for (const node of diagram.nodes) {
    const parts = [`node`, node.id, `"${node.label}"`, node.shape];
    if (node.fillColor) parts.push(`fill=${node.fillColor}`);
    if (node.strokeColor) parts.push(`stroke=${node.strokeColor}`);
    if (node.fontColor) parts.push(`font=${node.fontColor}`);
    if (node.width && node.height) parts.push(`size=${node.width}x${node.height}`);
    lines.push(parts.join(" "));
  }

  if (diagram.nodes.length > 0 && diagram.edges.length > 0) {
    lines.push("");
  }

  for (const edge of diagram.edges) {
    const parts = [`edge`, edge.id, `${edge.source}->${edge.target}`];
    if (edge.label) parts.push(`"${edge.label}"`);
    if (edge.style && edge.style !== "straight") parts.push(edge.style);
    if (edge.dashed) parts.push("dashed");
    lines.push(parts.join(" "));
  }

  return lines.join("\n");
}
