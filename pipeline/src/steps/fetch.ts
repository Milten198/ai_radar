import type { SupabaseClient } from "@supabase/supabase-js";
import { adapters } from "../adapters/index.js";
import type { RawArticle } from "../adapters/types.js";
import { normalizeUrl } from "../lib/url.js";

interface SourceRow {
  id: number;
  name: string;
  adapter: string;
  config: Record<string, unknown>;
}

export interface SourceFetchStats {
  found: number;
  inserted: number;
  error?: string;
}

export interface FetchResult {
  sources: Record<string, SourceFetchStats>;
  totalInserted: number;
  failedSources: number;
}

export interface FetchOptions {
  since: Date;
  dryRun: boolean;
  fetch?: typeof globalThis.fetch;
  log?: (msg: string) => void;
}

/** Dedupe within one batch by normalized URL; drop items without title or text. */
export function prepareRows(sourceId: number, lang: string | null, articles: RawArticle[]) {
  const seen = new Set<string>();
  const rows = [];
  for (const a of articles) {
    const url = normalizeUrl(a.url);
    if (seen.has(url) || !a.title.trim() || !a.contentText.trim()) continue;
    seen.add(url);
    rows.push({
      source_id: sourceId,
      url,
      title: a.title.trim(),
      author: a.author,
      published_at: a.publishedAt?.toISOString() ?? null,
      content_text: a.contentText,
      lang,
    });
  }
  return rows;
}

async function loadKnownUrls(db: SupabaseClient, sourceId: number): Promise<Set<string>> {
  const { data, error } = await db
    .from("articles")
    .select("url")
    .eq("source_id", sourceId)
    .order("fetched_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`load known urls: ${error.message}`);
  return new Set(data.map((r) => r.url as string));
}

export async function runFetch(db: SupabaseClient, opts: FetchOptions): Promise<FetchResult> {
  const log = opts.log ?? console.log;
  const fetchFn = opts.fetch ?? globalThis.fetch;

  const { data: sources, error } = await db
    .from("sources")
    .select("id, name, adapter, config")
    .eq("enabled", true)
    .order("id");
  if (error) throw new Error(`load sources: ${error.message}`);

  const result: FetchResult = { sources: {}, totalInserted: 0, failedSources: 0 };

  // One failing source must not stop the others.
  for (const source of sources as SourceRow[]) {
    const stats: SourceFetchStats = { found: 0, inserted: 0 };
    result.sources[source.name] = stats;
    try {
      const adapter = adapters[source.adapter];
      if (!adapter) throw new Error(`no adapter "${source.adapter}"`);
      const config = adapter.configSchema.parse(source.config);
      const known = await loadKnownUrls(db, source.id);

      const articles = await adapter.fetchArticles(config, {
        since: opts.since,
        isKnownUrl: (url) => known.has(normalizeUrl(url)),
        fetch: fetchFn,
        log,
      });
      const lang = typeof source.config.lang === "string" ? source.config.lang : null;
      const rows = prepareRows(source.id, lang, articles).filter((r) => !known.has(r.url));
      stats.found = articles.length;

      if (opts.dryRun) {
        stats.inserted = rows.length;
        for (const r of rows) log(`  [dry-run] ${r.published_at?.slice(0, 10) ?? "no date"}  ${r.title}`);
      } else if (rows.length) {
        const { data: inserted, error: insErr } = await db
          .from("articles")
          .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
          .select("id");
        if (insErr) throw new Error(`insert: ${insErr.message}`);
        stats.inserted = inserted.length;
      }
      log(`${source.name}: found ${stats.found}, new ${stats.inserted}`);
    } catch (err) {
      stats.error = err instanceof Error ? err.message : String(err);
      result.failedSources++;
      log(`${source.name}: FAILED: ${stats.error}`);
    }
    result.totalInserted += stats.inserted;
  }
  return result;
}
