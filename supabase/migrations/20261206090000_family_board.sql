-- The board, a family's shared screen for the kitchen tablet
-- (docs/specs/family-houses.md, "The board"). Glyn picked it on 7 November
-- 2026: a parent opens it on a tablet signed in as themselves, every kid has
-- a column of today's Johns, and a kid taps to tick their own. A tick made
-- there is the kid's, so it waits for a parent's OK like any kid's tick,
-- even though the tablet is signed in as a parent.
--
-- Safe to run twice.

create or replace function public.board_tick(p_assignment uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_your_john' using errcode = '42501';
  end if;
  if not exists (select 1 from public.houses h where h.id = a.house_id and h.kind = 'family') then
    raise exception 'not_a_family';
  end if;
  if not public.can(a.house_id, 'ticks.ok') then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m where m.house_id = a.house_id and m.user_id = a.user_id and m.role = 'member'
  ) then
    raise exception 'not_a_kid';
  end if;
  if a.outcome is not null then
    raise exception 'already_settled';
  end if;
  if a.absent_at is not null then
    raise exception 'left_off';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  if now() >= public.closes_at(a, ends) then
    raise exception 'week_closed';
  end if;
  if a.done_at is not null then
    raise exception 'already_done';
  end if;
  if a.job_id is not null then
    raise exception 'roll_call_needed';
  end if;
  if a.needs_photo then
    raise exception 'photo_required';
  end if;
  update public.assignments set done_at = now() where id = a.id;
  -- The kid's tick, made on the parent's tablet: it waits for an OK.
  update public.assignments set awaits_ok = true, ok_asked_at = null where id = a.id;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (
    a.house_id,
    case when now() > a.due_at then 'late' else 'done' end,
    a.user_id,
    a.id,
    jsonb_build_object('name', a.name, 'points', a.points, 'photo', false, 'board', true)
  );
end;
$$;

revoke execute on function public.board_tick(uuid) from public, anon, authenticated;
grant execute on function public.board_tick(uuid) to authenticated, service_role;
