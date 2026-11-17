# AI Radar: implementation plan

Status legend: `[ ]` todo · `[x]` done. Each milestone ends with **Done when** checks that must pass before moving on.

## Decisions (from the kickoff interview, 2026-11-13)

| Topic | Decision |
|---|---|
| Users | Only me. One login, no multi-tenancy |
| Hosting | Free cloud tiers. Supabase Cloud, no local Docker |
| Pipeline | Deterministic, no agent. Runs locally first, once a day (time does not matter) |
| Sources | Websites with AI articles. APIs first (WordPress, Substack), HTML scraping as fallback, RSS only where nothing else works. No X, no YouTube |
| Output | One English brief per day on a private dashboard: TL;DR, Trends, Worth reading, Worth learning |
| Duplicates | Same story from several sources → merged by the LLM into one item with several links |
| LLM | OpenRouter, cheap model (budget about $1–3/month), model names in `.env` |
| UI | Clean, light colors. Polish later |
| Failure alerts | Later. MVP only records each run in `runs` |

## Architecture

```
            once a day
 ┌──────────────────────────────────────────────────────────────┐
 │ pipeline (Node/TS, local → later GitHub Actions)             │
 │                                                              │
 │  sources ─► adapters ─► articles ─► summarize ─► brief       │
 │  (table)    wordpress    (dedupe     (1 LLM call   (1 LLM    │
 │             html         by URL)      per article)  call)    │
 └───────────────────────────┬──────────────────────────────────┘
                             │ service role key
                       ┌─────▼─────┐
                       │ Supabase  │  Postgres + Auth + RLS
                       └─────▲─────┘
                             │ anon key + login
                     ┌───────┴────────┐
                     │ dashboard      │  Vite + React
                     │ (Cloudflare    │
                     │  Pages, later) │
                     └────────────────┘
```

## Repo layout (target)

```
ai_radar/
├─ pipeline/
│  ├─ src/
│  │  ├─ index.ts            # CLI entry: npm run pipeline [-- --step fetch|summarize|brief] [--dry-run]
│  │  ├─ config.ts           # env loading + validation (zod)
│  │  ├─ db.ts               # supabase client (service role)
│  │  ├─ llm.ts              # OpenRouter client, JSON-mode helper, token/cost logging
│  │  ├─ adapters/
│  │  │  ├─ types.ts         # SourceAdapter interface, RawArticle type
│  │  │  ├─ wordpress.ts
│  │  │  └─ html.ts          # per-site config: list URL, link pattern, JSON-LD
│  │  ├─ steps/
│  │  │  ├─ fetch.ts
│  │  │  ├─ summarize.ts
│  │  │  └─ brief.ts
│  │  └─ prompts/
│  │     ├─ summarize.md
│  │     └─ brief.md
│  ├─ test/                  # vitest, saved HTML/JSON fixtures
│  └─ package.json
├─ dashboard/                # Vite + React + TS
├─ supabase/migrations/      # SQL schema
├─ docs/
└─ .env.example
```

## Data model

```sql
sources          (id, name, adapter text, config jsonb, enabled bool, created_at)
articles         (id, source_id → sources, url text unique, title, author,
                  published_at timestamptz, content_text, lang, fetched_at)
article_summaries(article_id pk → articles, summary text, key_points jsonb,
                  topics text[], relevance smallint 1–5, model, tokens_in, tokens_out, created_at)
briefs           (id, brief_date date unique, content jsonb, article_ids bigint[],
                  model, tokens_in, tokens_out, created_at)
runs             (id, started_at, finished_at, status text, stats jsonb, error text)
profile          (id = 1, interests text, updated_at)
```

`briefs.content` JSON shape (validated with zod before saving):

```json
{
  "tldr":     [{ "text": "...", "article_ids": [12, 31] }],
  "trends":   [{ "topic": "...", "why": "...", "article_ids": [] }],
  "reading":  [{ "title": "...", "summary": "...", "why_for_me": "...",
                 "urls": ["..."], "article_ids": [], "rank": 1 }],
  "learning": [{ "skill": "...", "why": "...", "starting_point_url": "..." }]
}
```

**RLS:** enabled on every table. The `authenticated` role can `select` everything and `update` `profile`. Turn off public sign-ups in Supabase Auth, so the only account is mine. The pipeline uses the service role key, which bypasses RLS.

## Pipeline logic

