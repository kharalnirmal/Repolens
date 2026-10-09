# Phase 15 — Zero-cost deployment

**Goal.** Deploy RepoLens as one Next.js application on Vercel Hobby without a
LangSmith Agent Server, while preserving every existing product behavior and
authorization boundary.

The repository assistant moves into the Next.js server application. Supabase,
Clerk and Gemini remain the database, identity and model providers. LangSmith
tracing is disabled in the zero-cost production deployment.

## Safety boundary

- Do not change file discovery, import resolution, graph folding, graph
  calculations, framework adapters, analysis storage, row-level security or the
  analysis canvas.
- Do not weaken repository limits or parser checks to accommodate Vercel.
- Do not let the model select an analysis, organization, credential, endpoint
  or access token.
- Do not give the model direct database access. Each tool closes over the
  already-authorized Supabase client and analysis ID.
- Do not remove or change `repolens-agent/` before production acceptance. It is
  the rollback reference.
- Do not redesign the Ask panel or change its visible loading, error, clear,
  selected-file or tool-step behavior.
- Do not add a database table, worker, queue or second deployed application.

## Build

### Embedded assistant

- Add a server-only LangChain agent to the Next.js application using
  `createAgent` and Gemini.
- Use the supported `@langchain/google` integration rather than the deprecated
  `@langchain/google-genai` package. Pass the existing `GEMINI_API_KEY`
  explicitly; do not introduce `GOOGLE_API_KEY`.
- Keep model construction at the application's existing central AI client
  boundary so model calls cannot bypass the shared configuration.
- Keep the model used by the current assistant unless provider availability
  requires a separately approved change.
- Carry the behavior of `repolens-agent/instructions.md` into server-only
  application code without weakening its evidence, refusal or prompt-injection
  rules.
- Set a finite recursion limit. A tool loop must end with a clear error rather
  than run without a bound.
- Pass request cancellation to the agent and model where the libraries support
  an abort signal.

### Repository tools

The embedded assistant has exactly these six tools, with their existing names,
meanings, input bounds and output data:

1. `get_analysis_summary`
2. `search_files`
3. `list_files_by_role`
4. `get_file_neighbors`
5. `walk_dependencies`
6. `get_route_table`

- Define the tools inside the authenticated request after the analysis has been
  authorized.
- Each tool calls the existing `runRepositoryTool` function directly. It must
  not call RepoLens over HTTP or reimplement graph calculations.
- Tool arguments contain only lookup inputs such as a path fragment, role,
  exact file path, direction, depth or limit.
- Tool results and repository content are untrusted data, never instructions.
- Every answer, including every follow-up answer and refusal, requires at least
  one repository tool call during that turn.

### Agent chat route

- Keep the route's Clerk authentication, organization requirement, RLS-backed
  analysis lookup, organization match and completed-analysis requirement.
- Replace only remote agent configuration, thread management, credential
  minting and the LangGraph SDK run with the local LangChain agent.
- An unavailable or failed model must not affect the map, graph calculations,
  explanations or other application behavior.
- Malformed input and limit violations must be rejected before constructing or
  invoking the agent.

The route continues to emit server-sent events with this contract:

| Event | Payload | Meaning |
| --- | --- | --- |
| `tool_call` | `{ id, name, detail }` | A repository lookup started. |
| `token` | `{ text }` | A response text fragment. |
| `error` | `{ message }` | The run stopped before completion. |
| `done` | `{}` | The run completed. |

The route no longer emits `thread`, and the browser does not receive or depend
on an internal agent or thread identifier.

### Conversation continuity

- Replace browser `threadId` state with prior user and assistant text sent on
  each request.
- Send no tool results, credentials or internal agent data as history.
- Preserve the existing selected-file context on the new question.
- Clearing Ask clears the local conversation and the next request carries no
  prior history.

Validate these fixed server limits:

- At most 12 prior messages.
- Roles are only `user` or `assistant`.
- Message text is non-empty and at most 4,000 characters.
- Prior history is at most 24,000 characters in total.
- The new question is non-empty and at most 4,000 characters.

Oversized values are rejected, not silently truncated. The browser may send
only the most recent history that fits these limits, preserving message order.

### Dependencies and cleanup

- Check exact versions against the root lockfile before installation.
- Add only the root dependencies required for LangChain, the supported Gemini
  integration and tool schemas.
- Remove `@langchain/langgraph-sdk` only after a repository-wide search confirms
  the embedded application no longer imports it and the production build
  passes.
- Keep the standalone agent, credential endpoint, delegated tool API and
  credential-signing code through production acceptance so rollback remains
  possible.

### Deployment configuration

Document these Vercel Production values:

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

Do not configure `REPOLENS_AGENT_URL`, `LANGSMITH_API_KEY`,
`LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT` or `GOOGLE_API_KEY` for the embedded
production assistant. Secret keys must remain server-only.

The production Clerk organization must have a matching row in
`public.organizations`. This phase supports a manually provisioned private demo;
public organization synchronization requires a separate webhook phase.

## Hosting limit

Repository analysis still runs in a Next.js `after()` callback. Vercel Hobby may
terminate it after 300 seconds. This phase documents that limit but does not
claim to make analysis durable or change parser behavior to fit it.

## Verification

Before editing application code, run `pnpm typecheck`, `pnpm lint` and
`pnpm build`. Stop if a baseline check fails.

After implementation:

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- Confirm malformed history and oversized questions fail before a model call.
- Confirm cancellation leaves Ask usable for the next question.
- Confirm a second organization cannot query the first organization's analysis.
- Confirm a question unsupported by map evidence says the map cannot answer it.

## Acceptance check

1. Open the signed-out landing page on desktop and mobile.
2. Sign up, sign in, select the expected organization and sign out again.
3. Submit a small public TypeScript or JavaScript repository.
4. Watch Fetch, Select, Parse and Store update through Realtime.
5. Open the completed map and verify Filters, Map and Details on mobile.
6. Select a file and request an explanation.
7. Ask for the repository summary and confirm at least one tool step appears.
8. Ask for a known file, then ask a follow-up about its direct dependencies.
9. Ask about an absent file and confirm no path or relationship is invented.
10. Ask a question the graph cannot answer and confirm the assistant declines.
11. Clear the chat and confirm the next question has no prior context.
12. Cancel a response and confirm the next question works.
13. Switch organizations and confirm the earlier analysis is not visible or
    queryable.
14. As an organization admin, delete the test repository.

## Definition of done

- One Vercel project serves the interface, APIs, analysis pipeline and Ask
  assistant.
- Production requires no LangSmith deployment or tracing subscription.
- The assistant uses only the six evidence tools and every turn performs a
  lookup.
- Follow-up questions work through bounded browser-supplied text history.
- Tenant authorization remains enforced before any tool can execute.
- Parser, graph, storage, explanation, deletion and canvas behavior are
  unchanged.
- The standalone agent remains available as the rollback reference until the
  complete production acceptance check passes.
- Typecheck, lint, build and the complete production acceptance check pass.
- The 300-second Vercel analysis limit is documented rather than hidden.
