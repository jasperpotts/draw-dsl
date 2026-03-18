export type {
  ShapeKeyword, ArrowOperator, TerminalMarker, ColorToken,
  TextSizeClass, TextClass, RouteType, ImportanceLevel,
  Position, Size, Shape, Connection, TextElement,
  DiagramElement, Diagram, ParseError, ValidationError,
} from "./types.js";
export { parseDsl } from "./parser.js";
export type { ParseResult } from "./parser.js";
export { serializeDiagram } from "./serializer.js";
