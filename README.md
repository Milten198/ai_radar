# AI Radar

A personal daily brief of what is happening in AI.

Once a day a pipeline reads a set of AI news sources, summarizes every new article with an LLM, and writes one English brief, ranked against my interests. I read it on a private dashboard.

## The brief

1. **TL;DR**: the 3–5 most important things since the last brief
2. **Trends**: topics that keep coming up across sources
3. **Worth reading**: ranked articles with short summaries and links
4. **Worth learning**: concrete technologies or skills to look at

## Stack

| Part | Tech |
|---|---|
| Language | TypeScript (Node 20+) |
| Database + auth | Supabase Cloud (free tier) |
| LLM | OpenRouter |
| Pipeline | Node script, run locally (`npm run pipeline`), later GitHub Actions cron |
| Dashboard | Vite + React, Supabase Auth, Cloudflare Pages |

## Status

Planning. See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) and [docs/SOURCES.md](docs/SOURCES.md).

## Setup

```bash
cp .env.example .env   # then fill in the keys
```
