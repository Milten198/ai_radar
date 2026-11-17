import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { BriefPage } from "./components/BriefPage";
import { Header, type View } from "./components/Header";
import { HistoryPage } from "./components/HistoryPage";
import { Login } from "./components/Login";
import { ProfilePage } from "./components/ProfilePage";
import { supabase } from "./supabase";

/** View state lives in the URL hash so the back button and bookmarks work: #/, #/history, #/brief/2026-11-17, #/profile */
function parseHash(): { view: View; date?: string } {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "history") return { view: "history" };
  if (h === "profile") return { view: "profile" };
  const m = h.match(/^brief\/(\d{4}-\d{2}-\d{2})$/);
  if (m) return { view: "history", date: m[1] };
  return { view: "today" };
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  if (session === undefined) return <div className="center muted">Loading…</div>;
  if (!session) return <Login />;

  return (
    <>
      <Header view={route.view} email={session.user.email ?? ""} />
      <main className="container">
        {route.view === "today" && <BriefPage />}
        {route.view === "history" && (route.date ? <BriefPage date={route.date} /> : <HistoryPage />)}
        {route.view === "profile" && <ProfilePage />}
      </main>
    </>
  );
}
