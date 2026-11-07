-- Ask Jonz chats, kept until the person deletes them. Each chat is one
-- person's in one house, and only they can read, write or delete it: not
-- housemates, not the app's owners. It goes when they leave the house (the
-- membership's cascade) and with their account. The turns are what the chat
-- showed: what they said, Jonz's replies, and whether a turn had a card;
-- a card from an earlier visit is never applied again (the app shows it as
-- a note to ask again).

create table public.ask_chats (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null,
  user_id uuid not null default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  turns jsonb not null default '[]'::jsonb check (jsonb_typeof(turns) = 'array' and pg_column_size(turns) <= 512000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Leaving the house, or the account going, takes the chats with it.
  foreign key (house_id, user_id) references public.members (house_id, user_id) on delete cascade
);

create index ask_chats_mine on public.ask_chats (user_id, house_id, updated_at desc);

alter table public.ask_chats enable row level security;

create policy "you read your own chats" on public.ask_chats
  for select to authenticated using (user_id = (select auth.uid()));
create policy "you start a chat in your house" on public.ask_chats
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member(house_id));
create policy "you carry on your own chats" on public.ask_chats
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "you delete your own chats" on public.ask_chats
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.ask_chats from public, anon, authenticated;
grant select, insert, delete on public.ask_chats to authenticated;
-- Only what a chat carries on with changes: its title, turns and when.
grant update (title, turns, updated_at) on public.ask_chats to authenticated;
grant all on public.ask_chats to service_role;
