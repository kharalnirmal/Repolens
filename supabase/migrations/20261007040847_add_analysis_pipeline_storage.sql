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
declare
  current_organization_id text := coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  );
begin
  if current_organization_id is null then
    raise exception 'An active organization is required';
  end if;

  if p_status not in ('queued', 'running', 'completed', 'failed') then
    raise exception 'Invalid analysis status';
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
    completed_at = case
      when p_status in ('completed', 'failed') then now()
      else null
    end,
    updated_at = now()
  where id = p_analysis_id
    and organization_id = current_organization_id;

  if not found then
    raise exception 'Analysis not found';
  end if;
end;
$$;

create or replace function public.store_analysis_result(
  p_analysis_id uuid,
  p_commit_sha text,
  p_framework text,
  p_coverage jsonb,
  p_files jsonb,
  p_edges jsonb
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

  if jsonb_typeof(p_files) <> 'array' or jsonb_typeof(p_edges) <> 'array' then
    raise exception 'Files and edges must be JSON arrays';
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

revoke all on function public.set_analysis_run_state(uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.store_analysis_result(uuid, text, text, jsonb, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.set_analysis_run_state(uuid, text, text, text, text)
to authenticated;
grant execute on function public.store_analysis_result(uuid, text, text, jsonb, jsonb, jsonb)
to authenticated;
