/**
 * XML Parser v2: mxGraph XML → AST
 *
 * Parses draw.io XML into the v2 AST by preserving the full style string
 * as a StyleMap. Optionally "theme-ifies" colors that closely match palette tokens.
 */

import { parseStringPromise } from "xml2js";
import type { Diagram, DiagramElement, Node, Edge, StyleMap, Position } from "../dsl/types.js";

// ---------------------------------------------------------------------------
// Style string parsing
// ---------------------------------------------------------------------------

/**
 * Parse a draw.io style string into a StyleMap.
 * Handles both key=value pairs and value-less flags (e.g., "rounded", "ellipse").
 */
export function parseStyleString(style: string): StyleMap {
  const map: StyleMap = {};
  if (!style) return map;
  const parts = style.split(";").filter((p) => p.trim() !== "");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) {
      // Value-less flag (e.g., "rounded", "ellipse", "text", "swimlane")
      map[part.trim()] = "";
    } else {
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (key) map[key] = value;
    }
  }
  return map;
}

/**
 * Serialize a StyleMap back to a draw.io style string.
 */
export function serializeStyleString(map: StyleMap): string {
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
// Color matching for theme-ification
// ---------------------------------------------------------------------------

/** Light theme palette for reverse mapping. */
const LIGHT_PALETTE: Record<string, { fill: string; stroke: string; font: string }> = {
  c0: { fill: "#EFF6FF", stroke: "#3b82f6", font: "#1e40af" },
  c1: { fill: "#ECFDF5", stroke: "#10b981", font: "#065f46" },
  c2: { fill: "#FEF3C7", stroke: "#f59e0b", font: "#92400e" },
  c3: { fill: "#FEE2E2", stroke: "#ef4444", font: "#991b1b" },
  c4: { fill: "#F3E8FF", stroke: "#a855f7", font: "#6b21a8" },
  c5: { fill: "#E0E7FF", stroke: "#6366f1", font: "#4338ca" },
  c6: { fill: "#FCE7F3", stroke: "#ec4899", font: "#9d174d" },
  c7: { fill: "#F8FAFC", stroke: "#94a3b8", font: "#334155" },
  c8: { fill: "#FFF7ED", stroke: "#f97316", font: "#c2410c" },
  c9: { fill: "#F0FDFA", stroke: "#14b8a6", font: "#115e59" },
};

const DEFAULT_COLORS = { fill: "#ffffff", stroke: "#9ca3af", font: "#1f2937" };

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r, g, b];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Try to match a hex color to a theme token channel.
 * Returns e.g. "$c0.fill" or undefined if no close match.
 */
function matchColorToTheme(
  hex: string,
  channel: "fill" | "stroke" | "font",
): string | undefined {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;

  let bestToken: string | undefined;
  let bestDist = Infinity;

  // Check default colors first
  const defaultHex = DEFAULT_COLORS[channel];
  const defaultRgb = hexToRgb(defaultHex);
  if (defaultRgb) {
    const dist = colorDistance(rgb, defaultRgb);
    if (dist < bestDist) {
      bestDist = dist;
      bestToken = `$default.${channel}`;
    }
  }

  // Check palette
  for (const [token, colors] of Object.entries(LIGHT_PALETTE)) {
    const tokenHex = colors[channel];
    const tokenRgb = hexToRgb(tokenHex);
    if (!tokenRgb) continue;
    const dist = colorDistance(rgb, tokenRgb);
    if (dist < bestDist) {
      bestDist = dist;
      bestToken = `$${token}.${channel}`;
    }
  }

  // Only match if very close (within threshold)
  if (bestDist > 30) return undefined;
  return bestToken;
}

/**
 * Theme-ify a StyleMap: replace literal colors with theme variable references
 * where the color closely matches a palette token.
 */
function themeifyStyle(style: StyleMap): void {
  const colorKeys: Array<{ styleKey: string; channel: "fill" | "stroke" | "font" }> = [
    { styleKey: "fillColor", channel: "fill" },
    { styleKey: "strokeColor", channel: "stroke" },
    { styleKey: "fontColor", channel: "font" },
  ];

  for (const { styleKey, channel } of colorKeys) {
    const value = style[styleKey];
    if (!value || value === "none" || value.startsWith("$")) continue;
    const themeVar = matchColorToTheme(value, channel);
    if (themeVar) {
      style[styleKey] = themeVar;
    }
  }
}

