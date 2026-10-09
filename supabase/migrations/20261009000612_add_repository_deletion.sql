grant delete on table public.projects to authenticated;

create policy "Organization admins can delete inactive projects"
on public.projects
for delete
to authenticated
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
  and (
    (select auth.jwt()) ->> 'org_role' = 'org:admin'
    or (select auth.jwt()) -> 'o' ->> 'rol' = 'admin'
  )
  and not exists (
    select 1
    from public.analyses
    where analyses.organization_id = projects.organization_id
      and analyses.project_id = projects.id
      and analyses.status in ('queued', 'running')
  )
);

create function public.delete_repository_project(p_project_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  delete from public.projects
  where id = p_project_id;

  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end;
$$;

revoke all on function public.delete_repository_project(uuid) from public;
grant execute on function public.delete_repository_project(uuid) to authenticated;
