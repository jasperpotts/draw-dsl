/**
 * Handles .drawio.svg files — SVG files that embed drawio XML in a <mxfile> element.
 *
 * Format: the drawio XML is stored inside the SVG as:
 *   <svg ...>
 *     <!-- DrawIO XML encoded as URI-component in the content attribute -->
 *   </svg>
 *
 * draw.io embeds the raw mxfile XML in the SVG's `content` attribute on the root <svg> tag,
 * or inline as a base64/URI-encoded block. This module handles extraction and embedding.
 */

import { parseStringPromise, Builder } from "xml2js";

export interface DrawioSvgFile {
  /** The raw SVG markup (used for display/rendering) */
  svg: string;
  /** The embedded drawio XML (mxfile) */
  drawioXml: string;
}

/**
 * Extract the drawio XML embedded in a .drawio.svg file.
 */
export async function extractFromSvg(svgContent: string): Promise<string> {
  // draw.io embeds the mxfile XML as a URI-encoded string in the SVG content attribute
  const contentMatch = svgContent.match(/content="([^"]+)"/);
  if (contentMatch) {
    const raw = contentMatch[1];
    // Some draw.io exports use HTML entities instead of URI encoding
    if (raw.includes("&lt;") || raw.includes("&amp;")) {
      // Single-pass decode to avoid double-decoding (e.g. &amp;quot; → &quot; not ")
      return raw.replace(/&(lt|gt|amp|quot|#10);/g, (_, entity) => {
        switch (entity) {
          case "lt": return "<";
          case "gt": return ">";
          case "amp": return "&";
          case "quot": return '"';
          case "#10": return "\n";
          default: return `&${entity};`;
        }
      });
    }
    return decodeURIComponent(raw);
  }

  // Some versions embed it differently — look for an mxfile element directly
  const mxfileMatch = svgContent.match(/<mxfile[\s\S]*?<\/mxfile>/);
  if (mxfileMatch) {
    return mxfileMatch[0];
  }

  throw new Error(
    "No drawio XML found in SVG file. Ensure this is a .drawio.svg file exported from draw.io."
  );
}

/**
 * Embed drawio XML into an SVG string (updating the content attribute).
 */
export function embedIntoSvg(svgContent: string, drawioXml: string): string {
  const encoded = encodeURIComponent(drawioXml);

  if (svgContent.includes('content="')) {
    // Replace existing content attribute
    return svgContent.replace(/content="[^"]*"/, `content="${encoded}"`);
  }

  // Insert content attribute into the root <svg> tag
  return svgContent.replace(/^(<svg\s)/, `$1content="${encoded}" `);
}
