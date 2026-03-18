/**
 * Renderer abstraction — converts drawio XML to SVG or PNG.
 *
 * Implementations:
 *   - desktop-cli: shells out to draw.io Desktop app (macOS/Windows/Linux with xvfb)
 *
 * Future: Playwright-based renderer for fully headless/CI environments.
 */

export type RenderFormat = "svg" | "png";

export interface RenderOptions {
  format: RenderFormat;
  /** draw.io page index (0-based). Defaults to 0. */
  pageIndex?: number;
  /** Scale factor for PNG export. Defaults to 1. */
  scale?: number;
  /** Use transparent background (PNG/SVG). Defaults to false. */
  transparent?: boolean;
}

export interface Renderer {
  render(drawioFilePath: string, outputPath: string, options: RenderOptions): Promise<void>;
}

export { DesktopCliRenderer } from "./desktop-cli.js";
