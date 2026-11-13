import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";

/** Server-side client with the service role key (bypasses RLS). Pipeline only. */
export function createDb(config: Config): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
