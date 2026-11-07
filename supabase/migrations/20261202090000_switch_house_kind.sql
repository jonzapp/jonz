-- Switching a house you already have between housemates and a family
-- (docs/specs/family-houses.md, "Switching a house"). Glyn picked this on
-- 7 November 2026: an admin changes "Who lives here" in Rules, rather than
-- starting a new house and losing the list, the people and the history.
--
-- To a family: a house with money in it (a stake or forfeits) waits for the
-- month to be settled as usual, and becomes a family on the 1st of next
-- month. A house with no money in it changes at once. Either way the Stake
-- and forfeits go to 0, nobody can dispute (a parent says OK instead), and
-- pocket money starts at 10 a month each.
--
-- Back to housemates: at once, as long as every kid signs in (a profile a
-- parent runs only lives in a family). Ticks still waiting for a parent's OK
-- stand, the housemate check comes back (24 hours), and the stake stays 0
-- until an admin sets one in Rules. Pocket money already earned can still be
-- marked Paid.
--
-- Safe to run twice.

-- --- 1. A switch that waits for the 1st ------------------------------------------------------

alter table public.houses add column if not exists next_kind text;
alter table public.houses add column if not exists next_kind_on date;
alter table public.houses drop constraint if exists houses_next_kind;
alter table public.houses add constraint houses_next_kind check (
  (next_kind is null and next_kind_on is null)
  or (next_kind in ('housemates', 'family') and next_kind_on is not null and next_kind <> kind)
);

-- New Wall post: the house became a family, or housemates, or will on a date.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_catalog.pg_constraint
  where conrelid = 'public.events'::regclass and conname = 'events_kind_check';
  if def is null or def like '%''kind_changed''%' then
    return;
  end if;
  execute 'alter table public.events drop constraint events_kind_check';
  execute 'alter table public.events add constraint events_kind_check '
    || replace(def, 'ARRAY[', 'ARRAY[''kind_changed''::text, ');
end;
$$;

-- --- 2. Making the change ----------------------------------------------------------------------

-- The change itself, now. Only the functions below call it.
create or replace function public.apply_house_kind(p_house uuid, p_kind text, p_by uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_kind = 'family' then
    update public.houses
    set kind = 'family', next_kind = null, next_kind_on = null,
        stake_minor = 0, late_forfeit_minor = 0, missed_forfeit_minor = 0, dispute_hours = 0,
        pocket_cap_minor = case when pocket_cap_minor = 0 then 1000 else pocket_cap_minor end
    where id = p_house;
  else
    update public.houses
    set kind = 'housemates', next_kind = null, next_kind_on = null, dispute_hours = 24
    where id = p_house;
    -- Nobody can OK a tick in a housemate house: those still waiting stand.
    update public.assignments set awaits_ok = false
    where house_id = p_house and awaits_ok;
  end if;
  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'kind_changed', p_by, jsonb_build_object('kind', p_kind));
end;
$$;

-- An admin picks who lives here. Returns the day it changes, or null when it
-- changed at once. Picking what the house is already cancels a change that
-- was waiting.
create or replace function public.set_house_kind(p_house uuid, p_kind text)
returns date
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  h public.houses;
  local_today date;
  first_next date;
begin
  if not public.is_member(p_house) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(p_house, 'house.settings') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('housemates', 'family') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('jonz.kind:' || p_house::text, 0));
  select * into h from public.houses where id = p_house for update;

  if p_kind = h.kind then
    if h.next_kind is not null then
      update public.houses set next_kind = null, next_kind_on = null where id = p_house;
      insert into public.events (house_id, kind, user_id, data)
      values (p_house, 'kind_changed', me, jsonb_build_object('kind', p_kind, 'kept', true));
    end if;
    return null;
  end if;

  if p_kind = 'housemates' then
    if exists (select 1 from public.members where house_id = p_house and not signs_in) then
      raise exception 'kids_without_sign_in';
    end if;
    perform public.apply_house_kind(p_house, 'housemates', me);
    return null;
  end if;

  -- To a family. No money in it: at once.
  if h.stake_minor = 0 and h.late_forfeit_minor = 0 and h.missed_forfeit_minor = 0 then
    perform public.apply_house_kind(p_house, 'family', me);
    return null;
  end if;
  -- Money in it: on the 1st, once this month is settled.
  local_today := (now() at time zone h.timezone)::date;
  first_next := (date_trunc('month', local_today) + interval '1 month')::date;
  update public.houses set next_kind = 'family', next_kind_on = first_next where id = p_house;
  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'kind_changed', me, jsonb_build_object('kind', 'family', 'on', first_next));
  return first_next;
end;
$$;

-- The clock makes a waiting change once its day has come and the month
-- before it is settled (or a week later, if that month never closes).
-- `p_now` is the clock's time, so a test can move it. Returns whether it
-- changed the house.
create or replace function public.apply_next_kind(p_house uuid, p_now timestamptz)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  h public.houses;
  local_today date;
begin
  select * into h from public.houses where id = p_house for update;
  if h.next_kind is null then
    return false;
  end if;
  local_today := (p_now at time zone h.timezone)::date;
  if h.next_kind_on > local_today then
    return false;
  end if;
  if not exists (
       select 1 from public.month_closes
       where house_id = p_house and month = to_char(h.next_kind_on - 1, 'YYYY-MM')
     )
     and h.next_kind_on + 7 > local_today then
    return false;
  end if;
  perform public.apply_house_kind(p_house, h.next_kind, null);
  return true;
end;
$$;

-- --- 3. Pocket money earned before switching back can still be paid ----------------------------

-- As 20261118090000, without "only in a family": what's owed is owed.
create or replace function public.pay_pocket_money(p_house uuid, p_kid uuid, p_month text)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  h public.houses;
  owed bigint;
begin
  if not public.is_member(p_house) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(p_house, 'pocket.pay') then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  select * into h from public.houses where id = p_house;
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'nothing_to_pay';
  end if;
  if p_month >= to_char(now() at time zone h.timezone, 'YYYY-MM') then
    raise exception 'not_pay_day_yet';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('jonz.pocket:' || p_house::text || p_kid::text, 0));
  select coalesce((select sum(amount_minor) from public.pocket_earnings
                   where house_id = p_house and user_id = p_kid and month = p_month), 0)
       - coalesce((select sum(amount_minor) from public.pocket_pays
                   where house_id = p_house and user_id = p_kid and month = p_month), 0)
    into owed;
  if owed <= 0 then
    raise exception 'nothing_to_pay';
  end if;
  insert into public.pocket_pays (house_id, user_id, month, amount_minor, paid_by)
  values (p_house, p_kid, p_month, owed, me);
  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'pocket_paid', me, jsonb_build_object('to', p_kid, 'amount', owed, 'month', p_month));
  return owed;
end;
$$;

-- --- Grants ------------------------------------------------------------------------------------

revoke execute on function public.apply_house_kind(uuid, text, uuid), public.set_house_kind(uuid, text),
  public.apply_next_kind(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.set_house_kind(uuid, text) to authenticated, service_role;
grant execute on function public.apply_next_kind(uuid, timestamptz) to service_role;
