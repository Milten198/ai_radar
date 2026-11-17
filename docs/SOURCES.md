# Sources

Probe results from 2026-11-13 (plain `curl` with a browser User-Agent, no auth).

## MVP sources

| Source | Adapter | Endpoint | Notes |
|---|---|---|---|
| aioai.pl 🇵🇱 | `wordpress` | `https://aioai.pl/wp-json/wp/v2/posts` | Full content, dates, categories as JSON |
| the-decoder.com | `wordpress` | `https://the-decoder.com/wp-json/wp/v2/posts` | AI-only news, high signal |
| techcrunch.com (AI) | `wordpress` | `https://techcrunch.com/wp-json/wp/v2/posts?categories=<AI id>` | Must filter to the AI category |
| anthropic.com/news | `html` | `https://www.anthropic.com/news` | No API. List page has `/news/<slug>` links (about 26); each article has JSON-LD (`headline`, `datePublished`, `description`) + server-rendered text |

## Phase 2 candidates

| Source | Adapter | Endpoint | Notes |
|---|---|---|---|
| Latent Space | `substack` | `https://latentspace.substack.com/api/v1/posts` | Use substack.com host, not latent.space |
| Import AI | `substack` | `https://importai.substack.com/api/v1/posts` | |
| Interconnects | `substack` | `https://www.interconnects.ai/api/v1/posts` | Some posts `audience: only_paid`, so skip those |
| Hacker News | `hn` | `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=...` | Keyword filter + points threshold |
| HF Daily Papers | `hf-papers` | `https://huggingface.co/api/daily_papers` | Low priority (research) |
| artificialintelligence-news.com | `wordpress` | `/wp-json/wp/v2/posts` | Works; more enterprise news |
| simonwillison.net | `html` | `https://simonwillison.net/` | Easy HTML, about 70 post links on the homepage |
| deepmind.google blog | `html` | `https://deepmind.google/discover/blog/` | Needs a site-specific selector; send `Accept-Encoding` |
| huggingface.co/blog | `html` | | Partly client-rendered |
| mistral.ai/news, blog.google AI, The Batch | `html` | | Reachable, need selectors |

## Problematic

| Source | Status | Workaround |
|---|---|---|
| openai.com/news | 403 (Cloudflare) | `https://openai.com/news/rss.xml` works. The one accepted RSS exception |
| reddit.com | 403 without auth | Free OAuth app ("script" type) |
| venturebeat.com | 429 rate-limited | Skip |
| marktechpost.com | Cloudflare bot challenge (403 "Just a moment...") on the API from the pipeline, though single manual requests pass | Disabled (migration `20261117000001`). Do not work around bot protection |
| X / Twitter, YouTube | Out of scope | |

## Adding a source

Insert a row into `sources`:

```sql
insert into sources (name, adapter, config, enabled)
values ('The Decoder', 'wordpress', '{"baseUrl":"https://the-decoder.com"}', true);
```