// ---------------------------------------------------------------------------
// Style cleaning: remove Visio-specific noise
// ---------------------------------------------------------------------------

/** Properties that are Visio import artifacts and not needed for rendering. */
const VISIO_NOISE_KEYS = new Set([
  "vsdxID", "gradientColor", "spacingTop", "spacingBottom",
  "spacingLeft", "spacingRight", "labelBackgroundColor", "points",
  "overflow", "backgroundOutline",
]);

function cleanVisioNoise(style: StyleMap): void {
  for (const key of VISIO_NOISE_KEYS) {
    delete style[key];
  }
}

// ---------------------------------------------------------------------------
// Label extraction
// ---------------------------------------------------------------------------

/** Formatting tags that should be preserved in labels. */
const FORMATTING_TAG_RE = /<\/?(b|i|u|em|strong|font|sub|sup|s|strike)\b[^>]*>/i;

/**
 * Extract a label from draw.io's HTML value attribute.
 * - If the label contains formatting tags (<b>, <font>, etc.), preserve them as raw HTML.
 * - Otherwise, convert structural tags (<div>, <p>, <br>) to \n and strip the rest.
 */
function extractLabel(rawValue: string): string {
  if (!rawValue) return "";

  // Decode HTML entities that draw.io uses in attributes
  let value = rawValue
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // Check if there are meaningful formatting tags
  const hasFormatting = FORMATTING_TAG_RE.test(value);

  if (hasFormatting) {
    // Preserve formatting tags, but clean up structural wrappers
    // Remove outer <div>/<p> wrappers that just add structure, keep inner formatting
    value = value
      .replace(/<br\s*\/?>/gi, "\\n")
      .replace(/<\/?(div|p)\b[^>]*>/gi, "\\n")
      .replace(/(\\n)+/g, "\\n")
      .replace(/^\\n|\\n$/g, "");
    return value;
  }

  // No formatting: strip all HTML to plain text
  return value
    .replace(/<br\s*\/?>/gi, "\\n")
    .replace(/<\/?(div|p)\b[^>]*>/gi, "\\n")
    .replace(/<[^>]+>/g, "")
    .replace(/(\\n)+/g, "\\n")
    .replace(/^\\n|\\n$/g, "");
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCell(cell: any): DiagramElement | null {
  const attrs = cell.$ ?? {};
  const styleStr: string = attrs.style ?? "";
  const id: string = attrs.id;
  const label: string = extractLabel(attrs.value ?? "");
  const source: string | undefined = attrs.source;
  const target: string | undefined = attrs.target;
  const parentId: string | undefined = attrs.parent;

  // Skip root cells
  if (id === "0" || id === "1") return null;

  const style = parseStyleString(styleStr);

  // Edge
  if (attrs.edge === "1" || source || target) {
    // Waypoints and floating edge points
    const waypoints: Position[] = [];
    let sourcePoint: Position | undefined;
    let targetPoint: Position | undefined;
    const geom = cell.mxGeometry?.[0];
    if (geom) {
      const arrays = geom.Array ?? [];
      for (const arr of arrays) {
        if (arr.$.as === "points") {
          const points = arr.mxPoint ?? [];
          for (const pt of points) {
            waypoints.push({ x: Number(pt.$.x ?? 0), y: Number(pt.$.y ?? 0) });
          }
        }
      }
      const mxPoints = geom.mxPoint ?? [];
      for (const pt of mxPoints) {
        const ptAttrs = pt.$ ?? {};
        if (ptAttrs.as === "sourcePoint") {
          sourcePoint = { x: Number(ptAttrs.x ?? 0), y: Number(ptAttrs.y ?? 0) };
        } else if (ptAttrs.as === "targetPoint") {
          targetPoint = { x: Number(ptAttrs.x ?? 0), y: Number(ptAttrs.y ?? 0) };
        }
      }

      // Preserve edge geometry width/height for shape-based edges (flexArrow etc.)
      const geomAttrs = geom.$ ?? {};
      const geoW = Number(geomAttrs.width ?? 0);
      const geoH = Number(geomAttrs.height ?? 0);
      if (geoW > 0 && geoH > 0) {
        style["_geoWidth"] = String(geoW);
        style["_geoHeight"] = String(geoH);
      }
    }

    // Ensure html=1
    style["html"] = "1";

    const edge: Edge = {
      kind: "edge",
      source: source ?? "",
      target: target ?? "",
      style,
    };

    if (label) edge.label = label;
    if (waypoints.length > 0) edge.waypoints = waypoints;
    if (sourcePoint) edge.sourcePoint = sourcePoint;
    if (targetPoint) edge.targetPoint = targetPoint;

    // Track parent container for edges inside groups/swimlanes
    if (parentId && parentId !== "1" && parentId !== "0") {
      edge.parent = parentId;
    }

    return edge;
  }

  // Vertex (shape/text/anything)
  if (attrs.vertex === "1") {
    const geom = cell.mxGeometry?.[0]?.$;
    const x = Number(geom?.x ?? 0);
    const y = Number(geom?.y ?? 0);
    const width = Number(geom?.width ?? 120);
    const height = Number(geom?.height ?? 60);

    // Ensure html=1 and whiteSpace=wrap are present
    if (!style["html"]) style["html"] = "1";
    if (!style["whiteSpace"]) style["whiteSpace"] = "wrap";

    const node: Node = {
      kind: "node",
      id,
      label,
      position: { x, y },
      size: { width, height },
      style,
    };

    // Parent group
    if (parentId && parentId !== "1" && parentId !== "0") {
      node.parent = parentId;
    }

    return node;
  }

  return null;
}

export async function parseMxGraphXml(drawioXml: string): Promise<Diagram> {
  const parsed = await parseStringPromise(drawioXml, { explicitArray: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let root: any;
  let title: string | undefined;

  if (parsed.mxfile) {
    const diagramEl = parsed.mxfile.diagram?.[0];
    if (typeof diagramEl === "string") {
      const inner = await parseStringPromise(decodeURIComponent(diagramEl), {
        explicitArray: true,
      });
      root = inner.mxGraphModel?.root?.[0];
    } else {
      title = diagramEl?.$?.name;
      root = diagramEl?.mxGraphModel?.[0]?.root?.[0];
    }
  } else if (parsed.mxGraphModel) {
    root = parsed.mxGraphModel.root?.[0];
  }

  if (!root) {
    throw new Error("Could not find mxGraphModel root in drawio XML.");
  }

  // Collect all cells: plain mxCells + UserObject-wrapped mxCells
  const rawMxCells: unknown[] = root.mxCell ?? [];
  const userObjects: unknown[] = root.UserObject ?? [];

  const cells: unknown[] = [...rawMxCells];
  for (const uo of userObjects) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uoAttrs = (uo as any).$ ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const innerCells = (uo as any).mxCell ?? [];
    for (const inner of innerCells) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged = { ...(inner as any) };
      merged.$ = { ...(merged.$ ?? {}), id: uoAttrs.id };
      if (uoAttrs.label !== undefined) merged.$.value = uoAttrs.label;
      cells.push(merged);
    }
  }

  // Build parent→children map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childrenByParent = new Map<string, any[]>();
  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    const parent = attrs.parent;
    if (parent && parent !== "0" && parent !== "1") {
      const list = childrenByParent.get(parent) ?? [];
      list.push(c);
      childrenByParent.set(parent, list);
    }
  }

  // -----------------------------------------------------------------------
  // Visio container merge pre-pass
  // -----------------------------------------------------------------------
  const consumedIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mergedGroups = new Map<string, { stencilChildren: any[]; textChild: any | null }>();

  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    const cellStyle: string = attrs.style ?? "";
    const cellId: string = attrs.id;

    if (attrs.vertex !== "1" || cellId === "0" || cellId === "1") continue;
    if (!cellStyle.includes("fillColor=none") || !cellStyle.includes("strokeColor=none")) continue;

    const children = childrenByParent.get(cellId);
    if (!children || children.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stencilChildren: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let textChild: any = null;
    let hasOther = false;

    for (const child of children) {
      const childStyle: string = (child.$ ?? {}).style ?? "";
      if (childStyle.includes("shape=stencil(")) {
        stencilChildren.push(child);
      } else if (childStyle.startsWith("text;")) {
        textChild = child;
      } else {
        const childChildStyle: string = (child.$ ?? {}).style ?? "";
        if (childChildStyle.includes("fillColor=none") && childChildStyle.includes("strokeColor=none")) {
          stencilChildren.push(child);
        } else {
          hasOther = true;
        }
      }
    }

    if (stencilChildren.length > 0 && !hasOther) {
      mergedGroups.set(cellId, { stencilChildren, textChild });
      for (const sc of stencilChildren) {
        consumedIds.add((sc.$ ?? {}).id);
        const nested = childrenByParent.get((sc.$ ?? {}).id);
        if (nested) {
          for (const n of nested) consumedIds.add((n.$ ?? {}).id);
        }
      }
      if (textChild) consumedIds.add((textChild.$ ?? {}).id);
    }
  }

  // -----------------------------------------------------------------------
  // Build cell positions for coordinate conversion
  // -----------------------------------------------------------------------
  const cellPositions = new Map<string, { x: number; y: number; parent?: string }>();
  const cellParents = new Map<string, string>();

  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    if (attrs.vertex === "1" && attrs.id !== "0" && attrs.id !== "1") {
      const geom = c.mxGeometry?.[0]?.$;
      cellPositions.set(attrs.id, {
        x: Number(geom?.x ?? 0),
        y: Number(geom?.y ?? 0),
        parent: attrs.parent,
      });
    }
    if (attrs.id && attrs.parent && attrs.parent !== "0" && attrs.parent !== "1") {
      cellParents.set(attrs.id, attrs.parent);
    }
  }

  // -----------------------------------------------------------------------
  // Parse cells into elements
  // -----------------------------------------------------------------------
  const elements: DiagramElement[] = [];

  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    const cellId: string = attrs.id;

    if (consumedIds.has(cellId)) continue;

    // Handle merged Visio container
    if (mergedGroups.has(cellId)) {
      const { stencilChildren, textChild } = mergedGroups.get(cellId)!;
      const textLabel: string = textChild
        ? extractLabel((textChild.$ ?? {}).value ?? "")
        : "";

      const geom = c.mxGeometry?.[0]?.$;
      const x = Number(geom?.x ?? 0);
      const y = Number(geom?.y ?? 0);
      const width = Number(geom?.width ?? 120);
      const height = Number(geom?.height ?? 60);

      // Use the stencil child's style (preserving shape=stencil(...) and all properties)
      const stencilStyle: string = (stencilChildren[0]?.$ ?? {}).style ?? "";
      const style = parseStyleString(stencilStyle);

      // Ensure basic properties
      if (!style["html"]) style["html"] = "1";
      if (!style["whiteSpace"]) style["whiteSpace"] = "wrap";

      // Clean Visio noise
      cleanVisioNoise(style);

      // Theme-ify colors
      themeifyStyle(style);

      const node: Node = {
        kind: "node",
        id: cellId,
        label: textLabel,
        position: { x, y },
        size: { width, height },
        style,
      };

      const parent = attrs.parent;
      if (parent && parent !== "1" && parent !== "0") {
        node.parent = parent;
      }

      elements.push(node);
      continue;
    }

    const el = parseCell(cell);
    if (el) {
      // Clean Visio noise and theme-ify
      cleanVisioNoise(el.style);
      themeifyStyle(el.style);
      elements.push(el);
    }
  }

  // Post-pass: convert parent-relative coordinates to absolute

  // Helper: compute absolute offset for a parent chain
  function getAbsoluteOffset(startParentId: string): { dx: number; dy: number } {
    let dx = 0, dy = 0;
    let pid: string | undefined = startParentId;
    while (pid && pid !== "0" && pid !== "1") {
      const pos = cellPositions.get(pid);
      if (!pos) break;
      dx += pos.x;
      dy += pos.y;
      pid = pos.parent;
    }
    return { dx, dy };
  }

  for (const el of elements) {
    if (el.kind === "node" && cellParents.has(el.id)) {
      const parentId = cellParents.get(el.id)!;
      const { dx, dy } = getAbsoluteOffset(parentId);
      el.position.x += dx;
      el.position.y += dy;
    }

    // Convert edge floating points and waypoints from parent-relative to absolute
    if (el.kind === "edge" && el.parent) {
      const { dx, dy } = getAbsoluteOffset(el.parent);
      if (el.sourcePoint) {
        el.sourcePoint.x += dx;
        el.sourcePoint.y += dy;
      }
      if (el.targetPoint) {
        el.targetPoint.x += dx;
        el.targetPoint.y += dy;
      }
      if (el.waypoints) {
        for (const wp of el.waypoints) {
          wp.x += dx;
          wp.y += dy;
        }
      }
    }
  }

  return { title, elements };
}
