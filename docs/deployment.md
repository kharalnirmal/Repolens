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

## Vercel Hobby production

Deploy the repository as one Next.js project using Node.js 22 or newer. Configure
these Production values:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY

GEMINI_API_KEY
REPOLENS_AGENT_CREDENTIAL_SECRET

LANGSMITH_TRACING=false
```

Do not configure `REPOLENS_AGENT_URL`, `LANGSMITH_API_KEY`,
`LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, or `GOOGLE_API_KEY` for this
deployment. Secret keys must not use a `NEXT_PUBLIC_` prefix.

Create one Clerk webhook endpoint at
`https://<production-domain>/api/webhooks/clerk`. Subscribe only to
`organization.created`, `organization.updated`, and `organization.deleted`, then
store that endpoint's signing secret as `CLERK_WEBHOOK_SIGNING_SECRET` in
Vercel. For local delivery, use Clerk's webhook relay rather than a second tunnel
or webhook package, and put the local endpoint's separate signing secret in
`.env.local`.

Existing Clerk organizations do not emit historical creation events. Before
enabling public sign-up, compare them with `public.organizations` and insert or
update each missing row once. New organizations are synchronized by the webhook,
and repository submission reconciles the active organization to cover delayed
delivery.

Repository analysis runs in a Next.js `after()` callback. Vercel Hobby may end
the invocation after 300 seconds, so analysis beyond that duration is not
durable. Do not weaken repository or parser limits to hide this hosting limit.
