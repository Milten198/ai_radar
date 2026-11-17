# AI Radar

A personal daily brief of what is happening in AI.

Once a day a pipeline reads a set of AI news sites, summarizes every new article with an LLM, and writes one English brief ranked against my interests. I read it on a private dashboard.

## The brief

1. **TL;DR**: the 3–5 most important things since the last brief
2. **Trends**: themes that keep coming up across sources
3. **Worth reading**: 5–10 ranked stories, each with a summary, a "why for you" line, and links to the original articles
4. **Worth learning**: concrete technologies or skills to look at, based on the day's news

## How it works

```
                       npm run pipeline  (once a day)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                                                                           │
 │  1. FETCH            2. SUMMARIZE              3. BRIEF                   │
 │  sources table       every new article         all summaries not yet      │
 │   → adapter          → 1 LLM call:             in a brief + profile       │
 │   → articles         summary, key points,      → 1 LLM call:              │
 │  (deduped by URL)    topics, relevance 1-5     TL;DR, trends, reading,    │
 │                                                learning                   │
 └──────┬──────────────────────┬───────────────────────────┬─────────────────┘
        │                      │ OpenRouter                │
        ▼                      ▼                           ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ Supabase (Postgres + Auth + RLS)                                          │
 │ sources · articles · article_summaries · briefs · runs · profile          │
 └───────────────────────────────────▲───────────────────────────────────────┘
                                     │ publishable key + login (read-only via RLS)
                             ┌───────┴────────┐
                             │   dashboard    │  Vite + React
                             │ Today/History/ │
                             │    Profile     │
                             └────────────────┘
```

### 1. Fetch

Each row in the `sources` table names an **adapter** and its config. Adding a site means adding a row, not writing code (unless it needs a new adapter type).

| Adapter | How it reads a site | Used for |
|---|---|---|
| `wordpress` | WordPress REST API (`/wp-json/wp/v2/posts`): JSON with full text, dates, authors | aioai.pl, The Decoder, TechCrunch AI |
| `html` | List page → links matching a pattern → each article's JSON-LD metadata + `<article>` text | Anthropic News |

- Only articles from the last `FETCH_WINDOW_HOURS` (default 48) are kept.
- URLs are normalized (no tracking params, no trailing slash) and stored once. Rerunning never creates duplicates.
- One broken source never stops the others. It is logged, and the run is marked `partial`.
- Sites behind a bot challenge are **disabled, not worked around** (see `docs/SOURCES.md`).

### 2. Summarize

Every article without a summary goes to OpenRouter (`OPENROUTER_MODEL_SUMMARY`, 3 at a time) with the interest profile. The model returns JSON: a 3–5 sentence English summary, key points, topic tags, and a **relevance score from 1 to 5** for me. The output is validated (zod); an invalid reply is re-asked once. Polish articles get English summaries.

### 3. Brief

All summarized articles from the last 7 days (relevance ≥ 2) that aren't in an earlier brief go to one LLM call (`OPENROUTER_MODEL_BRIEF`). The model:

- writes the four sections,
- **merges** reports of the same event from different sources into one item with several links,
- re-ranks everything against the profile, pushing funding news and gossip down.

The model refers to articles **by id only**. The code turns ids into titles and links and drops any id that doesn't exist, so the brief can't contain invented links. There's one brief per day (Europe/Warsaw date). A second run that day is skipped unless you pass `--force`.

### Safety

- Article text is untrusted. Prompts put it inside delimiters and treat it as data, and the LLM has no tools.
- The **service role key** (full DB access) is used only by the pipeline. The dashboard gets only the **publishable key**, and Row Level Security lets a logged-in user read the data and edit the profile, nothing more. Sign-ups are disabled, so the only account is mine.
- Every run is recorded in `runs` (status, per-source counts, tokens, cost), and the dashboard header shows the last one.

### Cost

About $0.001 per article summary and about $0.01 per brief with `google/gemini-2.5-flash`. That's roughly **$1.50 a month** at about 40 articles a day. Supabase and the hosting are on free tiers.

