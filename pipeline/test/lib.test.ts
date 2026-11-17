import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText } from "../src/lib/text.js";
import { normalizeUrl } from "../src/lib/url.js";

describe("normalizeUrl", () => {
  it("strips tracking params, fragment and trailing slash; lowercases host; forces https", () => {
    expect(normalizeUrl("http://Example.COM/post/abc/?utm_source=x&id=7#top")).toBe("https://example.com/post/abc?id=7");
  });

  it("keeps the root slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("resolves relative links against a base", () => {
    expect(normalizeUrl("/news/foo", "https://www.anthropic.com/news")).toBe("https://www.anthropic.com/news/foo");
  });

  it("maps variants of the same article to one key", () => {
    const a = normalizeUrl("https://the-decoder.com/some-story/");
    const b = normalizeUrl("https://the-decoder.com/some-story?utm_medium=rss");
    expect(a).toBe(b);
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, drops scripts and figures, decodes entities", () => {
    const html = `<p>First &amp; best.</p><figure><img src=x><figcaption>caption</figcaption></figure>
      <script>alert(1)</script><p>Second<br>line</p><ul><li>one</li><li>two</li></ul>`;
    expect(htmlToText(html)).toBe("First & best.\n\nSecond\n\nline\n\none\n\ntwo");
  });
});

describe("decodeEntities", () => {
  it("decodes numeric and named entities", () => {
    expect(decodeEntities("ChatGPT&#8217;s new &quot;Wallet&quot;")).toBe("ChatGPT’s new \"Wallet\"");
  });
});
