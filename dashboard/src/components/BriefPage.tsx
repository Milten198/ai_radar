import { useEffect, useState } from "react";
import { longDate } from "../format";
import { supabase } from "../supabase";
import type { ArticleLink, Brief } from "../types";

function Sources({ articles }: { articles: ArticleLink[] }) {
  if (!articles.length) return null;
  return (
    <span className="sources">
      {articles.map((a) => (
        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title={a.title} className="chip">
          {a.source}
        </a>
      ))}
    </span>
  );
}

/** Shows the brief for `date`, or the latest brief when no date is given. */
export function BriefPage({ date }: { date?: string }) {
  const [brief, setBrief] = useState<Brief | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBrief(undefined);
    let q = supabase.from("briefs").select("brief_date, content, article_ids, created_at");
    q = date ? q.eq("brief_date", date) : q.order("brief_date", { ascending: false }).limit(1);
    q.maybeSingle().then(({ data, error }) => {
      if (error) setError(error.message);
      setBrief(data as Brief | null);
    });
  }, [date]);

  if (error) return <p className="error">Could not load the brief: {error}</p>;
  if (brief === undefined) return <p className="muted">Loading…</p>;
  if (!brief) {
    return (
      <div className="card empty">
        <h2>No brief yet</h2>
        <p className="muted">
          Run <code>npm run pipeline</code> to fetch articles and write the first brief.
        </p>
      </div>
    );
  }

  const c = brief.content;
  return (
    <article className="brief">
      <div className="brief-head">
        {date && (
          <a href="#/history" className="back">
            ← All briefs
          </a>
        )}
        <h1>{longDate(brief.brief_date)}</h1>
        <p className="muted">
          {c.reading.length} stories picked from {brief.article_ids.length} articles
        </p>
      </div>

      <section className="card tldr">
        <h2>TL;DR</h2>
        <ul>
          {c.tldr.map((t, i) => (
            <li key={i}>
              {t.text} <Sources articles={t.articles} />
            </li>
          ))}
        </ul>
      </section>

      {c.trends.length > 0 && (
        <section>
          <h2 className="section-title">Trends</h2>
          <div className="trends">
            {c.trends.map((t, i) => (
              <div key={i} className="card trend">
                <h3>{t.topic}</h3>
                <p>{t.why}</p>
                <Sources articles={t.articles} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Worth reading</h2>
        <ol className="reading">
          {c.reading.map((r) => (
            <li key={r.rank} className="card story">
              <div className="rank" aria-hidden>
                {r.rank}
              </div>
              <div className="story-body">
                <h3>{r.title}</h3>
                <p>{r.summary}</p>
                {r.why_for_me && (
                  <p className="why">
                    <strong>Why for you:</strong> {r.why_for_me}
                  </p>
                )}
                <ul className="links">
                  {r.articles.map((a) => (
                    <li key={a.id}>
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.title}
                      </a>{" "}
                      <span className="muted">· {a.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {c.learning.length > 0 && (
        <section>
          <h2 className="section-title">Worth learning</h2>
          <div className="card">
            <ul className="learning">
              {c.learning.map((l, i) => (
                <li key={i}>
                  <strong>{l.skill}</strong>
                  <p>{l.why}</p>
                  <Sources articles={l.articles} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </article>
  );
}
