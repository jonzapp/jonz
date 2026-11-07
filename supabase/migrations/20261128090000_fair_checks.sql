-- Fair checks (the beta review, 7 Nov 2026, docs/specs/fair-checks.md).
--
-- Before the roommate beta a review found that one housemate could strike a
-- tick and be paid for it: in a house of two the one who questions a tick is
-- the only voter, so it was struck at once, and late in its window it became
-- a miss with the forfeit going to them. The owner of a John could strike a
-- housemate's cover of it and tick it late themselves. An on-call John could
-- be flagged again the moment it was done, and an admin could turn the check
-- window to nothing. This:
--
--  1. gives a struck John 12 hours to be done again before it can be missed
--     (closes_at moves on; on a flag too, which reads closes_at as a floor);
--  2. lets whoever's tick is questioned answer it with a photo
--     (answer_dispute): with only one voter, the photo settles it and the
--     tick stands; otherwise the photo is on the John for the voters to see
--     (with one voter and no photo, the clock strikes it when the vote closes:
--     @app/core dispute.ts);
--  3. keeps the owner of a covered John out of its check: they can't
--     question or vote on a housemate's cover of their own John;
--  4. lets each on-call John be flagged by a housemate once per window
--     (its respond_hours from the last flag); whoever is on call can still
--     say they've done it any time;
--  5. keeps the check window at 12 hours or more in a housemates' house.
--
-- An admin changing their own result is refused by the server
-- (apps/api/lib/moves/resets.ts), where admin_reset is called from.
-- Safe to run twice.

-- --- 1. 12 hours after a strike --------------------------------------------------------------

