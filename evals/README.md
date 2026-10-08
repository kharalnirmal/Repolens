# RepoLens evals

All commands load the same `.env*` files and precedence as Next.js.

- `pnpm eval:paths` reports the deterministic invented-path score from recent
  live explanation checks in `LANGSMITH_PROJECT`. A flagged path is printed
  with its trace link.
- `pnpm eval:paths -- --text "See src/made-up.ts" --paths src/real.ts` checks
  supplied text directly and exits non-zero when it finds an invented path.
- `pnpm eval:roles` classifies recent stored files and files in the current
  checkout whose adapter supplied an allowed conventional role. It refuses to
  run with fewer than 30 examples.
- `pnpm eval:prompts` reconstructs recent real explanation contexts, runs the
  current and retired prompts as separate LangSmith experiments, and creates a
  pairwise comparison view.

Prompt usefulness and pairwise preference are model-judged. Those scores are
subjective evidence, not exact ground truth. The invented-path and role scores
use deterministic comparison.

The scripts require `GEMINI_API_KEY`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`,
`NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SECRET_KEY` as applicable. Prompt
comparison makes five model calls per case: two answers, two scalar judges, and
one pairwise judge.
