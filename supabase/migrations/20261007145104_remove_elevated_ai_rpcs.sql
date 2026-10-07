drop function if exists public.store_explanation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text[]
);

drop function if exists public.restart_analysis(uuid);

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
    and status in ('completed', 'failed');

  return found;
end;
$$;

revoke all on function public.restart_failed_analysis(uuid)
from public, anon, authenticated;
grant execute on function public.restart_failed_analysis(uuid) to authenticated;
