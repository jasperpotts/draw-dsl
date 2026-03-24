/**
 * XML Builder v2: AST + resolved stylesheet → mxGraph XML string
 *
 * Converts a Diagram AST into a complete mxfile XML that draw.io can render.
 * Style properties pass through from the AST's StyleMap, with theme variable
 * ($c0.fill, $font.mono, etc.) resolution against the stylesheet.
 */

import type { Diagram, Node, Edge, StyleMap, Position } from "../dsl/types.js";
import type { Stylesheet, ResolvedProperties } from "../stylesheet/types.js";
import { mergeTheme, resolveVars } from "../stylesheet/resolver.js";
import {
  ARROW_TO_STYLE, ARROW_MULTIPLIER, IMP_STROKE_WIDTH,
  TERMINAL_OVERRIDE,
} from "./arrow-map.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Convert \n in labels to HTML line breaks for mxGraph. */
function labelToHtml(label: string): string {
  return escapeXml(label).replace(/\\n/g, "&lt;br&gt;");
}

// ---------------------------------------------------------------------------
// Theme variable resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a theme variable reference against the stylesheet.
 *
 * Examples:
 *   "$c0.fill"    → themeProps["--c0-fill"]  → "#EFF6FF"
 *   "$c0.stroke"  → themeProps["--c0-stroke"] → "#3b82f6"
 *   "$default.fill" → themeProps["--default-fill"] → "#ffffff"
 *   "$font"       → themeProps["--font-default"]
 *   "$font.mono"  → themeProps["--font-mono"]
 *   "$font.notes" → themeProps["--font-notes"]
 */
function resolveThemeVar(ref: string, themeProps: ResolvedProperties): string | undefined {
  if (!ref.startsWith("$")) return undefined;

  const body = ref.slice(1); // remove "$"

  // Font variables
  if (body === "font") return themeProps["--font-default"];
  if (body === "font.mono") return themeProps["--font-mono"];
  if (body === "font.notes") return themeProps["--font-notes"];

  // Color variables: "$c0.fill" → "--c0-fill"
  const dotIdx = body.indexOf(".");
  if (dotIdx > 0) {
    const token = body.slice(0, dotIdx);
    const channel = body.slice(dotIdx + 1);
    const cssVar = `--${token}-${channel}`;
    return themeProps[cssVar];
  }

  return undefined;
}

/**
 * Resolve all theme variables in a StyleMap, producing a clean style map
 * with only literal values suitable for mxGraph XML.
 */
