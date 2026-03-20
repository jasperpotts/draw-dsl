/**
 * Bidirectional mapping between DSL arrow operators and mxGraph edge styles.
 */

import type { ArrowOperator, TerminalMarker, RouteType, ImportanceLevel } from "../dsl/types.js";

// ---------------------------------------------------------------------------
// Forward mapping: DSL arrow → mxGraph style properties
// ---------------------------------------------------------------------------

export interface ArrowStyleProps {
  endArrow?: string;
  endFill?: number;
  startArrow?: string;
  startFill?: number;
  dashed?: boolean;
}

export const ARROW_TO_STYLE: Record<ArrowOperator, ArrowStyleProps> = {
  "->":   { endArrow: "classic", endFill: 1 },
  "-->":  { endArrow: "classic", endFill: 1, dashed: true },
  "=>":   { endArrow: "classic", endFill: 1 },
  "==>":  { endArrow: "classic", endFill: 1, dashed: true },
  "--":   { endArrow: "none", endFill: 0 },
  "---":  { endArrow: "none", endFill: 0, dashed: true },
  "<->":  { endArrow: "classic", endFill: 1, startArrow: "classic", startFill: 1 },
  "<-->": { endArrow: "classic", endFill: 1, startArrow: "classic", startFill: 1, dashed: true },
  "<=>":  { endArrow: "classic", endFill: 1, startArrow: "classic", startFill: 1 },
  "*->":  { endArrow: "classic", endFill: 1, startArrow: "diamond", startFill: 1 },
  "o->":  { endArrow: "classic", endFill: 1, startArrow: "diamond", startFill: 0 },
  "#->":  { endArrow: "block", endFill: 0 },
  "~->":  { endArrow: "block", endFill: 0, dashed: true },
  "+->":  { endArrow: "open", endFill: 0, dashed: true },
};

/** Thick arrows have a 2x stroke multiplier. */
export const ARROW_MULTIPLIER: Record<ArrowOperator, number> = {
  "->": 1, "-->": 1, "=>": 2, "==>": 2,
  "--": 1, "---": 1,
  "<->": 1, "<-->": 1, "<=>": 2,
  "*->": 1, "o->": 1, "#->": 1, "~->": 1, "+->": 1,
};

/** Base stroke width for each importance level. */
export const IMP_STROKE_WIDTH: Record<ImportanceLevel, number> = {
  1: 3, 2: 2, 3: 1, 4: 1,
};

/** Whether the importance level implies dashing. */
export const IMP_DASHED: Record<ImportanceLevel, boolean> = {
  1: false, 2: false, 3: false, 4: true,
};

/** Terminal marker overrides for the target end. */
export const TERMINAL_OVERRIDE: Record<TerminalMarker, { endArrow: string; endFill: number }> = {
  "-x": { endArrow: "cross", endFill: 0 },
  "-o": { endArrow: "oval", endFill: 0 },
};

/** Route type → mxGraph edgeStyle property value. */
export const ROUTE_TO_STYLE: Record<RouteType, string> = {
  ortho: "orthogonalEdgeStyle",
  straight: "none",
  curved: "curvedEdgeStyle",
  elbow: "elbowEdgeStyle",
  er: "entityRelationEdgeStyle",
  iso: "isometricEdgeStyle",
};

// ---------------------------------------------------------------------------
// Bidirectional arrow operators — these cannot have terminal markers
// ---------------------------------------------------------------------------

export const BIDIRECTIONAL_ARROWS: ReadonlySet<ArrowOperator> = new Set<ArrowOperator>([
  "<->", "<-->", "<=>",
]);

// ---------------------------------------------------------------------------
// All known arrow operators (ordered longest first for parsing)
// ---------------------------------------------------------------------------

export const ALL_ARROW_OPERATORS: readonly string[] = [
  "<-->", "<=>", "<->",
  "==>", "-->", "---",
  "=>", "->", "--",
  "*->", "o->", "#->", "~->", "+->",
];

// ---------------------------------------------------------------------------
// Reverse mapping helpers
// ---------------------------------------------------------------------------

/**
 * Reverse-map mxGraph edge style properties to a DSL arrow operator.
 * Returns the best-match arrow operator.
 */
