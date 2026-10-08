import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/supabase/database.types.ts";
import { requireEnvironment } from "./load-env.ts";

export function createEvalDatabaseClient() {
  return createClient<Database>(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
