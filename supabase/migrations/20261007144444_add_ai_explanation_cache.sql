create unique index explanations_file_cache_key_idx
on public.explanations (
  organization_id,
  analysis_id,
  file_id,
  content_hash,
  model,
  prompt_version
)
where file_id is not null;

create unique index explanations_folder_cache_key_idx
on public.explanations (
  organization_id,
  analysis_id,
  folder_path,
  content_hash,
  model,
  prompt_version
)
where folder_path is not null;

create table public.role_classification_cache (
  organization_id text not null references public.organizations (id) on delete cascade,
  content_hash text not null,
  model text not null,
  prompt_version text not null,
  role text not null check (
    role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook')
  ),
  created_at timestamptz not null default now(),
  primary key (organization_id, content_hash, model, prompt_version)
);

alter table public.role_classification_cache enable row level security;

revoke all on table public.role_classification_cache from anon, authenticated;
grant select on table public.role_classification_cache to authenticated;
grant all on table public.role_classification_cache to service_role;

create policy "Organization members can read role classifications"
on public.role_classification_cache
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create or replace function public.store_explanation(
  p_analysis_id uuid,
  p_target_kind text,
  p_target_path text,
  p_content_hash text,
  p_model text,
  p_prompt_version text,
  p_content text,
  p_shown_paths text[]
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
  current_file_id uuid;
begin
  if current_organization_id is null then
    raise exception 'An active organization is required';
  end if;
  if p_target_kind not in ('file', 'folder') then
    raise exception 'Invalid explanation target';
  end if;
  if not exists (
    select 1
    from public.analyses
    where id = p_analysis_id
      and organization_id = current_organization_id
      and status = 'completed'
  ) then
    raise exception 'Completed analysis not found';
  end if;

  if p_target_kind = 'file' then
    select id
    into current_file_id
    from public.files
    where organization_id = current_organization_id
      and analysis_id = p_analysis_id
      and path = p_target_path;

    if current_file_id is null then
      raise exception 'Explanation file not found';
    end if;
  elsif not exists (
    select 1
    from public.files
    where organization_id = current_organization_id
      and analysis_id = p_analysis_id
      and (p_target_path = '.' or path like replace(p_target_path, '%', '\%') || '/%' escape '\')
  ) then
    raise exception 'Explanation folder not found';
  end if;

  insert into public.explanations (
    organization_id,
    analysis_id,
    file_id,
    folder_path,
    content_hash,
    model,
    prompt_version,
    content,
    shown_paths
  ) values (
    current_organization_id,
    p_analysis_id,
    current_file_id,
    case when p_target_kind = 'folder' then p_target_path end,
    p_content_hash,
    p_model,
    p_prompt_version,
    p_content,
    p_shown_paths
  )
  on conflict do nothing;
end;
$$;

create or replace function public.restart_analysis(p_analysis_id uuid)
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

revoke all on function public.store_explanation(uuid, text, text, text, text, text, text, text[])
from public, anon, authenticated;
revoke all on function public.restart_analysis(uuid)
from public, anon, authenticated;

grant execute on function public.store_explanation(uuid, text, text, text, text, text, text, text[])
to authenticated;
grant execute on function public.restart_analysis(uuid) to authenticated;
