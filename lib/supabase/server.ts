import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

type GetToken = () => Promise<string | null>;

export function createServerSupabaseClient(getToken: GetToken) {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: getToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
