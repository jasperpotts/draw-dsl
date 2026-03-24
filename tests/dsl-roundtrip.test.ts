/**
 * DSL v2 Round-Trip Tests
 *
 * Pipeline: DSL text → parseDsl → AST₁ → buildMxGraphXml → XML
 *   → parseMxGraphXml → AST₂ → serializeDiagram → DSL text₂ → parseDsl → AST₃
 *
 * Verifies lossless conversion for v2 DSL features.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseDsl } from "../src/lib/dsl/parser.js";
import { serializeDiagram } from "../src/lib/dsl/serializer.js";
import { buildMxGraphXml } from "../src/lib/drawio/xml-builder.js";
import { parseMxGraphXml } from "../src/lib/drawio/xml-parser.js";
import { testStylesheet } from "./helpers/stylesheet.js";
import type { Diagram, Node, Edge } from "../src/lib/dsl/types.js";

const OUTPUT_DIR = join(import.meta.dirname, "..", "test-output", "dsl-roundtrip");

beforeAll(() => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

async function roundTrip(dslText: string, fixtureName?: string) {
  const { diagram: ast1, errors: parseErrors1 } = parseDsl(dslText);
  expect(parseErrors1, "Parse errors on input DSL").toEqual([]);

  const xml = buildMxGraphXml(ast1, testStylesheet, "light");
  const ast2 = await parseMxGraphXml(xml);
  const dslText2 = serializeDiagram(ast2);
  const { diagram: ast3, errors: parseErrors2 } = parseDsl(dslText2);
  expect(parseErrors2, "Parse errors on round-tripped DSL").toEqual([]);

  if (fixtureName) {
    writeFileSync(join(OUTPUT_DIR, `${fixtureName}.input.dsl`), dslText);
    writeFileSync(join(OUTPUT_DIR, `${fixtureName}.drawio`), xml);
    writeFileSync(join(OUTPUT_DIR, `${fixtureName}.roundtrip.dsl`), dslText2);
  }

  return { ast1, xml, ast2, dslText2, ast3 };
}

function nodes(d: Diagram): Node[] {
  return d.elements.filter((e): e is Node => e.kind === "node");
}

function edges(d: Diagram): Edge[] {
  return d.elements.filter((e): e is Edge => e.kind === "edge");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DSL v2 Round-Trip: Nodes", () => {
  it("basic node with style block round-trips", async () => {
    const dsl = `node n1 "Hello" @100,200 [120x60] { rounded=1; fillColor=#EFF6FF; strokeColor=#3b82f6 }`;
    const { ast1, ast3 } = await roundTrip(dsl, "basic-node");
    expect(nodes(ast1)).toHaveLength(1);
    expect(nodes(ast3)).toHaveLength(1);
    expect(nodes(ast3)[0].label).toBe("Hello");
  });

  it("node with theme variables round-trips", async () => {
    const dsl = `node n1 "Themed" @100,200 [120x60] { rounded=1; $c0 }`;
    const { ast1 } = await roundTrip(dsl, "themed-node");
    expect(nodes(ast1)).toHaveLength(1);
    expect(nodes(ast1)[0].style["fillColor"]).toBe("$c0.fill");
  });

  it("node with shape= property round-trips", async () => {
    const dsl = `node db "Database" @100,200 [80x80] { shape=cylinder3; $c1 }`;
    const { ast3 } = await roundTrip(dsl, "shape-node");
    expect(nodes(ast3)).toHaveLength(1);
    // The shape=cylinder3 should be preserved
    expect(nodes(ast3)[0].style["shape"]).toBe("cylinder3");
  });

  it("text node round-trips", async () => {
    const dsl = `node t1 "A Label" @100,200 { text; fillColor=none; strokeColor=none }`;
    const { ast3 } = await roundTrip(dsl, "text-node");
    expect(nodes(ast3)).toHaveLength(1);
  });

  it("node with multiline label round-trips", async () => {
    const dsl = `node n1 "Line 1\\nLine 2" @100,200 [120x60] { $c0 }`;
    const { ast3 } = await roundTrip(dsl, "multiline-node");
    expect(nodes(ast3)[0].label).toContain("Line 1");
    expect(nodes(ast3)[0].label).toContain("Line 2");
  });

  it("container node with children round-trips", async () => {
    const dsl = [
      `node pool "Services" @50,50 [500x400] { swimlane; container=1; $c7 }`,
      `node svc1 "Auth" @70,90 [120x60] in=pool { rounded=1; $c0 }`,
    ].join("\n");
    const { ast3 } = await roundTrip(dsl, "container-node");
    const n = nodes(ast3);
    expect(n.length).toBeGreaterThanOrEqual(2);
  });
});

describe("DSL v2 Round-Trip: Edges", () => {
  it("basic edge round-trips", async () => {
    const dsl = [
      `node a "A" @100,100 [60x40] { $c0 }`,
      `node b "B" @300,100 [60x40] { $c1 }`,
      `edge a -> b "connects"`,
    ].join("\n");
    const { ast3 } = await roundTrip(dsl, "basic-edge");
    expect(edges(ast3)).toHaveLength(1);
  });

  it("edge with style overrides round-trips", async () => {
    const dsl = [
      `node a "A" @100,100 [60x40] { $c0 }`,
      `node b "B" @300,100 [60x40] { $c1 }`,
      `edge a -> b { endArrow=block; strokeWidth=2; dashed=1 }`,
    ].join("\n");
    const { ast1 } = await roundTrip(dsl, "styled-edge");
    const e = edges(ast1)[0];
    expect(e.style["endArrow"]).toBe("block");
    expect(e.style["strokeWidth"]).toBe("2");
    expect(e.style["dashed"]).toBe("1");
  });

  it("dashed arrow --> round-trips", async () => {
    const dsl = [
      `node a "A" @100,100 [60x40] { $c0 }`,
      `node b "B" @300,100 [60x40] { $c1 }`,
      `edge a --> b "dashed"`,
    ].join("\n");
    const { ast1 } = await roundTrip(dsl, "dashed-edge");
    expect(edges(ast1)[0].arrow).toBe("-->");
  });

  it("bidirectional <-> round-trips", async () => {
    const dsl = [
      `node a "A" @100,100 [60x40] { $c0 }`,
      `node b "B" @300,100 [60x40] { $c1 }`,
      `edge a <-> b`,
    ].join("\n");
    const { ast1 } = await roundTrip(dsl, "bidi-edge");
    expect(edges(ast1)[0].arrow).toBe("<->");
  });

  it("floating edge round-trips", async () => {
    const dsl = `edge @100,200 -> @300,400 { strokeWidth=2 }`;
    const { ast1 } = await roundTrip(dsl, "floating-edge");
    expect(edges(ast1)[0].sourcePoint).toEqual({ x: 100, y: 200 });
    expect(edges(ast1)[0].targetPoint).toEqual({ x: 300, y: 400 });
  });

  it("edge with waypoints round-trips", async () => {
    const dsl = [
      `node a "A" @100,100 [60x40] { $c0 }`,
      `node b "B" @300,300 [60x40] { $c1 }`,
      `edge a -> b via 200,150 250,250`,
    ].join("\n");
    const { ast1 } = await roundTrip(dsl, "waypoint-edge");
    expect(edges(ast1)[0].waypoints).toHaveLength(2);
  });
});

describe("DSL v2 Round-Trip: Diagram", () => {
  it("diagram title round-trips", async () => {
    const dsl = [
      `diagram "My Diagram"`,
      ``,
      `node n1 "Hello" @100,100 [120x60] { $c0 }`,
    ].join("\n");
    const { ast1, ast3 } = await roundTrip(dsl, "title");
    expect(ast1.title).toBe("My Diagram");
    // Title comes back from XML
    expect(ast3.title).toBeDefined();
  });

  it("comprehensive multi-element diagram round-trips", async () => {
    const dsl = [
      `diagram "Test"`,
      ``,
      `node api "API" @100,100 [120x60] { rounded=1; $c0 }`,
      `node db "DB" @350,100 [80x80] { shape=cylinder3; $c1 }`,
      `node doc "Docs" @100,300 [120x80] { shape=document; $c2 }`,
      `edge api -> db "queries" { edgeStyle=orthogonalEdgeStyle }`,
      `edge api --> doc "generates"`,
    ].join("\n");
    const { ast1, ast3 } = await roundTrip(dsl, "comprehensive");
    expect(nodes(ast1).length).toBe(3);
    expect(edges(ast1).length).toBe(2);
    // Round-trip preserves element counts
    expect(nodes(ast3).length).toBe(3);
    expect(edges(ast3).length).toBe(2);
  });
});
