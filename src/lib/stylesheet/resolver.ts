/**
 * Stylesheet resolution: find, parse, merge, and resolve variables.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import type { Stylesheet, ResolvedProperties } from "./types.js";
import { parseStylesheet } from "./parser.js";
import { DEFAULT_STYLESHEET } from "./defaults.js";

const STYLESHEET_FILENAME = "diagram-styles.css";

/**
 * Search upward from `startDir` for a `diagram-styles.css` file.
 * Returns the absolute path if found, or undefined.
 */
export function findStylesheet(startDir: string): string | undefined {
  let dir = resolve(startDir);
  const root = dirname(dir);

  // Walk up until we hit the filesystem root
  while (true) {
    const candidate = join(dir, STYLESHEET_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // reached root
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve a stylesheet: load from explicit path, search upward, or use defaults.
 * Returns the parsed Stylesheet.
 */
export async function resolveStylesheet(
  filePath?: string,
  startDir?: string,
): Promise<Stylesheet> {
  let css: string;

  if (filePath) {
    css = await readFile(filePath, "utf-8");
  } else if (startDir) {
    const found = findStylesheet(startDir);
    if (found) {
      css = await readFile(found, "utf-8");
    } else {
      css = DEFAULT_STYLESHEET;
    }
  } else {
    css = DEFAULT_STYLESHEET;
  }

  return parseStylesheet(css);
}

/**
 * Merge :root + the selected @theme block into a flat property map.
 */
export function mergeTheme(
  stylesheet: Stylesheet,
  theme: "light" | "dark",
): ResolvedProperties {
  const merged: ResolvedProperties = { ...stylesheet.rootProperties };
  const themeProps = stylesheet.themes[theme];
  if (themeProps) {
    Object.assign(merged, themeProps);
  }
  return merged;
}

/**
 * Resolve `var(--name)` references in a property map (single-level only).
 */
export function resolveVars(
  properties: ResolvedProperties,
): ResolvedProperties {
  const resolved: ResolvedProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    resolved[key] = substituteVars(value, properties);
  }
  return resolved;
}

/**
 * Substitute `var(--name)` in a single value string.
 */
function substituteVars(value: string, properties: ResolvedProperties): string {
  return value.replace(/var\(([^)]+)\)/g, (_match, varName: string) => {
    const trimmed = varName.trim();
    return properties[trimmed] ?? `var(${trimmed})`;
  });
}

/**
 * Convenience: resolve a full stylesheet for a given theme.
 * Returns the flat resolved property map.
 */
export async function resolveThemeProperties(
  theme: "light" | "dark",
  stylesheetPath?: string,
  startDir?: string,
): Promise<ResolvedProperties> {
  const stylesheet = await resolveStylesheet(stylesheetPath, startDir);
  const merged = mergeTheme(stylesheet, theme);
  return resolveVars(merged);
}

/**
 * Get a class definition from the stylesheet, resolving var() references.
 */
export function resolveClass(
  stylesheet: Stylesheet,
  className: string,
  themeProps: ResolvedProperties,
): Record<string, string> {
  const classDef = stylesheet.classes[className];
  if (!classDef) return {};
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(classDef)) {
    resolved[key] = substituteVars(value, themeProps);
  }
  return resolved;
}
