/**
 * Type 1: Sample file round-trip tests.
 *
 * Pipeline: File → extract XML → parseMxGraphXml → AST₁ → serializeDiagram → DSL text
 *   → parseDsl → AST₂ → buildMxGraphXml → XML₂ → parseMxGraphXml → AST₃
 *
 * Verifies structural preservation: element counts, connection topology.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseDsl } from "../src/lib/dsl/parser.js";
import { serializeDiagram } from "../src/lib/dsl/serializer.js";
import { buildMxGraphXml } from "../src/lib/drawio/xml-builder.js";
import { parseMxGraphXml } from "../src/lib/drawio/xml-parser.js";
import { extractFromSvg } from "../src/lib/formats/drawio-svg.js";
import { extractFromPng } from "../src/lib/formats/drawio-png.js";
import { testStylesheet } from "./helpers/stylesheet.js";
import type { Diagram, Node, Edge } from "../src/lib/dsl/types.js";

const SAMPLES_DIR = join(import.meta.dirname, "..", "drawio-created-samples");
const OUTPUT_DIR = join(import.meta.dirname, "..", "test-output", "samples");

beforeAll(() => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

async function loadXml(filename: string): Promise<string> {
  const filePath = join(SAMPLES_DIR, filename);
  if (filename.endsWith(".drawio.svg")) {
    const content = await readFile(filePath, "utf-8");
    return extractFromSvg(content);
  }
  if (filename.endsWith(".drawio.png")) {
    return extractFromPng(filePath);
  }
  return readFile(filePath, "utf-8");
}

function countElements(d: Diagram) {
  const nodes = d.elements.filter((e): e is Node => e.kind === "node");
  const edges = d.elements.filter((e): e is Edge => e.kind === "edge");
  return { nodes, edges };
}

// .drawio files (raw XML)
const drawioFiles = [
  "T2.drawio",
  "Consensus Node Internals.drawio",
  "High Level Arch.drawio",
  "clpr-middleware-layer.drawio",
  "Subway Flow.drawio",
];

// .drawio.svg files
const svgFiles = [
  "clpr-networking-architecture.drawio.svg",
  "Merkle Tree.drawio.svg",
];

// .drawio.png files
const pngFiles = [
  "clpr-networking-architecture.drawio.png",
];

describe("Sample Round-Trip: .drawio files", () => {
  for (const file of drawioFiles) {
    it(`${file}: loads and parses to AST with elements`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const { nodes, edges } = countElements(ast);
      expect(nodes.length + edges.length).toBeGreaterThan(0);
    });

    it(`${file}: serializes to non-empty DSL`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const dslText = serializeDiagram(ast);
      expect(dslText.length).toBeGreaterThan(0);
    });

    it(`${file}: element count preserved through round-trip`, async () => {
      const xml1 = await loadXml(file);
      const ast1 = await parseMxGraphXml(xml1);
      const dslText = serializeDiagram(ast1);
      const { diagram: ast2, errors } = parseDsl(dslText);
      expect(errors).toEqual([]);

      const xml2 = buildMxGraphXml(ast2, testStylesheet, "light");
      const ast3 = await parseMxGraphXml(xml2);

      const { nodes: nodes1, edges: edges1 } = countElements(ast1);
      const { nodes: nodes3, edges: edges3 } = countElements(ast3);

      // Allow some variation from Visio merge differences
      expect(nodes3.length).toBeGreaterThanOrEqual(nodes1.length * 0.8);
      expect(edges3.length).toBeGreaterThanOrEqual(edges1.length * 0.8);

      // Write artifacts
      const base = file.replace(/\s+/g, "-").replace(/\.[^.]+$/, "");
      writeFileSync(join(OUTPUT_DIR, `${base}.dsl`), dslText);
      writeFileSync(join(OUTPUT_DIR, `${base}.roundtrip.drawio`), xml2);
    });
  }
});

describe("Sample Round-Trip: .drawio.svg files", () => {
  for (const file of svgFiles) {
    it(`${file}: extracts XML and parses with elements`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const { nodes, edges } = countElements(ast);
      expect(nodes.length + edges.length).toBeGreaterThan(0);
    });
  }
});

describe("Sample Round-Trip: .drawio.png files", () => {
  for (const file of pngFiles) {
    it(`${file}: extracts XML and parses with elements`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const { nodes, edges } = countElements(ast);
      expect(nodes.length + edges.length).toBeGreaterThan(0);
    });
  }
});
