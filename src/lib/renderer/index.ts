/**
 * Renderer abstraction — converts mxGraph XML to SVG or PNG.
 *
 * Implementations:
 *   - playwright: headless Chromium rendering via Playwright
 *   - desktop-cli: shells out to draw.io Desktop app (legacy)
 */

import type { Stylesheet } from "../stylesheet/types.js";

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
  render(
    mxGraphXml: string,
    outputPath: string,
    options: RenderOptions,
    stylesheet?: Stylesheet,
  ): Promise<string>;
}

export { PlaywrightRenderer } from "./playwright.js";
