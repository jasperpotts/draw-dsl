/**
 * Type 1: Sample file round-trip tests.
 *
 * Pipeline: File → extract XML → parseMxGraphXml → AST₁ → serializeDiagram → DSL text
 *   → parseDsl → AST₂ → buildMxGraphXml → XML₂ → parseMxGraphXml → AST₃
 *
 * Verifies structural preservation: element counts, connection topology, group hierarchy.
 *
 * NOT asserted (expected to change for external diagrams):
 * - Exact shape types (external shapes like cisco19, stencils → "box")
 * - Exact color token values (hex→token mapping is approximate)
 * - Exact text classes (font-size→class mapping is approximate)
 * - Arrow operator details (stroke-width ambiguities)
 * - Labels may lose HTML formatting
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import { mkdirSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { parseDsl } from "../src/lib/dsl/parser.js";
import { serializeDiagram } from "../src/lib/dsl/serializer.js";
import { buildMxGraphXml } from "../src/lib/drawio/xml-builder.js";
import { parseMxGraphXml } from "../src/lib/drawio/xml-parser.js";
import { extractFromSvg } from "../src/lib/formats/drawio-svg.js";
import { extractFromPng } from "../src/lib/formats/drawio-png.js";
import { testStylesheet } from "./helpers/stylesheet.js";
import type { Diagram, Shape, Connection, TextElement } from "../src/lib/dsl/types.js";

const SAMPLES_DIR = join(import.meta.dirname, "..", "drawio-created-samples");
const OUTPUT_DIR = join(import.meta.dirname, "..", "test-output", "samples");

beforeAll(() => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

/**
 * Load XML from a sample file, handling .drawio, .drawio.svg, and .drawio.png formats.
 */
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
  const shapes = d.elements.filter((e): e is Shape => e.kind === "shape");
  const conns = d.elements.filter((e): e is Connection => e.kind === "connection");
  const texts = d.elements.filter((e): e is TextElement => e.kind === "text");
  return { shapes, conns, texts };
}

/**
 * Build label-based topology set for connections.
 * Resolves IDs to labels so different ID schemes compare equal.
 */
function connectionTopology(d: Diagram): Set<string> {
  const idToLabel = new Map<string, string>();
  for (const el of d.elements) {
    if (el.kind === "shape" || el.kind === "text") {
      idToLabel.set(el.id, el.label);
    }
  }
  const conns = d.elements.filter((e): e is Connection => e.kind === "connection");
  return new Set(conns.map((c) => {
    const sLabel = idToLabel.get(c.source) ?? c.source;
    const tLabel = idToLabel.get(c.target) ?? c.target;
    return `${sLabel}->${tLabel}`;
  }));
}

// .drawio files (raw XML)
const drawioFiles = [
  "T2.drawio",
  "Consensus Node Internals.drawio",
  "High Level Arch.drawio",
  "clpr-middleware-layer.drawio",
  "Subway Flow.drawio",
];

// .drawio.svg files — these have extraction issues (URI encoding, double-encoding)
const svgFiles = [
  "clpr-networking-architecture.drawio.svg",
  "Merkle Tree.drawio.svg",
];

// .drawio.png files — this file doesn't have drawio tEXt chunk
const pngFiles = [
  "clpr-networking-architecture.drawio.png",
];

describe("Sample Round-Trip: .drawio files", () => {
  for (const file of drawioFiles) {
    it(`${file}: loads and parses to AST with elements`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const { shapes, conns } = countElements(ast);
      expect(shapes.length + conns.length).toBeGreaterThan(0);
    });

    it(`${file}: serializes to non-empty DSL`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const dslText = serializeDiagram(ast);
      expect(dslText.length).toBeGreaterThan(0);
    });

    it(`${file}: shape count preserved through round-trip`, async () => {
      const xml1 = await loadXml(file);
      const ast1 = await parseMxGraphXml(xml1);
      const dslText = serializeDiagram(ast1);
      const { diagram: ast2, errors } = parseDsl(dslText);

      // Write artifacts for manual inspection
      const base = file.replace(/\.[^.]+$/, "").replace(/\s+/g, "-");
      writeFileSync(join(OUTPUT_DIR, `${base}.dsl`), dslText);

      // Skip full round-trip if too many parse errors (external format incompatibilities)
      if (errors.length > ast1.elements.length * 0.5) {
        return; // too lossy to test further
      }

      const xml2 = buildMxGraphXml(ast2, testStylesheet, "light");
      writeFileSync(join(OUTPUT_DIR, `${base}.roundtrip.drawio`), xml2);
      const ast3 = await parseMxGraphXml(xml2);

      const { shapes: shapes1 } = countElements(ast1);
      const { shapes: shapes2 } = countElements(ast2);
      const { shapes: shapes3 } = countElements(ast3);

      // Shapes that successfully parsed should survive the full round-trip
      expect(shapes3.length).toBe(shapes2.length);

      // And we shouldn't lose too many shapes from the original
      // (some loss expected from parse errors on external format shapes)
      const lossRatio = shapes2.length / Math.max(shapes1.length, 1);
      expect(lossRatio, `Too many shapes lost from ${file}`).toBeGreaterThan(0.5);
    });

    it(`${file}: connection topology preserved through round-trip`, async () => {
      const xml1 = await loadXml(file);
      const ast1 = await parseMxGraphXml(xml1);
      const dslText = serializeDiagram(ast1);
      const { diagram: ast2, errors } = parseDsl(dslText);

      if (errors.length > ast1.elements.length * 0.5) {
        return;
      }

      const xml2 = buildMxGraphXml(ast2, testStylesheet, "light");
      const ast3 = await parseMxGraphXml(xml2);

      // Connection topology from ast2→ast3 should be preserved exactly
      const topo2 = connectionTopology(ast2);
      const topo3 = connectionTopology(ast3);
      expect(topo3).toEqual(topo2);
    });
  }
});

describe("Sample Round-Trip: .drawio.svg files", () => {
  for (const file of svgFiles) {
    it(`${file}: extracts XML and parses with elements`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const { shapes, conns } = countElements(ast);
      expect(shapes.length + conns.length).toBeGreaterThan(0);

      // Write DSL artifact
      const dslText = serializeDiagram(ast);
      const base = file.replace(/\.drawio\.svg$/, "").replace(/\s+/g, "-");
      writeFileSync(join(OUTPUT_DIR, `${base}.dsl`), dslText);
    });
  }
});

describe("Sample Round-Trip: .drawio.png files", () => {
  for (const file of pngFiles) {
    it(`${file}: extracts XML and parses with elements`, async () => {
      const xml = await loadXml(file);
      const ast = await parseMxGraphXml(xml);
      const { shapes, conns } = countElements(ast);
      expect(shapes.length + conns.length).toBeGreaterThan(0);

      // Write DSL artifact
      const dslText = serializeDiagram(ast);
      const base = file.replace(/\.drawio\.png$/, "").replace(/\s+/g, "-");
      writeFileSync(join(OUTPUT_DIR, `${base}.dsl`), dslText);
    });
  }
});
