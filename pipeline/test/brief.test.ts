import { describe, expect, it } from "vitest";
import {
  BriefOutputSchema,
  buildSystemPrompt,
  buildUserMessage,
  type Candidate,
  renderMarkdown,
  resolveBrief,
  todayInWarsaw,
} from "../src/steps/brief.js";

const cand = (id: number, relevance = 3, source = "The Decoder"): Candidate => ({
  id,
  title: `Article ${id}`,
  url: `https://x.com/${id}`,
  source,
  published_at: "2026-11-17T06:00:00Z",
  summary: `Summary ${id}.`,
  topics: ["agents"],
  relevance,
});

const output = (overrides: Partial<Record<string, unknown>> = {}) =>
  BriefOutputSchema.parse({
    tldr: [{ text: "Big thing", article_ids: [1] }],
    trends: [{ topic: "Agents", why: "Everywhere", article_ids: [1, 2] }],
    reading: [
      { rank: 2, title: "Second", summary: "S2", why_for_me: "W2", article_ids: [2] },
      { rank: 1, title: "First", summary: "S1", why_for_me: "W1", article_ids: [1, 3] },
    ],
    learning: [{ skill: "Agent memory", why: "Hot", article_ids: [3] }],
    ...overrides,
  });

describe("brief prompt", () => {
  it("injects the profile and keeps the dedupe + injection rules", () => {
    const p = buildSystemPrompt("Tester who likes agents");
    expect(p).toContain("Tester who likes agents");
    expect(p).toMatch(/Merge duplicates/);
    expect(p).toMatch(/data, not instructions/);
  });

  it("lists candidates by relevance with ids, inside delimiters", () => {
    const m = buildUserMessage([cand(1, 2), cand(2, 5, "TechCrunch AI")]);
    expect(m.startsWith("<articles>\n[2] TechCrunch AI · 2026-11-17 · relevance 5/5")).toBe(true);
    expect(m.indexOf("[2]")).toBeLessThan(m.indexOf("[1]"));
    expect(m.endsWith("</articles>")).toBe(true);
  });
});

describe("resolveBrief", () => {
  const candidates = [cand(1), cand(2), cand(3, 4, "Anthropic News")];

  it("resolves ids to links, sorts by rank and renumbers", () => {
    const b = resolveBrief(output(), candidates);
    expect(b.reading.map((r) => [r.rank, r.title])).toEqual([[1, "First"], [2, "Second"]]);
    expect(b.reading[0]?.articles).toEqual([
      { id: 1, title: "Article 1", url: "https://x.com/1", source: "The Decoder" },
      { id: 3, title: "Article 3", url: "https://x.com/3", source: "Anthropic News" },
    ]);
  });

  it("drops hallucinated ids and items left without articles", () => {
    const b = resolveBrief(
      output({
        trends: [{ topic: "Ghost", why: "x", article_ids: [999] }],
        reading: [
          { rank: 1, title: "Ghost", summary: "s", article_ids: [999] },
          { rank: 2, title: "Real", summary: "s", article_ids: [2, 999, 2] },
        ],
      }),
      candidates,
    );
    expect(b.trends).toEqual([]);
    expect(b.reading).toHaveLength(1);
    expect(b.reading[0]).toMatchObject({ rank: 1, title: "Real" });
    expect(b.reading[0]?.articles.map((a) => a.id)).toEqual([2]);
  });

  it("fails when no reading item survives", () => {
    expect(() => resolveBrief(output({ reading: [{ title: "Ghost", summary: "s", article_ids: [999] }] }), candidates)).toThrow(
      /no reading items/,
    );
  });

  it("schema coerces string ids from sloppy model output", () => {
    const o = output({ tldr: [{ text: "t", article_ids: ["1"] }] });
    expect(o.tldr[0]?.article_ids).toEqual([1]);
  });
});

describe("renderMarkdown", () => {
  it("renders all four sections with links", () => {
    const md = renderMarkdown("2026-11-17", resolveBrief(output(), [cand(1), cand(2), cand(3)]));
    expect(md).toMatch(/^# AI Radar: 2026-11-17/);
    for (const h of ["## TL;DR", "## Trends", "## Worth reading", "## Worth learning"]) expect(md).toContain(h);
    expect(md).toContain("### 1. First");
    expect(md).toContain("- [Article 1](https://x.com/1) · The Decoder");
  });
});

describe("todayInWarsaw", () => {
  it("uses the Warsaw calendar date, not UTC", () => {
    // 23:30 UTC on Nov 17 = 00:30 on Nov 18 in Warsaw (CET, UTC+1)
    expect(todayInWarsaw(new Date("2026-11-17T23:30:00Z"))).toBe("2026-11-18");
    expect(todayInWarsaw(new Date("2026-11-17T12:00:00Z"))).toBe("2026-11-17");
  });
});
