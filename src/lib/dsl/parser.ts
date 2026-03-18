/**
 * Parser: DSL string → drawio XML (mxGraphModel)
 *
 * Parses the text DSL and produces an mxGraphModel XML that draw.io can render.
 */

import type { DslDiagram, DslNode, DslEdge, NodeShape, EdgeStyle, ArrowType } from "./types.js";

// Map DSL shape names to draw.io style strings
const SHAPE_TO_STYLE: Record<NodeShape, string> = {
  box: "rounded=0;whiteSpace=wrap;html=1;",
  "rounded-box": "rounded=1;whiteSpace=wrap;html=1;",
  diamond: "rhombus;whiteSpace=wrap;html=1;",
  ellipse: "ellipse;whiteSpace=wrap;html=1;",
  cylinder: "shape=cylinder;whiteSpace=wrap;html=1;",
  parallelogram: "shape=parallelogram;whiteSpace=wrap;html=1;",
  hexagon: "shape=hexagon;whiteSpace=wrap;html=1;",
  actor: "shape=mxgraph.flowchart.actor;whiteSpace=wrap;html=1;",
  cloud: "shape=cloud;whiteSpace=wrap;html=1;",
  note: "shape=note;whiteSpace=wrap;html=1;",
  document: "shape=document;whiteSpace=wrap;html=1;",
  process: "shape=process;whiteSpace=wrap;html=1;",
};

const EDGE_STYLE_MAP: Record<EdgeStyle, string> = {
  straight: "",
  curved: "curved=1;",
  orthogonal: "edgeStyle=orthogonalEdgeStyle;",
  isometric: "edgeStyle=isometricEdgeStyle;",
};

function buildNodeStyle(node: DslNode): string {
  let style = SHAPE_TO_STYLE[node.shape];
  if (node.fillColor) style += `fillColor=${node.fillColor};`;
  if (node.strokeColor) style += `strokeColor=${node.strokeColor};`;
  if (node.fontColor) style += `fontColor=${node.fontColor};`;
  return style;
}

function buildEdgeStyle(edge: DslEdge): string {
  let style = EDGE_STYLE_MAP[edge.style ?? "straight"];
  if (edge.dashed) style += "dashed=1;";
  return style || "edgeStyle=none;";
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildDrawioXml(diagram: DslDiagram): string {
  const DEFAULT_WIDTH = 120;
  const DEFAULT_HEIGHT = 60;
  const GRID_SIZE = 160;
  const COLS = 4;

  const cellLines: string[] = [
    `    <mxCell id="0" />`,
    `    <mxCell id="1" parent="0" />`,
  ];

  // Auto-layout nodes in a grid if positions aren't set
  diagram.nodes.forEach((node, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * GRID_SIZE + 40;
    const y = row * GRID_SIZE + 40;
    const w = node.width ?? DEFAULT_WIDTH;
    const h = node.height ?? DEFAULT_HEIGHT;
    const style = buildNodeStyle(node);
    const label = escapeXml(node.label);

    cellLines.push(
      `    <mxCell id="${node.id}" value="${label}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />` +
        `</mxCell>`
    );
  });

  diagram.edges.forEach((edge) => {
    const style = buildEdgeStyle(edge);
    const label = edge.label ? escapeXml(edge.label) : "";
    const sourceAttr = edge.source ? ` source="${edge.source}"` : "";
    const targetAttr = edge.target ? ` target="${edge.target}"` : "";

    cellLines.push(
      `    <mxCell id="${edge.id}" value="${label}" style="${style}" edge="1"${sourceAttr}${targetAttr} parent="1">` +
        `<mxGeometry relative="1" as="geometry" />` +
        `</mxCell>`
    );
  });

  return [
    `<mxfile>`,
    `  <diagram name="${escapeXml(diagram.name ?? "Diagram")}">`,
    `    <mxGraphModel>`,
    `      <root>`,
    ...cellLines.map((l) => "    " + l),
    `      </root>`,
    `    </mxGraphModel>`,
    `  </diagram>`,
    `</mxfile>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// DSL text parser
// ---------------------------------------------------------------------------

type Token = { type: string; value: string };

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /"([^"]*)"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1] !== undefined) {
      tokens.push({ type: "string", value: m[1] });
    } else {
      tokens.push({ type: "word", value: m[0] });
    }
  }
  return tokens;
}

function parseNodeShape(value: string): NodeShape {
  const shapes: NodeShape[] = [
    "box", "rounded-box", "diamond", "ellipse", "cylinder",
    "parallelogram", "hexagon", "actor", "cloud", "note", "document", "process",
  ];
  return shapes.includes(value as NodeShape) ? (value as NodeShape) : "box";
}

function parseEdgeStyle(value: string): EdgeStyle {
  const styles: EdgeStyle[] = ["straight", "curved", "orthogonal", "isometric"];
  return styles.includes(value as EdgeStyle) ? (value as EdgeStyle) : "straight";
}

function parseKeyValue(token: string): { key: string; value: string } | null {
  const idx = token.indexOf("=");
  if (idx === -1) return null;
  return { key: token.slice(0, idx), value: token.slice(idx + 1) };
}

export function parseDsl(dsl: string): DslDiagram {
  const diagram: DslDiagram = { nodes: [], edges: [] };

  const lines = dsl.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const tokens = tokenizeLine(line);
    if (tokens.length === 0) continue;

    const keyword = tokens[0].value;

    if (keyword === "diagram") {
      diagram.name = tokens[1]?.value;
      continue;
    }

    if (keyword === "node") {
      const node: DslNode = {
        id: tokens[1]?.value ?? `n${diagram.nodes.length}`,
        label: tokens[2]?.value ?? "",
        shape: parseNodeShape(tokens[3]?.value ?? "box"),
      };

      for (let i = 4; i < tokens.length; i++) {
        const kv = parseKeyValue(tokens[i].value);
        if (!kv) continue;
        if (kv.key === "fill") node.fillColor = kv.value;
        else if (kv.key === "stroke") node.strokeColor = kv.value;
        else if (kv.key === "font") node.fontColor = kv.value;
        else if (kv.key === "size") {
          const [w, h] = kv.value.split("x").map(Number);
          node.width = w;
          node.height = h;
        }
      }

      diagram.nodes.push(node);
      continue;
    }

    if (keyword === "edge") {
      const id = tokens[1]?.value ?? `e${diagram.edges.length}`;
      const connToken = tokens[2]?.value ?? "->";
      const arrowMatch = connToken.match(/^(.+)->(.+)$/);

      const edge: DslEdge = {
        id,
        source: arrowMatch?.[1] ?? "",
        target: arrowMatch?.[2] ?? "",
      };

      for (let i = 3; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.type === "string") {
          edge.label = tok.value;
        } else if (tok.value === "dashed") {
          edge.dashed = true;
        } else {
          const style = parseEdgeStyle(tok.value);
          if (style !== "straight") edge.style = style;
        }
      }

      diagram.edges.push(edge);
      continue;
    }
  }

  return diagram;
}
