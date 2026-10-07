create or replace function public.create_or_get_analysis(
  p_repository_url text,
  p_repository_name text
)
returns table (
  analysis_id uuid,
  was_created boolean,
  analysis_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization_id text := coalesce(
    (select auth.jwt()) ->> 'org_id',
    (select auth.jwt()) -> 'o' ->> 'id'
  );
  selected_project_id uuid;
  selected_analysis_id uuid;
  selected_status text;
begin
  if current_organization_id is null then
    raise exception 'An active organization is required';
  end if;

  if p_repository_url !~ '^https://github\.com/[a-z0-9_.-]+/[a-z0-9_.-]+$'
    or nullif(trim(p_repository_name), '') is null then
    raise exception 'A canonical public GitHub repository URL is required';
  end if;

  insert into public.projects (
    organization_id,
    repository_url,
    repository_name
  )
  values (
    current_organization_id,
    p_repository_url,
    trim(p_repository_name)
  )
  on conflict (organization_id, repository_url)
  do update set repository_name = excluded.repository_name
  returning id into selected_project_id;

  insert into public.analyses (
    organization_id,
    project_id,
    status,
    stage,
    status_message
  )
  values (
    current_organization_id,
    selected_project_id,
    'queued',
    'queued',
    'Waiting to start'
  )
  on conflict (organization_id, project_id) do nothing
  returning id, status into selected_analysis_id, selected_status;

  if selected_analysis_id is not null then
    return query select selected_analysis_id, true, selected_status;
    return;
  end if;

  select existing.id, existing.status
  into selected_analysis_id, selected_status
  from public.analyses as existing
  where existing.organization_id = current_organization_id
    and existing.project_id = selected_project_id;

  return query select selected_analysis_id, false, selected_status;
end;
$$;

revoke all on function public.create_or_get_analysis(text, text)
from public, anon, authenticated;
grant execute on function public.create_or_get_analysis(text, text)
to authenticated;

create or replace function public.broadcast_analysis_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'status', new.status,
      'stage', new.stage,
      'message', new.status_message,
      'error', new.error_message
    ),
    'progress',
    'analysis:' || new.id::text || ':progress',
    true
  );

  return null;
end;
$$;

revoke execute on function public.broadcast_analysis_progress()
from public, anon, authenticated, service_role;

create trigger broadcast_analysis_progress_on_change
after update of status, stage, status_message, error_message
on public.analyses
for each row
when (
  old.status is distinct from new.status
  or old.stage is distinct from new.stage
  or old.status_message is distinct from new.status_message
  or old.error_message is distinct from new.error_message
)
execute function public.broadcast_analysis_progress();

create policy "Organization members can receive analysis progress"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and split_part((select realtime.topic()), ':', 1) = 'analysis'
  and split_part((select realtime.topic()), ':', 3) = 'progress'
  and exists (
    select 1
    from public.analyses
    where analyses.id::text = split_part((select realtime.topic()), ':', 2)
      and analyses.organization_id = coalesce(
        (select auth.jwt()) ->> 'org_id',
        (select auth.jwt()) -> 'o' ->> 'id'
      )
  )
);
