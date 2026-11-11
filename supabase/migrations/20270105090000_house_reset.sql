-- Resetting a house from its Danger zone (docs/specs/house-reset.md), for
-- when the first week was dealt too early, before everyone had joined, or
-- the house wants a clean slate. Two levels:
--
-- - Reset history (p_everything false): the house goes back to how it was
--   before its first deal. Every week dealt and everything that came from it
--   goes (its Johns, ticks, covers, swaps, flags, questioned ticks and their
--   votes, on-call picks, shares, pocket money earned and paid), the money
--   (forfeits, payments, corrections, closed and let-off months), History,
--   the Wall's posts about any of that, and everyone's streak, skips and
--   swaps. The John list, groups, rules and time away stay.
-- - Reset everything (p_everything true): all of that, and the John list,
--   groups and time away too, the Wall's rule changes with them, and the
--   rules back to what a new house of its kind starts with.
--
-- Either way the house keeps its name, kind, time zone, currency and week,
-- its people with their roles and preferences, its join code, Ask Jonz
-- chats, the Wall's posts about people (joined, moving out) and messages
-- from Jonz, and its House Pass as it is (no new free month). It is marked
-- never dealt, so the clock deals nothing until an admin does.
--
-- Callers:
--
-- - reset_house_data: a house admin (house_reset:write, a permission of its
--   own that only the admin role holds), from the house's Danger zone, Ask
--   Jonz's card, /v1 or MCP (where it waits for the person's approval);
-- - owner_reset_house_data: the app's owner (houses:write, with their code),
--   for any house, from the admin Houses page; it writes the audit entry too.
--
-- It can't be undone. The Wall gets one post, 'started_over', which the
-- clock pushes to everyone else in the house. Photo receipts of the wiped
-- Johns stay in Storage, unseen: a receipt is found only by its path, and
-- nothing holds those paths any more.

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_catalog.pg_constraint
  where conrelid = 'public.events'::regclass and conname = 'events_kind_check';
  if def is null or def like '%''started_over''%' then
    return;
  end if;
  execute 'alter table public.events drop constraint events_kind_check';
  execute 'alter table public.events add constraint events_kind_check '
    || replace(def, 'ARRAY[', 'ARRAY[''started_over''::text, ');
end;
$$;

insert into public.permissions (name, about, scope) values
  ('houses:write', 'Reset or delete a whole house: everyone in it is told, and it can''t be undone', 'app')
on conflict (name) do update set about = excluded.about, scope = excluded.scope;

insert into public.permissions (name, about, scope) values
  ('house_reset:write', 'Reset the house''s history, or everything in it, back to before its first deal: it can''t be undone', 'house')
on conflict (name) do update set about = excluded.about, scope = excluded.scope;

insert into public.role_permissions (role, permission) values ('admin', 'house_reset:write')
on conflict do nothing;

-- The wipe itself, for the two callers below once they've checked who's
-- asking. Not callable by anyone signed in.
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

comment on function public.wipe_house_data(uuid, uuid, boolean) is
  'Puts a house back to before its first deal (and, with p_everything, clears its list, groups, time away and rules): the wipe reset_house_data and owner_reset_house_data share, after their own checks.';

revoke execute on function public.wipe_house_data(uuid, uuid, boolean) from public, anon, authenticated;

-- A house admin resets their own house.
create or replace function public.reset_house_data(p_house uuid, p_everything boolean default false)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.require_user();
begin
  if not public.can(p_house, 'house_reset:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  return public.wipe_house_data(p_house, me, coalesce(p_everything, false));
end;
$$;

comment on function public.reset_house_data(uuid, boolean) is
  'A house admin (house_reset:write) resets the house''s history, or everything in it, back to before its first deal. Can''t be undone.';

revoke execute on function public.reset_house_data(uuid, boolean) from public, anon;
grant execute on function public.reset_house_data(uuid, boolean) to authenticated, service_role;

-- The app's owner resets any house, with a reason for the audit log.
create or replace function public.owner_reset_house_data(p_house uuid, p_everything boolean default false, p_reason text default null)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  h public.houses;
  done jsonb;
begin
  if not public.can_app('houses:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into h from public.houses where id = p_house;
  if h.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- The Wall says the house was reset, by nobody in it.
  done := public.wipe_house_data(h.id, null, coalesce(p_everything, false));

  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (
    auth.uid(), case when p_everything then 'house.reset_everything' else 'house.reset_history' end,
    'house', h.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', h.name, 'first_dealt_at', h.first_dealt_at, 'weeks', done -> 'weeks'),
    jsonb_build_object('first_dealt_at', null)
  );

  return done;
end;
$$;

comment on function public.owner_reset_house_data(uuid, boolean, text) is
  'The owner (houses:write) resets any house''s history, or everything in it, and writes the audit entry. Can''t be undone.';

revoke execute on function public.owner_reset_house_data(uuid, boolean, text) from public, anon;
grant execute on function public.owner_reset_house_data(uuid, boolean, text) to authenticated, service_role;
