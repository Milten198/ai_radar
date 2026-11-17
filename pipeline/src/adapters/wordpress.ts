import { z } from "zod";
import { httpGet } from "../lib/http.js";
import { decodeEntities, htmlToText } from "../lib/text.js";
import type { RawArticle, SourceAdapter } from "./types.js";

const ConfigSchema = z.object({
  baseUrl: z.string().url(),
  /** Optional WordPress category IDs to filter on (e.g. TechCrunch AI). */
  categories: z.array(z.number().int()).optional(),
  maxPages: z.number().int().positive().default(5),
});
type WordPressConfig = z.infer<typeof ConfigSchema>;

const PostSchema = z.object({
  link: z.string(),
  date_gmt: z.string(),
  title: z.object({ rendered: z.string() }),
  content: z.object({ rendered: z.string() }),
  _embedded: z
    .object({ author: z.array(z.object({ name: z.string().optional() }).passthrough()).optional() })
    .passthrough()
    .optional(),
});
type Post = z.infer<typeof PostSchema>;

const PER_PAGE = 50;

export function buildPostsUrl(config: WordPressConfig, since: Date, page: number): string {
  const url = new URL("/wp-json/wp/v2/posts", config.baseUrl);
  url.searchParams.set("after", since.toISOString());
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("_fields", "link,date_gmt,title,content,_links,_embedded");
  url.searchParams.set("_embed", "author");
  if (config.categories?.length) url.searchParams.set("categories", config.categories.join(","));
  return url.toString();
}

export function postToArticle(post: Post): RawArticle {
  return {
    url: post.link,
    title: decodeEntities(post.title.rendered),
    author: post._embedded?.author?.[0]?.name ?? null,
    // date_gmt has no zone suffix; it is UTC.
    publishedAt: new Date(`${post.date_gmt}Z`),
    contentText: htmlToText(post.content.rendered),
  };
}

export const wordpressAdapter: SourceAdapter<WordPressConfig> = {
  configSchema: ConfigSchema,

  async fetchArticles(config, ctx) {
    const articles: RawArticle[] = [];
    for (let page = 1; page <= config.maxPages; page++) {
      const res = await httpGet(ctx.fetch, buildPostsUrl(config, ctx.since, page));
      const posts = z.array(PostSchema).parse(await res.json());
      for (const post of posts) {
        const article = postToArticle(post);
        // `after` is interpreted in the site's timezone; re-check in UTC.
        if (article.publishedAt && article.publishedAt >= ctx.since) articles.push(article);
      }
      const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
      if (page >= totalPages || posts.length < PER_PAGE) break;
    }
    return articles;
  },
};
