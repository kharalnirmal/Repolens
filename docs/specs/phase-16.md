# Phase 16 — Clerk organization synchronization

**Goal.** Support public sign-up by keeping Clerk organizations synchronized
with `public.organizations`, so a new organization can create a repository
without manual database provisioning.

## Safety boundary

- Do not change parsing, import resolution, graph calculations, analysis
  storage, row-level security or the analysis canvas.
- Clerk remains the source of truth for organization identity and names.
- Never accept an organization ID or name from an unverified request body.
- The webhook endpoint is public because Clerk sends no user session. Every
  delivery must be verified with Clerk's signing secret before its body is
  used.
- Keep privileged Supabase credentials server-only.
- Organization deletion remains destructive. Deleting the organization row
  uses the existing foreign-key cascades to remove all of its RepoLens data.

## Build

### Organization lifecycle

- Handle Clerk `organization.created`, `organization.updated` and
  `organization.deleted` events.
- Creation and update upsert the verified Clerk organization ID and name into
  `public.organizations`.
- Deletion removes the matching organization row. A delivery for an already
  absent organization succeeds without inventing replacement data.
- Repeated deliveries are idempotent and safe to replay from Clerk.
- Unsupported verified event types are acknowledged without changing data.
- Invalid signatures return a client error and perform no database operation.
- Database failures return a server error so Clerk can retry the delivery.

### First-use race

Clerk webhooks are eventually consistent. Repository creation must not assume
the organization webhook has already arrived.

- Before creating an analysis, read the active organization ID from the
  authenticated Clerk session.
- Fetch that same organization from Clerk's Backend API and upsert its ID and
  current name with the server-only Supabase client.
- Do not accept a caller-supplied organization ID for this reconciliation.
- If Clerk cannot confirm the active organization or Supabase cannot store it,
  return a clear repository-creation error and do not start an analysis.
- Keep the existing RLS-backed analysis creation function and tenant boundary
  unchanged after reconciliation.

### Deployment configuration

- Add `CLERK_WEBHOOK_SIGNING_SECRET` to the documented local and Vercel
  environment variables. It must never use a `NEXT_PUBLIC_` prefix.
- Configure one Clerk webhook endpoint at the production application's HTTPS
  URL and subscribe only to the three organization lifecycle events.
- Existing Clerk organizations do not emit historical creation events. Before
  enabling public sign-up, confirm each existing Clerk organization has a
  matching database row or backfill it once.
- Local webhook testing may use Clerk's webhook relay. Do not install a second
  tunnel or webhook package.

## Verification

Before implementation:

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.

After implementation:

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- Confirm an invalid webhook signature changes no organization row.
- Confirm replaying creation, update and deletion deliveries is idempotent.
- Confirm repository creation still uses the active session organization and
  the existing RLS-backed database function.

## Acceptance check

1. Create a new Clerk account and organization, then immediately submit a
   small public repository. Confirm no foreign-key error appears.
2. Confirm the new Clerk organization has one matching row in
   `public.organizations` with the correct name.
3. Rename the organization in Clerk. Confirm the database name updates without
   changing its ID or repository data.
4. Replay the creation and update deliveries in Clerk. Confirm no duplicate
   organization or repository data appears.
5. Send a request with an invalid signature. Confirm it is rejected and no
   organization data changes.
6. Switch to a second organization. Confirm the first organization's analyses
   remain invisible and cannot be queried.
7. Using a disposable organization, delete it in Clerk. Confirm its
   organization row and RepoLens data are removed.
8. Replay the deletion delivery. Confirm it succeeds without restoring data or
   producing a new error.

## Definition of done

- New Clerk organizations need no manual Supabase provisioning.
- Organization names and deletions are synchronized from verified Clerk
  events.
- Immediate repository submission works even when webhook delivery is delayed.
- Webhook retries cannot create duplicate data.
- Tenant isolation remains enforced by the existing database policies.
- Typecheck, lint, build and the complete acceptance check pass.
