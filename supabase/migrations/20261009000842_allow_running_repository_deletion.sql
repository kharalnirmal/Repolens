alter policy "Organization admins can delete inactive projects"
on public.projects
rename to "Organization admins can delete projects";

alter policy "Organization admins can delete projects"
on public.projects
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
      and analyses.status = 'queued'
  )
);