-- A flag's closes_at is null until a strike sets it: then it is a floor on the
-- flag's own time (twice its window). A John due on a day keeps it as before.
create or replace function public.closes_at(a public.assignments, week_ends timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case
    when a.flagged_at is null then coalesce(a.closes_at, week_ends)
    else greatest(
      case
        when a.due_at < week_ends then least(week_ends, a.due_at + (a.due_at - a.flagged_at))
        else a.due_at + (a.due_at - a.flagged_at)
      end,
      a.closes_at
    )
  end
$$;

-- The hours a struck John gets to be done again.
create or replace function public.redo_hours()
returns integer
language sql
immutable
as $$ select 12 $$;

create or replace function public.resolve_dispute(p_dispute uuid, p_resolution text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.disputes;
  a public.assignments;
begin
  update public.disputes set resolution = p_resolution, resolved_at = now()
  where id = p_dispute and resolution is null
  returning * into d;
  if d.id is null then
    return false;
  end if;
  select * into a from public.assignments where id = d.assignment_id;
  if p_resolution = 'upheld' then
    -- Struck: open again, with time to do it however late the strike came.
    update public.assignments p
    set done_at = null, photo_path = null, covered_by = null, absent_at = null,
        closes_at = greatest(
          public.closes_at(p, (select w.ends_at from public.weeks w where w.id = p.week_id)),
          now() + make_interval(hours => public.redo_hours())
        )
    where (p.id = d.assignment_id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and (p.done_at = d.tick_at or p.absent_at = d.tick_at);
    delete from public.crew where assignment_id = d.assignment_id and created_at = d.tick_at;
  end if;
  insert into public.events (house_id, kind, assignment_id, data)
  values (d.house_id, p_resolution, d.assignment_id,
          jsonb_build_object('name', a.name, 'against', coalesce(a.covered_by, a.user_id)));
  return true;
end;
$$;

-- --- 3. Not your own cover ----------------------------------------------------------------------

-- Whether `me` holds a place on this covered John (or its job): their John was
-- covered, so its check is for the rest of the house.
create or replace function public.owns_covered(a public.assignments, me uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select a.covered_by is not null and (
    a.user_id = me
    or (a.job_id is not null and exists (
      select 1 from public.assignments x where x.job_id = a.job_id and x.user_id = me
    ))
  )
$$;

create or replace function public.raise_dispute(p_assignment uuid, p_reason text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  a public.assignments;
  h public.houses;
  checked uuid;
  dispute uuid;
begin
  select * into a from public.assignments where id = p_assignment;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  checked := public.checked_place(a);
  select * into a from public.assignments where id = checked for update;
  if coalesce(a.covered_by, a.user_id) = me or public.owns_covered(a, me) then
    raise exception 'own_john' using errcode = '42501';
  end if;
  select * into h from public.houses where id = a.house_id;
  if a.done_at is null or a.outcome is not null
     or now() >= a.done_at + make_interval(hours => h.dispute_hours) then
    raise exception 'not_disputable';
  end if;
  insert into public.disputes (assignment_id, house_id, raised_by, reason, tick_at, closes_at)
  values (a.id, a.house_id, me, btrim(p_reason), a.done_at,
          now() + make_interval(hours => greatest(h.dispute_hours, 12)))
  returning id into dispute;
  insert into public.dispute_votes (dispute_id, user_id, uphold) values (dispute, me, true);
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, 'disputed', me, a.id,
          jsonb_build_object('name', a.name, 'against', coalesce(a.covered_by, a.user_id), 'reason', btrim(p_reason)));
  return dispute;
exception
  when unique_violation then
    raise exception 'already_disputed';
end;
$$;

create or replace function public.cast_vote(p_dispute uuid, p_uphold boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  d public.disputes;
  a public.assignments;
begin
  select * into d from public.disputes where id = p_dispute;
  if d.id is null or not public.is_member(d.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  select * into a from public.assignments where id = d.assignment_id;
  if coalesce(a.covered_by, a.user_id) = me or public.owns_covered(a, me) then
    raise exception 'own_john' using errcode = '42501';
  end if;
  if d.resolution is not null or now() >= d.closes_at then
    raise exception 'vote_closed';
  end if;
  insert into public.dispute_votes (dispute_id, user_id, uphold)
  values (d.id, me, p_uphold)
  on conflict (dispute_id, user_id) do update set uphold = excluded.uphold, created_at = now();
end;
$$;

-- --- 2. Answering with a photo ------------------------------------------------------------------

alter table public.disputes add column if not exists photo_path text;

-- Who may vote on a dispute: everyone in the house but whoever ticked it and,
-- on a cover, whoever's John it was. The clock counts the same (tick.ts).
create or replace function public.dispute_voters(d public.disputes)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select count(*)::integer
  from public.members m, public.assignments a
  where a.id = d.assignment_id and m.house_id = d.house_id
    and m.user_id <> coalesce(a.covered_by, a.user_id)
    and not public.owns_covered(a, m.user_id)
$$;

-- Whoever's tick is questioned shows it was done: a photo, from the John's own
-- folder. It goes on the John. With one voter (a house of two) it settles the
-- question and the tick stands; otherwise the voters see it and decide.
create or replace function public.answer_dispute(p_dispute uuid, p_photo_path text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  d public.disputes;
  a public.assignments;
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  select * into d from public.disputes where id = p_dispute for update;
  if d.id is null or not public.is_member(d.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  select * into a from public.assignments where id = d.assignment_id for update;
  if coalesce(a.covered_by, a.user_id) <> me and not public.runs_for(a.house_id, coalesce(a.covered_by, a.user_id)) then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if d.resolution is not null or now() >= d.closes_at then
    raise exception 'vote_closed';
  end if;
  if photo is null then
    raise exception 'photo_required';
  end if;
  if photo not like a.house_id::text || '/' || a.id::text || '/%' then
    raise exception 'photo_path' using errcode = '22023';
  end if;
  update public.disputes set photo_path = photo where id = d.id;
  update public.assignments set photo_path = photo where id = a.id;
  if public.dispute_voters(d) <= 1 then
    perform public.resolve_dispute(d.id, 'rejected');
    return true;
  end if;
  return false;
end;
$$;

-- A photo for a questioned tick goes in the John's folder, so whoever ticked
-- it (the coverer, for a cover) may upload there while it is questioned.
create or replace function public.can_upload_proof(object_name text)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  house uuid;
  assignment uuid;
begin
  if coalesce(array_length(parts, 1), 0) < 2 then
    return false;
  end if;
  begin
    house := parts[1]::uuid;
    assignment := parts[2]::uuid;
  exception
    when others then
      return false;
  end;
  return exists (
    select 1 from public.assignments a
    where a.id = assignment and a.house_id = house and a.outcome is null
      and (
        a.user_id = (select auth.uid())
        or public.runs_for(house, a.user_id)
        or (
          public.is_member(house) and a.done_at is null and not a.excused
          and now() >= public.cover_opens_at(
            a,
            (select w.ends_at from public.weeks w where w.id = a.week_id),
            (select h.cover_grace_hours from public.houses h where h.id = house)
          )
        )
        or (
          a.covered_by = (select auth.uid())
          and exists (select 1 from public.disputes d where d.assignment_id = a.id and d.resolution is null)
        )
      )
  );
end;
$$;

-- --- 4. One flag per window ------------------------------------------------------------------------

create or replace function public.raise_flag(p_john uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  j public.johns;
  on_call_now boolean;
begin
  select * into j from public.johns where id = p_john;
  if j.id is null or not public.is_member(j.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.assignments x
    where x.john_id = p_john and x.flagged_by = me and x.user_id = me
      and x.done_at > now() - interval '10 minutes'
  ) then
    raise exception 'just_done';
  end if;
  -- Whoever is on call this week can always say it needs doing (and do it);
  -- anyone else, once per window from the last flag.
  select exists (
    select 1 from public.on_call oc join public.weeks w on w.id = oc.week_id
    where oc.john_id = p_john and oc.user_id = me and w.starts_at <= now() and w.ends_at > now()
  ) into on_call_now;
  if not on_call_now and exists (
    select 1 from public.assignments x
    where x.john_id = p_john and x.flagged_at > now() - make_interval(hours => j.respond_hours)
      and x.done_at is not null
  ) then
    raise exception 'flagged_recently';
  end if;
  return public.open_flag(p_john, now(), me);
end;
$$;

-- --- 5. A check window of 12 hours or more ----------------------------------------------------------

update public.houses set dispute_hours = 12 where kind = 'housemates' and dispute_hours < 12;
alter table public.houses drop constraint if exists houses_dispute_hours_fair;
alter table public.houses
  add constraint houses_dispute_hours_fair check (kind = 'family' or dispute_hours >= 12);

-- --- Grants ------------------------------------------------------------------------------------------

revoke execute on function
  public.resolve_dispute(uuid, text), public.raise_dispute(uuid, text), public.cast_vote(uuid, boolean),
  public.answer_dispute(uuid, text), public.raise_flag(uuid), public.owns_covered(public.assignments, uuid),
  public.dispute_voters(public.disputes), public.redo_hours()
from public, anon, authenticated;
grant execute on function
  public.raise_dispute(uuid, text), public.cast_vote(uuid, boolean), public.answer_dispute(uuid, text),
  public.raise_flag(uuid)
to authenticated, service_role;
grant execute on function
  public.resolve_dispute(uuid, text), public.owns_covered(public.assignments, uuid),
  public.dispute_voters(public.disputes), public.redo_hours()
to service_role;
