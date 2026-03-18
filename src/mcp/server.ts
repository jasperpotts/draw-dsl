/**
 * draw-dsl MCP Server
 *
 * Exposes draw.io DSL operations as MCP tools for use with Claude Code.
 *
 * Tools:
 *   diagram_parse      Read a .drawio / .drawio.svg / .drawio.png → DSL text
 *   diagram_render     Write DSL text → .drawio.svg / .drawio / .drawio.png
 *   diagram_validate   Check DSL text against validation rules
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { extractFromSvg, embedIntoSvg } from "../lib/formats/drawio-svg.js";
import { extractFromPng } from "../lib/formats/drawio-png.js";
import { parseMxGraphXml } from "../lib/drawio/xml-parser.js";
import { buildMxGraphXml } from "../lib/drawio/xml-builder.js";
import { parseDsl } from "../lib/dsl/parser.js";
import { serializeDiagram } from "../lib/dsl/serializer.js";
import { validate } from "../lib/validator/index.js";
import { resolveStylesheet } from "../lib/stylesheet/resolver.js";

const server = new Server(
  { name: "draw-dsl", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "diagram_parse",
    description:
      "Read a draw.io diagram file (.drawio, .drawio.svg, or .drawio.png) and return its content as DSL text. Best-effort reverse mapping — some precision loss when round-tripping.",
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
    name: "diagram_render",
    description:
      "Render DSL text to a .drawio.svg, .drawio.png, or raw .drawio XML file. Validates the DSL before rendering.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dsl: {
          type: "string",
          description: "The DSL text representing the diagram.",
        },
        output_path: {
          type: "string",
          description: "Path to write the output file (.drawio.svg, .drawio.png, or .drawio).",
        },
        dark: {
          type: "boolean",
          description: "Use dark theme (for PNG/drawio output). Default: false.",
        },
        stylesheet_path: {
          type: "string",
          description: "Optional path to a custom stylesheet file.",
        },
      },
      required: ["dsl", "output_path"],
    },
  },
  {
    name: "diagram_validate",
    description:
      "Validate DSL text against all rules. Returns errors with line numbers, or OK if clean.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dsl: {
          type: "string",
          description: "The DSL text to validate.",
        },
      },
      required: ["dsl"],
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
      case "diagram_parse": {
        const { path } = args as { path: string };
        const ext = path.toLowerCase();

        let drawioXml: string;
        if (ext.endsWith(".svg")) {
          const content = await readFile(path, "utf-8");
          drawioXml = await extractFromSvg(content);
        } else if (ext.endsWith(".png")) {
          drawioXml = await extractFromPng(path);
        } else {
          drawioXml = await readFile(path, "utf-8");
        }

        const diagram = await parseMxGraphXml(drawioXml);
        const dsl = serializeDiagram(diagram);

        return {
          content: [{ type: "text", text: dsl }],
        };
      }

      case "diagram_render": {
        const {
          dsl,
          output_path,
          dark = false,
          stylesheet_path,
        } = args as {
          dsl: string;
          output_path: string;
          dark?: boolean;
          stylesheet_path?: string;
        };

        // Parse
        const { diagram, errors: parseErrors } = parseDsl(dsl);
        if (parseErrors.length > 0) {
          const errMsg = parseErrors.map((e) => `line ${e.line}: ${e.message}`).join("\n");
          return {
            content: [{ type: "text", text: `Parse errors:\n${errMsg}` }],
            isError: true,
          };
        }

        // Validate
        const validationErrors = validate(diagram);
        if (validationErrors.length > 0) {
          const errMsg = validationErrors.map((e) => {
            const prefix = e.line ? `line ${e.line}: ` : "";
            return `${prefix}${e.message}`;
          }).join("\n");
          return {
            content: [{ type: "text", text: `Validation errors:\n${errMsg}` }],
            isError: true,
          };
        }

        // Resolve stylesheet
        const startDir = dirname(output_path);
        const stylesheet = await resolveStylesheet(stylesheet_path, startDir);

        const theme = dark ? "dark" : "light";
        const mxGraphXml = buildMxGraphXml(diagram, stylesheet, theme);

        // Determine output format and write
        if (output_path.endsWith(".drawio.svg") || output_path.endsWith(".svg")) {
          // Create SVG with embedded XML
          const encoded = encodeURIComponent(mxGraphXml);
          const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg1.1.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" content="${encoded}" version="1.1" width="800" height="600">
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
    Open in draw.io to view this diagram
  </text>
</svg>`;
          await writeFile(output_path, svg, "utf-8");
          return {
            content: [{ type: "text", text: `Wrote .drawio.svg to ${output_path}` }],
          };
        }

        // Raw drawio XML
        await writeFile(output_path, mxGraphXml, "utf-8");
        return {
          content: [{ type: "text", text: `Wrote .drawio XML to ${output_path}` }],
        };
      }

      case "diagram_validate": {
        const { dsl } = args as { dsl: string };

        const { diagram, errors: parseErrors } = parseDsl(dsl);
        const validationErrors = validate(diagram);

        const allErrors = [
          ...parseErrors.map((e) => `Parse error (line ${e.line}): ${e.message}`),
          ...validationErrors.map((e) => {
            const prefix = e.line ? `line ${e.line}: ` : "";
            return `Validation error: ${prefix}${e.message}`;
          }),
        ];

        if (allErrors.length === 0) {
          return { content: [{ type: "text", text: "OK — no errors found" }] };
        }

        return {
          content: [{ type: "text", text: allErrors.join("\n") }],
          isError: true,
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
