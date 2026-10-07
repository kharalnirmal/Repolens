alter policy "Organization members can read their organization"
on public.organizations
using (
  id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read projects"
on public.projects
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read analyses"
on public.analyses
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read files"
on public.files
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read edges"
on public.edges
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read routes"
on public.routes
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read explanations"
on public.explanations
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read file roles"
on public.file_roles
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

alter policy "Organization members can read insights"
on public.insights
using (
  organization_id = coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  )
);

drop index public.projects_organization_id_idx;
drop index public.analyses_organization_id_idx;
drop index public.files_organization_id_idx;
drop index public.edges_organization_id_idx;
drop index public.routes_organization_id_idx;
drop index public.explanations_organization_id_idx;
drop index public.file_roles_organization_id_idx;
drop index public.insights_organization_id_idx;

create index edges_target_file_id_idx
on public.edges (organization_id, analysis_id, target_file_id);

create index routes_file_id_idx
on public.routes (organization_id, analysis_id, file_id);

create index explanations_file_id_idx
on public.explanations (organization_id, analysis_id, file_id);

create index insights_file_id_idx
on public.insights (organization_id, analysis_id, file_id);
