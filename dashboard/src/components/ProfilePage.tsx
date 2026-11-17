import { useEffect, useState } from "react";
import { timeAgo } from "../format";
import { supabase } from "../supabase";

export function ProfilePage() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("profile")
      .select("interests, updated_at")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (error) return setStatus({ kind: "error", msg: error.message });
        setText(data.interests);
        setSaved(data.interests);
        setUpdatedAt(data.updated_at);
      });
  }, []);

  async function save() {
    setBusy(true);
    setStatus(null);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("profile")
      .update({ interests: text, updated_at: now })
      .eq("id", 1)
      .select("id");
    setBusy(false);
    if (error) return setStatus({ kind: "error", msg: error.message });
    // RLS can silently match 0 rows; treat that as a failure.
    if (!data?.length) return setStatus({ kind: "error", msg: "Not saved: no permission to update the profile." });
    setSaved(text);
    setUpdatedAt(now);
    setStatus({ kind: "ok", msg: "Saved. The next brief will use it." });
  }

  const dirty = text !== saved;

  return (
    <>
      <h1>Interest profile</h1>
      <p className="muted">
        The pipeline scores every article against this text and ranks the brief by it. Plain language works best: what
        to boost, what to push down.
      </p>
      <div className="card">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} spellCheck />
        <div className="row">
          <button className="btn primary" onClick={save} disabled={!dirty || busy || !text.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
          {dirty && (
            <button className="btn" onClick={() => setText(saved)} disabled={busy}>
              Discard changes
            </button>
          )}
          <span className="muted small">{updatedAt && `Last saved ${timeAgo(updatedAt)}`}</span>
        </div>
        {status && <p className={status.kind === "ok" ? "success" : "error"}>{status.msg}</p>}
      </div>
    </>
  );
}
