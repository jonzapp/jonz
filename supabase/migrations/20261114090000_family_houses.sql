-- Family houses, step 1 of the family version (docs/specs/family-houses.md).
-- Safe to run twice (a preview database may have run an earlier copy).
--
-- A house is now one of two kinds: housemates (everything as before) or a
-- family. A family is the same house underneath with its own words (admins
-- are parents, everyone else a kid) and no Stake: nobody in a family puts
-- money in or forfeits it. Pocket money takes the Stake's place in a later
-- step; until then a family's money is simply none.
--
-- The kind is chosen once, when the house is started ("Who lives here?"),
-- and a house started from the one you left keeps that house's kind.

-- --- 1. houses.kind --------------------------------------------------------------------------

alter table public.houses
  add column if not exists kind text not null default 'housemates' check (kind in ('housemates', 'family'));

-- A family never stakes or forfeits money. Enforced here, so a family's
-- rules can't be given a stake by any route.
alter table public.houses drop constraint if exists houses_family_no_stake;
alter table public.houses
  add constraint houses_family_no_stake check (
    kind = 'housemates' or (stake_minor = 0 and late_forfeit_minor = 0 and missed_forfeit_minor = 0)
  );

-- --- 2. create_house, with the kind -----------------------------------------------------------

-- As 20261107090000, with the kind. A family starts with no stake and no
-- forfeits. The old four-argument version goes, so a call without the kind
-- still finds exactly one function (the kind defaults to housemates).
drop function if exists public.create_house(text, text, text, smallint);

create or replace function public.create_house(
  p_name text,
  p_timezone text,
  p_currency text,
  p_week_starts smallint,
  p_kind text default 'housemates'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  house uuid;
  family boolean := coalesce(p_kind, 'housemates') = 'family';
begin
  if coalesce(p_kind, 'housemates') not in ('housemates', 'family') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if exists (select 1 from public.members where user_id = me) then
    raise exception 'already_in_house';
  end if;
  insert into public.houses (
    name, timezone, currency, week_starts, created_by, kind,
    stake_minor, late_forfeit_minor, missed_forfeit_minor
  )
  values (
    btrim(p_name), p_timezone, p_currency, p_week_starts, me, coalesce(p_kind, 'housemates'),
    case when family then 0 else 2000 end,
    case when family then 0 else 100 end,
    case when family then 0 else 300 end
  )
  returning id into house;
  insert into public.members (house_id, user_id, role) values (house, me, 'admin');
  insert into public.events (house_id, kind, user_id) values (house, 'joined', me);
  perform public.record_moved_on(me, house, 'started');
  return house;
end;
$$;

-- --- 3. start_house_from keeps the kind ---------------------------------------------------------

-- As 20261107090000, except the new house is the same kind as the one you left.
create or replace function public.start_house_from(
  p_from uuid,
  p_name text,
  p_timezone text,
  p_currency text,
  p_week_starts smallint
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  house uuid;
begin
  if not exists (
    select 1 from public.moved_on
    where user_id = me and from_house = p_from and how is null and left_at > now() - interval '90 days'
  ) then
    raise exception 'not_your_move' using errcode = '42501';
  end if;
  house := public.create_house(
    p_name, p_timezone, p_currency, p_week_starts,
    (select h.kind from public.houses h where h.id = p_from)
  );
  insert into public.johns (
    house_id, name, category, points, every_weeks, anchor_week, every_months, anchor_month,
    week_of_month, due_dow, due_time, needs_photo, kind, respond_hours, per_week, crew, keep_day
  )
  select house, j.name, j.category, j.points, j.every_weeks, j.anchor_week, j.every_months, j.anchor_month,
    j.week_of_month, j.due_dow, j.due_time, j.needs_photo, j.kind, j.respond_hours, j.per_week, j.crew, j.keep_day
  from public.johns j
  where j.house_id = p_from and j.archived_at is null
  order by j.created_at;
  update public.moved_on set how = 'copied'
  where user_id = me and to_house = house;
  return house;
end;
$$;

-- --- 4. A join link says what kind of house it opens -----------------------------------------------

-- As 20261027094000, plus the kind, so the join page can speak to a family.
-- A new column in what it returns means a new function, so the old one goes.
drop function if exists public.house_by_code(text);

create function public.house_by_code(p_code text)
returns table (id uuid, name text, members bigint, kind text)
language sql
stable
security definer set search_path = ''
as $$
  select h.id, h.name, (select count(*) from public.members m where m.house_id = h.id), h.kind
  from public.houses h
  where h.join_code = upper(btrim(p_code)) and auth.uid() is not null
    and exists (select 1 from public.members m where m.house_id = h.id);
$$;

-- --- Grants ------------------------------------------------------------------------------------

revoke execute on function
  public.create_house(text, text, text, smallint, text), public.house_by_code(text)
from public, anon, authenticated;
grant execute on function
  public.create_house(text, text, text, smallint, text), public.house_by_code(text),
  public.start_house_from(uuid, text, text, text, smallint)
to authenticated, service_role;
