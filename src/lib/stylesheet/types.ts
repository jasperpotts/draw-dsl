/**
 * Types for the CSS-subset stylesheet system.
 */

/** A custom property definition (e.g. `--font-default: "Arial", sans-serif;`). */
export interface CustomProperty {
  name: string;
  value: string;
}

/** A class definition (e.g. `.h1 { font-size: 24px; font-weight: bold; }`). */
export interface ClassDefinition {
  name: string;
  properties: Record<string, string>;
}

/** A `@theme light { ... }` or `@theme dark { ... }` block. */
export interface ThemeBlock {
  theme: "light" | "dark";
  properties: Record<string, string>;
}

/** Parsed stylesheet. */
export interface Stylesheet {
  /** Properties from `:root { ... }`. */
  rootProperties: Record<string, string>;
  /** Class definitions (`.h1`, `.b3`, etc.). */
  classes: Record<string, Record<string, string>>;
  /** Theme blocks. */
  themes: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
}

/** Flat resolved property map after merging :root + theme. */
export type ResolvedProperties = Record<string, string>;
