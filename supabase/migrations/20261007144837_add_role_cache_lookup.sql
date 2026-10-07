create or replace function public.get_role_classifications(
  p_organization_id text,
  p_content_hashes text[],
  p_model text,
  p_prompt_version text
)
returns table (content_hash text, role text)
language sql
stable
security invoker
set search_path = ''
as $$
  select cache.content_hash, cache.role
  from public.role_classification_cache as cache
  where cache.organization_id = p_organization_id
    and cache.content_hash = any(p_content_hashes)
    and cache.model = p_model
    and cache.prompt_version = p_prompt_version;
$$;

revoke all on function public.get_role_classifications(text, text[], text, text)
from public, anon, authenticated;
grant execute on function public.get_role_classifications(text, text[], text, text)
to service_role;
