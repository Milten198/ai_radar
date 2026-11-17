import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { z } from "zod";
import { addUsage, type LlmClient, type Usage, ZERO_USAGE } from "../llm.js";

export const SummarySchema = z.object({
  summary: z.string().min(20),
  key_points: z.array(z.string().min(1)).min(1).max(8),
  topics: z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .transform((t) => [...new Set(t.map((s) => s.trim().toLowerCase()))]),
  relevance: z.coerce.number().int().min(1).max(5),
});
export type Summary = z.infer<typeof SummarySchema>;

const PROMPT_TEMPLATE = readFileSync(new URL("../prompts/summarize.md", import.meta.url), "utf8");

export interface ArticleForSummary {
  id: number;
  title: string;
  url: string;
  published_at: string | null;
  content_text: string | null;
  lang: string | null;
}

export function buildSystemPrompt(profile: string): string {
  return PROMPT_TEMPLATE.replace("{{PROFILE}}", profile.trim());
}

/** User message: metadata + article text, truncated, inside delimiters (the text is untrusted). */
export function buildUserMessage(a: ArticleForSummary, maxChars: number): string {
  let text = (a.content_text ?? "").trim();
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n[... truncated]`;
  // Stop the article from closing our delimiter early.
  text = text.replaceAll("</article>", "</ article>");
  return [
    `Title: ${a.title}`,
    `URL: ${a.url}`,
    `Published: ${a.published_at ?? "unknown"}`,
    `Language: ${a.lang ?? "unknown"}`,
    "",
    "<article>",
    text,
    "</article>",
  ].join("\n");
}

export interface SummarizeResult {
  pending: number;
  summarized: number;
  failed: number;
  usage: Usage;
}

export interface SummarizeOptions {
  llm: LlmClient;
  model: string;
  maxArticleChars: number;
  dryRun: boolean;
  /** Max articles per run (safety cap on cost). */
  limit: number;
  concurrency?: number;
  log?: (msg: string) => void;
}

async function loadProfile(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.from("profile").select("interests").eq("id", 1).single();
  if (error) throw new Error(`load profile: ${error.message}`);
  return data.interests as string;
}

async function loadPending(db: SupabaseClient, limit: number): Promise<ArticleForSummary[]> {
  // Anti-join: articles with no row in article_summaries.
  const { data, error } = await db
    .from("articles")
    .select("id, title, url, published_at, content_text, lang, article_summaries!left(article_id)")
    .is("article_summaries", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`load pending articles: ${error.message}`);
  return data as unknown as ArticleForSummary[];
}

export async function runSummarize(db: SupabaseClient, opts: SummarizeOptions): Promise<SummarizeResult> {
  const log = opts.log ?? console.log;
  const system = buildSystemPrompt(await loadProfile(db));
  const pending = await loadPending(db, opts.limit);
  const result: SummarizeResult = { pending: pending.length, summarized: 0, failed: 0, usage: ZERO_USAGE };
  log(`${pending.length} articles to summarize with ${opts.model}`);

  const limit = pLimit(opts.concurrency ?? 3);
  await Promise.all(
    pending.map((article) =>
      limit(async () => {
        try {
          const { data, usage, model } = await opts.llm.json({
            model: opts.model,
            system,
            user: buildUserMessage(article, opts.maxArticleChars),
            schema: SummarySchema,
            maxTokens: 1000,
          });
          result.usage = addUsage(result.usage, usage);

          if (opts.dryRun) {
            log(`\n[${data.relevance}] ${article.title}\n    topics: ${data.topics.join(", ")}\n    ${data.summary}`);
          } else {
            const { error } = await db.from("article_summaries").upsert({
              article_id: article.id,
              summary: data.summary,
              key_points: data.key_points,
              topics: data.topics,
              relevance: data.relevance,
              model,
              tokens_in: usage.tokensIn,
              tokens_out: usage.tokensOut,
            });
            if (error) throw new Error(`save: ${error.message}`);
            log(`  [${data.relevance}] ${article.title}`);
          }
          result.summarized++;
        } catch (err) {
          result.failed++;
          log(`  FAILED ${article.title}: ${err instanceof Error ? err.message : err}`);
        }
      }),
    ),
  );
  return result;
}
