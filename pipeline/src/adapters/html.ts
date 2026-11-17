import * as cheerio from "cheerio";
import { z } from "zod";
import { httpGet, sleep } from "../lib/http.js";
import { decodeEntities, htmlToText } from "../lib/text.js";
import { normalizeUrl } from "../lib/url.js";
import type { RawArticle, SourceAdapter } from "./types.js";

/**
 * Generic scraper for sites without an API:
 * list page → links matching `linkPattern` → each article page → JSON-LD metadata + <article> text.
 * Pages without an Article-type JSON-LD block (e.g. category pages) are skipped.
 */
const ConfigSchema = z.object({
  listUrl: z.string().url(),
  /** Regex tested against the link's pathname, e.g. "^/news/[a-z0-9-]+$". */
  linkPattern: z.string(),
  /** CSS selector for the article body; first match wins. */
  contentSelector: z.string().default("article, main"),
  maxArticles: z.number().int().positive().default(30),
  delayMs: z.number().int().nonnegative().default(500),
});
type HtmlConfig = z.infer<typeof ConfigSchema>;

const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle", "Report"]);

interface ArticleMeta {
  headline?: string;
  datePublished?: string;
  author?: string;
}

export function extractLinks(html: string, config: HtmlConfig): string[] {
  const $ = cheerio.load(html);
  const pattern = new RegExp(config.linkPattern);
  const listHost = new URL(config.listUrl).hostname;
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let url: URL;
    try {
      url = new URL(href, config.listUrl);
    } catch {
      return;
    }
    if (url.hostname === listHost && pattern.test(url.pathname)) links.add(normalizeUrl(url.toString()));
  });
  return [...links];
}

/** Find the first Article-like object in any JSON-LD block (handles arrays and @graph). */
export function extractArticleMeta(html: string): ArticleMeta | null {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) queue.push(...obj["@graph"]);
      const types = ([] as unknown[]).concat(obj["@type"] ?? []);
      if (types.some((t) => typeof t === "string" && ARTICLE_TYPES.has(t))) {
        const author = ([] as unknown[]).concat(obj.author ?? [])[0] as { name?: string } | string | undefined;
        return {
          headline: typeof obj.headline === "string" ? obj.headline : undefined,
          datePublished: typeof obj.datePublished === "string" ? obj.datePublished : undefined,
          author: typeof author === "string" ? author : author?.name,
        };
      }
    }
  }
  return null;
}

export function parseArticlePage(url: string, html: string, config: HtmlConfig): RawArticle | null {
  const meta = extractArticleMeta(html);
  if (!meta) return null;
  const $ = cheerio.load(html);
  const title = meta.headline ?? $('meta[property="og:title"]').attr("content") ?? $("title").text();
  const body = $(config.contentSelector).first();
  const published = meta.datePublished ? new Date(meta.datePublished) : null;
  return {
    url,
    title: decodeEntities(title),
    author: meta.author ?? null,
    publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
    contentText: htmlToText(body.length ? (body.html() ?? "") : ($("body").html() ?? "")),
  };
}

export const htmlAdapter: SourceAdapter<HtmlConfig> = {
  configSchema: ConfigSchema,

  async fetchArticles(config, ctx) {
    const listHtml = await (await httpGet(ctx.fetch, config.listUrl)).text();
    const links = extractLinks(listHtml, config)
      .filter((url) => !ctx.isKnownUrl(url))
      .slice(0, config.maxArticles);

    const articles: RawArticle[] = [];
    for (const [i, url] of links.entries()) {
      if (i > 0 && config.delayMs) await sleep(config.delayMs);
      try {
        const html = await (await httpGet(ctx.fetch, url)).text();
        const article = parseArticlePage(url, html, config);
        // Undated articles are kept (better a stale item than a missed one).
        if (article && (!article.publishedAt || article.publishedAt >= ctx.since)) articles.push(article);
      } catch (err) {
        ctx.log(`  skip ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
    return articles;
  },
};