function resolveStyleMap(style: StyleMap, themeProps: ResolvedProperties): StyleMap {
  const resolved: StyleMap = {};
  for (const [key, value] of Object.entries(style)) {
    if (value.startsWith("$")) {
      const resolvedVal = resolveThemeVar(value, themeProps);
      if (resolvedVal !== undefined) {
        // Strip quotes from font family for mxGraph style attributes
        resolved[key] = resolvedVal.replace(/"/g, "").replace(/'/g, "");
      } else {
        resolved[key] = value; // leave unresolved (will appear as-is)
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Serialize a resolved StyleMap to a draw.io style string.
 */
function styleMapToString(map: StyleMap): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === "") {
      parts.push(key);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.join(";") + (parts.length > 0 ? ";" : "");
}

// ---------------------------------------------------------------------------
// Cell ID management
// ---------------------------------------------------------------------------

let cellIdCounter = 2; // 0 and 1 are reserved

function nextId(): string {
  return String(cellIdCounter++);
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildMxGraphXml(
  diagram: Diagram,
  stylesheet: Stylesheet,
  theme: "light" | "dark" = "light",
): string {
  cellIdCounter = 2;

  const merged = mergeTheme(stylesheet, theme);
  const themeProps = resolveVars(merged);

  // Pre-pass: assign mxCell IDs for all nodes
  const idMap = new Map<string, string>(); // DSL ID → mxCell ID

  for (const el of diagram.elements) {
    if (el.kind === "node") {
      const mxId = nextId();
      idMap.set(el.id, mxId);
    }
  }

  const cellLines: string[] = [
    `    <mxCell id="0" />`,
    `    <mxCell id="1" parent="0" />`,
  ];

  // Build absolute positions map for parent-relative conversion
  const nodePositions = new Map<string, Position>();
  for (const el of diagram.elements) {
    if (el.kind === "node") {
      nodePositions.set(el.id, el.position);
    }
  }

  for (const el of diagram.elements) {
    if (el.kind === "node") {
      const mxId = idMap.get(el.id)!;
      const parentMxId = el.parent ? idMap.get(el.parent) ?? "1" : "1";

      // Resolve theme variables in style, ensuring essential draw.io properties
      const resolvedStyle = resolveStyleMap(el.style, themeProps);
      if (!resolvedStyle["whiteSpace"]) resolvedStyle["whiteSpace"] = "wrap";
      if (!resolvedStyle["html"]) resolvedStyle["html"] = "1";
      const styleStr = styleMapToString(resolvedStyle);

      // Coordinate transform: absolute → parent-relative
      let x = el.position.x;
      let y = el.position.y;
      if (el.parent) {
        const parentPos = nodePositions.get(el.parent);
        if (parentPos) {
          x -= parentPos.x;
          y -= parentPos.y;
        }
      }

      const size = el.size ?? { width: 120, height: 60 };
      const label = labelToHtml(el.label);

      cellLines.push(
        `    <mxCell id="${mxId}" value="${label}" style="${styleStr}" vertex="1" parent="${parentMxId}">` +
        `<mxGeometry x="${x}" y="${y}" width="${size.width}" height="${size.height}" as="geometry" />` +
        `</mxCell>`
      );
    } else if (el.kind === "edge") {
      const connId = nextId();
      const sourceId = el.source ? (idMap.get(el.source) ?? el.source) : "";
      const targetId = el.target ? (idMap.get(el.target) ?? el.target) : "";

      // Determine edge parent
      const edgeParentMxId = el.parent ? (idMap.get(el.parent) ?? "1") : "1";

      // Compute parent offset for coordinate conversion (absolute → parent-relative)
      let parentDx = 0, parentDy = 0;
      if (el.parent) {
        // Walk up the parent chain to compute absolute offset
        let pid: string | undefined = el.parent;
        while (pid) {
          const pos = nodePositions.get(pid);
          if (!pos) break;
          parentDx += pos.x;
          parentDy += pos.y;
          // Find this node's parent
          const parentNode = diagram.elements.find(
            (e) => e.kind === "node" && e.id === pid
          ) as import("../dsl/types.js").Node | undefined;
          pid = parentNode?.parent;
        }
      }

      // Start with explicit style properties (v2: style map comes from the original)
      const combinedStyle: StyleMap = {};

      // Apply arrow operator defaults if present (for AI-generated DSL)
      if (el.arrow) {
        const arrowProps = ARROW_TO_STYLE[el.arrow];
        if (arrowProps) {
          if (arrowProps.endArrow) combinedStyle["endArrow"] = arrowProps.endArrow;
          if (arrowProps.endFill !== undefined) combinedStyle["endFill"] = String(arrowProps.endFill);
          if (arrowProps.startArrow) combinedStyle["startArrow"] = arrowProps.startArrow;
          if (arrowProps.startFill !== undefined) combinedStyle["startFill"] = String(arrowProps.startFill);
          if (arrowProps.dashed) combinedStyle["dashed"] = "1";
          const multiplier = ARROW_MULTIPLIER[el.arrow];
          const strokeWidth = multiplier * IMP_STROKE_WIDTH[3];
          combinedStyle["strokeWidth"] = String(strokeWidth);
        }
        if (el.terminal) {
          const override = TERMINAL_OVERRIDE[el.terminal];
          combinedStyle["endArrow"] = override.endArrow;
          combinedStyle["endFill"] = String(override.endFill);
        }
      }

      // Only add defaults if not already provided by style
      if (!combinedStyle["edgeStyle"] && !el.style["edgeStyle"]) {
        combinedStyle["edgeStyle"] = "orthogonalEdgeStyle";
      }
      if (!combinedStyle["rounded"] && !el.style["rounded"]) {
        combinedStyle["rounded"] = "1";
      }
      combinedStyle["html"] = "1";

      // Override with explicit style properties from DSL
      for (const [key, value] of Object.entries(el.style)) {
        if (key === "_geoWidth" || key === "_geoHeight") continue; // internal
        combinedStyle[key] = value;
      }

      // Resolve theme variables
      const resolvedStyle = resolveStyleMap(combinedStyle, themeProps);
      const styleStr = styleMapToString(resolvedStyle);

      const label = el.label ? labelToHtml(el.label) : "";

      // Geometry: preserve width/height for shape-based edges (flexArrow)
      const geoW = el.style["_geoWidth"];
      const geoH = el.style["_geoHeight"];
      const geoSizeAttrs = (geoW && geoH) ? ` width="${geoW}" height="${geoH}"` : "";

      // Waypoints (convert to parent-relative)
      let geometryInner = "";
      if (el.waypoints && el.waypoints.length > 0) {
        const points = el.waypoints
          .map((wp) => `<mxPoint x="${wp.x - parentDx}" y="${wp.y - parentDy}" />`)
          .join("");
        geometryInner = `<Array as="points">${points}</Array>`;
      }

      // Source/target points (convert to parent-relative)
      if (el.sourcePoint) {
        geometryInner += `<mxPoint x="${el.sourcePoint.x - parentDx}" y="${el.sourcePoint.y - parentDy}" as="sourcePoint" />`;
      }
      if (el.targetPoint) {
        geometryInner += `<mxPoint x="${el.targetPoint.x - parentDx}" y="${el.targetPoint.y - parentDy}" as="targetPoint" />`;
      }

      // Build source/target attributes
      let edgeAttrs = `edge="1"`;
      if (sourceId) edgeAttrs += ` source="${sourceId}"`;
      if (targetId) edgeAttrs += ` target="${targetId}"`;

      cellLines.push(
        `    <mxCell id="${connId}" value="${label}" style="${styleStr}" ${edgeAttrs} parent="${edgeParentMxId}">` +
        `<mxGeometry${geoSizeAttrs} relative="1" as="geometry">${geometryInner}</mxGeometry>` +
        `</mxCell>`
      );
    }
  }

  const title = escapeXml(diagram.title ?? "Diagram");

  return [
    `<mxfile>`,
    `  <diagram name="${title}">`,
    `    <mxGraphModel>`,
    `      <root>`,
    ...cellLines.map((l) => "    " + l),
    `      </root>`,
    `    </mxGraphModel>`,
    `  </diagram>`,
    `</mxfile>`,
  ].join("\n");
}
