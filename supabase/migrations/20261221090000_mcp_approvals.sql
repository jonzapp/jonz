-- Approvals for what can't be undone, asked of the person in Jonz itself
-- (docs/specs/operation-registry.md, "MCP").
--
-- An app the person connected to Jonz (an MCP client, signed in through
-- Supabase's OAuth server) holds a token like the app's own, with one more
-- claim: client_id. With it, a `destructive` operation doesn't run until the
-- person has approved that exact request at jonz.app/approve/<id>, signed in
-- to Jonz itself. The executor (packages/server) writes the request here as
-- jonz_api, sends the client to the page by URL elicitation, and on the
-- client's retry uses the approval once.
--
-- Two rules make that hold:
-- - An OAuth client's token can't approve: api_approval and
--   answer_api_approval refuse a token with a client_id.
-- - An OAuth client's token can't go around /mcp: PostgREST refuses it on
--   every request (api_pre_request), and Storage won't change a file for it,
--   so the only way to change anything for a connected app is the executor,
--   which asks for approval. (Realtime only reads, under each table's own
--   rules, as /mcp's reads do.)

-- --- Approvals ---------------------------------------------------------------------------

create table public.api_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 100),
  -- sha256 of the operation name and its checked input (the executor's requestHash).
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  input jsonb not null default '{}'::jsonb,
  house_id uuid references public.houses (id) on delete cascade,
  -- The OAuth client that asked, as its token said.
  client_id text check (char_length(client_id) <= 100),
  expires_at timestamptz not null,
  approved_at timestamptz,
  declined_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_approvals_answered_once_check check (approved_at is null or declined_at is null),
  constraint api_approvals_used_if_approved_check check (used_at is null or approved_at is not null)
);

create index api_approvals_user_id_idx on public.api_approvals (user_id);
create index api_approvals_house_id_idx on public.api_approvals (house_id);
create index api_approvals_created_at_idx on public.api_approvals (created_at);

create trigger api_approvals_set_updated_at before update on public.api_approvals
  for each row execute function public.set_updated_at();

comment on table public.api_approvals is 'Server only. A connected app''s request to do something that can''t be undone, and whether the person approved it in Jonz.';

alter table public.api_approvals enable row level security;
create policy "the API keeps approvals" on public.api_approvals
  for all to jonz_api using (true) with check (true);
revoke all on public.api_approvals from public, anon, authenticated, service_role;
grant select, insert, update on public.api_approvals to jonz_api;

-- --- The person's side: the approve page in Jonz ------------------------------------------

-- Refuses a connected app's token: approving is for the person, in Jonz.
create function public.require_first_party()
returns uuid
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
begin
  if (select auth.jwt()) ? 'client_id' then
    raise exception 'Only you can approve this, in Jonz itself.' using errcode = '42501';
  end if;
  return me;
end;
$$;

comment on function public.require_first_party() is 'The caller, if they are signed in to Jonz itself and not through a connected app (no client_id claim).';
revoke execute on function public.require_first_party() from public, anon, authenticated;

-- One of your requests, for the approve page to show. Null if it isn't yours.
create function public.api_approval(p_id uuid)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'operation', a.operation,
    'input', a.input,
    'house_id', a.house_id,
    'house_name', h.name,
    'created_at', a.created_at,
    'expires_at', a.expires_at,
    'approved_at', a.approved_at,
    'declined_at', a.declined_at,
    'used_at', a.used_at
  )
  from public.api_approvals a
  left join public.houses h on h.id = a.house_id
  where a.id = p_id and a.user_id = public.require_first_party();
$$;

comment on function public.api_approval(uuid) is 'A connected app''s request of yours, for the approve page. Refuses a connected app''s own token.';
revoke execute on function public.api_approval(uuid) from public, anon;
grant execute on function public.api_approval(uuid) to authenticated;

-- Approve or decline one of your requests, once, before it expires.
create function public.answer_api_approval(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_first_party();
  a public.api_approvals;
begin
  select * into a from public.api_approvals where id = p_id and user_id = me for update;
  if not found then
    raise exception 'That request isn''t there.';
  end if;
  if a.approved_at is not null or a.declined_at is not null then
    raise exception 'You''ve already answered that.';
  end if;
  if a.expires_at <= now() then
    raise exception 'That request has expired. Ask again from the app.';
  end if;
  if p_approve then
    update public.api_approvals set approved_at = now() where id = p_id;
  else
    update public.api_approvals set declined_at = now() where id = p_id;
  end if;
end;
$$;

comment on function public.answer_api_approval(uuid, boolean) is 'Approve or decline a connected app''s request, once, before it expires. Refuses a connected app''s own token.';
revoke execute on function public.answer_api_approval(uuid, boolean) from public, anon;
grant execute on function public.answer_api_approval(uuid, boolean) to authenticated;

-- --- A connected app's token goes through /mcp, never straight to the tables -------------

-- Run by PostgREST before every request (pgrst.db_pre_request), as the
-- request's own role.
create function public.api_pre_request()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ? 'client_id' then
    raise exception 'Connected apps reach Jonz through https://api.jonz.app/mcp.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.api_pre_request() is 'PostgREST''s check before every request: a connected app''s token (client_id claim) is refused here; it goes through /mcp.';
revoke execute on function public.api_pre_request() from public;
grant execute on function public.api_pre_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.api_pre_request';
notify pgrst, 'reload config';

-- Storage checks its own rules, not PostgREST's: no uploading, replacing or
-- deleting files with a connected app's token. Restrictive, so it holds on
-- top of every rule that lets people change a file.
create policy "connected apps change no files" on storage.objects
  as restrictive for insert to authenticated
  with check (not coalesce((select auth.jwt()) ? 'client_id', false));
create policy "connected apps replace no files" on storage.objects
  as restrictive for update to authenticated
  using (not coalesce((select auth.jwt()) ? 'client_id', false));
create policy "connected apps delete no files" on storage.objects
  as restrictive for delete to authenticated
  using (not coalesce((select auth.jwt()) ? 'client_id', false));

-- --- Tidying ------------------------------------------------------------------------------

create or replace function public.tidy_api_bookkeeping()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.api_idempotency_keys where created_at < now() - interval '24 hours';
  delete from public.api_rate_limits where window_started_at < now() - interval '1 hour';
  delete from public.api_approvals where created_at < now() - interval '24 hours';
$$;

comment on function public.tidy_api_bookkeeping() is 'Clears idempotency keys and approvals older than a day and rate-limit windows older than an hour. Run by cron.';
