import type { z } from "zod";

/** An article as returned by an adapter, before it is stored. */
export interface RawArticle {
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  contentText: string;
}

export interface FetchContext {
  /** Only return articles published at or after this moment. */
  since: Date;
  /** True if the URL (normalized) is already stored; lets adapters skip page fetches. */
  isKnownUrl: (url: string) => boolean;
  /** Injected so tests can run without the network. */
  fetch: typeof globalThis.fetch;
  log: (msg: string) => void;
}

export interface SourceAdapter<C = unknown> {
  configSchema: z.ZodType<C>;
  fetchArticles(config: C, ctx: FetchContext): Promise<RawArticle[]>;
}
