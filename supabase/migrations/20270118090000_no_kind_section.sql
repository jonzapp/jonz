-- One No kind section, the only catch-all now that Everything else goes
-- (docs/specs/john-kinds.md). A John in none of its house's kinds sits in
-- No kind: the John list's last section, with a grey lid, and the last
-- choice in a John's Kind list, so an admin can put a John there on
-- purpose. It isn't a kind, so nobody can rename or delete it. Everything
-- else was a second catch-all that could be deleted; it goes, and its
-- Johns move to No kind. A new house starts with no kinds at all: its
-- setup chat makes them with its Johns. Glyn's picks, 14 November 2026.

-- --- Everything else goes ----------------------------------------------------------------------

-- A house that renamed it made it its own: it stays, as a kind the house made.
update public.john_kinds set preset = null
where preset = 'other' and name not in ('Everything else', 'Tout le reste');

update public.johns j set john_kind_id = null
from public.john_kinds k
where k.id = j.john_kind_id and k.house_id = j.house_id and k.preset = 'other';

delete from public.john_kinds where preset = 'other';

alter table public.john_kinds drop constraint john_kinds_preset_check;
alter table public.john_kinds add constraint john_kinds_preset_check
  check (preset in ('kitchen', 'bathroom', 'bins', 'floors', 'errands'));

comment on column public.john_kinds.preset is 'Which of the old starting kinds it began as (houses made before 14 November 2026 started with them): a ready-made list''s Johns go in it. Null for a kind the house made.';
comment on column public.johns.john_kind_id is 'Its kind: the list''s section it sits in and its lid colour. Null for No kind.';

-- --- A new house starts with no kinds ---------------------------------------------------------

-- Its setup chat makes the kinds it needs as it adds the Johns, sorting
-- each into one (Glyn, 14 November). Houses that have kinds keep them.
drop trigger houses_seed_john_kinds on public.houses;
drop function public.house_kinds_seeded();
drop function public.seed_john_kinds(uuid);
drop function public.default_john_kinds(text);

-- Resetting everything leaves the house as a new one: an empty list, and
-- no kinds until it makes them again.
create or replace function public.wipe_house_data(p_house uuid, p_by uuid, p_everything boolean)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  h public.houses;
  family boolean;
  weeks integer;
  people integer;
begin
  select * into h from public.houses where id = p_house for update;
  if h.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  family := h.kind = 'family';

  select count(*) into weeks from public.weeks where house_id = p_house;

  -- A week takes its Johns with it, and they take their checks, votes,
  -- crews, swap asks, pocket money earned and the Wall's posts about them.
  delete from public.weeks where house_id = p_house;
  delete from public.ledger_entries where house_id = p_house;
  delete from public.month_closes where house_id = p_house;
  delete from public.month_let_offs where house_id = p_house;
  delete from public.pocket_pays where house_id = p_house;

  if p_everything then
    delete from public.johns where house_id = p_house;
    delete from public.john_kinds where house_id = p_house;
    delete from public.groups where house_id = p_house;
    delete from public.away_periods where house_id = p_house;
    -- What create_house gives a new house of this kind.
    update public.houses set
      stake_minor = case when family then 0 else 2000 end,
      late_forfeit_minor = case when family then 0 else 100 end,
      missed_forfeit_minor = case when family then 0 else 300 end,
      dispute_hours = case when family then 0 else 24 end,
      pocket_cap_minor = case when family then 1000 else 0 end,
      away_makeup = default,
      cover_grace_hours = default,
      late_hours = default,
      deal_mode = default,
      deal_budget = default,
      settle_in = default
    where id = p_house;
  end if;

  -- After the rules, so the post a change of rules leaves goes too.
  delete from public.events
  where house_id = p_house
    and kind not in ('joined', 'moving_out', 'moved_out', 'kind_changed', 'jonz_message', 'started_over')
    and (kind not in ('away', 'rules') or p_everything);
  delete from public.house_actions where house_id = p_house;

  update public.members
  set streak = 0, immunity_tokens = 0, swap_tokens = 0
  where house_id = p_house;
  select count(*) into people from public.members where house_id = p_house;

  update public.houses set first_dealt_at = null where id = p_house;

  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'started_over', p_by, jsonb_build_object('everything', p_everything));

  return jsonb_build_object('weeks', weeks, 'people', people);
end;
$$;

-- --- Grey is No kind's -------------------------------------------------------------------------

-- The ready colours in the kind sheet's order, grey (No kind's lid) now
-- last, so a new kind takes it only when every other is taken. The same
-- list is KIND_COLOURS in @app/core.
create or replace function public.kind_colours()
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select array['#7a4e2d', '#1f5fae', '#2a2d30', '#0f7c7a', '#6a3d9a', '#c2417a',
               '#2b8fc7', '#4f9a2e', '#b08840', '#4a4fc4', '#8a9096'];
$$;

-- --- No kind's name is taken --------------------------------------------------------------------

