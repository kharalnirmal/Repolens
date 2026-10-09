# Phase 14 — Repository deletion

**Goal.** Keep the shared analysis list useful by letting organization admins
remove repositories that are no longer needed.

## Build

- Running, completed and failed analyses have a delete action in the recent
  analyses list for organization admins.
- Deletion asks for confirmation and names the repository before anything is
  removed.
- Deleting a repository permanently removes its analysis and all data owned by
  that analysis.
- Deleting a running analysis removes its project immediately. The in-flight
  worker can no longer write results for the deleted analysis.
- Queued analyses cannot be deleted before their worker starts.
- Organization members who are not admins cannot see the action or perform the
  deletion directly.
- Authorization and active-analysis protection are enforced by the database,
  not only by the interface.

## Acceptance check

1. As an organization admin, delete a completed or failed repository from the
   recent analyses list. Confirm that it disappears and its analysis URL no
   longer loads.
2. Cancel the confirmation. Confirm that the repository remains.
3. Start an analysis. Confirm that no delete action appears while it is queued,
   then delete it after it starts running and confirm that it disappears.
4. Sign in as an organization member. Confirm that no delete actions appear.
5. Switch organizations. Confirm that deleting in one organization cannot
   affect a repository in another.
