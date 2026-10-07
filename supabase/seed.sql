insert into public.organizations (id, name)
values
  ('org_3KKklkay9qhiu6pNO1sAEAkvlyk', 'NYXEN''s Organization'),
  ('org_3KKoVfrHArli4gNcJHFeNMGjP3q', 'Nirmal')
on conflict (id) do update set name = excluded.name;

insert into public.projects (organization_id, repository_url, repository_name)
values
  (
    'org_3KKklkay9qhiu6pNO1sAEAkvlyk',
    'https://github.com/vercel/next.js',
    'vercel/next.js'
  ),
  (
    'org_3KKklkay9qhiu6pNO1sAEAkvlyk',
    'https://github.com/supabase/supabase',
    'supabase/supabase'
  ),
  (
    'org_3KKoVfrHArli4gNcJHFeNMGjP3q',
    'https://github.com/microsoft/TypeScript',
    'microsoft/TypeScript'
  )
on conflict (organization_id, repository_url) do nothing;

insert into public.analyses (
  organization_id,
  project_id,
  status,
  stage,
  status_message,
  started_at,
  completed_at,
  created_at
)
select
  project.organization_id,
  project.id,
  seed.status,
  seed.stage,
  seed.status_message,
  seed.started_at,
  seed.completed_at,
  seed.created_at
from (
  values
    (
      'org_3KKklkay9qhiu6pNO1sAEAkvlyk',
      'https://github.com/vercel/next.js',
      'completed',
      'stored',
      'Analysis complete',
      now() - interval '2 hours',
      now() - interval '110 minutes',
      now() - interval '2 hours'
    ),
    (
      'org_3KKklkay9qhiu6pNO1sAEAkvlyk',
      'https://github.com/supabase/supabase',
      'running',
      'parsing',
      'Resolving imports',
      now() - interval '2 minutes',
      null,
      now() - interval '2 minutes'
    ),
    (
      'org_3KKoVfrHArli4gNcJHFeNMGjP3q',
      'https://github.com/microsoft/TypeScript',
      'failed',
      'fetching',
      'Repository archive could not be fetched',
      now() - interval '1 day',
      now() - interval '1 day',
      now() - interval '1 day'
    )
) as seed(
  organization_id,
  repository_url,
  status,
  stage,
  status_message,
  started_at,
  completed_at,
  created_at
)
join public.projects as project
  on project.organization_id = seed.organization_id
  and project.repository_url = seed.repository_url
on conflict (organization_id, project_id) do update
set
  status = excluded.status,
  stage = excluded.stage,
  status_message = excluded.status_message,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  created_at = excluded.created_at;
