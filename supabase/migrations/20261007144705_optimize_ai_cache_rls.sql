drop policy if exists "Organization members can read role classifications"
on public.role_classification_cache;

create policy "Organization members can read role classifications"
on public.role_classification_cache
for select
to authenticated
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);
