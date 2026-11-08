-- Tell people (the beta review, 7 Nov 2026, docs/specs/tell-people.md).
--
-- Before the roommate beta a review found that people weren't told what
-- happened to their Johns or their house: no push when someone covered your
-- John, used a swap on you, or a question on your tick was decided; an
-- admin's rule changes went nowhere; and someone joining never saw that the
-- house plays for money. Covering opened on an overdue John with no word to
-- its owner and no way to say "I'm on it". This:
--
--  1. lets the join screen show the stake and fines (house_by_code);
--  2. puts every change to the house's rules on the Wall (a 'rules' post);
--  3. marks which posts the clock has told people about (events.told_at),
--     so it pushes each one once (apps/api/lib/engine/tell.ts);
--  4. tells a John's owner once when covering opens on it
--     (assignments.cover_told_at), and lets them hold covers off for two
--     hours, once per John (hold_cover; cover_john refuses 'cover_held').
-- Safe to run twice.

-- --- 1. What the join screen shows ---------------------------------------------------------

drop function if exists public.house_by_code(text);
create function public.house_by_code(p_code text)
returns table (
  id uuid, name text, members bigint, kind text,
  currency text, stake_minor integer, late_forfeit_minor integer, missed_forfeit_minor integer
)
language sql
stable
security definer set search_path = ''
as $$
  select h.id, h.name, (select count(*) from public.members m where m.house_id = h.id), h.kind,
         h.currency, h.stake_minor, h.late_forfeit_minor, h.missed_forfeit_minor
  from public.houses h
  where h.join_code = upper(btrim(p_code)) and auth.uid() is not null
    and exists (select 1 from public.members m where m.house_id = h.id);
$$;

-- --- 2. Rule changes on the Wall -----------------------------------------------------------

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_catalog.pg_constraint
  where conrelid = 'public.events'::regclass and conname = 'events_kind_check';
  if def is null or def like '%''rules''%' then
    return;
  end if;
  execute 'alter table public.events drop constraint events_kind_check';
  execute 'alter table public.events add constraint events_kind_check '
    || replace(def, 'ARRAY[', 'ARRAY[''rules''::text, ');
end;
$$;

-- What changed, by whom: each rule as [from, to]. Changes nobody made (the
-- service role, a migration) aren't news.
create or replace function public.post_rule_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;
  if new.stake_minor is distinct from old.stake_minor then
    changes := changes || jsonb_build_object('stake_minor', jsonb_build_array(old.stake_minor, new.stake_minor));
  end if;
  if new.late_forfeit_minor is distinct from old.late_forfeit_minor then
    changes := changes || jsonb_build_object('late_forfeit_minor', jsonb_build_array(old.late_forfeit_minor, new.late_forfeit_minor));
  end if;
  if new.missed_forfeit_minor is distinct from old.missed_forfeit_minor then
    changes := changes || jsonb_build_object('missed_forfeit_minor', jsonb_build_array(old.missed_forfeit_minor, new.missed_forfeit_minor));
  end if;
  if new.dispute_hours is distinct from old.dispute_hours then
    changes := changes || jsonb_build_object('dispute_hours', jsonb_build_array(old.dispute_hours, new.dispute_hours));
  end if;
  if new.late_hours is distinct from old.late_hours then
    changes := changes || jsonb_build_object('late_hours', jsonb_build_array(old.late_hours, new.late_hours));
  end if;
  if new.cover_grace_hours is distinct from old.cover_grace_hours then
    changes := changes || jsonb_build_object('cover_grace_hours', jsonb_build_array(old.cover_grace_hours, new.cover_grace_hours));
  end if;
  if changes = '{}'::jsonb then
    return null;
  end if;
  insert into public.events (house_id, kind, user_id, data)
  values (new.id, 'rules', auth.uid(), jsonb_build_object('changes', changes, 'currency', new.currency));
  return null;
end;
$$;

drop trigger if exists post_rule_change on public.houses;
create trigger post_rule_change
  after update on public.houses
  for each row execute function public.post_rule_change();

-- --- 3. Told once --------------------------------------------------------------------------

alter table public.events add column if not exists told_at timestamptz;
-- Everything before this is old news.
update public.events set told_at = created_at where told_at is null;
create index if not exists events_untold on public.events (house_id) where told_at is null;

-- --- 4. Covering opens: told, and held off -------------------------------------------------

alter table public.assignments add column if not exists cover_told_at timestamptz;
alter table public.assignments add column if not exists cover_held_until timestamptz;
-- Johns already overdue were never told; don't tell them all at once now.
update public.assignments set cover_told_at = now()
where cover_told_at is null and done_at is null and outcome is null and due_at < now();

-- Say you're on your overdue John: nobody can cover it for the next two
-- hours (never past when it would be missed). Once per John.
create or replace function public.hold_cover(p_assignment uuid)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
  until timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.user_id <> me then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if a.done_at is not null or a.outcome is not null or a.covered_by is not null or a.excused then
    raise exception 'already_done';
  end if;
  if a.cover_held_until is not null then
    raise exception 'cover_held_once';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  until := least(now() + interval '2 hours', public.closes_at(a, ends));
  update public.assignments set cover_held_until = until where id = a.id;
  return until;
end;
$$;

create or replace function public.cover_john(p_assignment uuid, p_photo_path text default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
  grace smallint;
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  holders uuid[];
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.user_id = me
     or (a.job_id is not null and exists (select 1 from public.assignments where job_id = a.job_id and user_id = me)) then
    raise exception 'tick_it_yourself';
  end if;
  if a.outcome is not null then
    raise exception 'already_settled';
  end if;
  if a.done_at is not null or a.excused or a.absent_at is not null then
    raise exception 'already_done';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  select cover_grace_hours into grace from public.houses where id = a.house_id;
  if now() < public.cover_opens_at(a, ends, grace) then
    raise exception 'too_soon_to_cover';
  end if;
  if a.cover_held_until is not null and now() < a.cover_held_until then
    raise exception 'cover_held';
  end if;
  if now() >= public.closes_at(a, ends) then
    raise exception 'week_closed';
  end if;
  if a.needs_photo and photo is null then
    raise exception 'photo_required';
  end if;
  if photo is not null and photo not like a.house_id::text || '/' || a.id::text || '/%' then
    raise exception 'photo_path' using errcode = '22023';
  end if;
  with covered as (
    update public.assignments p
    set done_at = now(), photo_path = case when p.id = a.id then photo end, covered_by = me
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and p.done_at is null and p.absent_at is null and not p.excused
    returning p.user_id
  )
  select array_agg(user_id) into holders from covered;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, 'covered', me, a.id,
          jsonb_build_object('name', a.name, 'points', a.points, 'photo', photo is not null, 'for', a.user_id)
          || case when a.job_id is not null then jsonb_build_object('for_all', to_jsonb(holders)) else '{}' end);
end;
$$;


revoke execute on function
  public.house_by_code(text), public.post_rule_change(), public.hold_cover(uuid), public.cover_john(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.house_by_code(text), public.hold_cover(uuid), public.cover_john(uuid, text)
to authenticated;
grant execute on function
  public.house_by_code(text), public.hold_cover(uuid), public.cover_john(uuid, text)
to service_role;
