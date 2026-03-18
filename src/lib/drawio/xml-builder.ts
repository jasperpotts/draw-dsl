/**
 * XML Builder: AST + resolved stylesheet → mxGraph XML string
 *
 * Converts a Diagram AST into a complete mxfile XML that draw.io can render.
 */

import type {
  Diagram, Shape, Connection, TextElement, DiagramElement,
  ColorToken, TextClass, ImportanceLevel, Position,
} from "../dsl/types.js";
import type { Stylesheet, ResolvedProperties } from "../stylesheet/types.js";
import { mergeTheme, resolveVars, resolveClass } from "../stylesheet/resolver.js";
import { getShapeStyle, getDefaultSize } from "./shape-map.js";
import {
  ARROW_TO_STYLE, ARROW_MULTIPLIER, IMP_STROKE_WIDTH, IMP_DASHED,
  TERMINAL_OVERRIDE, ROUTE_TO_STYLE,
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

/** Strip quotes from font family — mxGraph uses unquoted font names in style attributes. */
function sanitizeFontFamily(ff: string): string {
  return ff.replace(/"/g, "").replace(/'/g, "");
}

/** Convert \n in labels to HTML line breaks for mxGraph. */
function labelToHtml(label: string): string {
  return escapeXml(label).replace(/\\n/g, "<br>");
}

function colorProps(
  token: ColorToken | undefined,
  themeProps: ResolvedProperties,
  defaults: { fill: string; stroke: string; font: string },
): { fillColor: string; strokeColor: string; fontColor: string } {
  if (token) {
    return {
      fillColor: themeProps[`--${token}-fill`] ?? defaults.fill,
      strokeColor: themeProps[`--${token}-stroke`] ?? defaults.stroke,
      fontColor: themeProps[`--${token}-font`] ?? defaults.font,
    };
  }
  return {
    fillColor: defaults.fill,
    strokeColor: defaults.stroke,
    fontColor: defaults.font,
  };
}

function textStyleProps(
  textClass: TextClass | undefined,
  defaultClass: string,
  stylesheet: Stylesheet,
  themeProps: ResolvedProperties,
): { fontSize: number; fontStyle: number; fontFamily?: string } {
  const sizeName = textClass?.size ?? defaultClass;
  const classDef = resolveClass(stylesheet, sizeName, themeProps);
  const mono = textClass?.mono;

  let fontSize = 12;
  if (classDef["font-size"]) {
    fontSize = parseInt(classDef["font-size"], 10) || 12;
  }

  let fontStyle = 0; // 0=normal, 1=bold, 2=italic, 3=bold+italic
  if (classDef["font-weight"] === "bold") fontStyle |= 1;
  if (classDef["font-style"] === "italic") fontStyle |= 2;

  let fontFamily: string | undefined;
  if (mono) {
    const monoDef = resolveClass(stylesheet, "mono", themeProps);
    fontFamily = monoDef["font-family"] ?? themeProps["--font-mono"];
  }

  // Strip quotes from font family — mxGraph style attributes use unquoted font names
  if (fontFamily) {
    fontFamily = fontFamily.replace(/"/g, "").replace(/'/g, "");
  }

  return { fontSize, fontStyle, fontFamily };
}

// ---------------------------------------------------------------------------
// Cell builders
// ---------------------------------------------------------------------------

let cellIdCounter = 2; // 0 and 1 are reserved

function nextId(): string {
  return String(cellIdCounter++);
}

function buildShapeCell(
  shape: Shape,
  stylesheet: Stylesheet,
  themeProps: ResolvedProperties,
  parentId: string,
  groupInfo: Map<string, string>, // shape ID → mxCell ID
): string {
  const mxId = groupInfo.get(shape.id) ?? nextId();
  if (!groupInfo.has(shape.id)) groupInfo.set(shape.id, mxId);

  const isNote = shape.shapeType === "note";
  const defaultColor = isNote ? "c2" : undefined;
  const effectiveColor = shape.color ?? defaultColor as ColorToken | undefined;

  const defaults = {
    fill: themeProps["--default-fill"] ?? "#ffffff",
    stroke: themeProps["--default-stroke"] ?? "#9ca3af",
    font: themeProps["--default-font"] ?? "#1f2937",
  };
  const colors = colorProps(effectiveColor, themeProps, defaults);

  // Text style
  const defaultTextClass = "b3";
  const textProps = textStyleProps(shape.textClass, defaultTextClass, stylesheet, themeProps);

  // For notes, always use --font-notes
  let fontFamily = textProps.fontFamily;
  if (isNote) {
    fontFamily = sanitizeFontFamily(
      themeProps["--font-notes"]
      ?? resolveClass(stylesheet, "note", themeProps)["font-family"]
      ?? ""
    ) || undefined;
  }

  // Build style string
  let style = getShapeStyle(shape.shapeType);
  style += `fillColor=${colors.fillColor};`;
  style += `strokeColor=${colors.strokeColor};`;
  style += `fontColor=${colors.fontColor};`;
  style += `fontSize=${textProps.fontSize};`;
  if (textProps.fontStyle) style += `fontStyle=${textProps.fontStyle};`;
  if (fontFamily) style += `fontFamily=${fontFamily};`;

  // Check if this shape is a group (container)
  const isContainer = [...groupInfo.entries()].some(
    ([, parentMxId]) => parentMxId === mxId
  );
  // Actually, we need a different approach: check if any element has in=thisId
  // This is handled externally — mark as container if child shapes exist

  const size = shape.size ?? getDefaultSize(shape.shapeType);

  // Compute position — if this shape has a parent, convert to relative coordinates
  let x = shape.position.x;
  let y = shape.position.y;
  // Parent-relative conversion is handled in the main builder

  const label = labelToHtml(shape.label);

  return `    <mxCell id="${mxId}" value="${label}" style="${style}" vertex="1" parent="${parentId}">` +
    `<mxGeometry x="${x}" y="${y}" width="${size.width}" height="${size.height}" as="geometry" />` +
    `</mxCell>`;
}

function buildConnectionCell(
  conn: Connection,
  stylesheet: Stylesheet,
  themeProps: ResolvedProperties,
  idMap: Map<string, string>, // DSL ID → mxCell ID
): string {
  const mxId = nextId();
  const sourceId = idMap.get(conn.source) ?? conn.source;
  const targetId = idMap.get(conn.target) ?? conn.target;

  // Arrow style
  const arrowProps = ARROW_TO_STYLE[conn.arrow];
  const imp: ImportanceLevel = conn.importance ?? 3;
  const multiplier = ARROW_MULTIPLIER[conn.arrow];
  const baseWidth = IMP_STROKE_WIDTH[imp];
  const strokeWidth = multiplier * baseWidth;
  const isDashed = arrowProps.dashed || IMP_DASHED[imp];

  let style = "";

  // Edge style / routing
  const route = conn.route ?? "ortho";
  const edgeStyle = ROUTE_TO_STYLE[route];
  if (edgeStyle && edgeStyle !== "none") {
    style += `edgeStyle=${edgeStyle};`;
  }

  // Arrow endpoints
  let endArrow = arrowProps.endArrow;
  let endFill = arrowProps.endFill;
  if (conn.terminal) {
    const override = TERMINAL_OVERRIDE[conn.terminal];
    endArrow = override.endArrow;
    endFill = override.endFill;
  }

  if (endArrow) style += `endArrow=${endArrow};`;
  if (endFill !== undefined) style += `endFill=${endFill};`;
  if (arrowProps.startArrow) style += `startArrow=${arrowProps.startArrow};`;
  if (arrowProps.startFill !== undefined) style += `startFill=${arrowProps.startFill};`;

  style += `strokeWidth=${strokeWidth};`;
  if (isDashed) style += `dashed=1;`;

  // Color
  if (conn.color) {
    const strokeColor = themeProps[`--${conn.color}-stroke`];
    const fontColor = themeProps[`--${conn.color}-font`];
    if (strokeColor) style += `strokeColor=${strokeColor};`;
    if (fontColor) style += `fontColor=${fontColor};`;
  }

  // Text style
  const textProps = textStyleProps(conn.textClass, "ct1", stylesheet, themeProps);
  style += `fontSize=${textProps.fontSize};`;
  if (textProps.fontStyle) style += `fontStyle=${textProps.fontStyle};`;
  if (textProps.fontFamily) style += `fontFamily=${textProps.fontFamily};`;

  style += `html=1;`;

  const label = conn.label ? labelToHtml(conn.label) : "";

  // Waypoints
  let geometryInner = "";
  if (conn.waypoints && conn.waypoints.length > 0) {
    const points = conn.waypoints
      .map((wp) => `<mxPoint x="${wp.x}" y="${wp.y}" />`)
      .join("");
    geometryInner = `<Array as="points">${points}</Array>`;
  }

  return `    <mxCell id="${mxId}" value="${label}" style="${style}" edge="1" source="${sourceId}" target="${targetId}" parent="1">` +
    `<mxGeometry${geometryInner ? "" : " relative=\"1\""} as="geometry">${geometryInner}</mxGeometry>` +
    `</mxCell>`;
}

function buildTextCell(
  text: TextElement,
  stylesheet: Stylesheet,
  themeProps: ResolvedProperties,
): string {
  const mxId = nextId();

  const defaults = {
    fill: themeProps["--default-fill"] ?? "#ffffff",
    stroke: themeProps["--default-stroke"] ?? "#9ca3af",
    font: themeProps["--default-font"] ?? "#1f2937",
  };

  let fontColor = defaults.font;
  if (text.color) {
    fontColor = themeProps[`--${text.color}-font`] ?? fontColor;
  }

  const textProps = textStyleProps(text.textClass, "b2", stylesheet, themeProps);

  let style = "text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;";
  style += `strokeColor=none;fillColor=none;`;
  style += `fontColor=${fontColor};`;
  style += `fontSize=${textProps.fontSize};`;
  if (textProps.fontStyle) style += `fontStyle=${textProps.fontStyle};`;
  if (textProps.fontFamily) style += `fontFamily=${textProps.fontFamily};`;

  const label = labelToHtml(text.label);

  // Use a reasonable default size for text elements
  const width = 120;
  const height = 30;

  return `    <mxCell id="${mxId}" value="${label}" style="${style}" vertex="1" parent="1">` +
    `<mxGeometry x="${text.position.x}" y="${text.position.y}" width="${width}" height="${height}" as="geometry" />` +
    `</mxCell>`;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build mxGraph XML from a Diagram AST and resolved stylesheet.
 */
export function buildMxGraphXml(
  diagram: Diagram,
  stylesheet: Stylesheet,
  theme: "light" | "dark" = "light",
): string {
  // Reset cell ID counter
  cellIdCounter = 2;

  const merged = mergeTheme(stylesheet, theme);
  const themeProps = resolveVars(merged);

  // Pre-pass: assign mxCell IDs for all shapes/texts, identify groups
  const idMap = new Map<string, string>(); // DSL ID → mxCell ID
  const groupChildren = new Map<string, string[]>(); // group DSL ID → child DSL IDs

  for (const el of diagram.elements) {
    if (el.kind === "shape") {
      const mxId = nextId();
      idMap.set(el.id, mxId);
      if (el.group) {
        const children = groupChildren.get(el.group) ?? [];
        children.push(el.id);
        groupChildren.set(el.group, children);
      }
    } else if (el.kind === "text") {
      const mxId = nextId();
      idMap.set(el.id, mxId);
    }
  }

  // Mark containers
  const containerIds = new Set(groupChildren.keys());

  const cellLines: string[] = [
    `    <mxCell id="0" />`,
    `    <mxCell id="1" parent="0" />`,
  ];

  // Get absolute positions for all shapes (needed for group-relative conversion)
  const shapePositions = new Map<string, Position>();
  for (const el of diagram.elements) {
    if (el.kind === "shape") {
      shapePositions.set(el.id, el.position);
    }
  }

  // Counter continues from where pre-pass left off — connections get new IDs

  for (const el of diagram.elements) {
    if (el.kind === "shape") {
      const mxId = idMap.get(el.id)!;
      const parentMxId = el.group ? idMap.get(el.group) ?? "1" : "1";
      const isContainer = containerIds.has(el.id);

      let style = getShapeStyle(el.shapeType);

      // Container flag
      if (isContainer) {
        style += "container=1;";
      }

      // Note special behavior
      const isNote = el.shapeType === "note";
      const defaultColorToken = isNote ? "c2" : undefined;
      const effectiveColor = el.color ?? defaultColorToken as ColorToken | undefined;

      const defaults = {
        fill: themeProps["--default-fill"] ?? "#ffffff",
        stroke: themeProps["--default-stroke"] ?? "#9ca3af",
        font: themeProps["--default-font"] ?? "#1f2937",
      };
      const colors = colorProps(effectiveColor, themeProps, defaults);

      style += `fillColor=${colors.fillColor};`;
      style += `strokeColor=${colors.strokeColor};`;
      style += `fontColor=${colors.fontColor};`;

      // Text style
      const textProps = textStyleProps(el.textClass, "b3", stylesheet, themeProps);
      let fontFamily = textProps.fontFamily;
      if (isNote) {
        const rawFont = themeProps["--font-notes"]
          ?? resolveClass(stylesheet, "note", themeProps)["font-family"]
          ?? "";
        fontFamily = sanitizeFontFamily(rawFont) || undefined;
      }

      style += `fontSize=${textProps.fontSize};`;
      if (textProps.fontStyle) style += `fontStyle=${textProps.fontStyle};`;
      if (fontFamily) style += `fontFamily=${fontFamily};`;

      const size = el.size ?? getDefaultSize(el.shapeType);

      // Coordinate transform: absolute → parent-relative
      let x = el.position.x;
      let y = el.position.y;
      if (el.group) {
        const parentPos = shapePositions.get(el.group);
        if (parentPos) {
          x -= parentPos.x;
          y -= parentPos.y;
        }
      }

      const label = labelToHtml(el.label);

      cellLines.push(
        `    <mxCell id="${mxId}" value="${label}" style="${style}" vertex="1" parent="${parentMxId}">` +
        `<mxGeometry x="${x}" y="${y}" width="${size.width}" height="${size.height}" as="geometry" />` +
        `</mxCell>`
      );
    } else if (el.kind === "text") {
      const mxId = idMap.get(el.id)!;
      const defaults = {
        fill: themeProps["--default-fill"] ?? "#ffffff",
        stroke: themeProps["--default-stroke"] ?? "#9ca3af",
        font: themeProps["--default-font"] ?? "#1f2937",
      };

      let fontColor = defaults.font;
      if (el.color) {
        fontColor = themeProps[`--${el.color}-font`] ?? fontColor;
      }

      const textProps = textStyleProps(el.textClass, "b2", stylesheet, themeProps);

      let style = "text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;";
      style += `strokeColor=none;fillColor=none;`;
      style += `fontColor=${fontColor};`;
      style += `fontSize=${textProps.fontSize};`;
      if (textProps.fontStyle) style += `fontStyle=${textProps.fontStyle};`;
      if (textProps.fontFamily) style += `fontFamily=${textProps.fontFamily};`;

      const label = labelToHtml(el.label);
      const width = 120;
      const height = 30;

      cellLines.push(
        `    <mxCell id="${mxId}" value="${label}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${el.position.x}" y="${el.position.y}" width="${width}" height="${height}" as="geometry" />` +
        `</mxCell>`
      );
    } else if (el.kind === "connection") {
      const connId = nextId();
      const sourceId = idMap.get(el.source) ?? el.source;
      const targetId = idMap.get(el.target) ?? el.target;

      const arrowProps = ARROW_TO_STYLE[el.arrow];
      const imp: ImportanceLevel = el.importance ?? 3;
      const multiplier = ARROW_MULTIPLIER[el.arrow];
      const baseWidth = IMP_STROKE_WIDTH[imp];
      const strokeWidth = multiplier * baseWidth;
      const isDashed = arrowProps.dashed || IMP_DASHED[imp];

      let style = "";

      // Routing
      const route = el.route ?? "ortho";
      const edgeStyle = ROUTE_TO_STYLE[route];
      if (edgeStyle && edgeStyle !== "none") {
        style += `edgeStyle=${edgeStyle};`;
      }

      // Arrow endpoints
      let endArrow = arrowProps.endArrow;
      let endFill = arrowProps.endFill;
      if (el.terminal) {
        const override = TERMINAL_OVERRIDE[el.terminal];
        endArrow = override.endArrow;
        endFill = override.endFill;
      }

      if (endArrow) style += `endArrow=${endArrow};`;
      if (endFill !== undefined) style += `endFill=${endFill};`;
      if (arrowProps.startArrow) style += `startArrow=${arrowProps.startArrow};`;
      if (arrowProps.startFill !== undefined) style += `startFill=${arrowProps.startFill};`;

      style += `strokeWidth=${strokeWidth};`;
      if (isDashed) style += `dashed=1;`;

      // Color
      if (el.color) {
        const strokeColor = themeProps[`--${el.color}-stroke`];
        const fontColor = themeProps[`--${el.color}-font`];
        if (strokeColor) style += `strokeColor=${strokeColor};`;
        if (fontColor) style += `fontColor=${fontColor};`;
      }

      // Text style
      const textProps = textStyleProps(el.textClass, "ct1", stylesheet, themeProps);
      style += `fontSize=${textProps.fontSize};`;
      if (textProps.fontStyle) style += `fontStyle=${textProps.fontStyle};`;
      if (textProps.fontFamily) style += `fontFamily=${textProps.fontFamily};`;
      style += `html=1;`;

      const label = el.label ? labelToHtml(el.label) : "";

      // Waypoints
      let geometryInner = "";
      if (el.waypoints && el.waypoints.length > 0) {
        const points = el.waypoints
          .map((wp) => `<mxPoint x="${wp.x}" y="${wp.y}" />`)
          .join("");
        geometryInner = `<Array as="points">${points}</Array>`;
      }

      cellLines.push(
        `    <mxCell id="${connId}" value="${label}" style="${style}" edge="1" source="${sourceId}" target="${targetId}" parent="1">` +
        `<mxGeometry${geometryInner ? "" : ` relative="1"`} as="geometry">${geometryInner}</mxGeometry>` +
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
