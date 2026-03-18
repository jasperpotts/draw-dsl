#!/usr/bin/env node
/**
 * draw-dsl CLI
 *
 * Commands:
 *   decode <input>    Convert a .drawio.svg or .drawio.png to DSL text
 *   encode <input>    Convert DSL text back to a .drawio file
 *   render <input>    Render a .drawio file to SVG or PNG
 */

import { Command } from "commander";
import { readFile, writeFile } from "fs/promises";
import { extname, basename, dirname, join } from "path";
import { extractFromSvg } from "../lib/formats/drawio-svg.js";
import { extractFromPng } from "../lib/formats/drawio-png.js";
import { generateDsl, serializeDsl } from "../lib/dsl/generator.js";
import { parseDsl, buildDrawioXml } from "../lib/dsl/parser.js";
import { DesktopCliRenderer } from "../lib/renderer/desktop-cli.js";
import type { RenderFormat } from "../lib/renderer/index.js";

const program = new Command();

program
  .name("draw-dsl")
  .description("Convert draw.io diagrams to/from a concise AI-friendly DSL")
  .version("0.1.0");

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------
program
  .command("decode <input>")
  .description("Extract drawio XML from a .drawio.svg or .drawio.png and output DSL text")
  .option("-o, --output <file>", "Output file (defaults to stdout)")
  .action(async (input: string, opts: { output?: string }) => {
    const ext = extname(input).toLowerCase();

    let drawioXml: string;
    if (ext === ".svg") {
      const content = await readFile(input, "utf-8");
      drawioXml = await extractFromSvg(content);
    } else if (ext === ".png") {
      drawioXml = await extractFromPng(input);
    } else {
      // Treat as raw drawio XML
      drawioXml = await readFile(input, "utf-8");
    }

    const diagram = await generateDsl(drawioXml);
    const dsl = serializeDsl(diagram);

    if (opts.output) {
      await writeFile(opts.output, dsl, "utf-8");
      console.error(`Wrote DSL to ${opts.output}`);
    } else {
      process.stdout.write(dsl + "\n");
    }
  });

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------
program
  .command("encode <input>")
  .description("Convert a DSL text file to a .drawio XML file")
  .option("-o, --output <file>", "Output .drawio file (default: <input>.drawio)")
  .action(async (input: string, opts: { output?: string }) => {
    const dsl = await readFile(input, "utf-8");
    const diagram = parseDsl(dsl);
    const xml = buildDrawioXml(diagram);

    const outputPath =
      opts.output ?? join(dirname(input), basename(input, extname(input)) + ".drawio");

    await writeFile(outputPath, xml, "utf-8");
    console.error(`Wrote drawio XML to ${outputPath}`);
  });

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
program
  .command("render <input>")
  .description("Render a .drawio file to SVG or PNG using draw.io Desktop")
  .option("-f, --format <format>", "Output format: svg or png", "svg")
  .option("-o, --output <file>", "Output file (default: <input>.<format>)")
  .option("-p, --page <index>", "Page index (0-based)", "0")
  .option("-s, --scale <scale>", "Scale factor for PNG", "1")
  .option("--transparent", "Transparent background")
  .action(
    async (
      input: string,
      opts: {
        format: string;
        output?: string;
        page: string;
        scale: string;
        transparent?: boolean;
      }
    ) => {
      const format = opts.format as RenderFormat;
      const outputPath =
        opts.output ??
        join(dirname(input), basename(input, extname(input)) + "." + format);

      const renderer = new DesktopCliRenderer();
      await renderer.render(input, outputPath, {
        format,
        pageIndex: parseInt(opts.page, 10),
        scale: parseFloat(opts.scale),
        transparent: opts.transparent,
      });

      console.error(`Rendered ${input} → ${outputPath}`);
    }
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
