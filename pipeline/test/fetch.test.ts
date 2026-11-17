import { describe, expect, it } from "vitest";
import { prepareRows } from "../src/steps/fetch.js";

const article = (url: string, title = "T", text = "Body") => ({
  url,
  title,
  author: null,
  publishedAt: new Date("2026-11-12T00:00:00Z"),
  contentText: text,
});

describe("prepareRows", () => {
  it("normalizes URLs and dedupes within the batch", () => {
    const rows = prepareRows(1, "en", [article("https://x.com/a/"), article("https://x.com/a?utm_source=rss")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source_id: 1, url: "https://x.com/a", lang: "en", published_at: "2026-11-12T00:00:00.000Z" });
  });

  it("drops articles with an empty title or empty text", () => {
    const rows = prepareRows(1, null, [article("https://x.com/a", "  "), article("https://x.com/b", "T", ""), article("https://x.com/c")]);
    expect(rows.map((r) => r.url)).toEqual(["https://x.com/c"]);
  });
});
