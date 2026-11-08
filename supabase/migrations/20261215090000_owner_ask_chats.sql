-- The owner's Ask Jonz chats (docs/specs/owner-admin.md, "Ask Jonz, owner"),
-- kept as a housemate's are (ask_chats): until the owner deletes them,
-- listed under Your chats, carried on from where they were. Each is one
-- owner's own, read and written only through their session with their code
-- this session (is_owner), never the service role. The turns are what the
-- chat showed: what they asked and Jonz's replies. Owner chats sit apart
-- from every house's, as the owner's Ask Jonz does.

create table public.owner_ask_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  turns jsonb not null default '[]'::jsonb check (jsonb_typeof(turns) = 'array' and pg_column_size(turns) <= 512000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index owner_ask_chats_user_id_updated_at_idx on public.owner_ask_chats (user_id, updated_at desc);

create trigger owner_ask_chats_set_updated_at before update on public.owner_ask_chats
  for each row execute function public.set_updated_at();

alter table public.owner_ask_chats enable row level security;

create policy "the owner reads their own chats" on public.owner_ask_chats
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_owner()));
create policy "the owner starts a chat" on public.owner_ask_chats
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_owner()));
create policy "the owner carries on their own chats" on public.owner_ask_chats
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));
create policy "the owner deletes their own chats" on public.owner_ask_chats
  for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_owner()));

revoke all on public.owner_ask_chats from public, anon, authenticated;
grant select, insert, delete on public.owner_ask_chats to authenticated;
-- Only what a chat carries on with changes: its title and turns.
grant update (title, turns) on public.owner_ask_chats to authenticated;
grant all on public.owner_ask_chats to service_role;

comment on table public.owner_ask_chats is 'The owner''s saved Ask Jonz chats.';
