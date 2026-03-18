/**
 * CSS-subset parser for diagram stylesheets.
 *
 * Hand-written tokenizer + recursive descent parser.
 * Supports: :root {}, @theme light/dark {}, .className {}, var(), comments.
 */

import type { Stylesheet } from "./types.js";

export class StylesheetParseError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = "StylesheetParseError";
  }
}

export function parseStylesheet(css: string): Stylesheet {
  const stylesheet: Stylesheet = {
    rootProperties: {},
    classes: {},
    themes: {},
  };

  // Strip block comments
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  let pos = 0;
  const len = stripped.length;

  function skipWhitespace(): void {
    while (pos < len && /\s/.test(stripped[pos])) pos++;
  }

  function expect(ch: string): void {
    skipWhitespace();
    if (stripped[pos] !== ch) {
      throw new StylesheetParseError(`Expected '${ch}', found '${stripped[pos] ?? "EOF"}'`, pos);
    }
    pos++;
  }

  function parsePropertyValue(): string {
    skipWhitespace();
    let value = "";
    // Read until semicolon or closing brace
    while (pos < len && stripped[pos] !== ";" && stripped[pos] !== "}") {
      value += stripped[pos];
      pos++;
    }
    if (stripped[pos] === ";") pos++; // consume semicolon
    return value.trim();
  }

  function parseBlock(): Record<string, string> {
    const props: Record<string, string> = {};
    expect("{");
    skipWhitespace();
    while (pos < len && stripped[pos] !== "}") {
      // Read property name
      let name = "";
      while (pos < len && stripped[pos] !== ":" && stripped[pos] !== "}") {
        name += stripped[pos];
        pos++;
      }
      name = name.trim();
      if (!name || stripped[pos] === "}") break;
      expect(":");
      const value = parsePropertyValue();
      if (name && value) {
        props[name] = value;
      }
      skipWhitespace();
    }
    expect("}");
    return props;
  }

  skipWhitespace();
  while (pos < len) {
    skipWhitespace();
    if (pos >= len) break;

    // :root { ... }
    if (stripped.startsWith(":root", pos)) {
      pos += 5;
      skipWhitespace();
      const props = parseBlock();
      Object.assign(stylesheet.rootProperties, props);
      continue;
    }

    // @theme light { ... } or @theme dark { ... }
    if (stripped.startsWith("@theme", pos)) {
      pos += 6;
      skipWhitespace();
      let themeName = "";
      while (pos < len && /\S/.test(stripped[pos]) && stripped[pos] !== "{") {
        themeName += stripped[pos];
        pos++;
      }
      themeName = themeName.trim();
      if (themeName !== "light" && themeName !== "dark") {
        throw new StylesheetParseError(`Unknown theme '${themeName}', expected 'light' or 'dark'`, pos);
      }
      skipWhitespace();
      const props = parseBlock();
      stylesheet.themes[themeName] = props;
      continue;
    }

    // .className { ... }
    if (stripped[pos] === ".") {
      pos++; // skip dot
      let className = "";
      while (pos < len && /[a-zA-Z0-9_-]/.test(stripped[pos])) {
        className += stripped[pos];
        pos++;
      }
      skipWhitespace();
      const props = parseBlock();
      stylesheet.classes[className] = props;
      continue;
    }

    // Skip any other character (shouldn't happen in valid input)
    pos++;
  }

  return stylesheet;
}