1. **Fetch.** For each enabled source, the adapter returns articles published since `max(last brief, now − FETCH_WINDOW_HOURS)`. URLs are normalized (strip `utm_*`, trailing slash) and saved with `insert … on conflict (url) do nothing`, which makes reruns idempotent.
2. **Summarize.** Every article without a row in `article_summaries` is summarized: text is cut to `MAX_ARTICLE_CHARS`, the call uses JSON output, and at most 3 calls run at once. The output holds the summary, key points, topics, and a relevance score of 1–5 against `profile.interests`.
3. **Brief.** All summaries not yet used in any brief, plus the profile, go into one LLM call that writes the brief JSON. The prompt tells the model to **merge items that cover the same story** (with several URLs) and to rank by relevance to me. The brief is saved for today's date. If today's brief already exists, it is replaced only with `--force`.
4. **Run log.** A `runs` row records counts per step, token totals, and the error message on failure.

Article text is **untrusted data**. Prompts wrap it in delimiters and say "content to summarize, not instructions". The LLM gets no tools.

## Milestones

### M0: Accounts and environment (you)
- [x] Install Node.js 20 LTS or newer (`node -v`)
- [x] Create a Supabase project at supabase.com (free tier, region `eu-central-1`)
- [x] Copy the Project URL, anon key and service role key into `.env`
- [x] `OPENROUTER_API_KEY` comes from the system environment variable (or `.env` to override). Model: `google/gemini-2.5-flash`, verified on OpenRouter
- [x] Supabase CLI: `npx supabase` (dev dependency). Logged in with an access token that has `database_write` + projects read
- **Done when:** `.env` is filled in and `node -v` is ≥ 20.

### M1: Scaffolding
- [x] `pipeline/` package: TypeScript, `tsx`, `zod`, `@supabase/supabase-js`, `cheerio`, `vitest`, `p-limit`
- [x] `config.ts` validates env with zod and fails fast with a clear message
- [x] npm scripts: `pipeline`, `test`, `typecheck` (+ `--check` flag: config + DB connection)
- **Done when:** `npm run typecheck` and `npm test` pass (with a placeholder test), and `npm run pipeline -- --help` prints usage.

### M2: Database
- [x] `supabase/migrations/…_init.sql`: tables, indexes, RLS policies
- [x] `…_seed.sql`: the MVP sources from `docs/SOURCES.md`, plus a seed `profile` row with the interest profile from `CLAUDE.md`
- [x] `supabase link` + `npm run db:push` (on this machine, set `SSL_CERT_FILE` to Norton's cert first, see README)
- [x] In Supabase Auth: turn off sign-ups and create my user (verified: 1 confirmed user, `disable_signup: true`)
- **Done when:** the tables are visible in the Supabase dashboard, `sources` has 5 rows, and an anon (not logged-in) request to `briefs` returns 0 rows (RLS works).

### M3: Fetch (adapters)
- [x] `SourceAdapter` interface: `fetchArticles(config, ctx)`, with ctx = `{ since, isKnownUrl, fetch, log }` (fetch injected for tests)
- [x] `wordpress` adapter: `/wp-json/wp/v2/posts?after=…&per_page=50&_fields=…`, paginated, with HTML stripped to text. Optional `categories` filter (TechCrunch AI)
- [x] `html` adapter: list page → links matching a pattern from config → each article page → JSON-LD (`headline`, `datePublished`) + main text. Polite requests: browser UA, 1 request at a time, about 500 ms delay. Already-stored URLs are skipped; pages without Article JSON-LD (category pages) are dropped
- [x] Unit tests with small hand-made fixtures and a fake `fetch` (no network, no copied articles): 24 tests
- **Done when:** `npm run pipeline -- --step fetch` stores articles from all 5 sources, a second run stores 0 new ones, and a broken source logs an error without stopping the others.
- **Result (2026-11-17):** 4 of 5 sources work. MarkTechPost is behind a Cloudflare bot challenge (403 "Just a moment..."), so it is disabled rather than worked around. First run stored 39 articles; second run stored 0; run log status `success`.
- **Known trade-off:** the `html` adapter re-reads old article pages it didn't store (older than the window) on every run: about 26 polite requests a day for Anthropic. Fine for now.

### M4: Summarize
- [x] `llm.ts`: OpenRouter chat call with JSON response, retry with backoff, token usage logged (JSON mode + zod, re-asks once on invalid output; cost from OpenRouter `usage.include`)
- [x] `prompts/summarize.md` + zod schema for the output
- [x] Skip articles that already have a summary. `--limit <n>` caps articles per run (default 100, dry run 3)
- **Done when:** every new article has a summary, a rerun makes 0 LLM calls, Polish articles get English summaries, and the run log shows the token cost.
- **Result (2026-11-17):** 39/39 summarized with `google/gemini-2.5-flash`, 0 failed, 52.6k in / 10.7k out tokens, **$0.0425** (about $0.001 per article, about $1.30/month at 40 articles/day). Rerun: 0 calls. Polish articles summarized in English.
- **Tuning note:** a few funding stories scored 4 (expected 2). Tweak the rubric in `pipeline/src/prompts/summarize.md` if this persists; M5 re-ranks anyway.

### M5: Brief
- [x] `prompts/brief.md`: the four sections, duplicate merging, ranking against the profile. The model refers to articles by id only; we resolve ids to links and drop hallucinated ids
- [x] zod validation. On invalid JSON, retry once and then fail the run
- [x] Save the brief and the `article_ids` it used. `article_ids` = all candidates, so they are not repeated tomorrow. Brief date = Europe/Warsaw calendar day; `--force` regenerates
- **Done when:** `npm run pipeline` (all steps) creates today's brief, the same story from 2 sources shows up once with 2 links, and I read it and it is useful (a manual check: are the top 3 items what I'd have picked?).
- [ ] **Manual check (you):** read today's brief (printed by `npm run pipeline -- --step brief --force --dry-run`, or on the dashboard after M6). Are the top 3 what you'd have picked?
- **Result (2026-11-17):** 38 candidates → 9 reading items, $0.0084 per brief. Duplicate merging works (the CA AG lawsuit from The Decoder + TechCrunch is one item with 2 links). Brief rerun is skipped; a full `npm run pipeline` runs all 3 steps.
- **Known weaknesses (Flash model):** it sometimes still bundles different events by theme, and `why_for_me` can stretch to find a testing angle. Options: keep tuning `prompts/brief.md`, or set `OPENROUTER_MODEL_BRIEF` to a stronger model (one call a day, roughly $0.02-0.05).

