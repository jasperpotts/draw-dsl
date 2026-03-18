/**
 * Individual validation rules for diagrams.
 * Each rule function takes a Diagram and returns an array of ValidationErrors.
 */

import type { Diagram, ValidationError, Shape, Connection, TextElement, DiagramElement } from "../dsl/types.js";
import { ALL_ARROW_OPERATORS } from "../drawio/arrow-map.js";

const VALID_COLORS = new Set(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]);
const VALID_SIZE_CLASSES = new Set(["h1", "h2", "h3", "h4", "b1", "b2", "b3", "b4", "b5", "b6", "ct1", "ct2"]);
const VALID_ROUTES = new Set(["ortho", "straight", "curved", "elbow", "er", "iso"]);
const ARROW_SET = new Set(ALL_ARROW_OPERATORS);

function getShapesAndTexts(elements: DiagramElement[]): (Shape | TextElement)[] {
  return elements.filter((e): e is Shape | TextElement => e.kind === "shape" || e.kind === "text");
}

function getConnections(elements: DiagramElement[]): Connection[] {
  return elements.filter((e): e is Connection => e.kind === "connection");
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** All shape/text IDs must be unique. */
export function uniqueIds(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();
  for (const el of getShapesAndTexts(diagram.elements)) {
    const prev = seen.get(el.id);
    if (prev !== undefined) {
      errors.push({
        line: el.line,
        message: `Duplicate ID '${el.id}' (first defined on line ${prev})`,
      });
    } else {
      seen.set(el.id, el.line ?? 0);
    }
  }
  return errors;
}

/** Arrow operators must be recognized. */
export function validArrows(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const conn of getConnections(diagram.elements)) {
    if (!ARROW_SET.has(conn.arrow)) {
      errors.push({ line: conn.line, message: `Unknown arrow operator '${conn.arrow}'` });
    }
  }
  return errors;
}

/** No hex colors — c= must use c0–c9 tokens only. */
export function noHexColors(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const el of diagram.elements) {
    const color = "color" in el ? el.color : undefined;
    if (color && !VALID_COLORS.has(color)) {
      errors.push({ line: el.line, message: `Invalid color token '${color}' — use c0–c9` });
    }
    if (color && color.startsWith("#")) {
      errors.push({ line: el.line, message: `Hex colors are not allowed — use c0–c9 tokens` });
    }
  }
  return errors;
}

/** Text classes must be valid. */
export function validTextClasses(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const el of diagram.elements) {
    const tc = "textClass" in el ? el.textClass : undefined;
    if (!tc) continue;
    if (tc.size && !VALID_SIZE_CLASSES.has(tc.size)) {
      errors.push({ line: el.line, message: `Unknown text size class '${tc.size}'` });
    }
  }
  return errors;
}

/** Importance levels must be 1–4. */
export function validImportance(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const conn of getConnections(diagram.elements)) {
    if (conn.importance !== undefined && (conn.importance < 1 || conn.importance > 4)) {
      errors.push({ line: conn.line, message: `Importance must be 1–4, got ${conn.importance}` });
    }
  }
  return errors;
}

/** Route values must be recognized. */
export function validRouting(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const conn of getConnections(diagram.elements)) {
    if (conn.route && !VALID_ROUTES.has(conn.route)) {
      errors.push({ line: conn.line, message: `Unknown route type '${conn.route}'` });
    }
  }
  return errors;
}

/** Coordinates must be non-negative numbers. */
export function validCoordinates(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const el of diagram.elements) {
    if (el.kind === "connection") continue;
    const pos = el.position;
    if (pos.x < 0 || pos.y < 0) {
      errors.push({ line: el.line, message: `Coordinates must be non-negative: @${pos.x},${pos.y}` });
    }
    if (!Number.isInteger(pos.x) || !Number.isInteger(pos.y)) {
      errors.push({ line: el.line, message: `Coordinates must be integers: @${pos.x},${pos.y}` });
    }
  }
  return errors;
}

/** Size overrides must be positive integers. */
export function validSizes(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const el of diagram.elements) {
    if (el.kind !== "shape" || !el.size) continue;
    if (el.size.width <= 0 || el.size.height <= 0) {
      errors.push({ line: el.line, message: `Size must be positive: [${el.size.width}x${el.size.height}]` });
    }
    if (!Number.isInteger(el.size.width) || !Number.isInteger(el.size.height)) {
      errors.push({ line: el.line, message: `Size must be integers: [${el.size.width}x${el.size.height}]` });
    }
  }
  return errors;
}

/** Group references (in=) must target existing shape IDs. */
export function groupRefsExist(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const shapeIds = new Set<string>();
  for (const el of diagram.elements) {
    if (el.kind === "shape") shapeIds.add(el.id);
  }
  for (const el of diagram.elements) {
    if (el.kind === "shape" && el.group) {
      if (!shapeIds.has(el.group)) {
        errors.push({ line: el.line, message: `Group reference '${el.group}' does not exist` });
      }
    }
  }
  return errors;
}

/** Connection source/target IDs must exist as shape or text IDs. */
export function endpointsExist(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  for (const el of getShapesAndTexts(diagram.elements)) {
    ids.add(el.id);
  }
  for (const conn of getConnections(diagram.elements)) {
    if (!ids.has(conn.source)) {
      errors.push({ line: conn.line, message: `Connection source '${conn.source}' does not exist` });
    }
    if (!ids.has(conn.target)) {
      errors.push({ line: conn.line, message: `Connection target '${conn.target}' does not exist` });
    }
  }
  return errors;
}

/** Waypoints must be valid X,Y coordinate pairs. */
export function waypointFormat(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const conn of getConnections(diagram.elements)) {
    if (!conn.waypoints) continue;
    for (const wp of conn.waypoints) {
      if (!Number.isFinite(wp.x) || !Number.isFinite(wp.y)) {
        errors.push({ line: conn.line, message: `Invalid waypoint coordinates: ${wp.x},${wp.y}` });
      }
    }
  }
  return errors;
}
