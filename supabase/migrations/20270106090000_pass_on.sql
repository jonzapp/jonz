-- The House Pass switches on (docs/specs/house-pass.md, "Still to build" 1
-- and 4). @app/core's PASS_ENFORCED is true from this change: a house
-- without the Pass loses the extras.
--
-- 1. Every house made before today keeps everything for life: it becomes a
--    Founding house, as the houses made before the Pass did
--    (20261029110000_house_pass.sql). Paid plans stay as they are.
-- 2. house_has_pass: whether a house has the Pass now (Founding, or a free
--    month or plan that hasn't ended). The database's own copy of core's
--    hasPass, for the checks below.
-- 3. Photo receipts are a Pass extra, so a John that asks for a photo only
--    insists on one while the house has the Pass. Without it, it ticks
--    like any other John (mark_done, roll_call, cover_john, board_tick).
-- 4. History: every house sees its last four weeks (PASS_FREE_HISTORY_WEEKS);
--    older moves need the Pass (house_history).
--
-- Each function is changed in place from its live definition, as
-- 20261218120000_read_permissions.sql did, and the change says so if a
-- definition no longer reads as expected. Safe to run twice.

-- --- 1. Founding houses -------------------------------------------------------------------------

update public.houses
set pass_plan = 'founding', pass_ends_at = null
where pass_plan = 'trial';

-- --- 2. Whether a house has the Pass ------------------------------------------------------------

create or replace function public.house_has_pass(p_house uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.houses
    where id = p_house
      and (pass_plan = 'founding' or pass_ends_at > now())
  );
$$;

comment on function public.house_has_pass(uuid) is 'Whether the house has the House Pass now: Founding, or a free month or plan that has not ended.';

revoke execute on function public.house_has_pass(uuid) from public, anon, authenticated;
grant execute on function public.house_has_pass(uuid) to service_role;

-- --- 3. A photo only while the house has the Pass ----------------------------------------------

do $$
declare
  fn text;
  def text;
  changed text;
begin
  foreach fn in array array[
    'public.mark_done(uuid, text)',
    'public.roll_call(uuid, uuid[], text)',
    'public.cover_john(uuid, text)'
  ] loop
    select pg_get_functiondef(fn::regprocedure) into def;
    changed := replace(def, 'if a.needs_photo and photo is null then',
                            'if a.needs_photo and photo is null and public.house_has_pass(a.house_id) then');
    if changed <> def then
      execute changed;
    elsif position('public.house_has_pass(a.house_id)' in def) = 0 then
      raise exception '% doesn''t read as expected', fn;
    end if;
  end loop;

  select pg_get_functiondef('public.board_tick(uuid)'::regprocedure) into def;
  changed := replace(def, 'if a.needs_photo then',
                          'if a.needs_photo and public.house_has_pass(a.house_id) then');
  if changed <> def then
    execute changed;
  elsif position('public.house_has_pass(a.house_id)' in def) = 0 then
    raise exception 'board_tick doesn''t read as expected';
  end if;
end;
$$;

-- --- 4. Four weeks of history free --------------------------------------------------------------

do $$
declare
  def text;
  changed text;
begin
  select pg_get_functiondef('public.house_history(uuid, timestamptz, integer)'::regprocedure) into def;
  changed := replace(def, 'and (p_before is null or x.created_at < p_before)',
                          'and (p_before is null or x.created_at < p_before)
    and (x.created_at >= now() - interval ''28 days'' or public.house_has_pass(p_house))');
  if changed <> def then
    execute changed;
  elsif position('public.house_has_pass(p_house)' in def) = 0 then
    raise exception 'house_history doesn''t read as expected';
  end if;
end;
$$;
