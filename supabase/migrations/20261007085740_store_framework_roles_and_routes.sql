drop function public.store_analysis_result(uuid, text, text, jsonb, jsonb, jsonb);

insert into public.file_roles (
  organization_id,
  analysis_id,
  file_id,
  role,
  source
)
select
  file.organization_id,
  file.analysis_id,
  file.id,
  'source',
  'fallback'
from public.files as file
where not exists (
  select 1
  from public.file_roles as file_role
  where file_role.organization_id = file.organization_id
    and file_role.analysis_id = file.analysis_id
    and file_role.file_id = file.id
);

create function public.store_analysis_result(
  p_analysis_id uuid,
  p_commit_sha text,
  p_framework text,
  p_coverage jsonb,
  p_files jsonb,
  p_edges jsonb,
  p_file_roles jsonb,
  p_routes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization_id text := coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  );
  inserted_edge_count integer;
  inserted_role_count integer;
  inserted_route_count integer;
begin
  if current_organization_id is null then
    raise exception 'An active organization is required';
  end if;

  perform 1
  from public.analyses
  where id = p_analysis_id
    and organization_id = current_organization_id
  for update;

  if not found then
    raise exception 'Analysis not found';
  end if;

  if jsonb_typeof(p_files) <> 'array'
    or jsonb_typeof(p_edges) <> 'array'
    or jsonb_typeof(p_file_roles) <> 'array'
    or jsonb_typeof(p_routes) <> 'array'
  then
    raise exception 'Files, edges, file roles and routes must be JSON arrays';
  end if;

  if jsonb_array_length(p_file_roles) <> jsonb_array_length(p_files) then
    raise exception 'Every file must have exactly one role';
  end if;

  delete from public.files
  where analysis_id = p_analysis_id
    and organization_id = current_organization_id;

  insert into public.files (
    organization_id,
    analysis_id,
    path,
    content,
    content_hash,
    line_count,
    module_kind,
    exports
  )
  select
    current_organization_id,
    p_analysis_id,
    parsed.path,
    parsed.content,
    parsed.content_hash,
    parsed.line_count,
    parsed.module_kind,
    parsed.exports
  from jsonb_to_recordset(p_files) as parsed(
    path text,
    content text,
    content_hash text,
    line_count integer,
    module_kind text,
    exports text[]
  );

  insert into public.edges (
    organization_id,
    analysis_id,
    source_file_id,
    target_file_id,
    kind,
    specifier
  )
  select
    current_organization_id,
    p_analysis_id,
    source.id,
    target.id,
    parsed.kind,
    parsed.specifier
  from jsonb_to_recordset(p_edges) as parsed(
    source_path text,
    target_path text,
    kind text,
    specifier text
  )
  join public.files as source
    on source.organization_id = current_organization_id
    and source.analysis_id = p_analysis_id
    and source.path = parsed.source_path
  join public.files as target
    on target.organization_id = current_organization_id
    and target.analysis_id = p_analysis_id
    and target.path = parsed.target_path;

  get diagnostics inserted_edge_count = row_count;
  if inserted_edge_count <> jsonb_array_length(p_edges) then
    raise exception 'An edge referred to a file that was not stored';
  end if;

  insert into public.file_roles (
    organization_id,
    analysis_id,
    file_id,
    role,
    source
  )
  select
    current_organization_id,
    p_analysis_id,
    file.id,
    parsed.role,
    parsed.source
  from jsonb_to_recordset(p_file_roles) as parsed(
    file_path text,
    role text,
    source text
  )
  join public.files as file
    on file.organization_id = current_organization_id
    and file.analysis_id = p_analysis_id
    and file.path = parsed.file_path;

  get diagnostics inserted_role_count = row_count;
  if inserted_role_count <> jsonb_array_length(p_file_roles) then
    raise exception 'A file role referred to a file that was not stored';
  end if;

  insert into public.routes (
    organization_id,
    analysis_id,
    file_id,
    method,
    path
  )
  select
    current_organization_id,
    p_analysis_id,
    file.id,
    parsed.method,
    parsed.path
  from jsonb_to_recordset(p_routes) as parsed(
    file_path text,
    method text,
    path text
  )
  join public.files as file
    on file.organization_id = current_organization_id
    and file.analysis_id = p_analysis_id
    and file.path = parsed.file_path;

  get diagnostics inserted_route_count = row_count;
  if inserted_route_count <> jsonb_array_length(p_routes) then
    raise exception 'A route referred to a file that was not stored';
  end if;

  update public.analyses
  set
    status = 'completed',
    stage = 'completed',
    status_message = 'Analysis complete',
    framework = p_framework,
    commit_sha = p_commit_sha,
    coverage = p_coverage,
    error_message = null,
    completed_at = now(),
    updated_at = now()
  where id = p_analysis_id
    and organization_id = current_organization_id;
end;
$$;

revoke all on function public.store_analysis_result(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute on function public.store_analysis_result(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
to authenticated;

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
            'module_kind', file.module_kind,
            'role', file_role.role,
            'role_source', file_role.source
          )
          order by file.path
        )
        from public.files as file
        join public.file_roles as file_role
          on file_role.organization_id = file.organization_id
          and file_role.analysis_id = file.analysis_id
          and file_role.file_id = file.id
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
        join public.files as source
          on source.organization_id = edge.organization_id
          and source.analysis_id = edge.analysis_id
          and source.id = edge.source_file_id
        join public.files as target
          on target.organization_id = edge.organization_id
          and target.analysis_id = edge.analysis_id
          and target.id = edge.target_file_id
        where edge.analysis_id = analysis.id
      ),
      '[]'::jsonb
    ),
    'routes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'file_path', file.path,
            'method', route.method,
            'path', route.path
          )
          order by route.path, route.method, file.path
        )
        from public.routes as route
        join public.files as file
          on file.organization_id = route.organization_id
          and file.analysis_id = route.analysis_id
          and file.id = route.file_id
        where route.analysis_id = analysis.id
      ),
      '[]'::jsonb
    )
  )
  from public.analyses as analysis
  join public.projects as project
    on project.organization_id = analysis.organization_id
    and project.id = analysis.project_id
  where analysis.id = p_analysis_id
    and analysis.status = 'completed';
$$;
