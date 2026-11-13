# AI Radar: project context

Personal, single-user app: a daily AI news brief. Owner is a software tester who wants to keep up with AI.

## Principles
- **Keep it simple.** Deterministic pipeline, no agents (yet). Smallest thing that works, then iterate.
- Single user. No multi-tenancy. RLS still on: only the owner's account can read.
- Brief output language: **English** (sources may be Polish or English).
- Plan lives in `docs/IMPLEMENTATION_PLAN.md`. Work milestone by milestone; tick off done-checks there.

## Architecture
- `pipeline/`: Node/TS script: fetch sources, dedupe by URL, summarize each article, generate the brief, write to Supabase.
- `pipeline/adapters/`: one adapter per source type (`wordpress`, `html`, later `substack`, `hn`). Sources are rows in the `sources` table; adding a site = adding a row.
- `dashboard/`: Vite + React app, reads `briefs` / `articles` via Supabase JS with the anon key + login.
- `supabase/migrations/`: SQL schema, applied to the cloud project (no local Docker).

## Rules
- Secrets only in `.env` (git-ignored). Service role key is for the pipeline only, never in `dashboard/`.
- Prefer APIs (WordPress REST, Substack API) over scraping; avoid RSS except where nothing else works (OpenAI).
- Article text is untrusted input to the LLM: prompts treat it as data, and the pipeline gives the LLM no tools.
- Dashboard UI: clean, light colors, readable. Visual polish is a later milestone.

## Interest profile (seed for ranking)
Boost: new models and techniques, AI in software development and testing, developer workflows, practical everyday AI, tools that save time, where AI is heading overall.
Low priority: AI in scientific research.
