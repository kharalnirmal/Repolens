create or replace function public.restart_failed_analysis(p_analysis_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization_id text := coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  );
begin
  if current_organization_id is null then
    raise exception 'An active organization is required';
  end if;

  update public.analyses
  set
    status = 'queued',
    stage = null,
    status_message = 'Waiting to start',
    error_message = null,
    started_at = null,
    completed_at = null,
    updated_at = now()
  where id = p_analysis_id
    and organization_id = current_organization_id
    and status = 'failed';

  return found;
end;
$$;

create or replace function public.get_analysis_graph(p_analysis_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'framework', analysis.framework,
    'coverage', analysis.coverage,
    'repository_name', project.repository_name,
    'files', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', file.id,
            'path', file.path,
            'line_count', file.line_count,
            'module_kind', file.module_kind
          )
          order by file.path
        )
        from public.files as file
        where file.analysis_id = analysis.id
      ),
      '[]'::jsonb
    ),
    'edges', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'source_path', source.path,
            'target_path', target.path,
            'kind', edge.kind,
            'specifier', edge.specifier
          )
          order by source.path, target.path, edge.kind, edge.specifier
        )
        from public.edges as edge
        join public.files as source on source.id = edge.source_file_id
        join public.files as target on target.id = edge.target_file_id
        where edge.analysis_id = analysis.id
      ),
      '[]'::jsonb
    ),
    'route_count', (
      select count(*)
      from public.routes as route
      where route.analysis_id = analysis.id
    )
  )
  from public.analyses as analysis
  join public.projects as project
    on project.organization_id = analysis.organization_id
    and project.id = analysis.project_id
  where analysis.id = p_analysis_id
    and analysis.status = 'completed';
$$;

revoke all on function public.restart_failed_analysis(uuid)
from public, anon, authenticated;
revoke all on function public.get_analysis_graph(uuid)
from public, anon, authenticated;

grant execute on function public.restart_failed_analysis(uuid) to authenticated;
grant execute on function public.get_analysis_graph(uuid) to authenticated;
