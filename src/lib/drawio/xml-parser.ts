/**
 * XML Parser: mxGraph XML → AST
 *
 * Best-effort reverse mapping from draw.io XML back to the DSL AST.
 * Replaces the old generator.ts.
 */

import { parseStringPromise } from "xml2js";
import type {
  Diagram, DiagramElement, Shape, Connection, TextElement,
  ColorToken, TextClass, TextSizeClass, ImportanceLevel, RouteType,
  Position, HAlign, VAlign,
} from "../dsl/types.js";
import { styleToShape } from "./shape-map.js";
import { styleToArrow, styleToRoute, strokeToImportance, ARROW_MULTIPLIER } from "./arrow-map.js";

// ---------------------------------------------------------------------------
// Color matching
// ---------------------------------------------------------------------------

/** Light theme palette for reverse mapping. */
const LIGHT_PALETTE: Record<ColorToken, { fill: string; stroke: string; font: string }> = {
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

const DARK_PALETTE: Record<ColorToken, { fill: string; stroke: string; font: string }> = {
  c0: { fill: "#1e3a5f", stroke: "#60a5fa", font: "#bfdbfe" },
  c1: { fill: "#1a3a2a", stroke: "#34d399", font: "#a7f3d0" },
  c2: { fill: "#3d2e0a", stroke: "#fbbf24", font: "#fde68a" },
  c3: { fill: "#3b1c1c", stroke: "#f87171", font: "#fecaca" },
  c4: { fill: "#2e1a47", stroke: "#c084fc", font: "#e9d5ff" },
  c5: { fill: "#1e1b4b", stroke: "#818cf8", font: "#c7d2fe" },
  c6: { fill: "#3b1a2e", stroke: "#f472b6", font: "#fbcfe8" },
  c7: { fill: "#1e293b", stroke: "#64748b", font: "#cbd5e1" },
  c8: { fill: "#3b1f0a", stroke: "#fb923c", font: "#fed7aa" },
  c9: { fill: "#0f2a2a", stroke: "#2dd4bf", font: "#99f6e4" },
};

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
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

/**
 * Check if a color is near-white (all RGB channels > 240).
 */
function isNearWhite(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240;
}

/**
 * Find the nearest color token for a hex color.
 * Only checks the light palette — matching against dark palette causes
 * false positives (e.g., black matching dark-theme fills).
 */
function nearestColorToken(hex: string, channel?: "fill" | "stroke"): ColorToken | undefined {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;

  let bestToken: ColorToken | undefined;
  let bestDist = Infinity;

  for (const [token, colors] of Object.entries(LIGHT_PALETTE)) {
    // If a specific channel is requested, only check that channel
    const candidates = channel
      ? [channel === "fill" ? colors.fill : colors.stroke]
      : [colors.fill, colors.stroke, colors.font];
    for (const colorHex of candidates) {
      const cRgb = hexToRgb(colorHex);
      if (!cRgb) continue;
      const dist = colorDistance(rgb, cRgb);
      if (dist < bestDist) {
        bestDist = dist;
        bestToken = token as ColorToken;
      }
    }
  }

  // Only match if reasonably close
  if (bestDist > 80) return undefined;
  return bestToken;
}

// ---------------------------------------------------------------------------
// HSL helpers for hue-based matching
// ---------------------------------------------------------------------------

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** Angular distance between two hues (0–180). */
function hueDist(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return d > 180 ? 360 - d : d;
}

/**
 * Find the best color token considering both fill and stroke colors together.
 * Uses hue-based matching for saturated fills, RGB distance for desaturated ones.
 */
function bestColorTokenForShape(
  fillHex: string | undefined,
  strokeHex: string | undefined,
): ColorToken | undefined {
  const fillRgb = fillHex ? hexToRgb(fillHex) : null;
  const strokeRgb = strokeHex ? hexToRgb(strokeHex) : null;

  if (!fillRgb && !strokeRgb) return undefined;

  // Check if fill is saturated (not gray/white/black)
  const fillHsl = fillRgb ? rgbToHsl(fillRgb[0], fillRgb[1], fillRgb[2]) : null;
  const fillIsSaturated = fillHsl ? fillHsl.s > 0.15 : false;

  // Very dark + desaturated fills (dark gray/black) should use defaults, not a color token
  // These don't visually match any pastel palette color
  if (fillHsl && fillHsl.l < 0.25 && fillHsl.s < 0.2) {
    return undefined;
  }

  // For saturated fills, use hue-based matching against palette fill AND stroke colors
  // (palette fills are pastels, strokes are brighter — both carry the token's hue)
  if (fillIsSaturated && fillHsl && fillRgb) {
    let bestToken: ColorToken | undefined;
    let bestHueDist = Infinity;

    for (const [token, colors] of Object.entries(LIGHT_PALETTE)) {
      // Check hue distance against both fill and stroke, take the minimum
      let minHd = Infinity;
      for (const colorHex of [colors.fill, colors.stroke]) {
        const cRgb = hexToRgb(colorHex);
        if (!cRgb) continue;
        const cHsl = rgbToHsl(cRgb[0], cRgb[1], cRgb[2]);
        // Skip desaturated palette colors
        if (cHsl.s < 0.2) continue;
        const hd = hueDist(fillHsl.h, cHsl.h);
        if (hd < minHd) minHd = hd;
      }
      if (minHd < bestHueDist) {
        bestHueDist = minHd;
        bestToken = token as ColorToken;
      }
    }

    // Only use hue match if within 45 degrees
    if (bestHueDist <= 45 && bestToken) return bestToken;
  }

  // For desaturated fills (white, gray, etc.), use RGB distance with defaults comparison
  const defaultFillRgb = hexToRgb("#ffffff")!;
  const defaultStrokeRgb = hexToRgb("#9ca3af")!;

  let bestToken: ColorToken | undefined;
  let bestScore = Infinity;

  // Score using defaults (no token)
  let defaultScore = 0;
  if (fillRgb) defaultScore += colorDistance(fillRgb, defaultFillRgb);
  if (strokeRgb) defaultScore += colorDistance(strokeRgb, defaultStrokeRgb);
  bestScore = defaultScore;

  for (const [token, colors] of Object.entries(LIGHT_PALETTE)) {
    let score = 0;
    if (fillRgb) {
      const tokenFillRgb = hexToRgb(colors.fill);
      if (tokenFillRgb) score += colorDistance(fillRgb, tokenFillRgb);
    }
    if (strokeRgb) {
      const tokenStrokeRgb = hexToRgb(colors.stroke);
      if (tokenStrokeRgb) score += colorDistance(strokeRgb, tokenStrokeRgb);
    }
    if (score < bestScore) {
      bestScore = score;
      bestToken = token as ColorToken;
    }
  }

  return bestToken;
}

// ---------------------------------------------------------------------------
// Font size → text class matching
// ---------------------------------------------------------------------------

const FONT_SIZE_TO_CLASS: Array<{ size: number; cls: TextSizeClass }> = [
  { size: 24, cls: "h1" },
  { size: 20, cls: "h2" },
  { size: 16, cls: "h3" },
  { size: 14, cls: "h4" },
  { size: 16, cls: "b1" },
  { size: 14, cls: "b2" },
  { size: 12, cls: "b3" },
  { size: 10, cls: "b4" },
  { size: 9, cls: "b5" },
  { size: 8, cls: "b6" },
  { size: 10, cls: "ct1" },
  { size: 9, cls: "ct2" },
];

function nearestTextClass(fontSize: number, isConnection: boolean, isBold?: boolean): TextSizeClass {
  // For connections, prefer ct classes
  if (isConnection) {
    if (fontSize <= 9) return "ct2";
    if (fontSize <= 10) return "ct1";
  }

  // Disambiguate h3/b1 (both 16px) and h4/b2 (both 14px) using bold flag
  if (!isConnection && isBold !== undefined) {
    if (fontSize === 16) return isBold ? "h3" : "b1";
    if (fontSize === 14) return isBold ? "h4" : "b2";
  }

  let best: TextSizeClass = "b3";
  let bestDist = Infinity;
  for (const { size, cls } of FONT_SIZE_TO_CLASS) {
    // Skip connection classes for shapes and vice versa
    if (isConnection && !cls.startsWith("ct") && cls !== "b4" && cls !== "b5" && cls !== "b6") continue;
    if (!isConnection && cls.startsWith("ct")) continue;

    const dist = Math.abs(fontSize - size);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Style string parsing
// ---------------------------------------------------------------------------

function getStyleProp(style: string, key: string): string | undefined {
  const m = style.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
  return m?.[1];
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCell(cell: any, parentMap: Map<string, any[]>): DiagramElement | null {
  const attrs = cell.$ ?? {};
  const style: string = attrs.style ?? "";
  const id: string = attrs.id;
  const label: string = (attrs.value ?? "").replace(/<br\s*\/?>/g, "\\n").replace(/<[^>]+>/g, "");
  const source: string | undefined = attrs.source;
  const target: string | undefined = attrs.target;
  const parent: string | undefined = attrs.parent;

  // Skip root cells
  if (id === "0" || id === "1") return null;

  // Edge
  if (attrs.edge === "1" || source || target) {
    const strokeWidth = Number(getStyleProp(style, "strokeWidth") ?? "1");
    const { arrow, terminal } = styleToArrow(style, strokeWidth);
    const route = styleToRoute(style);
    const multiplier = ARROW_MULTIPLIER[arrow];
    const importance = strokeToImportance(strokeWidth, multiplier);
    const isDashed = getStyleProp(style, "dashed") === "1";
    const effectiveImp = isDashed && importance === 3 ? 4 : importance;

    // Color from stroke — only match against palette stroke colors
    const strokeColor = getStyleProp(style, "strokeColor");
    const color = strokeColor ? nearestColorToken(strokeColor, "stroke") : undefined;

    // Text class
    const fontSize = Number(getStyleProp(style, "fontSize") ?? "10");
    const textSize = nearestTextClass(fontSize, true);
    const fontFamily = getStyleProp(style, "fontFamily") ?? "";
    const isMono = /mono|consolas|courier/i.test(fontFamily);

    const textClass: TextClass = {};
    if (textSize !== "ct1") textClass.size = textSize;
    if (isMono) textClass.mono = true;

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
            waypoints.push({
              x: Number(pt.$.x ?? 0),
              y: Number(pt.$.y ?? 0),
            });
          }
        }
      }

      // Extract sourcePoint/targetPoint for floating edges (Visio imports)
      const mxPoints = geom.mxPoint ?? [];
      for (const pt of mxPoints) {
        const ptAttrs = pt.$ ?? {};
        if (ptAttrs.as === "sourcePoint") {
          sourcePoint = { x: Number(ptAttrs.x ?? 0), y: Number(ptAttrs.y ?? 0) };
        } else if (ptAttrs.as === "targetPoint") {
          targetPoint = { x: Number(ptAttrs.x ?? 0), y: Number(ptAttrs.y ?? 0) };
        }
      }
    }

    const conn: Connection = {
      kind: "connection",
      source: source ?? "",
      arrow,
      target: target ?? "",
    };

    if (terminal) conn.terminal = terminal;
    if (label) conn.label = label;
    if (color) conn.color = color;
    if (textClass.size || textClass.mono || textClass.italic) conn.textClass = textClass;
    if (effectiveImp !== 3) conn.importance = effectiveImp as ImportanceLevel;
    if (route !== "ortho") conn.route = route;
    if (waypoints.length > 0) conn.waypoints = waypoints;

    // Floating edge endpoints (Visio imports use absolute coordinates)
    if (!source && sourcePoint) conn.sourcePoint = sourcePoint;
    if (!target && targetPoint) conn.targetPoint = targetPoint;

    // Anchor points
    const entryX = getStyleProp(style, "entryX");
    if (entryX !== undefined) conn.entryX = Number(entryX);
    const entryY = getStyleProp(style, "entryY");
    if (entryY !== undefined) conn.entryY = Number(entryY);
    const exitX = getStyleProp(style, "exitX");
    if (exitX !== undefined) conn.exitX = Number(exitX);
    const exitY = getStyleProp(style, "exitY");
    if (exitY !== undefined) conn.exitY = Number(exitY);

    return conn;
  }

  // Vertex (shape or text)
  if (attrs.vertex === "1") {
    const geom = cell.mxGeometry?.[0]?.$;
    const x = Number(geom?.x ?? 0);
    const y = Number(geom?.y ?? 0);
    const width = Number(geom?.width ?? 120);
    const height = Number(geom?.height ?? 60);

    // Extract fontStyle bitmask (bit 0 = bold, bit 1 = italic)
    const fontStyleVal = Number(getStyleProp(style, "fontStyle") ?? "0");
    const isBold = (fontStyleVal & 1) === 1;
    const isItalic = (fontStyleVal & 2) === 2;

    // Text element detection
    if (style.startsWith("text;") || (style.includes("fillColor=none") && style.includes("strokeColor=none"))) {
      const fontSize = Number(getStyleProp(style, "fontSize") ?? "14");
      const textSize = nearestTextClass(fontSize, false, isBold);
      const fontFamily = getStyleProp(style, "fontFamily") ?? "";
      const isMono = /mono|consolas|courier/i.test(fontFamily);

      const fontColor = getStyleProp(style, "fontColor");
      const color = fontColor ? nearestColorToken(fontColor) : undefined;

      const textClass: TextClass = {};
      if (textSize !== "b2") textClass.size = textSize;
      if (isMono) textClass.mono = true;
      if (isItalic) textClass.italic = true;

      const text: TextElement = {
        kind: "text",
        id,
        label,
        position: { x, y },
      };

      if (color) text.color = color;
      if (textClass.size || textClass.mono || textClass.italic) text.textClass = textClass;

      return text;
    }

    // Shape
    const shapeType = styleToShape(style);
    const fillColor = getStyleProp(style, "fillColor");
    const strokeColor = getStyleProp(style, "strokeColor");
    const color = bestColorTokenForShape(
      fillColor && fillColor !== "none" ? fillColor : undefined,
      strokeColor && strokeColor !== "none" ? strokeColor : undefined,
    );

    const fontSize = Number(getStyleProp(style, "fontSize") ?? "12");
    const textSize = nearestTextClass(fontSize, false, isBold);
    const fontFamily = getStyleProp(style, "fontFamily") ?? "";
    const isMono = /mono|consolas|courier/i.test(fontFamily);

    const textClass: TextClass = {};
    if (textSize !== "b3") textClass.size = textSize;
    if (isMono) textClass.mono = true;
    if (isItalic) textClass.italic = true;

    const shape: Shape = {
      kind: "shape",
      shapeType,
      id,
      label,
      position: { x, y },
    };

    // Size — only include if non-default
    shape.size = { width, height };

    // Detect noFill for non-text vertices
    if (fillColor === "none") {
      shape.noFill = true;
    }

    if (color) shape.color = color;
    if (textClass.size || textClass.mono || textClass.italic) shape.textClass = textClass;

    // Stroke width
    const strokeWidthStr = getStyleProp(style, "strokeWidth");
    if (strokeWidthStr) {
      const sw = Number(strokeWidthStr);
      if (!isNaN(sw) && sw !== 1) shape.strokeWidth = sw;
    }

    // Text alignment
    const align = getStyleProp(style, "align");
    if (align === "left" || align === "right") shape.align = align as HAlign;

    const verticalAlign = getStyleProp(style, "verticalAlign");
    if (verticalAlign === "top" || verticalAlign === "bottom") shape.verticalAlign = verticalAlign as VAlign;

    // Container
    if (getStyleProp(style, "container") === "1" || style.includes("swimlane")) {
      shape.container = true;
    }

    // Group — parent other than "1" means it's inside a group
    if (parent && parent !== "1" && parent !== "0") {
      shape.group = parent;
    }

    return shape;
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

  // Build parent map for group coordinate conversion
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
      // Merge UserObject id/label onto inner mxCell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged = { ...(inner as any) };
      merged.$ = { ...(merged.$ ?? {}), id: uoAttrs.id };
      if (uoAttrs.label !== undefined) merged.$.value = uoAttrs.label;
      cells.push(merged);
    }
  }

  const parentMap = new Map<string, unknown[]>();

  // -----------------------------------------------------------------------
  // Visio container merge pre-pass
  // Visio imports create a 3-cell pattern:
  //   Parent: UserObject vertex with fillColor=none;strokeColor=none (invisible container)
  //   Child A: vertex with shape=stencil(...) (the visible shape outline)
  //   Child B: vertex with style starting "text;" (the label)
  // We merge these into a single shape using the container's geometry + text child's label.
  // -----------------------------------------------------------------------

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

  // Classify merged Visio containers by dimensions + stencil properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function classifyMergedShape(containerStyle: string, width: number, height: number, stencilChildren: any[]): string {
    const aspect = width / height;
    const stencilStyle: string = (stencilChildren[0]?.$ ?? {}).style ?? "";
    const stencilRounded = stencilStyle.includes("rounded=1");
    const containerRounded = containerStyle.includes("rounded=1");
    const isRounded = stencilRounded || containerRounded;

    // Square + single stencil → circle
    if (stencilChildren.length === 1 && aspect >= 0.8 && aspect <= 1.2 && width >= 40) {
      if (isRounded || width >= 60) return "circle";
    }

    if (isRounded) return "rbox";
    return "box";
  }

  // Identify Visio cell groups: invisible container with stencil children + optional text child.
  // Patterns: 1 stencil + 1 text (standard), N stencils + 1 text (complex icons),
  //           N stencils + 0 text (unlabeled icons)
  const consumedIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mergedGroups = new Map<string, { stencilChildren: any[]; textChild: any | null }>();

  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    const style: string = attrs.style ?? "";
    const id: string = attrs.id;

    // Skip non-vertices and root cells
    if (attrs.vertex !== "1" || id === "0" || id === "1") continue;

    // Candidate: invisible container with fillColor=none and strokeColor=none
    if (!style.includes("fillColor=none") || !style.includes("strokeColor=none")) continue;

    const children = childrenByParent.get(id);
    if (!children || children.length === 0) continue;

    // Classify children
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
        // Check if child is itself a merged container (nested Visio groups)
        const childId = (child.$ ?? {}).id;
        const childChildStyle: string = (child.$ ?? {}).style ?? "";
        if (childChildStyle.includes("fillColor=none") && childChildStyle.includes("strokeColor=none")) {
          // Nested invisible container — still part of the group
          stencilChildren.push(child);
        } else {
          hasOther = true;
        }
      }
    }

    // Accept if we have at least 1 stencil child and no unexpected children
    if (stencilChildren.length > 0 && !hasOther) {
      mergedGroups.set(id, { stencilChildren, textChild });
      for (const sc of stencilChildren) {
        const scId = (sc.$ ?? {}).id;
        consumedIds.add(scId);
        // Also consume any children of nested stencil containers
        const nested = childrenByParent.get(scId);
        if (nested) {
          for (const n of nested) consumedIds.add((n.$ ?? {}).id);
        }
      }
      if (textChild) consumedIds.add((textChild.$ ?? {}).id);
    }
  }

  const elements: DiagramElement[] = [];
  // First pass: build ID → position map for parent-relative → absolute conversion
  const cellPositions = new Map<string, { x: number; y: number; parent?: string }>();

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
  }

  // Build cell ID → parent ID map for all cells (used for coordinate conversion)
  const cellParents = new Map<string, string>();
  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    if (attrs.id && attrs.parent && attrs.parent !== "0" && attrs.parent !== "1") {
      cellParents.set(attrs.id, attrs.parent);
    }
  }

  for (const cell of cells) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cell as any;
    const attrs = c.$ ?? {};
    const id: string = attrs.id;

    // Skip consumed children of merged Visio groups
    if (consumedIds.has(id)) continue;

    // Handle merged Visio container: emit a single Shape
    if (mergedGroups.has(id)) {
      const { stencilChildren, textChild } = mergedGroups.get(id)!;
      const textLabel: string = textChild
        ? ((textChild.$ ?? {}).value ?? "").replace(/<br\s*\/?>/g, "\\n").replace(/<[^>]+>/g, "")
        : "";

      const geom = c.mxGeometry?.[0]?.$;
      const x = Number(geom?.x ?? 0);
      const y = Number(geom?.y ?? 0);
      const width = Number(geom?.width ?? 120);
      const height = Number(geom?.height ?? 60);

      const style: string = attrs.style ?? "";
      const shapeType = classifyMergedShape(style, width, height, stencilChildren);

      const shape: Shape = {
        kind: "shape",
        shapeType,
        id,
        label: textLabel,
        position: { x, y },
        size: { width, height },
      };

      // Detect noFill: only when stencil child actually has no fill
      const stencilStyle: string = (stencilChildren[0]?.$ ?? {}).style ?? "";
      const stencilFill = getStyleProp(stencilStyle, "fillColor");
      if (!stencilFill || stencilFill === "none") {
        shape.noFill = true;
      }

      // Determine color token using stencil fill + stroke together
      const stencilStroke = getStyleProp(stencilStyle, "strokeColor");
      const color = bestColorTokenForShape(
        stencilFill && stencilFill !== "none" ? stencilFill : undefined,
        stencilStroke && stencilStroke !== "none" ? stencilStroke : undefined,
      );
      if (color) shape.color = color;

      // Stroke width from stencil child
      const stencilStrokeWidth = getStyleProp(stencilStyle, "strokeWidth");
      if (stencilStrokeWidth) {
        const sw = Number(stencilStrokeWidth);
        if (!isNaN(sw) && sw !== 1) shape.strokeWidth = sw;
      }

      // Group — parent other than "1" means it's inside a group
      const parent = attrs.parent;
      if (parent && parent !== "1" && parent !== "0") {
        shape.group = parent;
      }

      elements.push(shape);
      continue;
    }

    const el = parseCell(cell, parentMap);
    if (el) elements.push(el);
  }

  // Post-pass: convert parent-relative coordinates to absolute for ALL positioned elements
  for (const el of elements) {
    if ((el.kind === "shape" || el.kind === "text") && cellParents.has(el.id)) {
      const parentId = cellParents.get(el.id)!;
      const parentPos = cellPositions.get(parentId);
      if (parentPos) {
        el.position.x += parentPos.x;
        el.position.y += parentPos.y;

        // Handle nested groups recursively
        let ancestor = parentPos.parent;
        while (ancestor && ancestor !== "0" && ancestor !== "1") {
          const ancestorPos = cellPositions.get(ancestor);
          if (ancestorPos) {
            el.position.x += ancestorPos.x;
            el.position.y += ancestorPos.y;
            ancestor = ancestorPos.parent;
          } else {
            break;
          }
        }
      }
    }
  }

  return { title, elements };
}
