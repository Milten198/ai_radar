import { useEffect, useState } from "react";
import { timeAgo } from "../format";
import { supabase } from "../supabase";
import type { Run } from "../types";

export type View = "today" | "history" | "profile";

const LABEL: Record<Run["status"], string> = {
  success: "OK",
  partial: "partial",
  failed: "failed",
  running: "running",
};

function RunStatus() {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    supabase
      .from("runs")
      .select("id, started_at, finished_at, status, error")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setRun(data as Run | null));
  }, []);
  if (!run) return null;
  const when = run.finished_at ?? run.started_at;
  return (
    <span className={`run run-${run.status}`} title={run.error ?? `Run #${run.id}`}>
      <span className="dot" aria-hidden /> Last run {LABEL[run.status]} · {timeAgo(when)}
    </span>
  );
}

export function Header({ view, email }: { view: View; email: string }) {
  const tab = (v: View, href: string, label: string) => (
    <a href={href} className={view === v ? "tab active" : "tab"} aria-current={view === v ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <header className="header">
      <div className="container header-inner">
        <a href="#/" className="brand">
          <span className="logo" aria-hidden /> AI Radar
        </a>
        <nav className="tabs">
          {tab("today", "#/", "Today")}
          {tab("history", "#/history", "History")}
          {tab("profile", "#/profile", "Profile")}
        </nav>
        <div className="header-right">
          <RunStatus />
          <button className="btn link" onClick={() => supabase.auth.signOut()} title={email}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
