/**
 * Type 2: Exhaustive DSL round-trip tests.
 *
 * Pipeline: DSL text → parseDsl → AST₁ → buildMxGraphXml → XML
 *   → parseMxGraphXml → AST₂ → serializeDiagram → DSL text₂ → parseDsl → AST₃
 *
 * Verifies lossless conversion for every DSL feature.
 *
 * Known elision behaviors (tested but expected):
 * - Notes without explicit color get c=c2 after round-trip (builder applies default)
 * - b3 (12px) on shapes is default, gets elided after round-trip
 * - ct1 (10px) on connections is default, gets elided after round-trip
 * - imp=4 adds dashing which may conflict with --> detection
 */

import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseDsl } from "../src/lib/dsl/parser.js";
import { serializeDiagram } from "../src/lib/dsl/serializer.js";
import { buildMxGraphXml } from "../src/lib/drawio/xml-builder.js";
import { parseMxGraphXml } from "../src/lib/drawio/xml-parser.js";
import { testStylesheet } from "./helpers/stylesheet.js";
import { normalizeDiagram } from "./helpers/ast-compare.js";
import type { Diagram, Shape, Connection, TextElement } from "../src/lib/dsl/types.js";
import * as fixtures from "./helpers/dsl-fixtures.js";

const OUTPUT_DIR = join(import.meta.dirname, "..", "test-output", "dsl-roundtrip");

beforeAll(() => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

/**
 * Run the full round-trip pipeline and return intermediate results.
 */
async function roundTrip(dslText: string, fixtureName?: string) {
  // Step 1: DSL → AST₁
  const { diagram: ast1, errors: parseErrors1 } = parseDsl(dslText);
  expect(parseErrors1, "Parse errors on input DSL").toEqual([]);

  // Step 2: AST₁ → XML
  const xml = buildMxGraphXml(ast1, testStylesheet, "light");

  // Step 3: XML → AST₂
  const ast2 = await parseMxGraphXml(xml);

  // Step 4: AST₂ → DSL text₂
  const dslText2 = serializeDiagram(ast2);

  // Step 5: DSL text₂ → AST₃
  const { diagram: ast3, errors: parseErrors2 } = parseDsl(dslText2);
  expect(parseErrors2, "Parse errors on round-tripped DSL").toEqual([]);

  // Write artifacts for manual inspection
  if (fixtureName) {
    writeFileSync(join(OUTPUT_DIR, `${fixtureName}.input.dsl`), dslText);
    writeFileSync(join(OUTPUT_DIR, `${fixtureName}.drawio`), xml);
    writeFileSync(join(OUTPUT_DIR, `${fixtureName}.roundtrip.dsl`), dslText2);
  }

  return { ast1, xml, ast2, dslText2, ast3 };
}

/** Build ID→label map for a diagram */
function idToLabelMap(d: Diagram): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of d.elements) {
    if (el.kind === "shape" || el.kind === "text") {
      map.set(el.id, el.label);
    }
  }
  return map;
}

function shapes(d: Diagram): Shape[] {
  return d.elements.filter((e): e is Shape => e.kind === "shape");
}

function connections(d: Diagram): Connection[] {
  return d.elements.filter((e): e is Connection => e.kind === "connection");
}

function texts(d: Diagram): TextElement[] {
  return d.elements.filter((e): e is TextElement => e.kind === "text");
}

describe("DSL Round-Trip: Shapes", () => {
  it("all 16 shape keywords round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.ALL_SHAPES, "all-shapes");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.shapes.length).toBe(16);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].shapeType, `Shape "${n1.shapes[i].label}"`).toBe(n1.shapes[i].shapeType);
      expect(n2.shapes[i].label).toBe(n1.shapes[i].label);
      expect(n2.shapes[i].position).toEqual(n1.shapes[i].position);
    }
  });

  it("size overrides round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.SIZE_OVERRIDES, "size-overrides");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].size, `Size "${n1.shapes[i].label}"`).toEqual(n1.shapes[i].size);
    }
  });

  it("multiline labels round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.MULTILINE_LABELS, "multiline-labels");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].label).toBe(n1.shapes[i].label);
    }
  });
});

