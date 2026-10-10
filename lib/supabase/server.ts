import "server-only";

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

export function createPrivilegedSupabaseClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey?.trim()) {
    throw new Error("Missing required environment variable: SUPABASE_SECRET_KEY");
  }

  return createClient<Database>(env.supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
