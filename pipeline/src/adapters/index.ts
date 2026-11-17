import { htmlAdapter } from "./html.js";
import type { SourceAdapter } from "./types.js";
import { wordpressAdapter } from "./wordpress.js";

/** Adapter name (sources.adapter column) → implementation. */
export const adapters: Record<string, SourceAdapter<any>> = {
  wordpress: wordpressAdapter,
  html: htmlAdapter,
};
