-- The /v1 API's own bookkeeping (docs/specs/api.md, packages/server).
--
-- The API reaches the database as its own role, jonz_api. For each request it
-- becomes `authenticated` with the person's token claims (set local role), so
-- Row Level Security and can() decide exactly as they do for PostgREST. It
-- drops back to jonz_api only to write the three tables below, which people
-- can never read or write: their only rules are for jonz_api, and only
-- jonz_api is granted them.
--
-- jonz_api has no password here. It is given one in the dashboard (SQL
-- editor: alter role jonz_api password '...'), and the API connects through
-- the transaction pooler as jonz_api.<project ref>. Until then nobody can sign
-- in as it.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jonz_api') then
    create role jonz_api login noinherit;
  end if;
end
$$;

comment on role jonz_api is 'The /v1 API and MCP server. Becomes authenticated per request; writes only the api_ tables as itself.';

-- Becoming the person: noinherit, so jonz_api has none of authenticated's
-- rights until it sets the role, and none after it resets it.
grant authenticated to jonz_api;
grant usage on schema public to jonz_api;

-- --- Idempotency keys --------------------------------------------------------------------
-- A write sent with an Idempotency-Key is answered once; the same key and the
-- same request within 24 hours gets the first answer back, and the same key
-- with a different request is refused. Kept for 24 hours.

create table public.api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 255),
  operation text not null,
  -- sha256 of the operation name and its checked input.
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status integer not null check (status between 200 and 299),
  response jsonb,
  created_at timestamptz not null default now(),
  constraint api_idempotency_keys_user_id_key_key unique (user_id, key)
);

create index api_idempotency_keys_created_at_idx on public.api_idempotency_keys (created_at);

comment on table public.api_idempotency_keys is 'Server only. The first answer to each write sent with an Idempotency-Key, kept 24 hours.';

alter table public.api_idempotency_keys enable row level security;
create policy "the API keeps idempotency keys" on public.api_idempotency_keys
  for all to jonz_api using (true) with check (true);
revoke all on public.api_idempotency_keys from public, anon, authenticated;
grant select, insert, update on public.api_idempotency_keys to jonz_api;

-- --- Audit -------------------------------------------------------------------------------
-- One row per write through the API or MCP: who, what, which house, from
-- where. It can only grow; deleting an account clears who, not the row.

create table public.api_audit_entries (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  operation text not null,
  house_id uuid references public.houses (id) on delete set null,
  via text not null check (via in ('api', 'mcp', 'ask')),
  -- The Jonz-Client header as read: "ios/1.4.2 (57)". Null for MCP and scripts.
  client text check (char_length(client) <= 100),
  request_id text not null check (char_length(request_id) <= 100),
  created_at timestamptz not null default now()
);

create index api_audit_entries_user_id_idx on public.api_audit_entries (user_id);
create index api_audit_entries_house_id_idx on public.api_audit_entries (house_id);
create index api_audit_entries_created_at_idx on public.api_audit_entries (created_at desc);

comment on table public.api_audit_entries is 'Server only. Every write made through the /v1 API or MCP, by whom and from which client.';

alter table public.api_audit_entries enable row level security;
create policy "the API writes the audit" on public.api_audit_entries
  for insert to jonz_api with check (true);
revoke all on public.api_audit_entries from public, anon, authenticated, service_role;
grant insert on public.api_audit_entries to jonz_api;

-- --- Rate limits -------------------------------------------------------------------------
-- Requests per person per minute, counted in fixed one-minute windows, shared
-- by every API instance. Windows older than an hour are cleared.

create table public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  -- "<user id>:read" or "<user id>:write".
  bucket text not null check (bucket ~ '^[0-9a-f-]{36}:(read|write)$'),
  window_started_at timestamptz not null,
  hits integer not null default 1 check (hits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_rate_limits_bucket_window_started_at_key unique (bucket, window_started_at)
);

create index api_rate_limits_window_started_at_idx on public.api_rate_limits (window_started_at);

create trigger api_rate_limits_set_updated_at before update on public.api_rate_limits
  for each row execute function public.set_updated_at();

comment on table public.api_rate_limits is 'Server only. How many requests each person made in each minute, for the API''s rate limits.';

alter table public.api_rate_limits enable row level security;
create policy "the API counts requests" on public.api_rate_limits
  for all to jonz_api using (true) with check (true);
revoke all on public.api_rate_limits from public, anon, authenticated;
grant select, insert, update on public.api_rate_limits to jonz_api;

-- --- Tidying ------------------------------------------------------------------------------

create function public.tidy_api_bookkeeping()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.api_idempotency_keys where created_at < now() - interval '24 hours';
  delete from public.api_rate_limits where window_started_at < now() - interval '1 hour';
$$;

comment on function public.tidy_api_bookkeeping() is 'Clears idempotency keys older than a day and rate-limit windows older than an hour. Run by cron.';
revoke execute on function public.tidy_api_bookkeeping() from public, anon, authenticated;

select cron.schedule('tidy-api-bookkeeping', '7 * * * *', 'select public.tidy_api_bookkeeping()');
