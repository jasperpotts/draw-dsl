/**
 * Diagram validator — runs all rules and returns sorted errors.
 */

import type { Diagram, ValidationError } from "../dsl/types.js";
import {
  uniqueIds,
  validArrows,
  noHexColors,
  validTextClasses,
  validImportance,
  validRouting,
  validCoordinates,
  validSizes,
  groupRefsExist,
  endpointsExist,
  waypointFormat,
} from "./rules.js";

const ALL_RULES = [
  uniqueIds,
  validArrows,
  noHexColors,
  validTextClasses,
  validImportance,
  validRouting,
  validCoordinates,
  validSizes,
  groupRefsExist,
  endpointsExist,
  waypointFormat,
];

/**
 * Run all validation rules against a diagram.
 * Returns errors sorted by line number.
 */
export function validate(diagram: Diagram): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const rule of ALL_RULES) {
    errors.push(...rule(diagram));
  }
  errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return errors;
}
