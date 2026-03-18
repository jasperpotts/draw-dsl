#!/usr/bin/env node
/**
 * draw-dsl CLI
 *
 * Commands:
 *   parse <file>       Convert a .drawio.svg / .drawio.png / .drawio to DSL text
 *   render <file.dsl>  Convert DSL text to .drawio.svg (or .png / .drawio)
 *   validate <file>    Check DSL against validation rules
 */

import { Command } from "commander";
import { readFile, writeFile } from "fs/promises";
import { extname, basename, dirname, join } from "path";
import { extractFromSvg, embedIntoSvg } from "../lib/formats/drawio-svg.js";
import { extractFromPng } from "../lib/formats/drawio-png.js";
import { parseMxGraphXml } from "../lib/drawio/xml-parser.js";
import { buildMxGraphXml } from "../lib/drawio/xml-builder.js";
import { parseDsl } from "../lib/dsl/parser.js";
import { serializeDiagram } from "../lib/dsl/serializer.js";
import { validate } from "../lib/validator/index.js";
import { resolveStylesheet } from "../lib/stylesheet/resolver.js";
import type { Stylesheet } from "../lib/stylesheet/types.js";

const program = new Command();

program
  .name("draw-dsl")
  .description("Coordinate-based DSL for draw.io diagrams — optimised for AI generation")
  .version("0.1.0");

// ---------------------------------------------------------------------------
// Helper: read from file or stdin
// ---------------------------------------------------------------------------

