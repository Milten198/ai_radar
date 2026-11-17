import { describe, expect, it } from "vitest";
import { extractArticleMeta, extractLinks, htmlAdapter } from "../src/adapters/html.js";
import { ctx, fakeFetch } from "./helpers.js";

const config = htmlAdapter.configSchema.parse({
  listUrl: "https://www.example.com/news",
  linkPattern: "^/news/[a-z0-9-]+$",
  delayMs: 0,
});

const listPage = `<html><body>
  <a href="/news/new-model">New model</a>
  <a href="/news/old-post">Old post</a>
  <a href="/news/policy">Policy (category page)</a>
  <a href="/news/new-model#section">Duplicate with fragment</a>
  <a href="/research/paper">Not news</a>
  <a href="https://other.com/news/foreign">Other host</a>
</body></html>`;

const articlePage = (headline: string, date: string) => `<html><head>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    datePublished: date,
    author: { "@type": "Organization", name: "Example Co" },
  })}</script></head>
  <body><nav>Menu</nav><article><h1>${headline}</h1><p>Paragraph one.</p><script>x()</script><p>Paragraph two.</p></article></body></html>`;

const categoryPage = `<html><head><script type="application/ld+json">{"@type":"CollectionPage"}</script></head><body><main>List</main></body></html>`;

describe("html adapter", () => {
  it("extracts unique, same-host links matching the pattern", () => {
    expect(extractLinks(listPage, config)).toEqual([
      "https://www.example.com/news/new-model",
      "https://www.example.com/news/old-post",
      "https://www.example.com/news/policy",
    ]);
  });

  it("finds Article metadata inside @graph and arrays", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["BlogPosting"],"headline":"H","datePublished":"2026-11-12","author":[{"name":"Ann"}]}]}</script>`;
    expect(extractArticleMeta(html)).toEqual({ headline: "H", datePublished: "2026-11-12", author: "Ann" });
  });

  it("returns null when there is no article JSON-LD (category pages) or it is malformed", () => {
    expect(extractArticleMeta(categoryPage)).toBeNull();
    expect(extractArticleMeta(`<script type="application/ld+json">{broken</script>`)).toBeNull();
  });

  it("fetches articles, skips category pages, old posts and known URLs", async () => {
    const { fn, calls } = fakeFetch([
      [(u) => u.endsWith("/news"), { body: listPage }],
      [(u) => u.endsWith("/new-model"), { body: articlePage("New model", "2026-11-12T00:00:00.000Z") }],
      [(u) => u.endsWith("/old-post"), { body: articlePage("Old post", "2026-10-01T00:00:00.000Z") }],
      [(u) => u.endsWith("/policy"), { body: categoryPage }],
    ]);
    const known = new Set(["https://www.example.com/news/old-post"]);
    const articles = await htmlAdapter.fetchArticles(config, ctx({ fetch: fn, isKnownUrl: (u) => known.has(u) }));

    expect(articles).toEqual([
      {
        url: "https://www.example.com/news/new-model",
        title: "New model",
        author: "Example Co",
        publishedAt: new Date("2026-11-12T00:00:00.000Z"),
        contentText: "New model\n\nParagraph one.\n\nParagraph two.",
      },
    ]);
    expect(calls).not.toContain("https://www.example.com/news/old-post"); // known → not fetched
  });

  it("keeps going when one article page fails", async () => {
    const logs: string[] = [];
    const { fn } = fakeFetch([
      [(u) => u.endsWith("/news"), { body: listPage }],
      [(u) => u.endsWith("/new-model"), { body: "boom", status: 403 }],
      [(u) => u.endsWith("/old-post"), { body: articlePage("Fresh", "2026-11-15T00:00:00.000Z") }],
    ]);
    const articles = await htmlAdapter.fetchArticles(config, ctx({ fetch: fn, log: (m) => logs.push(m) }));
    expect(articles.map((a) => a.title)).toEqual(["Fresh"]);
    expect(logs.some((l) => l.includes("HTTP 403"))).toBe(true);
  });
});
