-- A parent's OK, step 2 of the family version (docs/specs/family-houses.md).
--
-- In a family nobody votes on a tick. A kid's tick waits for a parent to say
-- OK (it stands) or Not yet (it goes back to the kid, open again), with no
-- closing time. A parent's own tick, or one a parent makes for a kid, needs
-- no OK. Housemate houses don't change.

-- --- 1. A family has no check window ----------------------------------------------------------

-- No vote means no window to vote in: a family's dispute_hours is 0, so a
-- parent's tick stands at once and raise_dispute refuses every tick
-- (not_disputable). A kid's tick is held by awaits_ok instead.
update public.houses set dispute_hours = 0 where kind = 'family' and dispute_hours <> 0;

alter table public.houses drop constraint if exists houses_family_no_window;
alter table public.houses
  add constraint houses_family_no_window check (kind = 'housemates' or dispute_hours = 0);

-- As 20261114090000, but a family starts with no window too.
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
    stake_minor, late_forfeit_minor, missed_forfeit_minor, dispute_hours
  )
  values (
    btrim(p_name), p_timezone, p_currency, p_week_starts, me, coalesce(p_kind, 'housemates'),
    case when family then 0 else 2000 end,
    case when family then 0 else 100 end,
    case when family then 0 else 300 end,
    case when family then 0 else 24 end
  )
  returning id into house;
  insert into public.members (house_id, user_id, role) values (house, me, 'admin');
  insert into public.events (house_id, kind, user_id) values (house, 'joined', me);
  perform public.record_moved_on(me, house, 'started');
  return house;
end;
$$;

-- --- 2. A kid's tick waits for an OK -----------------------------------------------------------

alter table public.assignments
  add column if not exists awaits_ok boolean not null default false,
  add column if not exists okayed_by uuid references public.profiles (id) on delete set null,
  add column if not exists okayed_at timestamptz,
  -- When the parents were told it waits (the clock tells them once).
  add column if not exists ok_asked_at timestamptz;

create index if not exists assignments_awaits_ok on public.assignments (house_id) where awaits_ok;

-- Every way a John gets ticked (Mark done, a cover, a roll call, Done it)
-- sets done_at as the person ticking, so the rule lives here: in a family, a
-- tick made by someone who isn't a parent waits for an OK. Taking the tick
-- back, or Not yet, clears it.
create or replace function public.tick_awaits_ok()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if new.done_at is null then
    new.awaits_ok := false;
    new.okayed_by := null;
    new.okayed_at := null;
    new.ok_asked_at := null;
  elsif old.done_at is null then
    new.awaits_ok := me is not null
      and exists (select 1 from public.houses h where h.id = new.house_id and h.kind = 'family')
      and not public.is_admin(new.house_id);
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_tick_awaits_ok on public.assignments;
create trigger assignments_tick_awaits_ok
  before update of done_at on public.assignments
  for each row execute function public.tick_awaits_ok();

-- --- 3. OK and Not yet ---------------------------------------------------------------------------

-- New Wall posts: a parent's OK, and Not yet. Added to the live list of
-- kinds, as 20261113090000 does.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_catalog.pg_constraint
  where conrelid = 'public.events'::regclass and conname = 'events_kind_check';
  if def is null or def like '%''okayed''%' then
    return;
  end if;
  execute 'alter table public.events drop constraint events_kind_check';
  execute 'alter table public.events add constraint events_kind_check '
    || replace(def, 'ARRAY[', 'ARRAY[''okayed''::text, ''not_yet''::text, ');
end;
$$;

-- A parent answers a kid's tick: OK lets it stand, Not yet sends the John
-- back to the kid, open again, as a struck-out tick is. A Together John's
-- places share one tick, so they share the answer. Returns whose tick it was.
create or replace function public.answer_tick(p_assignment uuid, p_ok boolean)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ticker uuid;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.is_admin(a.house_id) then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  if a.outcome is not null or a.done_at is null or not a.awaits_ok then
    raise exception 'nothing_to_ok';
  end if;
  ticker := coalesce(a.covered_by, a.user_id);
  if p_ok then
    update public.assignments p set awaits_ok = false, okayed_by = me, okayed_at = now()
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and p.done_at = a.done_at;
  else
    update public.assignments p set done_at = null, photo_path = null, covered_by = null, absent_at = null
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and (p.done_at = a.done_at or p.absent_at = a.done_at);
    delete from public.crew where job_id = coalesce(a.job_id, a.id) and created_at = a.done_at;
  end if;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, case when p_ok then 'okayed' else 'not_yet' end, me, a.id,
          jsonb_build_object('name', a.name, 'against', ticker));
  return ticker;
end;
$$;

-- --- Grants ------------------------------------------------------------------------------------

revoke execute on function public.answer_tick(uuid, boolean), public.tick_awaits_ok() from public, anon, authenticated;
grant execute on function public.answer_tick(uuid, boolean) to authenticated, service_role;