## Project structure

```
ai_radar/
├─ pipeline/                 Node/TS pipeline (npm workspace)
│  ├─ src/
│  │  ├─ index.ts            CLI entry (npm run pipeline)
│  │  ├─ config.ts           env loading + validation
│  │  ├─ llm.ts              OpenRouter client (JSON, retries, cost)
│  │  ├─ adapters/           wordpress.ts, html.ts
│  │  ├─ steps/              fetch.ts, summarize.ts, brief.ts, runLog.ts
│  │  ├─ prompts/            summarize.md, brief.md  ← tune the LLM here
│  │  └─ lib/                http, text, url helpers
│  └─ test/                  vitest unit tests (no network)
├─ dashboard/                Vite + React app (npm workspace)
│  └─ src/                   App.tsx, components/, styles.css
├─ supabase/migrations/      SQL schema, RLS policies, seed data
├─ docs/
│  ├─ IMPLEMENTATION_PLAN.md milestones and status
│  └─ SOURCES.md             which sites work, which don't, and why
├─ .env.example              all settings, documented
└─ CLAUDE.md                 project context for Claude Code sessions
```

## Setup (first time)

Prerequisites: **Node.js 22+**, a **Supabase** project (free tier), and an **OpenRouter** API key.

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure**: copy the template and fill in the values (comments in the file explain each one):
   ```bash
   cp .env.example .env
   ```
   - Supabase dashboard → **Project Settings → API Keys**: the Project URL, the **publishable** key (`VITE_SUPABASE_ANON_KEY`), and the **secret** key (`SUPABASE_SERVICE_ROLE_KEY`)
   - `OPENROUTER_API_KEY` can live in `.env` or as a system environment variable (a system variable wins)
