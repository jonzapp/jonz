-- The owner's Ask Jonz (docs/specs/owner-admin.md, "Ask Jonz, owner").
--
-- A chat of the owner's own, apart from every house's: its own table, read
-- and written only by the owner's session with its code (is_owner), never
-- by the service role. A turn is written down before Claude is asked, so
-- turns sent together can't all slip under the day's limit, and turns go
-- after 90 days.

create table public.owner_ask_turns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asked_at timestamptz not null default now(),
  question text not null check (char_length(question) <= 2000),
  reply text check (char_length(reply) <= 8000),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0)
);
create index owner_ask_turns_owner_at on public.owner_ask_turns (owner_id, asked_at desc);

alter table public.owner_ask_turns enable row level security;

-- The owner reads their own turns. Nobody writes but the functions below.
create policy owner_ask_turns_owner_reads on public.owner_ask_turns
  for select to authenticated
  using (public.is_owner() and owner_id = (select auth.uid()));

grant select on public.owner_ask_turns to authenticated;

-- A turn for the owner, if the day's limit allows: written now, its answer
-- added by finish_owner_ask. Turns older than 90 days go as it writes.
create function public.claim_owner_ask(p_question text, p_limit integer)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  turn uuid;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner.ask:' || me::text, 0));
  delete from public.owner_ask_turns where asked_at < now() - interval '90 days';
  if (select count(*) from public.owner_ask_turns where owner_id = me and asked_at >= now() - interval '24 hours') >= p_limit then
    raise exception 'ask_limit';
  end if;
  insert into public.owner_ask_turns (owner_id, question) values (me, left(coalesce(p_question, ''), 2000))
  returning id into turn;
  return turn;
end;
$$;

-- What Jonz answered, and what it cost, on the owner's own turn.
create function public.finish_owner_ask(p_turn uuid, p_reply text, p_input integer, p_output integer)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  update public.owner_ask_turns
  set reply = left(p_reply, 8000), input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0)
  where id = p_turn and owner_id = (select auth.uid());
end;
$$;

revoke execute on function public.claim_owner_ask(text, integer) from public, anon;
revoke execute on function public.finish_owner_ask(uuid, text, integer, integer) from public, anon;
grant execute on function public.claim_owner_ask(text, integer) to authenticated;
grant execute on function public.finish_owner_ask(uuid, text, integer, integer) to authenticated;
