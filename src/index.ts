/**
 * draw-dsl library exports
 *
 * Use these if consuming draw-dsl as a library rather than via the CLI or MCP server.
 */

// DSL types and operations
export type {
  ShapeKeyword, ArrowOperator, TerminalMarker, ColorToken,
  TextSizeClass, TextClass, RouteType, ImportanceLevel,
  Position, Size, Shape, Connection, TextElement,
  DiagramElement, Diagram, ParseError, ValidationError,
  ParseResult,
} from "./lib/dsl/index.js";
export { parseDsl, serializeDiagram } from "./lib/dsl/index.js";

// draw.io XML operations
export { buildMxGraphXml } from "./lib/drawio/xml-builder.js";
export { parseMxGraphXml } from "./lib/drawio/xml-parser.js";
export { getShapeStyle, isKnownShape, styleToShape } from "./lib/drawio/shape-map.js";

// Format extraction/embedding
export { extractFromSvg, embedIntoSvg } from "./lib/formats/drawio-svg.js";
export { extractFromPng } from "./lib/formats/drawio-png.js";

// Stylesheet
export type { Stylesheet, ResolvedProperties } from "./lib/stylesheet/types.js";
export { parseStylesheet } from "./lib/stylesheet/parser.js";
export { resolveStylesheet, mergeTheme, resolveVars, resolveThemeProperties } from "./lib/stylesheet/resolver.js";

// Validator
export { validate } from "./lib/validator/index.js";

// Renderer
export type { Renderer, RenderFormat, RenderOptions } from "./lib/renderer/index.js";
export { PlaywrightRenderer } from "./lib/renderer/index.js";