-- Whether a kind's name is No kind's, in English or French: a John written
-- with it goes in No kind, and no kind can take it.
create function public.no_kind_name(p_name text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(btrim(coalesce(p_name, ''))) in ('no kind', 'sans type');
$$;
comment on function public.no_kind_name(text) is 'Whether a name is No kind''s (en or fr), which no kind can take.';

-- A new kind goes last.
create or replace function public.add_kind(p_house uuid, p_name text, p_colour text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pos integer;
  k uuid;
begin
  if public.no_kind_name(p_name) then
    raise exception 'kind_name_taken' using errcode = '23505';
  end if;
  select coalesce(max(x.position) + 1, 0) into pos from public.john_kinds x where x.house_id = p_house;
  insert into public.john_kinds (house_id, name, colour, position)
  values (p_house, btrim(p_name), lower(p_colour), pos)
  returning id into k;
  return k;
exception
  when unique_violation then
    raise exception 'kind_name_taken' using errcode = '23505';
  when check_violation then
    raise exception 'bad_kind_name' using errcode = '22023';
end;
$$;
comment on function public.add_kind(uuid, text, text) is 'Adds a kind to the end of a house''s list.';

create or replace function public.save_kind(p_house uuid, p_kind uuid, p_name text, p_colour text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k uuid;
begin
  perform public.check_can(p_house, 'johns:write');
  if p_colour is null or p_colour !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'bad_colour' using errcode = '22023';
  end if;
  if p_kind is null then
    return public.add_kind(p_house, p_name, p_colour);
  end if;
  if public.no_kind_name(p_name) then
    raise exception 'kind_name_taken' using errcode = '23505';
  end if;
  update public.john_kinds set name = btrim(p_name), colour = lower(p_colour)
  where id = p_kind and house_id = p_house
  returning id into k;
  if k is null then
    raise exception 'unknown_kind' using errcode = '22023';
  end if;
  return k;
exception
  when unique_violation then
    raise exception 'kind_name_taken' using errcode = '23505';
  when check_violation then
    raise exception 'bad_kind_name' using errcode = '22023';
end;
$$;

-- The kind a John is written with: one of the house's by id, or one by name
-- (made, in the next free colour, if the house has none by that name).
-- Null (No kind) when given neither, or No kind's own name.
create or replace function public.john_kind_for(p_house uuid, p_kind uuid, p_kind_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k uuid;
  taken text[];
begin
  if p_kind is not null then
    select x.id into k from public.john_kinds x where x.id = p_kind and x.house_id = p_house;
    if k is null then
      raise exception 'unknown_kind' using errcode = '22023';
    end if;
    return k;
  end if;
  if nullif(btrim(p_kind_name), '') is not null and not public.no_kind_name(p_kind_name) then
    select x.id into k from public.john_kinds x
    where x.house_id = p_house and lower(x.name) = lower(btrim(p_kind_name));
    if k is null then
      select coalesce(array_agg(x.colour), '{}') into taken from public.john_kinds x where x.house_id = p_house;
      k := public.add_kind(p_house, p_kind_name, coalesce(
        (select c from unnest(public.kind_colours()) with ordinality as u (c, n) where c <> all (taken) order by n limit 1),
        (public.kind_colours())[cardinality(taken) % cardinality(public.kind_colours()) + 1]
      ));
    end if;
  end if;
  return k;
end;
$$;

-- --- Moving a John to No kind -----------------------------------------------------------------

-- Until now a John changed without a kind kept the one it had, so nothing
-- could move it to No kind. p_no_kind does (the operation's kindId: null);
-- left out, it still keeps its kind.
drop function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint);

-- Changes apply from the next deal. Its week (anchor_week) is kept; its
-- kind, pay and the youngest age stay as they are when not given.
create function public.change_john(
  p_john uuid,
  p_name text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_kind uuid default null,
  p_kind_name text default null,
  p_every_months smallint default null,
  p_week_of_month smallint default null,
  p_anchor_month integer default null,
  p_anchor_week integer default null,
  p_when text default 'day',
  p_respond_hours smallint default 12,
  p_per_week smallint default 2,
  p_crew smallint default 1,
  p_keep_day boolean default false,
  p_pay_minor integer default null,
  p_min_age smallint default null,
  p_no_kind boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  h uuid := (select j.house_id from public.johns j where j.id = p_john);
  c jsonb;
  k uuid;
begin
  perform public.check_can(h, 'johns:write');
  c := public.john_columns(h, jsonb_build_object(
    'name', p_name, 'points', p_points, 'everyWeeks', p_every_weeks,
    'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month, 'anchorMonth', p_anchor_month,
    'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo, 'groupId', p_group,
    'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew, 'keepDay', p_keep_day
  ), now());
  k := public.john_kind_for(h, p_kind, p_kind_name);

  update public.johns
  set name = c ->> 'name',
      john_kind_id = case when k is not null then k when p_no_kind or public.no_kind_name(p_kind_name) then null else john_kind_id end,
      points = (c ->> 'points')::smallint,
      every_weeks = (c ->> 'every_weeks')::smallint,
      every_months = (c ->> 'every_months')::smallint,
      week_of_month = (c ->> 'week_of_month')::smallint,
      anchor_month = (c ->> 'anchor_month')::int,
      due_dow = (c ->> 'due_dow')::smallint,
      due_time = (c ->> 'due_time')::time,
      needs_photo = (c ->> 'needs_photo')::boolean,
      group_id = (c ->> 'group_id')::uuid,
      kind = c ->> 'kind',
      respond_hours = (c ->> 'respond_hours')::smallint,
      per_week = (c ->> 'per_week')::smallint,
      crew = (c ->> 'crew')::smallint,
      keep_day = (c ->> 'keep_day')::boolean,
      pay_minor = coalesce(p_pay_minor, pay_minor),
      min_age = case when p_min_age is null then min_age else p_min_age end
  where id = p_john and archived_at is null;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;
comment on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint, boolean) is 'Change a John on the list, from the next deal.';

-- --- Who may call them -------------------------------------------------------------------------

revoke all on function public.no_kind_name(text) from public, anon;
revoke all on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint, boolean) from public, anon;

grant execute on function public.no_kind_name(text) to authenticated;
grant execute on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint, boolean) to authenticated;
