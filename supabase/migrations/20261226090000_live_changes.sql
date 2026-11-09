-- Live updates through our own server (docs/specs/api.md, C3): each change
-- to what a house's screens show (a tick, a dispute, the Wall) is noted here
-- and sent on a private Realtime Broadcast channel that only the API listens
-- to. The API passes it to the house's open streams, and a stream that comes
-- back after a gap asks what it missed (house_live_since). The note is only
-- "this house changed": the app reads the house again, through /v1.

create table public.live_changes (
  id bigint generated always as identity primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index live_changes_house_id_idx on public.live_changes (house_id, id);
create index live_changes_created_at_idx on public.live_changes (created_at);

comment on table public.live_changes is
  'Each change to what a house''s screens show, for the API''s live streams (house_live_since). Kept two days.';

alter table public.live_changes enable row level security;
-- No policies: nobody reads it straight; house_live_since does, for a member.
revoke all on table public.live_changes from public, anon, authenticated;

-- The shards the API listens on: a fixed few channels, each carrying many houses.
create function public.live_topic(p_house_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'live:' || (abs(hashtext(p_house_id::text)) % 16)::text;
$$;

create function public.note_live_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  house uuid := case when tg_op = 'DELETE' then old.house_id else new.house_id end;
  change bigint;
begin
  if house is null then
    return null;
  end if;
  insert into public.live_changes (house_id) values (house) returning id into change;
  -- Now and then, forget what's two days old: a stream gone that long reads the house afresh.
  if random() < 0.01 then
    delete from public.live_changes where created_at < now() - interval '2 days';
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('house', house, 'id', change),
      'change',
      public.live_topic(house),
      true
    );
  exception when others then
    -- A missed message only delays the screen: the stream's next look catches it.
    null;
  end;
  return null;
end;
$$;

create trigger live_change after insert or update or delete on public.events
  for each row execute function public.note_live_change();
create trigger live_change after insert or update or delete on public.assignments
  for each row execute function public.note_live_change();
create trigger live_change after insert or update or delete on public.disputes
  for each row execute function public.note_live_change();

-- The house's newest change after p_after ({"latest": null} when none): for a member only.
create function public.house_live_since(p_house_id uuid, p_after bigint default null)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object('latest', max(c.id))
  from public.live_changes c
  where c.house_id = p_house_id
    and public.is_member(p_house_id)
    and c.id > coalesce(p_after, 0);
$$;

revoke execute on function public.live_topic(uuid), public.note_live_change(), public.house_live_since(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.house_live_since(uuid, bigint) to authenticated, service_role;
grant execute on function public.live_topic(uuid) to service_role;
