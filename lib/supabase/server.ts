import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

type GetToken = () => Promise<string | null>;

export function createServerSupabaseClient(getToken: GetToken) {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: getToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
