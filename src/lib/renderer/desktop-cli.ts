/**
 * Renderer that shells out to the draw.io Desktop application CLI.
 *
 * Requires draw.io Desktop to be installed:
 *   - macOS: /Applications/draw.io.app  (or custom path via DRAWIO_PATH env var)
 *   - Windows: C:\Program Files\draw.io\draw.io.exe
 *   - Linux: /usr/bin/drawio (with xvfb for headless)
 *
 * CLI usage: draw.io -x -f <format> -o <output> <input>
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import type { Renderer, RenderOptions } from "./index.js";

const execFileAsync = promisify(execFile);

const DEFAULT_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/draw.io.app/Contents/MacOS/draw.io",
    `${process.env.HOME}/Applications/draw.io.app/Contents/MacOS/draw.io`,
  ],
  win32: [
    "C:\\Program Files\\draw.io\\draw.io.exe",
    "C:\\Program Files (x86)\\draw.io\\draw.io.exe",
  ],
  linux: ["/usr/bin/drawio", "/usr/local/bin/drawio"],
};

function findDrawioBinary(): string {
  const envPath = process.env.DRAWIO_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`DRAWIO_PATH is set but does not exist: ${envPath}`);
    }
    return envPath;
  }

  const platform = process.platform;
  const candidates = DEFAULT_PATHS[platform] ?? [];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `draw.io Desktop not found. Install from https://github.com/jgraph/drawio-desktop/releases ` +
      `or set the DRAWIO_PATH environment variable to the draw.io binary.`
  );
}

export class DesktopCliRenderer implements Renderer {
  private readonly binaryPath: string;

  constructor(binaryPath?: string) {
    this.binaryPath = binaryPath ?? findDrawioBinary();
  }

  async render(drawioFilePath: string, outputPath: string, options: RenderOptions): Promise<void> {
    const args = [
      "--export",
      "--format", options.format,
      "--output", outputPath,
    ];

    if (options.pageIndex !== undefined) {
      args.push("--page-index", String(options.pageIndex));
    }

    if (options.scale !== undefined && options.scale !== 1) {
      args.push("--scale", String(options.scale));
    }

    if (options.transparent) {
      args.push("--transparent");
    }

    args.push(drawioFilePath);

    try {
      await execFileAsync(this.binaryPath, args);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`draw.io export failed: ${message}`);
    }
  }
}
