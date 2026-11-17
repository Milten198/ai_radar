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

1. Go to https://supabase.com/dashboard/account/tokens → **Generate new token**. It starts with `sbp_`.
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
