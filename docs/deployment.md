# Deployment

## Analysis worker security migration

The analysis worker uses `SUPABASE_SECRET_KEY` only in server code. Configure it
in every application environment before deploying the worker changes. Never use
a `NEXT_PUBLIC_` prefix for this value.

Deploy `20261007183848_secure_analysis_worker_writes.sql` in this order:

1. Configure `SUPABASE_SECRET_KEY` in the application environment.
2. Deploy the application. It prefers the service-role worker and temporarily
   falls back to the signed-in caller when the old database function still
   requires an organization claim. It also retries the old six-argument storage
   signature when necessary.
3. Apply every pending database migration in timestamp order. The security
   migration removes worker RPC access from
   `authenticated`; verify the security advisor no longer reports
   `set_analysis_run_state` or `store_analysis_result`.
4. Run one analysis before removing the transitional application fallback in a
   later release.

Do not roll back only the application after step 3. To roll back, first apply a
reviewed database rollback that restores the previous worker function bodies
and their `authenticated` grants, then roll back the application. This briefly
reopens the write exposure, so roll forward instead whenever possible.