export function styleToArrow(style: string, strokeWidth?: number): { arrow: ArrowOperator; terminal?: TerminalMarker } {
  const props = parseEdgeStyleProps(style);

  // Check for terminal markers first
  let terminal: TerminalMarker | undefined;
  if (props.endArrow === "cross" && props.endFill === 0) {
    terminal = "-x";
  } else if (props.endArrow === "oval" && props.endFill === 0) {
    terminal = "-o";
  }

  const hasDash = props.dashed === true;
  const hasStart = !!props.startArrow;
  const startArrow = props.startArrow ?? "";
  const startFill = props.startFill ?? 0;

  // Determine base arrow without terminal
  const effectiveEnd = terminal ? "classic" : (props.endArrow ?? "classic");
  const effectiveEndFill = terminal ? 1 : (props.endFill ?? 1);

  // No arrowhead
  if (effectiveEnd === "none") {
    return { arrow: hasDash ? "---" : "--" };
  }

  // Bidirectional
  if (hasStart && startArrow === "classic") {
    if (hasDash) return { arrow: "<-->" };
    // Use strokeWidth to distinguish <=> (thick) from <-> (thin)
    // Only at sw>=4 is it unambiguously thick (sw=2 is ambiguous with thin imp=2)
    if (strokeWidth !== undefined && strokeWidth >= 4) {
      const thickImp = strokeToImportance(strokeWidth, 2);
      if (thickImp >= 1 && thickImp <= 3) return { arrow: "<=>" };
    }
    return { arrow: "<->" };
  }

  // UML: diamond start
  if (startArrow === "diamond" && startFill === 1) return { arrow: "*->", terminal };
  if (startArrow === "diamond" && startFill === 0) return { arrow: "o->", terminal };

  // UML: block/open end
  if (effectiveEnd === "block" && effectiveEndFill === 0) {
    return { arrow: hasDash ? "~->" : "#->", terminal: undefined };
  }
  if (effectiveEnd === "open" && effectiveEndFill === 0 && hasDash) {
    return { arrow: "+->", terminal: undefined };
  }

  // Check for thick arrow variants using strokeWidth context
  // Only at sw>=4 is it unambiguously thick (sw=2 is ambiguous with thin imp=2)
  if (strokeWidth !== undefined && strokeWidth >= 4) {
    const thickImp = strokeToImportance(strokeWidth, 2);
    if (thickImp >= 1 && thickImp <= 3) {
      return { arrow: hasDash ? "==>" : "=>", terminal };
    }
  }

  // Basic arrows — dashed variants
  if (hasDash) return { arrow: "-->", terminal };
  return { arrow: "->", terminal };
}

/** Parse style string into key-value pairs relevant to edges. */
function parseEdgeStyleProps(style: string): {
  endArrow?: string;
  endFill?: number;
  startArrow?: string;
  startFill?: number;
  dashed?: boolean;
} {
  const get = (key: string): string | undefined => {
    const m = style.match(new RegExp(`${key}=([^;]+)`));
    return m?.[1];
  };
  return {
    endArrow: get("endArrow"),
    endFill: get("endFill") !== undefined ? Number(get("endFill")) : undefined,
    startArrow: get("startArrow"),
    startFill: get("startFill") !== undefined ? Number(get("startFill")) : undefined,
    dashed: get("dashed") === "1",
  };
}

/** Reverse-map mxGraph edgeStyle to a RouteType. */
export function styleToRoute(style: string): RouteType {
  const m = style.match(/edgeStyle=([^;]+)/);
  if (!m) return "straight";
  const edgeStyle = m[1];
  for (const [route, mxStyle] of Object.entries(ROUTE_TO_STYLE)) {
    if (edgeStyle === mxStyle) return route as RouteType;
  }
  return "ortho";
}

/** Reverse-map stroke width to importance level, accounting for arrow multiplier. */
export function strokeToImportance(strokeWidth: number, arrowMultiplier: number): ImportanceLevel {
  const base = strokeWidth / arrowMultiplier;
  if (base >= 2.5) return 1;
  if (base >= 1.5) return 2;
  return 3;
}
