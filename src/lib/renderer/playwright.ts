/**
 * Playwright-based headless renderer for mxGraph XML → SVG/PNG.
 *
 * Uses Chromium to load a minimal page with the mxGraph JS library,
 * injects the XML, and extracts the rendered SVG from the DOM.
 */

import type { Renderer, RenderOptions } from "./index.js";
import type { Stylesheet, ResolvedProperties } from "../stylesheet/types.js";
import { mergeTheme, resolveVars } from "../stylesheet/resolver.js";
import { embedIntoSvg } from "../formats/drawio-svg.js";

// Lazy-load playwright to avoid import errors when not installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPlaywright(): Promise<any> {
  try {
    // Dynamic import to avoid compile-time dependency
    const moduleName = "playwright";
    return await import(moduleName);
  } catch {
    throw new Error(
      "Playwright is required for rendering. Install it with: npm install playwright && npx playwright install chromium"
    );
  }
}

/**
 * Minimal HTML template that loads mxGraph and renders XML to SVG.
 */
function renderPageHtml(mxGraphXml: string): string {
  const escapedXml = mxGraphXml
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/mxgraph@4.2.2/javascript/mxClient.min.js"></script>
  <style>body { margin: 0; overflow: hidden; }</style>
</head>
<body>
  <div id="graph" style="position:absolute;"></div>
  <script>
    (function() {
      const container = document.getElementById('graph');
      const graph = new mxGraph(container);
      graph.setEnabled(false);

      const xml = \`${escapedXml}\`;

      // Parse the XML — handle mxfile wrapper
      const parser = new DOMParser();
      let xmlDoc = parser.parseFromString(xml, 'text/xml');

      let graphModelXml;
      const mxfile = xmlDoc.querySelector('mxfile');
      if (mxfile) {
        const diagram = mxfile.querySelector('diagram');
        if (diagram) {
          const graphModel = diagram.querySelector('mxGraphModel');
          if (graphModel) {
            graphModelXml = new XMLSerializer().serializeToString(graphModel);
          }
        }
      } else {
        graphModelXml = xml;
      }

      if (graphModelXml) {
        const doc = mxUtils.parseXml(graphModelXml);
        const codec = new mxCodec(doc);
        codec.decode(doc.documentElement, graph.getModel());
      }

      // Fit the graph
      graph.fit();
      graph.center();

      // Store SVG for extraction
      window.__renderedSvg = mxUtils.getXml(
        graph.getSvg(null, 1, 0, false, null, true, true, null, null, false)
      );
      window.__renderDone = true;
    })();
  </script>
</body>
</html>`;
}

/**
 * Post-process SVG: replace known palette hex values with CSS custom properties,
 * inject theme-switching <style> block.
 */
function postProcessSvg(
  svgContent: string,
  mxGraphXml: string,
  stylesheet: Stylesheet,
): string {
  const lightProps = resolveVars(mergeTheme(stylesheet, "light"));
  const darkProps = resolveVars(mergeTheme(stylesheet, "dark"));

  // Build hex → CSS var mapping from light theme
  const hexToVar = new Map<string, string>();
  for (const [key, value] of Object.entries(lightProps)) {
    if (key.startsWith("--c") || key.startsWith("--default-")) {
      const hex = value.toLowerCase();
      if (hex.startsWith("#")) {
        hexToVar.set(hex, `var(${key})`);
      }
    }
  }

  // Replace hex colors in SVG attributes
  let svg = svgContent;
  for (const [hex, cssVar] of hexToVar) {
    // Replace in fill, stroke, color attributes (case-insensitive hex)
    const hexRegex = new RegExp(hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    svg = svg.replace(hexRegex, cssVar);
  }

  // Build CSS custom property blocks
  const lightCss = Object.entries(lightProps)
    .filter(([k]) => k.startsWith("--"))
    .map(([k, v]) => `    ${k}: ${v};`)
    .join("\n");

  const darkCss = Object.entries(darkProps)
    .filter(([k]) => k.startsWith("--"))
    .map(([k, v]) => `    ${k}: ${v};`)
    .join("\n");

  const styleBlock = `<style>
  :root {
${lightCss}
  }
  @media (prefers-color-scheme: dark) {
    :root {
${darkCss}
    }
  }
</style>`;

  // Inject style block after opening <svg> tag
  svg = svg.replace(/(<svg[^>]*>)/, `$1\n${styleBlock}`);

  // Embed mxGraph XML for round-tripping
  svg = embedIntoSvg(svg, mxGraphXml);

  return svg;
}

export class PlaywrightRenderer implements Renderer {
  async render(
    mxGraphXml: string,
    outputPath: string,
    options: RenderOptions,
    stylesheet?: Stylesheet,
  ): Promise<string> {
    const pw = await getPlaywright();
    const browser = await pw.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const html = renderPageHtml(mxGraphXml);

      await page.setContent(html, { waitUntil: "networkidle" });

      // Wait for rendering to complete
      await page.waitForFunction("window.__renderDone === true", {}, { timeout: 30000 });

      if (options.format === "png") {
        // Screenshot for PNG
        await page.screenshot({ path: outputPath, fullPage: true });
        return outputPath;
      }

      // Extract SVG
      let svg = await page.evaluate("window.__renderedSvg") as string;

      if (stylesheet) {
        svg = postProcessSvg(svg, mxGraphXml, stylesheet);
      }

      return svg;
    } finally {
      await browser.close();
    }
  }
}
