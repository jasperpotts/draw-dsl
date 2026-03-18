/**
 * Handles .drawio.png files — PNG files that embed drawio XML in a tEXt chunk.
 *
 * draw.io stores the diagram XML (compressed/encoded) in the PNG's `mxGraphModel` tEXt metadata chunk.
 * This module reads and writes that metadata without requiring any native image libraries.
 */

import { createReadStream } from "fs";
import { readFile, writeFile } from "fs/promises";

/** PNG signature bytes */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface PngChunk {
  type: string;
  data: Buffer;
  offset: number;
}

function readChunks(buffer: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8; // skip PNG signature

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data, offset });
    offset += 12 + length; // length(4) + type(4) + data(length) + crc(4)
  }

  return chunks;
}

/**
 * Extract the drawio XML embedded in a .drawio.png file.
 */
export async function extractFromPng(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);

  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG file.");
  }

  const chunks = readChunks(buffer);

  for (const chunk of chunks) {
    if (chunk.type === "tEXt") {
      const nullIdx = chunk.data.indexOf(0);
      if (nullIdx === -1) continue;

      const keyword = chunk.data.subarray(0, nullIdx).toString("ascii");
      const text = chunk.data.subarray(nullIdx + 1).toString("latin1");

      if (keyword === "mxGraphModel") {
        return decodeURIComponent(text);
      }
    }
  }

  throw new Error(
    "No drawio XML found in PNG file. Ensure this is a .drawio.png file exported from draw.io."
  );
}