describe("DSL Round-Trip: Arrows", () => {
  it("basic arrows (-> --> -- ---) round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.ALL_ARROWS_BASIC, "arrows-basic");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections.length).toBe(n1.connections.length);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].arrow, `Arrow ${n1.connections[i].sourceLabel}->${n1.connections[i].targetLabel}`).toBe(n1.connections[i].arrow);
      expect(n2.connections[i].sourceLabel).toBe(n1.connections[i].sourceLabel);
      expect(n2.connections[i].targetLabel).toBe(n1.connections[i].targetLabel);
    }
  });

  it("bidirectional arrows (<-> <-->) round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.ALL_ARROWS_BIDI, "arrows-bidi");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections.length).toBe(n1.connections.length);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].arrow).toBe(n1.connections[i].arrow);
    }
  });

  it("UML arrows (*-> o-> #-> ~-> +->) round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.ALL_ARROWS_UML, "arrows-uml");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections.length).toBe(n1.connections.length);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].arrow, `Arrow ${n1.connections[i].sourceLabel}->${n1.connections[i].targetLabel}`).toBe(n1.connections[i].arrow);
    }
  });

  it("terminal markers (-x -o) round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.TERMINAL_MARKERS, "terminal-markers");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].terminal).toBe(n1.connections[i].terminal);
    }
  });

  it("thick arrows (=> ==>) round-trip at imp=1", async () => {
    const dsl = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
A => B imp=1
C ==> D imp=1`;
    const { ast1, ast2 } = await roundTrip(dsl, "arrows-thick");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections.length).toBe(2);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].arrow).toBe(n1.connections[i].arrow);
    }
  });

  it("thick bidirectional (<=>) round-trips at imp=2", async () => {
    const dsl = `\
box A "A" @10,10
box B "B" @200,10
A <=> B imp=2`;
    const { ast1, ast2 } = await roundTrip(dsl, "arrows-thick-bidi");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections[0].arrow).toBe("<=>");
  });
});

describe("DSL Round-Trip: Colors", () => {
  it("all 10 color tokens round-trip on shapes", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.ALL_COLORS, "all-colors");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].color, `Color "${n1.shapes[i].label}"`).toBe(n1.shapes[i].color);
    }
  });

  it("note shapes get c2 default color after round-trip", async () => {
    const dsl = `note N1 "A Note" @10,10`;
    const { ast2 } = await roundTrip(dsl);
    const s = shapes(ast2);
    expect(s[0].color).toBe("c2");
  });
});

describe("DSL Round-Trip: Text Classes", () => {
  it("heading text classes (h1-h4) round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.TEXT_CLASSES_HEADINGS, "text-headings");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].textClass?.size, `TextClass "${n1.shapes[i].label}"`).toBe(n1.shapes[i].textClass?.size);
    }
  });

  it("body text classes b1/b2 round-trip", async () => {
    const dsl = `\
box S1 "Body 1" @10,10 text=b1
box S2 "Body 2" @10,90 text=b2`;
    const { ast1, ast2 } = await roundTrip(dsl, "text-body-b1b2");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].textClass?.size, `TextClass "${n1.shapes[i].label}"`).toBe(n1.shapes[i].textClass?.size);
    }
  });

  it("body text classes (b4 b5 b6) round-trip", async () => {
    const dsl = `\
box S4 "Body 4" @10,10 text=b4
box S5 "Body 5" @10,90 text=b5
box S6 "Body 6" @10,170 text=b6`;
    const { ast1, ast2 } = await roundTrip(dsl);
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.shapes.length; i++) {
      expect(n2.shapes[i].textClass?.size, `TextClass "${n1.shapes[i].label}"`).toBe(n1.shapes[i].textClass?.size);
    }
  });

  it("b3 on shapes is default (12px) — gets elided after round-trip", async () => {
    const dsl = `box S1 "Default Text" @10,10 text=b3`;
    const { ast2 } = await roundTrip(dsl);
    const s = shapes(ast2);
    // b3 is 12px which is the default shape font size — xml-parser won't emit textClass
    expect(s[0].textClass).toBeUndefined();
  });

  it("ct2 on connections round-trips", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.TEXT_CLASSES_CONN, "text-conn");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    // First connection has no text class (ct1 default, gets elided)
    // Second connection has ct2
    // Sort is by sourceLabel->targetLabel, let's check both
    const conn1NoClass = n2.connections.find((c) => c.label === "label1");
    const conn1WithClass = n2.connections.find((c) => c.label === "label2");
    expect(conn1NoClass?.textClass).toBeUndefined();
    expect(conn1WithClass?.textClass?.size).toBe("ct2");
  });

  it("mono with b2 text class round-trips", async () => {
    const dsl = `box S1 "Mono Text" @10,10 text=b2,mono`;
    const { ast2 } = await roundTrip(dsl, "text-b2-mono");
    const s = shapes(ast2);
    expect(s[0].textClass?.size).toBe("b2");
    expect(s[0].textClass?.mono).toBe(true);
  });

  it("mono modifier alone round-trips", async () => {
    const dsl = `box S1 "Mono" @10,10 text=h1,mono`;
    const { ast2 } = await roundTrip(dsl);
    const s = shapes(ast2);
    expect(s[0].textClass?.mono).toBe(true);
    expect(s[0].textClass?.size).toBe("h1");
  });
});

describe("DSL Round-Trip: Connection Attributes", () => {
  it("route types round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.ROUTE_TYPES, "route-types");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].route, `Route ${n1.connections[i].sourceLabel}->${n1.connections[i].targetLabel}`).toBe(n1.connections[i].route);
    }
  });

  it("importance levels round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.IMPORTANCE_LEVELS, "importance");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    for (let i = 0; i < n1.connections.length; i++) {
      expect(n2.connections[i].importance, `Importance ${n1.connections[i].sourceLabel}->${n1.connections[i].targetLabel}`).toBe(n1.connections[i].importance);
    }
  });

  it("connection with label + color + text class combined", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.CONNECTION_ATTRS, "conn-attrs");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections[0].label).toBe(n1.connections[0].label);
    expect(n2.connections[0].color).toBe(n1.connections[0].color);
    expect(n2.connections[0].textClass?.size).toBe(n1.connections[0].textClass?.size);
  });

  it("waypoints round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.WAYPOINTS, "waypoints");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.connections[0].waypoints).toEqual(n1.connections[0].waypoints);
  });
});

describe("DSL Round-Trip: Groups", () => {
  it("group parent-child relationships round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.GROUPS, "groups");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);

    // Parent exists without group
    const parent2 = n2.shapes.find((s) => s.label === "Group Container");
    expect(parent2).toBeDefined();
    expect(parent2!.groupLabel).toBeUndefined();

    // Children have correct group reference (by parent label)
    const child1 = n2.shapes.find((s) => s.label === "Child 1");
    const child2 = n2.shapes.find((s) => s.label === "Child 2");
    expect(child1?.groupLabel).toBe("Group Container");
    expect(child2?.groupLabel).toBe("Group Container");

    // Positions are absolute
    const origChild1 = n1.shapes.find((s) => s.label === "Child 1")!;
    expect(child1!.position.x).toBe(origChild1.position.x);
    expect(child1!.position.y).toBe(origChild1.position.y);
  });
});

describe("DSL Round-Trip: Text Elements", () => {
  it("text elements round-trip", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.TEXT_ELEMENTS, "text-elements");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.texts.length).toBe(n1.texts.length);
    for (let i = 0; i < n1.texts.length; i++) {
      expect(n2.texts[i].label).toBe(n1.texts[i].label);
      expect(n2.texts[i].position).toEqual(n1.texts[i].position);
    }
    // Color on text element
    const colored = n2.texts.find((t) => t.label === "Colored");
    expect(colored?.color).toBe("c0");
    // Text class on text element
    const styled = n2.texts.find((t) => t.label === "Styled");
    expect(styled?.textClass?.size).toBe("h2");
  });
});

describe("DSL Round-Trip: Diagram Title", () => {
  it("diagram title round-trips", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.DIAGRAM_TITLE, "diagram-title");
    expect(ast2.title).toBe(ast1.title);
  });
});

describe("DSL Round-Trip: Comprehensive", () => {
  it("comprehensive fixture: element counts preserved", async () => {
    const { ast1, ast2 } = await roundTrip(fixtures.COMPREHENSIVE, "comprehensive");
    const n1 = normalizeDiagram(ast1);
    const n2 = normalizeDiagram(ast2);
    expect(n2.shapes.length).toBe(n1.shapes.length);
    expect(n2.connections.length).toBe(n1.connections.length);
    expect(n2.texts.length).toBe(n1.texts.length);
  });
});