3. **Create the database**: apply the migrations (see [Supabase CLI](#supabase-cli-login-link-migrations) below):
   ```bash
   npm run db:push
   ```
4. **Create your login**: Supabase → **Authentication → Users → Add user** (tick *Auto Confirm User*). Then **Authentication → Sign In / Providers** → turn **off** *Allow new users to sign up*.
5. **Check everything is connected**:
   ```bash
   npm run pipeline -- --check
   ```
   Expected: `OK: config valid, database reachable, N sources configured.`

## Commands

All commands run from the repo root.

### Pipeline

| Command | What it does |
|---|---|
| `npm run pipeline` | Full run: fetch → summarize → brief |
| `npm run pipeline -- --step fetch` | Only fetch new articles |
| `npm run pipeline -- --step summarize` | Only summarize articles that have no summary yet |
| `npm run pipeline -- --step brief` | Only write today's brief (skipped if it exists) |
| `npm run pipeline -- --step brief --force` | Rewrite today's brief (e.g. after changing the prompt or profile) |
| `npm run pipeline -- --dry-run` | Run without writing to the database; prints what it would save. Summarize is capped at 3 articles |
| `npm run pipeline -- --step summarize --limit 10` | Cap how many articles get summarized (default 100) |
| `npm run pipeline -- --step brief --force --dry-run` | Preview a fresh brief in the terminal without saving it |
| `npm run pipeline -- --check` | Validate config and the database connection, then exit |
| `npm run pipeline -- --help` | List all options |

### Dashboard

| Command | What it does |
|---|---|
| `npm run dev` | Start the dashboard at http://localhost:5173 (hot reload) |
| `npm run build` | Typecheck and build to `dashboard/dist` |
| `npm run preview` | Serve the production build locally |

### Quality

| Command | What it does |
|---|---|
| `npm test` | Pipeline unit tests (vitest, no network, no DB) |
| `npm run typecheck` | TypeScript check for the pipeline and dashboard |

### Database

| Command | What it does |
|---|---|
| `npm run db:push` | Apply new migrations in `supabase/migrations/` to the linked project |

## Common tasks

**Add a WordPress site.** Check that its API answers (`https://SITE/wp-json/wp/v2/posts?per_page=1`), then add a migration:

```sql
insert into public.sources (name, adapter, config)
values ('Site Name', 'wordpress', '{"baseUrl": "https://site.com", "lang": "en"}');
-- optional: "categories": [123] to restrict to one category
```

**Add a site without an API** (HTML adapter):

```sql
insert into public.sources (name, adapter, config)
values ('Site Name', 'html',
  '{"listUrl": "https://site.com/blog", "linkPattern": "^/blog/[a-z0-9-]+$", "lang": "en"}');
-- optional: "contentSelector": "article, main", "maxArticles": 30, "delayMs": 500
```

Then run `npm run db:push` and `npm run pipeline -- --step fetch --dry-run` to see what it finds.

**Disable a source:** `update public.sources set enabled = false where name = '...';`

**Change what counts as relevant:** edit the profile on the dashboard (**Profile** tab). It applies from the next summarize and brief run.

**Tune the LLM output:** edit `pipeline/src/prompts/summarize.md` (scoring rubric) or `pipeline/src/prompts/brief.md` (sections, merging, ranking). Check the result with `npm run pipeline -- --step brief --force --dry-run`.

**Switch models:** set `OPENROUTER_MODEL_SUMMARY` / `OPENROUTER_MODEL_BRIEF` in `.env` to any model id from openrouter.ai/models.

## Supabase CLI (login, link, migrations)

The CLI is a dev dependency, so run it with `npx supabase ...` from the repo root.

### Norton 360 workaround (required on this machine)

Norton inspects HTTPS traffic with its own certificate. Browsers trust that certificate but the Supabase CLI doesn't, so every CLI call fails with `Transport error (GET https://api.supabase.com/...)`. Point the CLI at Norton's certificate.

Set it once, permanently, for your user account (then restart your terminals and the Claude app):

```powershell
[Environment]::SetEnvironmentVariable("SSL_CERT_FILE", "C:\ProgramData\Norton\Antivirus\wscert.pem", "User")
```

Or set it for the current PowerShell window only:

```powershell
$env:SSL_CERT_FILE = "C:\ProgramData\Norton\Antivirus\wscert.pem"
```

### Log in with an access token

The browser login with a verification code is unreliable here. Use a personal access token instead:

1. Go to https://supabase.com/dashboard/account/tokens → **Generate new token** (it starts with `sbp_`; it needs database write and project read permissions).
   - This is **not** the project's `sb_publishable_` or `sb_secret_` API key. Those keys go in `.env`; they won't work here.
2. Log in:
   ```powershell
   npx supabase login --token sbp_your_token
   ```

### Link the project (one time per machine)

```powershell
npx supabase link --project-ref <your-project-ref>
```

### Apply migrations

```powershell
npm run db:push   # = supabase db push --linked
```

New migrations go in `supabase/migrations/` as `YYYYMMDDHHMMSS_name.sql`.

If the CLI still fails, add `--debug` to see why. As a fallback, paste the SQL into the **SQL Editor** in the Supabase dashboard.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Invalid configuration: - X: ...` | A value is missing in `.env` (or the system env). The message names every missing key |
| A source shows `FAILED: HTTP 403` | Usually a bot challenge (Cloudflare "Just a moment..."). Disable the source; don't work around it |
| `Brief: skipped, brief for … already exists` | Expected on a second run the same day. Use `--force` to rewrite |
| `Brief: skipped, no new summarized articles` | Nothing new since the last brief. Run `--step fetch` and `--step summarize` first |
| Dashboard shows "No brief yet" | Run `npm run pipeline` once |
| Dashboard login: "Invalid login credentials" | Check the user in Supabase → Authentication → Users |
| Supabase CLI: `Transport error` | See the Norton workaround above |
| Supabase CLI: `Invalid access token` / `missing database_write` | Generate a new access token with database write permission and log in again |

## Status

Milestones M0–M6 are done: the full pipeline and the dashboard work locally. Next: **M7**, the daily run on GitHub Actions, and **M8**, the dashboard on Cloudflare Pages. See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
