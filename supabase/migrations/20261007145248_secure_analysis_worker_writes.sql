drop function if exists public.store_analysis_result(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
);

create or replace function public.set_analysis_run_state(
  p_analysis_id uuid,
  p_status text,
  p_stage text,
  p_status_message text,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt()) ->> 'role' is distinct from 'service_role' then
    raise exception 'Analysis state may only be changed by the analysis worker';
  end if;

  if p_status not in ('running', 'failed') then
    raise exception 'Invalid worker analysis status';
  end if;

  update public.analyses
  set
    status = p_status,
    stage = p_stage,
    status_message = p_status_message,
    error_message = p_error_message,
    started_at = case
      when p_status = 'running' then coalesce(started_at, now())
      else started_at
    end,
    completed_at = case when p_status = 'failed' then now() else null end,
    updated_at = now()
  where id = p_analysis_id
    and status in ('queued', 'running');

  if not found then
    raise exception 'Analysis is not queued or running';
  end if;
end;
$$;

create or replace function public.store_analysis_result(
  p_analysis_id uuid,
  p_commit_sha text,
  p_framework text,
  p_coverage jsonb,
  p_files jsonb,
  p_edges jsonb,
  p_file_roles jsonb default null,
  p_routes jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization_id text;
  current_status text;
  current_stage text;
  effective_file_roles jsonb;
  effective_routes jsonb := coalesce(p_routes, '[]'::jsonb);
  expected_route_count integer;
  inserted_edge_count integer;
  inserted_role_count integer;
  inserted_route_count integer;
begin
  if (select auth.jwt()) ->> 'role' is distinct from 'service_role' then
    raise exception 'Analysis results may only be stored by the analysis worker';
  end if;

  select organization_id, status, stage
  into current_organization_id, current_status, current_stage
  from public.analyses
  where id = p_analysis_id
  for update;

  if not found then
    raise exception 'Analysis not found';
  end if;

  if current_status <> 'running' or current_stage <> 'store' then
    raise exception 'Analysis is not ready to store results';
  end if;

  if jsonb_typeof(p_files) <> 'array'
    or jsonb_typeof(p_edges) <> 'array'
    or (p_file_roles is not null and jsonb_typeof(p_file_roles) <> 'array')
    or jsonb_typeof(effective_routes) <> 'array'
  then
    raise exception 'Files, edges, file roles and routes must be JSON arrays';
  end if;

  if p_file_roles is null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'file_path', parsed.value ->> 'path',
          'role', 'source',
          'source', 'fallback'
        )
      ),
      '[]'::jsonb
    )
    into effective_file_roles
    from jsonb_array_elements(p_files) as parsed(value);
  else
    effective_file_roles := p_file_roles;
  end if;

  if jsonb_array_length(effective_file_roles) <> jsonb_array_length(p_files) then
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
  from jsonb_to_recordset(effective_file_roles) as parsed(
    file_path text,
    role text,
    source text
  )
  join public.files as file
    on file.organization_id = current_organization_id
    and file.analysis_id = p_analysis_id
    and file.path = parsed.file_path;

  get diagnostics inserted_role_count = row_count;
  if inserted_role_count <> jsonb_array_length(effective_file_roles) then
    raise exception 'A file role referred to a file that was not stored';
  end if;

  with parsed_routes as (
    select *
    from jsonb_to_recordset(effective_routes) as parsed(
      file_path text,
      method text,
      path text
    )
  ),
  unambiguous_routes as (
    select min(file_path) as file_path, method, path
    from parsed_routes
    group by method, path
    having count(distinct file_path) = 1
  )
  select count(*)
  into expected_route_count
  from unambiguous_routes;

  with parsed_routes as (
    select *
    from jsonb_to_recordset(effective_routes) as parsed(
      file_path text,
      method text,
      path text
    )
  ),
  unambiguous_routes as (
    select min(file_path) as file_path, method, path
    from parsed_routes
    group by method, path
    having count(distinct file_path) = 1
  )
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
  from unambiguous_routes as parsed
  join public.files as file
    on file.organization_id = current_organization_id
    and file.analysis_id = p_analysis_id
    and file.path = parsed.file_path;

  get diagnostics inserted_route_count = row_count;
  if inserted_route_count <> expected_route_count then
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
    and organization_id = current_organization_id
    and status = 'running'
    and stage = 'store';

  if not found then
    raise exception 'Analysis state changed before results were stored';
  end if;
end;
$$;

revoke all on function public.set_analysis_run_state(uuid, text, text, text, text)
from public, anon, authenticated;
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

grant execute on function public.set_analysis_run_state(uuid, text, text, text, text)
to service_role;
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
to service_role;
