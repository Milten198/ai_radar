import { describe, expect, it } from "vitest";
import { buildPostsUrl, wordpressAdapter } from "../src/adapters/wordpress.js";
import { ctx, fakeFetch } from "./helpers.js";

const post = (n: number, dateGmt: string) => ({
  link: `https://blog.example.com/post-${n}/`,
  date_gmt: dateGmt,
  title: { rendered: `Post ${n} &#8211; AI` },
  content: { rendered: `<p>Body of post ${n}.</p>` },
  _embedded: { author: [{ name: `Author ${n}` }] },
});

const config = wordpressAdapter.configSchema.parse({ baseUrl: "https://blog.example.com" });

describe("wordpress adapter", () => {
  it("builds the posts URL with after, paging, embed and optional categories", () => {
    const url = new URL(
      buildPostsUrl({ ...config, categories: [577047203] }, new Date("2026-11-10T00:00:00Z"), 2),
    );
    expect(url.pathname).toBe("/wp-json/wp/v2/posts");
    expect(url.searchParams.get("after")).toBe("2026-11-10T00:00:00.000Z");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("_embed")).toBe("author");
    expect(url.searchParams.get("categories")).toBe("577047203");
  });

  it("maps posts to articles (UTC dates, decoded titles, plain text, author)", async () => {
    const { fn } = fakeFetch([
      [() => true, { body: JSON.stringify([post(1, "2026-11-12T08:30:00")]), headers: { "x-wp-totalpages": "1" } }],
    ]);
    const [a] = await wordpressAdapter.fetchArticles(config, ctx({ fetch: fn }));
    expect(a).toEqual({
      url: "https://blog.example.com/post-1/",
      title: "Post 1 – AI",
      author: "Author 1",
      publishedAt: new Date("2026-11-12T08:30:00Z"),
      contentText: "Body of post 1.",
    });
  });

  it("drops posts older than `since` (site-timezone `after` can leak them)", async () => {
    const { fn } = fakeFetch([
      [() => true, { body: JSON.stringify([post(1, "2026-11-12T00:00:00"), post(2, "2026-11-09T23:00:00")]) }],
    ]);
    const articles = await wordpressAdapter.fetchArticles(config, ctx({ fetch: fn }));
    expect(articles.map((a) => a.title)).toEqual(["Post 1 – AI"]);
  });

  it("follows pagination until x-wp-totalpages", async () => {
    const page = (n: number) => Array.from({ length: 50 }, (_, i) => post(n * 100 + i, "2026-11-12T00:00:00"));
    const { fn, calls } = fakeFetch([
      [(u) => u.includes("page=1&"), { body: JSON.stringify(page(1)), headers: { "x-wp-totalpages": "2" } }],
      [(u) => u.includes("page=2&"), { body: JSON.stringify([post(999, "2026-11-12T00:00:00")]), headers: { "x-wp-totalpages": "2" } }],
    ]);
    const articles = await wordpressAdapter.fetchArticles(config, ctx({ fetch: fn }));
    expect(articles).toHaveLength(51);
    expect(calls).toHaveLength(2);
  });

  it("throws on a non-retryable HTTP error without retrying", async () => {
    const { fn, calls } = fakeFetch([[() => true, { body: "gone", status: 404 }]]);
    await expect(wordpressAdapter.fetchArticles(config, ctx({ fetch: fn }))).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(1);
  });

  it("does not retry a 403 bot challenge", async () => {
    const { fn, calls } = fakeFetch([[() => true, { body: "Just a moment...", status: 403 }]]);
    await expect(wordpressAdapter.fetchArticles(config, ctx({ fetch: fn }))).rejects.toThrow(/HTTP 403/);
    expect(calls).toHaveLength(1);
  });

  it("retries a 503 and succeeds", async () => {
    let n = 0;
    const fn = (async () =>
      ++n === 1 ? new Response("busy", { status: 503 }) : new Response(JSON.stringify([post(1, "2026-11-12T00:00:00")]))) as typeof fetch;
    const articles = await wordpressAdapter.fetchArticles(config, ctx({ fetch: fn }));
    expect(articles).toHaveLength(1);
    expect(n).toBe(2);
  });
});
