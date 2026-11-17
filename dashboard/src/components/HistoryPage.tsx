import { useEffect, useState } from "react";
import { shortDate } from "../format";
import { supabase } from "../supabase";
import type { BriefContent } from "../types";

interface Row {
  brief_date: string;
  tldr: BriefContent["tldr"];
}

export function HistoryPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("briefs")
      .select("brief_date, tldr:content->tldr")
      .order("brief_date", { ascending: false })
      .limit(90)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setRows((data as Row[] | null) ?? []);
      });
  }, []);

  if (error) return <p className="error">Could not load history: {error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  if (!rows.length) return <p className="muted">No briefs yet.</p>;

  return (
    <>
      <h1>All briefs</h1>
      <ul className="history">
        {rows.map((r) => (
          <li key={r.brief_date}>
            <a href={`#/brief/${r.brief_date}`} className="card history-item">
              <span className="history-date">{shortDate(r.brief_date)}</span>
              <span className="history-preview">{r.tldr?.[0]?.text ?? "—"}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