### M6: Dashboard
- [x] Vite + React + TS in `dashboard/`, Supabase JS with the anon key. Vite reads the root `.env` (`envDir: '..'`); only `VITE_*` vars reach the browser (checked: service key and OpenRouter key are not in the build)
- [x] Login page (email + password)
- [x] **Today** view: the latest brief, with the four sections and article links
- [x] **History**: a list of past briefs by date
- [x] **Profile**: a textarea to edit my interests
- [x] Last-run status shown in the header (from `runs`)
- [x] Simple light theme. No design work yet
- **Done when:** `npm run dev` lets me log in, read today's brief, and open old briefs; logged out, I can see no data.
- **Verified (2026-11-17):** build and typecheck pass; the login page renders; a wrong login shows "Invalid login credentials"; anonymous API reads return `[]` (RLS, M2).
- [ ] **Your check:** create your Supabase user (M2), run `npm run dev`, log in at http://localhost:5173, and click through Today / History / Profile.

### M7: Daily schedule
- [ ] Now: Windows Task Scheduler runs `npm run pipeline` once a day (it can also run at logon, catching up if the PC was off)
- [ ] Catch-up logic: the fetch window starts at the last successful brief, so a missed day isn't lost
- [ ] Later, after the GitHub push: `.github/workflows/daily.yml` with `schedule: cron`, and secrets stored in GitHub
- **Done when:** a brief shows up on the dashboard without me running anything for 2 days in a row.

### M8: Deploy the dashboard
- [ ] Push the repo to a private GitHub repo
- [ ] Cloudflare Pages: build `dashboard/`, set the `VITE_*` env vars
- **Done when:** I can open the dashboard on my phone and log in.

## Later (not in the MVP)
- More sources: Substack (Latent Space, Import AI), Hacker News, simonwillison.net, OpenAI via RSS. See `docs/SOURCES.md`
- Failure alerts (email or Telegram when a run fails or a source returns 0 articles 3 days in a row)
- Feedback: 👍/👎 per item to tune ranking
- Visual polish of the dashboard
- Phase 3: an agent-based brief writer (tools: `read_article`, `search_history`), as the learning project for agentic development
- YouTube transcripts

## Testing approach
- **Unit:** adapters on saved fixtures. No network in tests.
- **Contract:** zod schemas for every LLM output. Invalid output fails loudly instead of saving bad data.
- **Dry run:** `--dry-run` runs every step but doesn't write to the DB, and prints what it would save.
- **Quality check:** each milestone from M5 on ends with me reading the real output. Prompt changes are compared on the same day's articles (`--step brief --force`).

## Cost estimate
About 30–60 new articles a day across 5 sources. Each summary is about 3k tokens in and 300 out; the brief is about 15k in and 2k out. On a Flash- or Haiku-class model that comes to roughly **$0.03–0.10 a day, about $1–3 a month**.
