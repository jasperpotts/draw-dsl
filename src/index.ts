/**
 * draw-dsl library exports
 *
 * Use these if consuming draw-dsl as a library rather than via the CLI or MCP server.
 */

export type { DslDiagram, DslNode, DslEdge, NodeShape, EdgeStyle, ArrowType } from "./lib/dsl/index.js";
export { generateDsl, serializeDsl, parseDsl, buildDrawioXml } from "./lib/dsl/index.js";
export { extractFromSvg } from "./lib/formats/drawio-svg.js";
export { extractFromPng } from "./lib/formats/drawio-png.js";
export type { Renderer, RenderFormat, RenderOptions } from "./lib/renderer/index.js";
export { DesktopCliRenderer } from "./lib/renderer/index.js";
