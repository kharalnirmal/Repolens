create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  command record;
begin
  for command in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if command.schema_name = 'public' then
      execute format(
        'alter table if exists %s enable row level security',
        command.object_identity
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function public.rls_auto_enable();

create table public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  repository_url text not null,
  repository_name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, repository_url)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  stage text,
  status_message text,
  framework text,
  commit_sha text,
  coverage jsonb,
  error_message text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete cascade
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  content text not null,
  content_hash text not null,
  line_count integer not null check (line_count >= 0),
  module_kind text,
  exports text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_id, id),
  unique (organization_id, analysis_id, path),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind text not null check (kind in ('import', 're-export', 'dynamic-import', 'require')),
  specifier text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_id, source_file_id, target_file_id, kind, specifier),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  foreign key (organization_id, analysis_id, source_file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade,
  foreign key (organization_id, analysis_id, target_file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_id, method, path),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid,
  folder_path text,
  content_hash text not null,
  model text not null,
  prompt_version text not null,
  content text not null,
  shown_paths text[] not null,
  created_at timestamptz not null default now(),
  check ((file_id is null) <> (folder_path is null)),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null,
  source text not null check (source in ('convention', 'model', 'fallback')),
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_id, file_id),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid,
  kind text not null check (kind in ('nothing-imports', 'high-fan-in', 'oversized', 'cycle')),
  related_file_ids uuid[] not null default '{}',
  observed_value integer,
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create index projects_organization_id_idx on public.projects (organization_id);
create index analyses_organization_id_idx on public.analyses (organization_id);
create index files_organization_id_idx on public.files (organization_id);
create index edges_organization_id_idx on public.edges (organization_id);
create index routes_organization_id_idx on public.routes (organization_id);
create index explanations_organization_id_idx on public.explanations (organization_id);
create index file_roles_organization_id_idx on public.file_roles (organization_id);
create index insights_organization_id_idx on public.insights (organization_id);

alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

revoke all on table
  public.organizations,
  public.projects,
  public.analyses,
  public.files,
  public.edges,
  public.routes,
  public.explanations,
  public.file_roles,
  public.insights
from anon, authenticated;

grant select on table
  public.organizations,
  public.projects,
  public.analyses,
  public.files,
  public.edges,
  public.routes,
  public.explanations,
  public.file_roles,
  public.insights
to authenticated;

create policy "Organization members can read their organization"
on public.organizations
for select
to authenticated
using (
  id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read projects"
on public.projects
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read analyses"
on public.analyses
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read files"
on public.files
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read edges"
on public.edges
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read routes"
on public.routes
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read explanations"
on public.explanations
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read file roles"
on public.file_roles
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);

create policy "Organization members can read insights"
on public.insights
for select
to authenticated
using (
  organization_id = (select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id'))
);
