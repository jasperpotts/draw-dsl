/**
 * Shared stylesheet loader for tests.
 * Uses the built-in DEFAULT_STYLESHEET constant so tests don't depend on filesystem resolution.
 */

import { DEFAULT_STYLESHEET } from "../../src/lib/stylesheet/defaults.js";
import { parseStylesheet } from "../../src/lib/stylesheet/parser.js";
import type { Stylesheet } from "../../src/lib/stylesheet/types.js";

export const testStylesheet: Stylesheet = parseStylesheet(DEFAULT_STYLESHEET);
