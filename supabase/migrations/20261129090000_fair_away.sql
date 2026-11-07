-- Fair time away and swaps (the beta review, 7 Nov 2026, docs/specs/fair-away.md).
--
-- Booking time away from today hands the Johns you have due before you go
-- to a housemate (or skips them with nobody home). Cancelling the trip, or
-- undoing it, left them with that housemate, and deleted the Wall post, so
-- a trip booked and cancelled a minute later could dump a John on someone
-- with no trace. A swap token could also trade a John already overdue for a
-- housemate's fresh one. This:
--
--  1. marks each John a trip handed on or skipped (handed_from, the one who
--     went away, and handed_by_away, the trip);
--  2. ends a trip one way everywhere (end_away: cancelling, undoing, and a
--     deletion's own time away): Johns still to come go back to when they
--     were due, and any it handed on or skipped that are still open and due
--     from today come back to whoever went away;
--  3. keeps the Wall post, saying the trip was cancelled, or ended early;
--  4. lets a swap token trade only Johns not yet due, on both sides.
--
-- The push to whoever is handed a John is sent by the server
-- (apps/api/lib/moves/away.ts), where booking now goes through.
-- Safe to run twice.

-- --- 1. What a trip handed on --------------------------------------------------------------

alter table public.assignments add column if not exists handed_from uuid;
alter table public.assignments add column if not exists handed_by_away uuid;
create index if not exists assignments_handed_by_away on public.assignments (handed_by_away)
  where handed_by_away is not null;

create or replace function public.start_away(p_user uuid, p_starts date, p_ends date, p_note text)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := p_user;
  h public.houses;
  today date;
  away_id uuid;
  departure timestamptz;
  moved integer := 0;
  handed integer := 0;
  excused integer := 0;
  a public.assignments;
  sharers uuid[];
  holder uuid;
  soon boolean;
begin
  select houses.* into h
  from public.houses join public.members m on m.house_id = houses.id
  where m.user_id = me;
  if h.id is null then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  today := (now() at time zone h.timezone)::date;
  if p_starts is null or p_ends is null or p_starts < today then
    raise exception 'away_in_past';
  end if;
  if p_ends < p_starts then
    raise exception 'away_backwards';
  end if;
  if p_ends - p_starts > 91 then
    raise exception 'away_too_long';
  end if;
  if exists (
    select 1 from public.away
    where house_id = h.id and user_id = me and starts_on <= p_ends and ends_on >= p_starts
  ) then
    raise exception 'away_overlaps';
  end if;

  insert into public.away (house_id, user_id, starts_on, ends_on, note)
  values (h.id, me, p_starts, p_ends, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into away_id;

  departure := (p_starts::timestamp at time zone h.timezone) - interval '1 minute';
  soon := departure < now() + interval '12 hours';

  if not soon then
    update public.assignments x
    set due_moved_from = coalesce(x.due_moved_from, x.due_at), due_at = departure, reminded = 0
    where x.house_id = h.id and x.user_id = me
      and x.done_at is null and x.outcome is null and x.job_id is null
      and (x.due_at at time zone h.timezone)::date between p_starts and p_ends
      and x.due_at > departure;
    get diagnostics moved = row_count;
  end if;

  for a in
    select * from public.assignments x
    where x.house_id = h.id and x.user_id = me
      and x.done_at is null and x.absent_at is null and x.outcome is null and not x.excused
      and (x.due_at at time zone h.timezone)::date between p_starts and p_ends
      and x.due_at > now()
      and (soon or x.job_id is not null)
    order by x.due_at
    for update
  loop
    select coalesce(array_agg(gm.user_id), '{}') into sharers
    from public.johns j join public.group_members gm on gm.group_id = j.group_id and gm.house_id = j.house_id
    where j.id = a.john_id;
    if cardinality(sharers) = 0 then
      select array_agg(m.user_id) into sharers from public.members m where m.house_id = h.id;
    end if;

    select s.id into holder
    from unnest(sharers) as s (id)
    where s.id <> me
      and not exists (
        select 1 from public.away w
        where w.house_id = h.id and w.user_id = s.id
          and (a.due_at at time zone h.timezone)::date between w.starts_on and w.ends_on
      )
      and not (a.job_id is not null and exists (
        select 1 from public.assignments y where y.job_id = a.job_id and y.user_id = s.id
      ))
    order by (
      select coalesce(sum(x.points), 0) from public.assignments x where x.week_id = a.week_id and x.user_id = s.id
    ), s.id
    limit 1;

    if holder is null then
      update public.assignments set excused = true, handed_from = me, handed_by_away = away_id where id = a.id;
      excused := excused + 1;
    else
      update public.assignments set user_id = holder, reminded = 0, handed_from = me, handed_by_away = away_id where id = a.id;
      handed := handed + 1;
    end if;
  end loop;
  moved := moved + handed + excused;

  insert into public.events (house_id, kind, user_id, data)
  values (h.id, 'away', me, jsonb_build_object(
    'away', away_id, 'starts_on', p_starts, 'ends_on', p_ends, 'moved', moved,
    'handed', handed, 'excused', excused));
  return moved;
end;
$$;


-- --- 2. Ending a trip, one way everywhere --------------------------------------------------

-- Cancel what's still to come of a trip, or end one under way yesterday. Its
-- Johns go back to when they were due; what it handed on or skipped comes
-- back to whoever went away while still open and due from today, unless the
-- housemate it went to has since skipped it with their own token. The Wall
-- post stays and says so. No check on who asks: callers do that.
create or replace function public.end_away(p_away uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  a public.away;
  tz text;
  today date;
begin
  select * into a from public.away where id = p_away for update;
  if a.id is null then
    return;
  end if;
  select timezone into tz from public.houses where id = a.house_id;
  today := (now() at time zone tz)::date;
  if a.ends_on < today then
    return;
  end if;

  update public.assignments
  set due_at = due_moved_from, due_moved_from = null, reminded = 0
  where house_id = a.house_id and user_id = a.user_id
    and done_at is null and outcome is null
    and due_moved_from is not null and due_moved_from > now()
    and (due_moved_from at time zone tz)::date between greatest(a.starts_on, today) and a.ends_on;

  update public.assignments x
  set user_id = x.handed_from, excused = false, reminded = 0, handed_from = null, handed_by_away = null
  where x.handed_by_away = a.id
    and x.done_at is null and x.outcome is null and x.covered_by is null and x.absent_at is null
    and (x.due_at at time zone tz)::date >= today
    and ((x.user_id = x.handed_from and x.excused) or (x.user_id <> x.handed_from and not x.excused))
    and exists (select 1 from public.members m where m.house_id = x.house_id and m.user_id = x.handed_from);

  if a.starts_on >= today then
    delete from public.away where id = a.id;
    update public.events set data = data || jsonb_build_object('cancelled', true)
    where house_id = a.house_id and kind = 'away' and data ->> 'away' = a.id::text;
  else
    update public.away set ends_on = today - 1 where id = a.id;
    update public.events set data = data || jsonb_build_object('back_on', today)
    where house_id = a.house_id and kind = 'away' and data ->> 'away' = a.id::text;
  end if;
end;
$$;

create or replace function public.cancel_away(p_away uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  a public.away;
  tz text;
begin
  select * into a from public.away where id = p_away;
  if a.id is null or a.user_id <> me then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  select timezone into tz from public.houses where id = a.house_id;
  if a.ends_on < (now() at time zone tz)::date then
    raise exception 'away_over';
  end if;
  perform public.end_away(a.id);
end;
$$;

create or replace function public.end_deletion_away(p_away uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.end_away(p_away);
end;
$$;

-- --- 3. Undoing a trip ends it the same way ------------------------------------------------

-- undo_action as 20261103100000_on_call_taps.sql, its away branch now end_away.
create or replace function public.undo_action(p_action uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  x public.house_actions;
  reach text;
  a public.assignments;
  b public.assignments;
  aw public.away;
  tz text;
  today date;
  s jsonb;
  n integer;
begin
  select * into x from public.house_actions where id = p_action for update;
  if x.id is null or not public.is_member(x.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  -- Changes to the same people one at a time, as set_member_role does.
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || x.house_id::text, 0));
  if x.assignment_id is not null then
    select * into a from public.assignments where id = x.assignment_id for update;
  end if;
  reach := public.undo_reach(x);
  if x.undone_at is not null then
    raise exception 'already_undone';
  end if;
  if reach is null then
    raise exception 'cannot_undo';
  end if;
  perform set_config('johns.undoing', 'on', true);
  select timezone into tz from public.houses where id = x.house_id;

  case x.kind
  when 'reset' then
    perform public.undo_reset(x);
  when 'tick', 'cover' then
    -- Back to open. A forfeit it was settled with goes too; the engine
    -- settles it again from here (missed, if its John has closed).
    delete from public.ledger where assignment_id = a.id and kind = 'forfeit';
    update public.assignments
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null
    where id = a.id;
    delete from public.events
    where assignment_id = a.id and kind in ('done', 'late', 'covered') and created_at >= a.done_at;
  when 'flag' then
    n := greatest(jsonb_array_length(x.data -> 'sharers'), 1);
    for s in select * from jsonb_array_elements(x.data -> 'sharers') loop
      update public.week_shares
      set share = greatest(share - round((x.data ->> 'points')::numeric / n, 2), 0)
      where week_id = a.week_id and user_id = (s #>> '{}')::uuid;
    end loop;
    -- Its 'flagged' post goes with it.
    delete from public.assignments where id = a.id;
  when 'swap' then
    select * into b from public.assignments where id = x.ref for update;
    update public.assignments set user_id = x.actor, reminded = 0 where id = b.id;
    update public.assignments set user_id = x.subject, reminded = 0 where id = a.id;
    update public.members set swap_tokens = swap_tokens + 1
    where house_id = x.house_id and user_id = x.actor and swap_tokens < 1;
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'immunity' then
    update public.assignments set excused = false, outcome = null, settled_at = null where id = a.id;
    update public.members set immunity_tokens = immunity_tokens + 1
    where house_id = x.house_id and user_id = a.user_id and immunity_tokens < 2;
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'dispute' then
    delete from public.disputes where id = x.ref;
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'vote' then
    delete from public.dispute_votes where dispute_id = x.ref and user_id = x.actor;
  when 'payment' then
    delete from public.ledger
    where house_id = x.house_id and kind = 'payment'
      and id in (select (jsonb_array_elements_text(x.data -> 'ledger'))::bigint);
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'away' then
    -- As cancel_away, for whoever it was.
    perform public.end_away(x.ref);
  when 'role' then
    if x.data ->> 'from' = 'member' and not exists (
      select 1 from public.members where house_id = x.house_id and role = 'admin' and user_id <> x.subject
    ) then
      raise exception 'last_admin';
    end if;
    update public.members set role = x.data ->> 'from' where house_id = x.house_id and user_id = x.subject;
  when 'remove' then
    insert into public.members (house_id, user_id, role, joined_at, streak, immunity_tokens, swap_tokens)
    values (x.house_id, x.subject, x.data ->> 'role', (x.data ->> 'joined_at')::timestamptz,
            (x.data ->> 'streak')::smallint, (x.data ->> 'immunity_tokens')::smallint,
            (x.data ->> 'swap_tokens')::smallint);
  end case;

  update public.house_actions set undone_at = now(), undone_by = me where id = x.id;

  -- A Done it is a flag its holder raised and ticked at once. Taking the tick
  -- back takes the flag with it: nobody asked, so nothing is left to do.
  if x.kind = 'tick' then
    perform public.drop_own_flag(x.assignment_id);
  end if;

  -- An admin taking back someone else's move says so on the Wall, to them.
  if x.actor is not null and x.actor <> me then
    insert into public.events (house_id, kind, user_id, assignment_id, data)
    values (x.house_id, 'undone', x.actor,
            case when x.kind = 'flag' then null else x.assignment_id end,
            jsonb_build_object('by', me, 'what', x.kind, 'name', x.data ->> 'name', 'action', x.id));
  end if;
end;
$$;


-- --- 4. Swaps only for Johns not yet due ---------------------------------------------------

create or replace function public.use_swap(p_mine uuid, p_theirs uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  mine public.assignments := public.my_open_assignment(p_mine);
  theirs public.assignments;
begin
  select * into theirs from public.assignments where id = p_theirs for update;
  if theirs.id is null or theirs.house_id <> mine.house_id or theirs.week_id <> mine.week_id
     or theirs.user_id = mine.user_id then
    raise exception 'not_swappable';
  end if;
  if mine.done_at is not null or theirs.done_at is not null or theirs.outcome is not null
     or theirs.absent_at is not null or mine.flagged_at is not null or theirs.flagged_at is not null then
    raise exception 'not_swappable';
  end if;
  if mine.due_at <= now() or theirs.due_at <= now() then
    raise exception 'swap_due';
  end if;
  if (mine.job_id is not null and exists (
        select 1 from public.assignments where job_id = mine.job_id and user_id = theirs.user_id))
     or (theirs.job_id is not null and exists (
        select 1 from public.assignments where job_id = theirs.job_id and user_id = mine.user_id)) then
    raise exception 'same_job';
  end if;
  update public.members set swap_tokens = swap_tokens - 1
  where house_id = mine.house_id and user_id = mine.user_id and swap_tokens > 0;
  if not found then
    raise exception 'no_swap';
  end if;
  update public.assignments set user_id = theirs.user_id, reminded = 0 where id = mine.id;
  update public.assignments set user_id = mine.user_id, reminded = 0 where id = theirs.id;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (mine.house_id, 'swap_used', mine.user_id, theirs.id,
          jsonb_build_object('gave', mine.name, 'took', theirs.name, 'with', theirs.user_id));
end;
$$;

-- Replacing a function keeps its grants; said again here so this file stands alone.
revoke execute on function
  public.start_away(uuid, date, date, text), public.end_away(uuid), public.cancel_away(uuid),
  public.end_deletion_away(uuid), public.undo_action(uuid), public.use_swap(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.cancel_away(uuid), public.undo_action(uuid), public.use_swap(uuid, uuid)
to authenticated;
grant execute on function
  public.start_away(uuid, date, date, text), public.end_away(uuid), public.cancel_away(uuid),
  public.end_deletion_away(uuid), public.undo_action(uuid), public.use_swap(uuid, uuid)
to service_role;
