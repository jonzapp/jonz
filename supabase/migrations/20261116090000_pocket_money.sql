-- Pocket money and Pay day, step 3 of the family version (docs/specs/family-houses.md).
--
-- In a family each John can earn something. A kid earns it when their tick
-- stands (a parent's OK, then the clock settles it done), up to the house's
-- monthly cap per kid. After the month ends, a parent pays each kid outside
-- Jonz (cash, a bank app, a kids' card) and taps Paid. Jonz never moves the
-- money. Parents' own Johns earn nothing. Housemate houses don't change.
--
-- Safe to run twice.

-- --- 1. What a John earns, and the monthly cap ---------------------------------------------------

alter table public.houses
  add column if not exists pocket_cap_minor integer not null default 0;
alter table public.houses drop constraint if exists houses_pocket_cap;
alter table public.houses
  add constraint houses_pocket_cap check (pocket_cap_minor between 0 and 1000000);
-- A family made before pocket money gets the usual cap.
update public.houses set pocket_cap_minor = 1000 where kind = 'family' and pocket_cap_minor = 0;
grant update (pocket_cap_minor) on public.houses to authenticated;

alter table public.johns
  add column if not exists pay_minor integer not null default 0;
alter table public.johns drop constraint if exists johns_pay;
alter table public.johns add constraint johns_pay check (pay_minor between 0 and 100000);
grant insert (pay_minor), update (pay_minor) on public.johns to authenticated;

-- What each dealt John earns, kept with it so a later change to the John
-- doesn't rewrite a month already earned.
alter table public.assignments
  add column if not exists pay_minor integer not null default 0;

-- As 20261115090000, but a family starts with pocket money up to 10 a month each.
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
    stake_minor, late_forfeit_minor, missed_forfeit_minor, dispute_hours, pocket_cap_minor
  )
  values (
    btrim(p_name), p_timezone, p_currency, p_week_starts, me, coalesce(p_kind, 'housemates'),
    case when family then 0 else 2000 end,
    case when family then 0 else 100 end,
    case when family then 0 else 300 end,
    case when family then 0 else 24 end,
    case when family then 1000 else 0 end
  )
  returning id into house;
  insert into public.members (house_id, user_id, role) values (house, me, 'admin');
  insert into public.events (house_id, kind, user_id) values (house, 'joined', me);
  perform public.record_moved_on(me, house, 'started');
  return house;
end;
$$;

-- As 20261114090000, but a family's Johns keep what they earn, and its cap comes too.
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
  update public.houses n set pocket_cap_minor = o.pocket_cap_minor
  from public.houses o
  where n.id = house and o.id = p_from and o.kind = 'family';
  insert into public.johns (
    house_id, name, category, points, every_weeks, anchor_week, every_months, anchor_month,
    week_of_month, due_dow, due_time, needs_photo, kind, respond_hours, per_week, crew, keep_day, pay_minor
  )
  select house, j.name, j.category, j.points, j.every_weeks, j.anchor_week, j.every_months, j.anchor_month,
    j.week_of_month, j.due_dow, j.due_time, j.needs_photo, j.kind, j.respond_hours, j.per_week, j.crew, j.keep_day, j.pay_minor
  from public.johns j
  where j.house_id = p_from and j.archived_at is null
  order by j.created_at;
  update public.moved_on set how = 'copied'
  where user_id = me and to_house = house;
  return house;
end;
$$;

-- However a John is dealt (the deal, a cover's new place, a Together John's
-- places), in a family it takes what its John earns.
create or replace function public.assignment_pay()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.john_id is not null and new.pay_minor = 0
     and exists (select 1 from public.houses h where h.id = new.house_id and h.kind = 'family') then
    select j.pay_minor into new.pay_minor from public.johns j where j.id = new.john_id;
    new.pay_minor := coalesce(new.pay_minor, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_pay on public.assignments;
create trigger assignments_pay
  before insert on public.assignments
  for each row execute function public.assignment_pay();

-- A parent changing what a John earns changes it for the week's open places too.
create or replace function public.john_pay_changed()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.assignments a set pay_minor = new.pay_minor
  where a.john_id = new.id and a.outcome is null
    and exists (select 1 from public.houses h where h.id = a.house_id and h.kind = 'family');
  return new;
end;
$$;

drop trigger if exists johns_pay_changed on public.johns;
create trigger johns_pay_changed
  after update of pay_minor on public.johns
  for each row when (old.pay_minor is distinct from new.pay_minor)
  execute function public.john_pay_changed();

-- --- 2. Earning ------------------------------------------------------------------------------------

-- One row per John a kid earned from, in the month it was due (the house's
-- zone). The amount is what the John earns, cut so the month's total stays
-- within the cap.
create table if not exists public.pocket_earnings (
  assignment_id uuid primary key references public.assignments (id) on delete cascade,
  house_id uuid not null references public.houses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount_minor integer not null check (amount_minor > 0),
  created_at timestamptz not null default now()
);
create index if not exists pocket_earnings_house on public.pocket_earnings (house_id, month);

-- What a parent paid a kid for a month. More than one if a late John
-- earned after the first payment.
create table if not exists public.pocket_pays (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount_minor integer not null check (amount_minor > 0),
  paid_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pocket_pays_house on public.pocket_pays (house_id, month);

alter table public.pocket_earnings enable row level security;
alter table public.pocket_pays enable row level security;
drop policy if exists "members see pocket money" on public.pocket_earnings;
create policy "members see pocket money" on public.pocket_earnings
  for select to authenticated using (public.is_member(house_id));
drop policy if exists "members see pay day" on public.pocket_pays;
create policy "members see pay day" on public.pocket_pays
  for select to authenticated using (public.is_member(house_id));
revoke all on public.pocket_earnings, public.pocket_pays from anon, authenticated;
grant select on public.pocket_earnings, public.pocket_pays to authenticated;
grant select, insert, update, delete on public.pocket_earnings, public.pocket_pays to service_role;

-- Whenever a kid's John settles done it earns; if it stops being done (an
-- admin's reset), the earning goes. Whoever covered it did it, so they earn.
create or replace function public.pocket_earn()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  h public.houses;
  earner uuid := coalesce(new.covered_by, new.user_id);
  m text;
  so_far bigint;
  amount integer;
begin
  if old.outcome = 'done' and new.outcome is distinct from 'done' then
    delete from public.pocket_earnings where assignment_id = new.id;
    return new;
  end if;
  if new.outcome is distinct from 'done' or old.outcome is not distinct from 'done' or new.pay_minor <= 0 then
    return new;
  end if;
  select * into h from public.houses where id = new.house_id;
  if h.kind <> 'family' or h.pocket_cap_minor <= 0 then
    return new;
  end if;
  if exists (select 1 from public.members where house_id = new.house_id and user_id = earner and role = 'admin')
     or not exists (select 1 from public.members where house_id = new.house_id and user_id = earner) then
    return new;
  end if;
  m := to_char(new.due_at at time zone h.timezone, 'YYYY-MM');
  -- One earning at a time per kid, so two settling together can't both fit under the cap.
  perform pg_advisory_xact_lock(hashtextextended('jonz.pocket:' || new.house_id::text || earner::text, 0));
  select coalesce(sum(amount_minor), 0) into so_far
  from public.pocket_earnings where house_id = new.house_id and user_id = earner and month = m;
  amount := least(new.pay_minor::bigint, greatest(h.pocket_cap_minor - so_far, 0))::integer;
  if amount > 0 then
    insert into public.pocket_earnings (assignment_id, house_id, user_id, month, amount_minor)
    values (new.id, new.house_id, earner, m, amount)
    on conflict (assignment_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_pocket_earn on public.assignments;
create trigger assignments_pocket_earn
  after update of outcome on public.assignments
  for each row execute function public.pocket_earn();

-- --- 3. Pay day ------------------------------------------------------------------------------------

-- New Wall post: a parent paid a kid. Added to the live list of kinds, as 20261113090000 does.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_catalog.pg_constraint
  where conrelid = 'public.events'::regclass and conname = 'events_kind_check';
  if def is null or def like '%''pocket_paid''%' then
    return;
  end if;
  execute 'alter table public.events drop constraint events_kind_check';
  execute 'alter table public.events add constraint events_kind_check '
    || replace(def, 'ARRAY[', 'ARRAY[''pocket_paid''::text, ');
end;
$$;

-- A parent says they paid a kid what they earned in a month that's over.
-- Pays what's still owed for it and returns that amount.
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
  if not public.is_admin(p_house) then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  select * into h from public.houses where id = p_house;
  if h.kind <> 'family' or p_month is null or p_month !~ '^\d{4}-\d{2}$' then
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

revoke execute on function public.pay_pocket_money(uuid, uuid, text), public.assignment_pay(),
  public.john_pay_changed(), public.pocket_earn() from public, anon, authenticated;
grant execute on function public.pay_pocket_money(uuid, uuid, text) to authenticated, service_role;
