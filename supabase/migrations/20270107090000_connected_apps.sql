-- What a connected app may do in Jonz (docs/specs/operation-registry.md,
-- "MCP"): Read only or Read and change, picked by the person on the consent
-- page and changed under Connected apps on You.
--
-- Three rules make it hold:
-- - Only the person sets it, in Jonz itself: my_app_access and
--   set_app_access refuse a connected app's own token
--   (require_first_party), so an app can't raise its own access.
-- - The executor reads it (as jonz_api) on every call from a connected app
--   (a token with a client_id) and refuses anything but a read unless it is
--   'write'. No row means read only.
-- - A connected app's token still can't go around /mcp (api_pre_request).

create table public.connected_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The OAuth client, as Supabase's OAuth server names it (its client_id claim).
  client_id text not null check (char_length(client_id) between 1 and 100),
  access text not null default 'read' check (access in ('read', 'write')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_apps_user_id_client_id_key unique (user_id, client_id)
);

create trigger connected_apps_set_updated_at before update on public.connected_apps
  for each row execute function public.set_updated_at();

comment on table public.connected_apps is 'Server only. Each app a person connected to Jonz and what it may do: read, or write (what they can, with anything that can''t be undone still approved in Jonz). No row means read.';

alter table public.connected_apps enable row level security;
create policy "the API reads connected apps" on public.connected_apps
  for select to jonz_api using (true);
revoke all on public.connected_apps from public, anon, authenticated, service_role;
grant select on public.connected_apps to jonz_api;

-- What each of your connected apps may do, for Connected apps on You.
create function public.my_app_access()
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('client_id', a.client_id, 'access', a.access) order by a.client_id), '[]'::jsonb)
  from public.connected_apps a
  where a.user_id = public.require_first_party();
$$;

comment on function public.my_app_access() is 'What each app you connected to Jonz may do. Refuses a connected app''s own token.';
revoke execute on function public.my_app_access() from public, anon;
grant execute on function public.my_app_access() to authenticated;

-- Set what one of your apps may do, from its next call: on the consent page
-- before you allow it, or later under Connected apps.
create function public.set_app_access(p_client_id text, p_access text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_first_party();
begin
  if p_client_id is null or char_length(p_client_id) not between 1 and 100 then
    raise exception 'Which app?' using errcode = '22023';
  end if;
  if p_access is null or p_access not in ('read', 'write') then
    raise exception 'An app can read, or read and change.' using errcode = '22023';
  end if;
  insert into public.connected_apps (user_id, client_id, access)
  values (me, p_client_id, p_access)
  on conflict on constraint connected_apps_user_id_client_id_key do update set access = excluded.access;
end;
$$;

comment on function public.set_app_access(text, text) is 'Set what one of your connected apps may do: read, or write. Refuses a connected app''s own token.';
revoke execute on function public.set_app_access(text, text) from public, anon;
grant execute on function public.set_app_access(text, text) to authenticated;
