# Zero-cost deployment plan

## Decision

Deploy RepoLens as one Next.js application on Vercel Hobby, with Supabase,
Clerk, and Gemini on their free tiers. Run the repository assistant inside the
Next.js application instead of deploying it through LangSmith.

This is the selected version of option 2. It is intended for a personal demo or
small portfolio deployment. It removes the LangSmith Plus requirement without
rewriting the parser, graph, database model, authentication flow, or interface.

## Non-negotiable safety rule

The deployment work must not change how RepoLens discovers files, resolves
imports, folds the graph, calculates insights, stores analyses, authorizes rows,
or renders the analysis canvas.

The embedded-agent migration is complete only when the existing Ask interface
still emits the same visible states and all existing terminal checks pass. Keep
the standalone `repolens-agent/` project unchanged until the embedded agent has
passed the production acceptance check. It is the rollback reference, not code
to delete during the migration.

## Target architecture

```text
Browser
  |
  v
Vercel: RepoLens Next.js application
  |-- Clerk: users, sessions, organizations
  |-- Supabase: Postgres, RLS, Realtime
  |-- GitHub: public repository archives and source files
  `-- Gemini: classification, explanations, and Ask responses
```

There is no deployed LangSmith Agent Server in this architecture. LangSmith
tracing remains optional and is disabled for the zero-cost deployment.

## Free-tier services

| Service | Plan | Purpose | Important limit |
| --- | --- | --- | --- |
| Vercel | Hobby | Next.js application and server functions | Functions have a 300-second maximum duration. Hobby is for personal, non-commercial use. |
| Supabase | Free | Database and Realtime | 500 MB database, free projects may pause after one week of inactivity. |
| Clerk | Hobby | Authentication and organizations | Free-tier user and organization limits apply. |
| Gemini API | Free quota | Model calls | Requests stop when the provider's free quota or rate limit is reached. |
| LangSmith | Not used | None in production | Do not configure a deployment or enable tracing. |

Free tiers and quotas can change. Confirm the provider dashboards immediately
before launch. A custom domain is optional; the generated `vercel.app` domain
costs nothing.

## Known limitation accepted for this deployment

Repository analysis currently runs in a Next.js `after()` callback. Vercel
Hobby can terminate the invocation after 300 seconds. Small and medium
repositories should be tested, but no document or configuration can make work
beyond that limit reliable.

This migration must not quietly claim to solve that limitation. Do not weaken
the repository size checks or parser checks to fit the host. If an analysis
times out, report it as a hosting limit. Durable analysis execution is a later,
separately specified change.

## Change boundary

### Allowed changes

- Add the minimum LangChain and Gemini integration packages to the root app.
- Move the repository assistant instructions into server-only application code.
- Define six in-process tools over the existing `runRepositoryTool` function.
- Replace the remote LangGraph SDK call in the agent-chat route with a local
  LangChain agent invocation.
- Preserve the current server-sent event contract used by `AskPanel`.
- Send a bounded conversation history from `AskPanel` so follow-up questions
  work without a remote thread database.
- Remove production requirements for `REPOLENS_AGENT_URL` and
  `LANGSMITH_API_KEY` after the embedded path passes acceptance.
- Update deployment documentation and environment examples.

### Forbidden changes

- No parser changes.
- No graph calculation or folding changes.
- No analysis database schema changes for the agent migration.
- No RLS weakening and no service-role key in browser code.
- No direct model access to Supabase.
- No model-generated file paths, dependencies, routes, or roles.
- No replacement of Clerk, Supabase, Gemini, React Flow, or Next.js.
- No visual redesign of the Ask panel.
- No removal of the standalone agent until production validation is complete.

## Embedded agent design

The current assistant has six read-only tools. That is a fixed-purpose agent,
so the embedded version should use LangChain `createAgent`, not Managed Deep
Agents or a custom LangGraph server.

The six tool names and meanings remain unchanged:

1. `get_analysis_summary`
2. `search_files`
3. `list_files_by_role`
4. `get_file_neighbors`
5. `walk_dependencies`
6. `get_route_table`

Each tool is created inside the authenticated request and closes over only:

- the authorized Supabase client;
- the analysis ID already checked by the route.

The tool calls the existing `runRepositoryTool` function directly. It must not
call the application's public tool API over HTTP and must not accept an analysis
ID, organization ID, credential, endpoint, or access token as a model argument.
This keeps tenant selection outside the model.

The system instructions remain behaviorally identical to
`repolens-agent/instructions.md`. In particular, every answer requires a tool
lookup during that turn, repository data is untrusted, absent evidence is never
invented, and the agent does not grade code.

Set a finite agent recursion limit. A bad model decision must end with a clear
error rather than an unbounded tool loop.

## Conversation continuity

The current remote service stores threads. Vercel memory cannot safely replace
that storage because function instances are temporary.

For the zero-cost version, the browser sends a bounded history of prior user and
assistant text with each question. The server validates roles, string lengths,
message count, and total characters before passing that history to the agent.
Tool results and credentials are never accepted from the browser as history.

This avoids a new database table and preserves follow-up questions. Clearing
the Ask panel clears the local history exactly as it does today.

Recommended server limits:

- At most 12 prior messages.
- At most 4,000 characters per message.
- At most 24,000 characters across the supplied history.
- The new question remains limited to 4,000 characters.

These numbers are implementation defaults, not user-configurable settings.

## Streaming contract

The Ask panel already consumes server-sent events. Keep these events:

| Event | Payload | Meaning |
| --- | --- | --- |
| `tool_call` | `{ id, name, detail }` | A repository lookup started. |
| `token` | `{ text }` | A response text fragment. |
| `error` | `{ message }` | The run stopped before completion. |
| `done` | `{}` | The run completed. |

The embedded route no longer needs a remote thread event. The client should not
display or depend on internal agent identifiers.

Preserve request cancellation: closing the browser request must stop the local
agent invocation and any pending model request where the library supports an
abort signal.

## Dependency plan

Do not install packages until implementation begins and the exact compatible
versions have been checked against the existing lockfile.

Expected root dependencies:

```text
langchain
@langchain/google-genai
```

The root already declares `@langchain/core` and `langsmith`. Keep one model
construction location in accordance with the project rules. Configure the
Gemini model with the existing `GEMINI_API_KEY`; do not introduce a second
provider key for the same service.

After the migration passes, remove `@langchain/langgraph-sdk` only if no other
application code imports it. Do not remove packages merely because they look
unused before confirming with a repository-wide search and a production build.

## Implementation sequence

### Stage 1: Freeze current behavior

1. Record a successful local Ask conversation with a summary question, a file
   search, a direct-neighbor question, and a follow-up question.
2. Record the visible tool-step labels and streaming behavior.
3. Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before editing.
4. Stop if any baseline check fails; do not mix an existing failure into the
   migration.

### Stage 2: Build the embedded agent in isolation

1. Add only the required root dependencies.
2. Add a server-only module that constructs the Gemini chat model and agent.
3. Adapt the six existing tool schemas without changing their names or output.
4. Reuse the existing agent instructions without weakening evidence rules.
5. Add bounded recursion and request cancellation.
6. Leave the current route behavior unchanged until this module typechecks.

### Stage 3: Switch the API boundary

1. Keep the route's Clerk authentication and analysis authorization checks.
2. Replace only the remote client, thread creation, and remote stream loop.
3. Stream the local agent through the existing SSE event names.
4. Change the client payload from `threadId` to validated bounded history.
5. Keep all current loading, clear, error, selected-file, and tool-step UI
   behavior.

### Stage 4: Verify before cleanup

1. Run `pnpm typecheck`.
2. Run `pnpm lint`.
3. Run `pnpm build`.
4. Run the phase 12 manual acceptance checks.
5. Verify a second organization cannot query the first organization's analysis.
6. Verify malformed history and oversized questions fail without a model call.
7. Verify cancelling a response leaves the interface usable for the next ask.
8. Verify an answer with no useful map evidence says that the map cannot answer.

Only after all checks pass may deployment-only remote-agent variables be
removed from the Vercel configuration.

## Production organization prerequisite

The current database requires a row in `public.organizations` matching the
active Clerk organization ID. The repository currently seeds development
organizations but does not synchronize newly created production organizations.

For a private one-user demo, insert the one production Clerk organization into
Supabase manually. This requires no application change but does not support
public onboarding.

For public sign-up, write a separate phase specification for a Clerk webhook
that synchronizes organization creation, updates, and deletion. Do not fold that
work into the embedded-agent migration; separate changes are easier to verify
and roll back.

## Production environment

Configure these values in Vercel Production settings:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
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

Do not configure these for the embedded production agent:

```text
REPOLENS_AGENT_URL
LANGSMITH_API_KEY
LANGSMITH_ENDPOINT
LANGSMITH_PROJECT
GOOGLE_API_KEY
```

`SUPABASE_SECRET_KEY`, `CLERK_SECRET_KEY`, `GEMINI_API_KEY`, and
`REPOLENS_AGENT_CREDENTIAL_SECRET` are server-only. They must never have a
`NEXT_PUBLIC_` prefix.

## External dashboard setup

### Clerk

1. Use a production Clerk instance.
2. Enable Organizations and the existing Admin and Member roles.
3. Add the production Vercel domain to the allowed application domains.
4. Keep `/sign-in` and `/sign-up` as the application paths.
5. Use Clerk's current Supabase integration setup.

### Supabase

1. Create or select the production project.
2. Apply every committed migration in timestamp order.
3. Configure Clerk under Authentication > Third-Party Auth.
4. Confirm Clerk session tokens receive the `authenticated` Postgres role.
5. Confirm RLS is enabled and run the security and performance advisors.
6. Use the publishable key in public configuration and the secret key only in
   Vercel server configuration.

### Gemini

1. Create an API key in Google AI Studio.
2. Restrict and monitor the key where Google supports it.
3. Set only `GEMINI_API_KEY` in Vercel.
4. Expect free-quota exhaustion to disable uncached AI operations until quota
   resets; parsing and stored maps must remain available.

### Vercel

1. Import the Git repository as one Next.js project.
2. Use Node.js 22 or newer, matching `package.json`.
3. Keep Fluid Compute enabled.
4. Add the production environment variables before the first production build.
5. Deploy from the branch that passed typecheck, lint, and build.
6. Do not deploy `repolens-agent/` as a second Vercel project.

## Production acceptance check

Run these manually against the production URL:

1. Open the signed-out landing page on desktop and mobile.
2. Sign up, sign in, select the expected organization, and sign out again.
3. Submit a small public TypeScript or JavaScript repository.
4. Watch Fetch, Select, Parse, and Store update through Realtime.
5. Open the completed map and verify Filters, Map, and Details on mobile.
6. Select a file and request an explanation.
7. Ask for the repository summary and confirm at least one tool step appears.
8. Ask for a known file, then ask a follow-up about its direct dependencies.
9. Ask about an absent file and confirm no path or relationship is invented.
10. Clear the chat and confirm the next question starts without prior context.
11. Switch organizations and confirm the earlier analysis is not visible.
12. As an organization admin, delete the test repository.

The deployment is not complete if any check is skipped because it is
inconvenient. Record provider errors and fix them rather than adding fallback
data or weakening authorization.

## Rollback

If the embedded Ask path fails after deployment:

1. Roll Vercel back to the last known-good deployment.
2. Leave the parser output and database rows untouched.
3. Do not delete `repolens-agent/` or its instructions during rollback.
4. Keep LangSmith tracing disabled unless it is deliberately enabled for
   diagnosis within the free trace allowance.
5. Fix forward in a new deployment after local typecheck, lint, build, and the
   Ask acceptance check pass.

Rollback does not make LangSmith agent hosting free. It only restores the
previous code while the Ask feature remains unconfigured.

## Definition of done

- One Vercel project serves the interface, APIs, analysis pipeline, and Ask
  agent.
- No LangSmith deployment is required.
- The Ask agent uses only the six evidence tools.
- Follow-up questions work through bounded browser-supplied history.
- Tenant authorization remains enforced before tool execution.
- Existing parser, graph, analysis, explanation, and deletion behavior is
  unchanged.
- Typecheck, lint, and production build pass.
- The complete production acceptance check passes.
- The known 300-second Vercel analysis limit is documented, not hidden.
