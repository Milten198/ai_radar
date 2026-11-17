import type { SupabaseClient } from "@supabase/supabase-js";

export type RunStatus = "success" | "partial" | "failed";

/** Insert a `runs` row with status "running"; returns its id. */
export async function startRun(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from("runs").insert({}).select("id").single();
  if (error) throw new Error(`start run: ${error.message}`);
  return data.id as number;
}

export async function finishRun(
  db: SupabaseClient,
  id: number,
  status: RunStatus,
  stats: Record<string, unknown>,
  errorMessage?: string,
): Promise<void> {
  const { error } = await db
    .from("runs")
    .update({ status, stats, error: errorMessage ?? null, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error(`finish run ${id}: ${error.message}`);
}
