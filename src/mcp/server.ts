/**
 * draw-dsl MCP Server
 *
 * Exposes draw.io DSL operations as MCP tools for use with Claude Code.
 *
 * Tools:
 *   decode_diagram    Read a .drawio / .drawio.svg / .drawio.png → DSL text
 *   encode_diagram    Write DSL text → .drawio XML file
 *   render_diagram    Render a .drawio file to SVG or PNG
 *   edit_diagram      Apply DSL edits and re-render in one step
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { extname, basename, dirname, join } from "path";
import { extractFromSvg } from "../lib/formats/drawio-svg.js";
import { extractFromPng } from "../lib/formats/drawio-png.js";
import { generateDsl, serializeDsl } from "../lib/dsl/generator.js";
import { parseDsl, buildDrawioXml } from "../lib/dsl/parser.js";
import { DesktopCliRenderer } from "../lib/renderer/desktop-cli.js";
import type { RenderFormat } from "../lib/renderer/index.js";

const server = new Server(
  { name: "draw-dsl", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const renderer = new DesktopCliRenderer();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "decode_diagram",
    description:
      "Read a draw.io diagram file (.drawio, .drawio.svg, or .drawio.png) and return its content as a concise DSL string that is easy for AI to understand and edit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the diagram file.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "encode_diagram",
    description:
      "Write a DSL string to a .drawio XML file. Creates the file if it does not exist.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dsl: {
          type: "string",
          description: "The DSL text representing the diagram.",
        },
        output_path: {
          type: "string",
          description: "Path to write the .drawio XML file.",
        },
      },
      required: ["dsl", "output_path"],
    },
  },
  {
    name: "render_diagram",
    description:
      "Render a .drawio file to SVG or PNG using the draw.io Desktop application.",
    inputSchema: {
      type: "object" as const,
      properties: {
        input_path: {
          type: "string",
          description: "Path to the .drawio file to render.",
        },
        output_path: {
          type: "string",
          description: "Path for the output SVG or PNG file.",
        },
        format: {
          type: "string",
          enum: ["svg", "png"],
          description: "Output format. Defaults to 'svg'.",
        },
        page_index: {
          type: "number",
          description: "Page/tab index to render (0-based). Defaults to 0.",
        },
        scale: {
          type: "number",
          description: "Scale factor for PNG output. Defaults to 1.",
        },
        transparent: {
          type: "boolean",
          description: "Use transparent background. Defaults to false.",
        },
      },
      required: ["input_path", "output_path"],
    },
  },
  {
    name: "edit_diagram",
    description:
      "Decode a diagram to DSL, apply edits, re-encode to .drawio, and optionally render. " +
      "Use this as the primary way to create or modify draw.io diagrams.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dsl: {
          type: "string",
          description: "The updated DSL string for the diagram.",
        },
        drawio_path: {
          type: "string",
          description: "Path to write (or overwrite) the .drawio file.",
        },
        render: {
          type: "boolean",
          description: "If true, also render to SVG after writing. Defaults to false.",
        },
        render_format: {
          type: "string",
          enum: ["svg", "png"],
          description: "Render format if render=true. Defaults to 'svg'.",
        },
      },
      required: ["dsl", "drawio_path"],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "decode_diagram": {
        const { path } = args as { path: string };
        const ext = extname(path).toLowerCase();

        let drawioXml: string;
        if (ext === ".svg") {
          const content = await readFile(path, "utf-8");
          drawioXml = await extractFromSvg(content);
        } else if (ext === ".png") {
          drawioXml = await extractFromPng(path);
        } else {
          drawioXml = await readFile(path, "utf-8");
        }

        const diagram = await generateDsl(drawioXml);
        const dsl = serializeDsl(diagram);

        return {
          content: [{ type: "text", text: dsl }],
        };
      }

      case "encode_diagram": {
        const { dsl, output_path } = args as { dsl: string; output_path: string };
        const diagram = parseDsl(dsl);
        const xml = buildDrawioXml(diagram);
        await writeFile(output_path, xml, "utf-8");

        return {
          content: [{ type: "text", text: `Wrote .drawio XML to ${output_path}` }],
        };
      }

      case "render_diagram": {
        const {
          input_path,
          output_path,
          format = "svg",
          page_index = 0,
          scale = 1,
          transparent = false,
        } = args as {
          input_path: string;
          output_path: string;
          format?: string;
          page_index?: number;
          scale?: number;
          transparent?: boolean;
        };

        await renderer.render(input_path, output_path, {
          format: format as RenderFormat,
          pageIndex: page_index,
          scale,
          transparent,
        });

        return {
          content: [{ type: "text", text: `Rendered ${input_path} → ${output_path}` }],
        };
      }

      case "edit_diagram": {
        const {
          dsl,
          drawio_path,
          render = false,
          render_format = "svg",
        } = args as {
          dsl: string;
          drawio_path: string;
          render?: boolean;
          render_format?: string;
        };

        const diagram = parseDsl(dsl);
        const xml = buildDrawioXml(diagram);
        await writeFile(drawio_path, xml, "utf-8");

        let result = `Wrote .drawio XML to ${drawio_path}`;

        if (render) {
          const fmt = render_format as RenderFormat;
          const renderOutput = join(
            dirname(drawio_path),
            basename(drawio_path, extname(drawio_path)) + "." + fmt
          );
          await renderer.render(drawio_path, renderOutput, { format: fmt });
          result += `\nRendered → ${renderOutput}`;
        }

        return {
          content: [{ type: "text", text: result }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("draw-dsl MCP server running on stdio");