async function readInput(filePath: string | undefined): Promise<string> {
  if (filePath === "-" || filePath === undefined) {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  return readFile(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------
program
  .command("parse <input>")
  .description("Convert a .drawio.svg, .drawio.png, or .drawio file to DSL text")
  .option("-o, --output <file>", "Output file (defaults to stdout)")
  .action(async (input: string, opts: { output?: string }) => {
    const ext = input.toLowerCase();

    let drawioXml: string;
    if (ext.endsWith(".svg")) {
      const content = await readFile(input, "utf-8");
      drawioXml = await extractFromSvg(content);
    } else if (ext.endsWith(".png")) {
      drawioXml = await extractFromPng(input);
    } else {
      // Treat as raw drawio XML
      drawioXml = await readFile(input, "utf-8");
    }

    const diagram = await parseMxGraphXml(drawioXml);
    const dsl = serializeDiagram(diagram);

    if (opts.output) {
      await writeFile(opts.output, dsl, "utf-8");
      console.error(`Wrote DSL to ${opts.output}`);
    } else {
      process.stdout.write(dsl + "\n");
    }
  });

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
program
  .command("render [input]")
  .description("Convert DSL text to .drawio.svg (default), .drawio.png, or .drawio")
  .option("-o, --output <file>", "Output file (default: stdout for .drawio.svg)")
  .option("--dark", "Use dark theme (for PNG/drawio output)")
  .option("--stylesheet <path>", "Path to stylesheet file")
  .action(async (input: string | undefined, opts: { output?: string; dark?: boolean; stylesheet?: string }) => {
    const dslText = await readInput(input);

    const { diagram, errors } = parseDsl(dslText);
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(`Parse error (line ${err.line}): ${err.message}`);
      }
      process.exit(1);
    }

    // Validate
    const validationErrors = validate(diagram);
    if (validationErrors.length > 0) {
      for (const err of validationErrors) {
        const prefix = err.line ? `line ${err.line}: ` : "";
        console.error(`Validation error: ${prefix}${err.message}`);
      }
      process.exit(1);
    }

    // Resolve stylesheet
    const startDir = input ? dirname(input) : process.cwd();
    const stylesheet = await resolveStylesheet(opts.stylesheet, startDir);

    const theme = opts.dark ? "dark" : "light";
    const mxGraphXml = buildMxGraphXml(diagram, stylesheet, theme);

    // Determine output format
    const outputPath = opts.output;
    let outputFormat = "drawio.svg"; // default
    if (outputPath) {
      if (outputPath.endsWith(".drawio.svg")) outputFormat = "drawio.svg";
      else if (outputPath.endsWith(".drawio.png")) outputFormat = "drawio.png";
      else if (outputPath.endsWith(".drawio")) outputFormat = "drawio";
      else if (outputPath.endsWith(".svg")) outputFormat = "drawio.svg";
      else if (outputPath.endsWith(".png")) outputFormat = "drawio.png";
    }

    if (outputFormat === "drawio") {
      // Raw XML output
      if (outputPath) {
        await writeFile(outputPath, mxGraphXml, "utf-8");
        console.error(`Wrote drawio XML to ${outputPath}`);
      } else {
        process.stdout.write(mxGraphXml + "\n");
      }
      return;
    }

    if (outputFormat === "drawio.svg") {
      // For SVG, we need Playwright to render the mxGraph XML
      // For now, output the raw XML with a note that rendering requires Playwright
      // When Playwright is available, we'll render properly
      try {
        const { PlaywrightRenderer } = await import("../lib/renderer/playwright.js");
        const renderer = new PlaywrightRenderer();
        const svg = await renderer.render(mxGraphXml, outputPath ?? "", { format: "svg" }, stylesheet);
        if (outputPath) {
          await writeFile(outputPath, svg, "utf-8");
          console.error(`Wrote .drawio.svg to ${outputPath}`);
        } else {
          process.stdout.write(svg + "\n");
        }
      } catch {
        // Fallback: output raw mxGraph XML wrapped in a minimal SVG with embedded XML
        const fallbackSvg = buildFallbackSvg(mxGraphXml, stylesheet, theme);
        if (outputPath) {
          await writeFile(outputPath, fallbackSvg, "utf-8");
          console.error(`Wrote .drawio.svg to ${outputPath} (without visual rendering — install playwright for full rendering)`);
        } else {
          process.stdout.write(fallbackSvg + "\n");
        }
      }
      return;
    }

    if (outputFormat === "drawio.png") {
      try {
        const { PlaywrightRenderer } = await import("../lib/renderer/playwright.js");
        const renderer = new PlaywrightRenderer();
        await renderer.render(mxGraphXml, outputPath!, { format: "png" }, stylesheet);
        console.error(`Wrote .drawio.png to ${outputPath}`);
      } catch {
        console.error("PNG rendering requires Playwright. Install with: npm install playwright && npx playwright install chromium");
        console.error("Falling back to .drawio XML output.");
        const fallbackPath = outputPath!.replace(/\.png$/, ".drawio");
        await writeFile(fallbackPath, mxGraphXml, "utf-8");
        console.error(`Wrote drawio XML to ${fallbackPath}`);
      }
    }
  });

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------
program
  .command("validate [input]")
  .description("Check DSL text against validation rules")
  .action(async (input: string | undefined) => {
    const dslText = await readInput(input);

    const { diagram, errors: parseErrors } = parseDsl(dslText);

    if (parseErrors.length > 0) {
      for (const err of parseErrors) {
        console.error(`Parse error (line ${err.line}): ${err.message}`);
      }
    }

    const validationErrors = validate(diagram);

    if (validationErrors.length > 0) {
      for (const err of validationErrors) {
        const prefix = err.line ? `line ${err.line}: ` : "";
        console.error(`Validation error: ${prefix}${err.message}`);
      }
    }

    const totalErrors = parseErrors.length + validationErrors.length;
    if (totalErrors === 0) {
      console.log("OK — no errors found");
      process.exit(0);
    } else {
      console.error(`\n${totalErrors} error(s) found`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Fallback SVG builder (when Playwright is not available)
// ---------------------------------------------------------------------------

function buildFallbackSvg(
  mxGraphXml: string,
  stylesheet: Stylesheet,
  theme: "light" | "dark",
): string {
  // Create a minimal SVG that embeds the mxGraph XML
  // This won't have visual rendering but will be openable in draw.io
  const encoded = encodeURIComponent(mxGraphXml);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg1.1.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" content="${encoded}" version="1.1" width="800" height="600">
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
    Open in draw.io to view this diagram
  </text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
