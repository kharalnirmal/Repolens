# RepoLens

A local app that parses public JavaScript and TypeScript repositories and maps
their real dependencies.

## Development

Set these values in `.env.local` or `.env`:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
GEMINI_API_KEY=
REPOLENS_AGENT_CREDENTIAL_SECRET=
LANGSMITH_TRACING=false
```

Generate `REPOLENS_AGENT_CREDENTIAL_SECRET` with `openssl rand -base64 32`. It
keeps the standalone agent credential endpoints available as a rollback path.

Ask runs inside the Next.js server application and uses `GEMINI_API_KEY`
directly. It does not require a LangSmith deployment. Keep
`LANGSMITH_TRACING=false` for the zero-cost configuration.

In Clerk, enable Organizations and configure:

- Membership: optional (`force_organization_selection: false`)
- Automatically create an organization for new users: on
- Default roles: unchanged

Membership must remain optional. Required membership shows Clerk's
create-organization task before automatic organization creation can land a new
account in the workspace.

Then run:

```bash
pnpm dev
```
