import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { LlmClient, Usage } from "../llm.js";

// ---------------------------------------------------------------------------
// LLM output schema (what the model returns: references by article id only)
// ---------------------------------------------------------------------------
const Ids = z.array(z.coerce.number().int()).default([]);

export const BriefOutputSchema = z.object({
  tldr: z.array(z.object({ text: z.string().min(1), article_ids: Ids })).min(1),
  trends: z.array(z.object({ topic: z.string().min(1), why: z.string().min(1), article_ids: Ids })).default([]),
  reading: z
    .array(
      z.object({
        rank: z.coerce.number().int().optional(),
        title: z.string().min(1),
        summary: z.string().min(1),
        why_for_me: z.string().default(""),
        article_ids: Ids,
      }),
    )
    .min(1),
  learning: z.array(z.object({ skill: z.string().min(1), why: z.string().min(1), article_ids: Ids })).default([]),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

// ---------------------------------------------------------------------------
// Stored brief content (ids resolved to links by us, never by the model)
// ---------------------------------------------------------------------------
export interface ArticleLink {
  id: number;
  title: string;
  url: string;
  source: string;
}

export interface BriefContent {
  tldr: Array<{ text: string; articles: ArticleLink[] }>;
  trends: Array<{ topic: string; why: string; articles: ArticleLink[] }>;
  reading: Array<{ rank: number; title: string; summary: string; why_for_me: string; articles: ArticleLink[] }>;
  learning: Array<{ skill: string; why: string; articles: ArticleLink[] }>;
}

export interface Candidate {
  id: number;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  summary: string;
  topics: string[];
  relevance: number;
}

const PROMPT_TEMPLATE = readFileSync(new URL("../prompts/brief.md", import.meta.url), "utf8");

export function buildSystemPrompt(profile: string): string {
  return PROMPT_TEMPLATE.replace("{{PROFILE}}", profile.trim());
}

/** Candidates as compact text blocks, highest first-pass relevance first. */
export function buildUserMessage(candidates: Candidate[]): string {
  const blocks = [...candidates]
    .sort((a, b) => b.relevance - a.relevance)
    .map((c) =>
      [
        `[${c.id}] ${c.source} · ${c.published_at?.slice(0, 10) ?? "undated"} · relevance ${c.relevance}/5`,
        c.title,
        c.summary.replaceAll("</articles>", "</ articles>"),
        `Topics: ${c.topics.join(", ")}`,
      ].join("\n"),
    );
  return `<articles>\n${blocks.join("\n\n")}\n</articles>`;
}

/**
 * Map ids to links, drop unknown ids (hallucinations), drop items left without any article,
 * and renumber reading ranks 1..n in the model's order.
 */
export function resolveBrief(out: BriefOutput, candidates: Candidate[]): BriefContent {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const links = (ids: number[]): ArticleLink[] =>
    [...new Set(ids)]
      .map((id) => byId.get(id))
      .filter((c): c is Candidate => !!c)
      .map((c) => ({ id: c.id, title: c.title, url: c.url, source: c.source }));

  const tldr = out.tldr.map((t) => ({ text: t.text, articles: links(t.article_ids) }));
  const trends = out.trends
    .map((t) => ({ topic: t.topic, why: t.why, articles: links(t.article_ids) }))
    .filter((t) => t.articles.length > 0);
  const reading = [...out.reading]
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((r) => ({ title: r.title, summary: r.summary, why_for_me: r.why_for_me, articles: links(r.article_ids) }))
    .filter((r) => r.articles.length > 0)
    .map((r, i) => ({ rank: i + 1, ...r }));
  const learning = out.learning.map((l) => ({ skill: l.skill, why: l.why, articles: links(l.article_ids) }));

  if (reading.length === 0) throw new Error("brief has no reading items with valid article ids");
  return { tldr, trends, reading, learning };
}

export function renderMarkdown(date: string, c: BriefContent): string {
  const refs = (a: ArticleLink[]) => (a.length ? ` (${a.map((x) => `[${x.source}](${x.url})`).join(", ")})` : "");
  const out = [`# AI Radar: ${date}`, "", "## TL;DR", ...c.tldr.map((t) => `- ${t.text}${refs(t.articles)}`)];
  if (c.trends.length) out.push("", "## Trends", ...c.trends.map((t) => `- **${t.topic}**: ${t.why}${refs(t.articles)}`));
  out.push(
    "",
    "## Worth reading",
    ...c.reading.flatMap((r) => [
      "",
      `### ${r.rank}. ${r.title}`,
      r.summary,
      r.why_for_me ? `*Why for you:* ${r.why_for_me}` : "",
      r.articles.map((a) => `- [${a.title}](${a.url}) · ${a.source}`).join("\n"),
    ].filter(Boolean)),
  );
  if (c.learning.length) out.push("", "## Worth learning", ...c.learning.map((l) => `- **${l.skill}**: ${l.why}${refs(l.articles)}`));
  return out.join("\n");
}

/** Calendar date in Europe/Warsaw (the brief is "today's" for the reader, not UTC). */
export function todayInWarsaw(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------
export interface BriefOptions {
  llm: LlmClient;
  model: string;
  dryRun: boolean;
  force: boolean;
  /** Ignore candidates below this first-pass relevance. */
  minRelevance?: number;
  /** Only consider articles fetched in the last N days. */
  lookbackDays?: number;
  now?: Date;
  log?: (msg: string) => void;
}

export type BriefResult =
  | { status: "skipped"; reason: string }
  | { status: "created"; date: string; candidates: number; reading: number; usage: Usage; markdown: string };

export async function runBrief(db: SupabaseClient, opts: BriefOptions): Promise<BriefResult> {
  const log = opts.log ?? console.log;
  const now = opts.now ?? new Date();
  const date = todayInWarsaw(now);

  const { data: briefs, error: bErr } = await db
    .from("briefs")
    .select("brief_date, article_ids")
    .order("brief_date", { ascending: false })
    .limit(60);
  if (bErr) throw new Error(`load briefs: ${bErr.message}`);
  if (briefs.some((b) => b.brief_date === date) && !opts.force) {
    return { status: "skipped", reason: `brief for ${date} already exists (use --force to regenerate)` };
  }
  // Articles already covered by an earlier brief are not repeated. (With --force, today's own ids are reusable.)
  const used = new Set(briefs.filter((b) => b.brief_date !== date).flatMap((b) => b.article_ids as number[]));

  const since = new Date(now.getTime() - (opts.lookbackDays ?? 7) * 86_400_000).toISOString();
  const { data: rows, error: aErr } = await db
    .from("articles")
    .select("id, title, url, published_at, sources(name), article_summaries!inner(summary, topics, relevance)")
    .gte("fetched_at", since)
    .gte("article_summaries.relevance", opts.minRelevance ?? 2)
    .limit(300);
  if (aErr) throw new Error(`load candidates: ${aErr.message}`);

  const candidates: Candidate[] = (rows as any[])
    .filter((r) => !used.has(r.id))
    .map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      source: r.sources?.name ?? "unknown",
      published_at: r.published_at,
      summary: r.article_summaries.summary,
      topics: r.article_summaries.topics,
      relevance: r.article_summaries.relevance,
    }));
  if (candidates.length === 0) return { status: "skipped", reason: "no new summarized articles since the last brief" };

  const { data: profile, error: pErr } = await db.from("profile").select("interests").eq("id", 1).single();
  if (pErr) throw new Error(`load profile: ${pErr.message}`);

  log(`Writing brief for ${date} from ${candidates.length} candidate articles with ${opts.model}`);
  const { data, usage, model } = await opts.llm.json({
    model: opts.model,
    system: buildSystemPrompt(profile.interests),
    user: buildUserMessage(candidates),
    schema: BriefOutputSchema,
    maxTokens: 8000,
  });
  const content = resolveBrief(data, candidates);
  const markdown = renderMarkdown(date, content);

  if (!opts.dryRun) {
    const { error } = await db.from("briefs").upsert(
      {
        brief_date: date,
        content,
        article_ids: candidates.map((c) => c.id),
        model,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
      },
      { onConflict: "brief_date" },
    );
    if (error) throw new Error(`save brief: ${error.message}`);
  }
  return { status: "created", date, candidates: candidates.length, reading: content.reading.length, usage, markdown };
}
