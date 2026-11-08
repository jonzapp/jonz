-- A named permission on every house operation (step 3 of the operation
-- registry; packages/core/src/operations.ts).
--
-- Until now 20 house functions asked only "is this person in the house?"
-- (is_member) or "is this their own row?". Each now asks can(house,
-- '<resource>:<level>') for what it does, so the role list decides, as it
-- does for the admin ones. Three permissions are new, held by both roles:
-- history:write_own (undo your own moves), payments:write_own (mark money
-- paid between housemates) and billing:write_own (buy the House Pass, open
-- billing for one you bought).
--
-- Nobody's access changes: every member already holds every *_own
-- permission, and each function keeps its own-row checks. Safe to run twice.

-- --- 1. The new permissions ------------------------------------------------------------------

insert into public.permissions (name, about) values
  ('history:write_own', 'Undo your own moves from History'),
  ('payments:write_own', 'Mark money paid between housemates'),
  ('billing:write_own', 'Buy the House Pass, and open billing for one you bought')
on conflict (name) do update set about = excluded.about;

insert into public.role_permissions (role, permission)
select r.role, p.permission
from (values ('member'), ('admin')) r(role),
     (values ('history:write_own'), ('payments:write_own'), ('billing:write_own')) p(permission)
on conflict do nothing;

-- --- 2. Your own open John, for a named permission -------------------------------------------

-- The helper every "your own John" move starts with now also asks the
-- permission the move needs (ticks:write_own unless it says otherwise).
create or replace function public.my_open_assignment(p_assignment uuid, p_permission text default 'ticks:write_own')
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  ends timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or (a.user_id <> (select auth.uid()) and not public.runs_for(a.house_id, a.user_id))
     or not public.can(a.house_id, p_permission) then
    raise exception 'not_your_john' using errcode = '42501';
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
  return a;
end;
$$;
comment on function public.my_open_assignment(uuid, text) is 'The caller''s own open John (or one they act for), locked, if they hold the permission in its house; otherwise raises.';
drop function if exists public.my_open_assignment(uuid);
revoke execute on function public.my_open_assignment(uuid, text) from public, anon, authenticated;
grant execute on function public.my_open_assignment(uuid, text) to service_role;

-- --- 3. Each function asks for what it does ---------------------------------------------------

-- Each function is its definition as it stands with only its check changed:
-- `member_check` swaps is_member(x) for can(x, '<permission>'), `own_john`
-- passes the permission to my_open_assignment, and `find`/`put` (on its
-- own, or as well) rewrites one line. The migration stops if a definition
-- doesn't have the text it expects.
--
-- Two functions also take their lowest permission now: leaving the house
-- (remove_member on yourself) asks members:write_own, and removing a flag
-- asks flags:write_own first (your own flag; anyone's still needs
-- flags:write further on). board_tick asks ticks:write before anything
-- else, and plan_john's refusal is a permission refusal (42501).
create temporary table operation_checks (fn text primary key, perm text not null, how text, find text, put text);
insert into operation_checks (fn, perm, how) values
  ('answer_dispute', 'disputes:write_own', 'member_check'),
  ('raise_dispute', 'disputes:write_own', 'member_check'),
  ('cast_vote', 'disputes:write_own', 'member_check'),
  ('confirm_payment', 'payments:write_own', 'member_check'),
  ('cover_john', 'swaps:write_own', 'member_check'),
  ('hold_cover', 'swaps:write_own', 'member_check'),
  ('house_history', 'house:read', 'member_check'),
  ('raise_flag', 'flags:write_own', 'member_check'),
  ('remove_flag', 'flags:write_own', 'member_check'),
  ('board_tick', 'ticks:write', 'member_check'),
  ('save_prefs', 'profile:write_own', 'member_check'),
  ('undo_action', 'history:write_own', 'member_check'),
  ('use_immunity', 'perks:write_own', 'own_john'),
  ('use_swap', 'perks:write_own', 'own_john'),
  ('offer_swap', 'swaps:write_own', 'own_john');
insert into operation_checks (fn, perm, how, find, put) values
  ('plan_john', 'ticks:write_own', 'member_check',
   E'raise exception ''not_found'';',
   E'raise exception ''not_found'' using errcode = ''42501'';'),
  ('answer_swap', 'swaps:write_own', null,
   'if o.id is null or o.asked_user_id <> me then',
   'if o.id is null or o.asked_user_id <> me or not public.can(o.house_id, ''swaps:write_own'') then'),
  ('undo_cover', 'swaps:write_own', null,
   'if a.id is null or a.covered_by is distinct from me then',
   'if a.id is null or a.covered_by is distinct from me or not public.can(a.house_id, ''swaps:write_own'') then'),
  ('remove_member', 'members:write_own', null,
   'if p_user <> me and not public.can(p_house, ''members:write'') then',
   'if not public.can(p_house, case when p_user = me then ''members:write_own'' else ''members:write'' end) then');

do $$
declare
  c record;
  def text;
  changed text;
begin
  for c in select * from operation_checks loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = c.fn;
    if def is null then
      raise exception '% is missing', c.fn;
    end if;
    changed := case c.how
      when 'member_check' then regexp_replace(def, 'public\.is_member\(([^()]*)\)', format('public.can(\1, %L)', c.perm), 'g')
      when 'own_john' then regexp_replace(def, 'public\.my_open_assignment\(([^(),]*)\)', format('public.my_open_assignment(\1, %L)', c.perm), 'g')
      else def
    end;
    if c.find is not null then
      changed := replace(changed, c.find, c.put);
    end if;
    -- Run twice, the second time finds each check already there.
    if changed = def and position(format('%L', c.perm) in def) = 0 then
      raise exception '% doesn''t read as expected; nothing changed', c.fn;
    end if;
    execute changed;
  end loop;
end;
$$;

drop table operation_checks;
