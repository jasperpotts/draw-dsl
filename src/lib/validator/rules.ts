/**
 * Validation rules for v2 diagrams.
 * Each rule function takes a Diagram and returns an array of ValidationErrors.
 */

import type { Diagram, ValidationError, Node, Edge, DiagramElement } from "../dsl/types.js";

function getNodes(elements: DiagramElement[]): Node[] {
  return elements.filter((e): e is Node => e.kind === "node");
}

function getEdges(elements: DiagramElement[]): Edge[] {
  return elements.filter((e): e is Edge => e.kind === "edge");
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** All node IDs must be unique. */
export function uniqueIds(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();
  for (const el of getNodes(diagram.elements)) {
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

/** Coordinates must be finite numbers. */
export function validCoordinates(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const el of getNodes(diagram.elements)) {
    const pos = el.position;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      errors.push({ line: el.line, message: `Invalid coordinates: @${pos.x},${pos.y}` });
    }
  }
  return errors;
}

/** Size overrides must be positive. */
export function validSizes(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const el of getNodes(diagram.elements)) {
    if (!el.size) continue;
    if (el.size.width <= 0 || el.size.height <= 0) {
      errors.push({ line: el.line, message: `Size must be positive: [${el.size.width}x${el.size.height}]` });
    }
  }
  return errors;
}

/** Parent references (in=) must target existing node IDs. */
export function parentRefsExist(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set<string>();
  for (const el of getNodes(diagram.elements)) {
    nodeIds.add(el.id);
  }
  for (const el of getNodes(diagram.elements)) {
    if (el.parent && !nodeIds.has(el.parent)) {
      errors.push({ line: el.line, message: `Parent reference '${el.parent}' does not exist` });
    }
  }
  return errors;
}

/** Edge source/target IDs must exist as node IDs (or be floating endpoints). */
export function endpointsExist(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set<string>();
  for (const el of getNodes(diagram.elements)) {
    nodeIds.add(el.id);
  }
  for (const edge of getEdges(diagram.elements)) {
    if (edge.source && !nodeIds.has(edge.source) && !edge.sourcePoint) {
      errors.push({ line: edge.line, message: `Edge source '${edge.source}' does not exist` });
    }
    if (edge.target && !nodeIds.has(edge.target) && !edge.targetPoint) {
      errors.push({ line: edge.line, message: `Edge target '${edge.target}' does not exist` });
    }
  }
  return errors;
}

/** Theme variable references must be well-formed. */
export function validThemeVars(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  const validPattern = /^\$(c[0-9]|default)\.(fill|stroke|font)$|^\$(font|font\.mono|font\.notes)$|^\$(text\.(h[1-4]|b[1-6]|ct[12]))$/;

  for (const el of diagram.elements) {
    for (const [, value] of Object.entries(el.style)) {
      if (value.startsWith("$") && !validPattern.test(value)) {
        errors.push({ line: el.line, message: `Unknown theme variable '${value}'` });
      }
    }
  }
  return errors;
}
