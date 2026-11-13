-- AI Radar: initial schema
-- Single-user app. The pipeline writes with the service role key (bypasses RLS);
-- the dashboard reads as the one authenticated user.

-- Sources: one row per site. `adapter` picks the fetch code, `config` holds its settings.
create table public.sources (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  adapter     text not null check (adapter in ('wordpress', 'html', 'substack', 'hn', 'rss')),
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Articles: deduplicated by normalized URL.
create table public.articles (
  id            bigint generated always as identity primary key,
  source_id     bigint not null references public.sources (id) on delete cascade,
  url           text not null unique,
  title         text not null,
  author        text,
  published_at  timestamptz,
  content_text  text,
  lang          text,
  fetched_at    timestamptz not null default now()
);
create index articles_published_at_idx on public.articles (published_at desc);
create index articles_source_id_idx on public.articles (source_id);

-- One LLM summary per article.
create table public.article_summaries (
  article_id  bigint primary key references public.articles (id) on delete cascade,
  summary     text not null,
  key_points  jsonb not null default '[]'::jsonb,
  topics      text[] not null default '{}',
  relevance   smallint check (relevance between 1 and 5),
  model       text,
  tokens_in   integer,
  tokens_out  integer,
  created_at  timestamptz not null default now()
);

-- One brief per day. `content` = { tldr, trends, reading, learning } (validated by the pipeline).
create table public.briefs (
  id           bigint generated always as identity primary key,
  brief_date   date not null unique,
  content      jsonb not null,
  article_ids  bigint[] not null default '{}',
  model        text,
  tokens_in    integer,
  tokens_out   integer,
  created_at   timestamptz not null default now()
);

-- Pipeline run log.
create table public.runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  stats        jsonb not null default '{}'::jsonb,
  error        text
);
create index runs_started_at_idx on public.runs (started_at desc);

-- Interest profile used for ranking. Exactly one row.
create table public.profile (
  id          smallint primary key default 1 check (id = 1),
  interests   text not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: on everywhere. No policies for `anon` → anonymous sees nothing.
-- Public sign-ups are disabled in Supabase Auth, so `authenticated` = the owner.
-- ---------------------------------------------------------------------------
alter table public.sources           enable row level security;
alter table public.articles          enable row level security;
alter table public.article_summaries enable row level security;
alter table public.briefs            enable row level security;
alter table public.runs              enable row level security;
alter table public.profile           enable row level security;

create policy "owner reads sources"   on public.sources           for select to authenticated using (true);
create policy "owner reads articles"  on public.articles          for select to authenticated using (true);
create policy "owner reads summaries" on public.article_summaries for select to authenticated using (true);
create policy "owner reads briefs"    on public.briefs            for select to authenticated using (true);
create policy "owner reads runs"      on public.runs              for select to authenticated using (true);
create policy "owner reads profile"   on public.profile           for select to authenticated using (true);
create policy "owner edits profile"   on public.profile           for update to authenticated using (true) with check (true);
