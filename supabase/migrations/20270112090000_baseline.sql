-- The whole database as of the migration of 12 January 2027, in one file: the
-- 81 migrations up to it, squashed (docs/standards/database.md). It builds
-- the same database they did. A database that already ran them has this
-- version on its list and never runs this file.

-- ---------------------------------------------------------------------------
-- The API's own role. It has no password here: it is given one in the
-- dashboard (SQL editor: alter role jonz_api password '...'), and the API
-- connects through the transaction pooler as jonz_api.<project ref>. Until
-- then nobody can sign in as it. It is noinherit, so it holds none of the
-- rights below until it sets the role for a statement
-- (apps/api/lib/db/scope.ts).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jonz_api') then
    create role jonz_api login noinherit;
  end if;
end
$$;

comment on role jonz_api is 'The /v1 API and MCP server. Becomes authenticated per request; writes only the api_ tables as itself.';

grant authenticated to jonz_api;
grant service_role to jonz_api;
grant anon to jonz_api;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."account_deletion_preview"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'house', h.name,
    'pass_until', case
      when h.pass_bought_by = me.id and h.pass_plan in ('monthly', 'yearly') and h.pass_ends_at > now()
      then (h.pass_ends_at at time zone h.timezone)::date
    end,
    'delete_after', now() + interval '30 days'
  )
  from (select auth.uid() as id) me
  left join public.members m on m.user_id = me.id
  left join public.houses h on h.id = m.house_id
  where me.id is not null;
$$;


ALTER FUNCTION "public"."account_deletion_preview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."account_deletion_status"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('delete_after', d.deletes_at, 'requested_by', d.requested_by)
  from public.account_deletions d
  where d.user_id = auth.uid() and d.state = 'pending';
$$;


ALTER FUNCTION "public"."account_deletion_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_correction"("p_house" "uuid", "p_user" "uuid", "p_amount" integer, "p_month" "text", "p_assignment" "uuid") RETURNS bigint[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  others uuid[];
  ids bigint[] := '{}';
  n integer;
  base integer;
  extra integer;
  i integer := 0;
  o uuid;
  lid bigint;
begin
  if p_amount = 0 then
    return ids;
  end if;
  select array_agg(user_id order by joined_at, user_id) into others
  from public.members where house_id = p_house and user_id <> p_user;
  n := coalesce(cardinality(others), 0);
  if n = 0 then
    -- A house of one keeps everything anyway.
    return ids;
  end if;
  insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id)
  values (p_house, p_user, 'correction', p_amount, p_month, p_assignment)
  returning ledger_entries.id into lid;
  ids := ids || lid;
  base := abs(p_amount) / n;
  extra := abs(p_amount) - base * n;
  foreach o in array others loop
    i := i + 1;
    if base + (case when i <= extra then 1 else 0 end) = 0 then
      continue;
    end if;
    insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id, counterparty_user_id)
    values (p_house, o, 'correction', -sign(p_amount)::integer * (base + case when i <= extra then 1 else 0 end),
            p_month, p_assignment, p_user)
    returning ledger_entries.id into lid;
    ids := ids || lid;
  end loop;
  return ids;
end;
$$;


ALTER FUNCTION "public"."add_correction"("p_house" "uuid", "p_user" "uuid", "p_amount" integer, "p_month" "text", "p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_john"("p_house" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint DEFAULT NULL::smallint, "p_week_of_month" smallint DEFAULT NULL::smallint, "p_anchor_month" integer DEFAULT NULL::integer, "p_anchor_week" integer DEFAULT NULL::integer, "p_when" "text" DEFAULT 'day'::"text", "p_respond_hours" smallint DEFAULT 12, "p_per_week" smallint DEFAULT 2, "p_crew" smallint DEFAULT 1, "p_keep_day" boolean DEFAULT false, "p_pay_minor" integer DEFAULT NULL::integer, "p_min_age" smallint DEFAULT NULL::smallint) RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select public.add_johns(p_house, jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'name', p_name, 'category', p_category, 'points', p_points, 'everyWeeks', p_every_weeks,
    'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month, 'anchorMonth', p_anchor_month,
    'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo, 'groupId', p_group,
    'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew,
    'keepDay', p_keep_day, 'payMinor', p_pay_minor, 'minAge', p_min_age
  ))));
$$;


ALTER FUNCTION "public"."add_john"("p_house" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_john"("p_house" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) IS 'Add a John to the list, counting from this week; gives its id.';



CREATE OR REPLACE FUNCTION "public"."add_johns"("p_house" "uuid", "p_johns" "jsonb") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  j jsonb;
  c jsonb;
  new_id uuid;
begin
  perform public.check_can(p_house, 'johns:write');
  for j in select value from jsonb_array_elements(p_johns) with ordinality order by ordinality loop
    c := public.john_columns(p_house, j, now());
    if c is null then
      raise exception 'admins_only' using errcode = '42501';
    end if;
    insert into public.johns (house_id, anchor_week, name, category, points, every_weeks, every_months, week_of_month,
                              anchor_month, due_dow, due_time, needs_photo, group_id, kind, respond_hours, per_week,
                              crew, keep_day, pay_minor, min_age)
    values (p_house, (c ->> 'anchor_week')::int, c ->> 'name', c ->> 'category', (c ->> 'points')::smallint,
            (c ->> 'every_weeks')::smallint, (c ->> 'every_months')::smallint, (c ->> 'week_of_month')::smallint,
            (c ->> 'anchor_month')::int, (c ->> 'due_dow')::smallint, (c ->> 'due_time')::time,
            (c ->> 'needs_photo')::boolean, (c ->> 'group_id')::uuid, c ->> 'kind', (c ->> 'respond_hours')::smallint,
            (c ->> 'per_week')::smallint, (c ->> 'crew')::smallint, (c ->> 'keep_day')::boolean,
            coalesce((c ->> 'pay_minor')::int, 0), (c ->> 'min_age')::smallint)
    returning id into new_id;
    return next new_id;
  end loop;
end;
$$;


ALTER FUNCTION "public"."add_johns"("p_house" "uuid", "p_johns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_johns"("p_house" "uuid", "p_johns" "jsonb") IS 'Add several Johns at once, all or none; gives their ids in order.';



CREATE OR REPLACE FUNCTION "public"."add_kid"("p_parent" "uuid", "p_kid" "uuid", "p_born" smallint) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  house uuid;
  this_year integer := extract(year from now())::integer;
begin
  select m.house_id into house
  from public.members m join public.houses h on h.id = m.house_id
  where m.user_id = p_parent and h.kind = 'family'
    and public.user_can(m.house_id, p_parent, 'members:write');
  if house is null then
    raise exception 'parents_add_kids' using errcode = '42501';
  end if;
  if p_born is null or p_born < this_year - 18 or p_born > this_year then
    raise exception 'bad_born_year' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || house::text, 0));
  if exists (select 1 from public.members where user_id = p_kid) then
    raise exception 'already_in_house';
  end if;
  insert into public.members (house_id, user_id, role, signs_in, born_year)
  values (house, p_kid, 'member', false, p_born);
  insert into public.events (house_id, kind, user_id, data)
  values (house, 'joined', p_kid, jsonb_build_object('added_by', p_parent));
  return house;
end;
$$;


ALTER FUNCTION "public"."add_kid"("p_parent" "uuid", "p_kid" "uuid", "p_born" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_push_device"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ((select auth.uid()), p_endpoint, p_p256dh, p_auth);
$$;


ALTER FUNCTION "public"."add_push_device"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_push_device"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text") IS 'Send your reminders to this device too.';



CREATE OR REPLACE FUNCTION "public"."admin_audit_append_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  raise exception 'audit_append_only' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."admin_audit_append_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reset"("p_actor" "uuid", "p_house" "uuid", "p_kind" "text", "p_target" "jsonb", "p_forfeits" "jsonb" DEFAULT '{}'::"jsonb", "p_apply" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  h public.houses;
  w public.weeks;
  a public.assignments;
  f public.ledger_entries;
  target public.assignments;
  v_outcome text;
  lid bigint;
  month_now text;
  month_of text;
  closed boolean;
  people jsonb := '{}'::jsonb;
  told uuid[] := '{}';
  ids uuid[] := '{}';
  flag_ids uuid[] := '{}';
  added bigint[] := '{}';
  reopened integer := 0;
  past_due integer := 0;
  n_flags integer := 0;
  n_disputes integer := 0;
  correction boolean := false;
  nothing boolean;
  old_forfeit integer;
  new_forfeit integer;
  credit_before uuid;
  credit_after uuid;
  sharers uuid[];
  s uuid;
  snapshot jsonb;
  action uuid;
  event uuid;
  v_subject uuid;
  v_name text;
  v_month text;
  w_month text;
begin
  select * into h from public.houses where id = p_house;
  if h.id is null or not public.user_can(p_house, p_actor, 'history:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  month_now := to_char(now() at time zone h.timezone, 'YYYY-MM');

  -- --- What it touches.
  if p_kind = 'result' then
    select * into target from public.assignments
    where id = (p_target ->> 'assignment')::uuid and house_id = p_house for update;
    if target.id is null then
      raise exception 'not_found';
    end if;
    v_outcome := p_target ->> 'outcome';
    if v_outcome is null or v_outcome not in ('done', 'late', 'missed', 'excused') then
      raise exception 'unknown_outcome' using errcode = '22023';
    end if;
    if exists (select 1 from public.disputes where assignment_id = target.id and resolution is null) then
      raise exception 'disputed';
    end if;
    select * into w from public.weeks where id = target.week_id;
    ids := array[target.id];
    v_subject := target.user_id;
    v_name := target.name;
  elsif p_kind in ('person_week', 'week', 'redeal', 'skip') then
    select * into w from public.weeks where id = (p_target ->> 'week')::uuid and house_id = p_house for update;
    if w.id is null then
      raise exception 'not_found';
    end if;
    if p_kind = 'skip' and w.skipped_at is not null then
      raise exception 'already_skipped';
    end if;
    if p_kind <> 'skip' and w.closed_at is not null then
      raise exception 'week_closed';
    end if;
    if p_kind = 'person_week' then
      v_subject := (p_target ->> 'user')::uuid;
      select array_agg(id) into ids from public.assignments
      where week_id = w.id and user_id = v_subject
        and (done_at is not null or outcome is not null or covered_by is not null);
    elsif p_kind = 'skip' then
      select array_agg(id) into ids from public.assignments where week_id = w.id;
    else
      -- Flags go; everything else ticked or settled goes back to open.
      select array_agg(id) into flag_ids from public.assignments where week_id = w.id and flagged_at is not null;
      select array_agg(id) into ids from public.assignments
      where week_id = w.id and flagged_at is null
        and (done_at is not null or outcome is not null or covered_by is not null);
    end if;
    ids := coalesce(ids, '{}');
    flag_ids := coalesce(flag_ids, '{}');
  elsif p_kind = 'letoff' then
    v_month := p_target ->> 'month';
    if v_month is null or v_month !~ '^\d{4}-\d{2}$' then
      raise exception 'unknown_month' using errcode = '22023';
    end if;
    if exists (select 1 from public.month_let_offs where house_id = p_house and month_let_offs.month = v_month) then
      raise exception 'already_let_off';
    end if;
    select coalesce(array_agg(distinct l.assignment_id) filter (where l.assignment_id is not null), '{}') into ids
    from public.ledger_entries l where l.house_id = p_house and l.month = v_month and l.kind = 'forfeit';
  else
    raise exception 'unknown_reset' using errcode = '22023';
  end if;
  if w.id is not null then
    w_month := to_char(w.starts_at at time zone h.timezone, 'YYYY-MM');
  end if;

  -- --- The tally.
  for a in select * from public.assignments where id = any (ids) loop
    month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
    closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    credit_before := public.credited_to(a);
    if p_kind = 'result' then
      new_forfeit := case v_outcome
        when 'late' then coalesce((p_forfeits ->> 'late')::integer, 0)
        when 'missed' then coalesce((p_forfeits ->> 'missed')::integer, 0)
        else 0 end;
      credit_after := case when v_outcome = 'missed' then null else a.user_id end;
    elsif p_kind = 'skip' then
      new_forfeit := 0;
      credit_after := null;
    elsif p_kind = 'letoff' then
      new_forfeit := 0;
      credit_after := credit_before;
    else
      new_forfeit := 0;
      credit_after := a.user_id;
      reopened := reopened + 1;
      if a.due_at < now() then
        past_due := past_due + 1;
      end if;
    end if;
    if p_kind in ('person_week', 'week', 'redeal') and a.done_at is not null then
      people := public.reset_bump(people, coalesce(a.covered_by, a.user_id), 'ticks', 1);
    end if;
    -- Balances only move for weeks the deal has counted (any week before this one).
    if p_kind <> 'skip' and credit_before is distinct from credit_after then
      people := public.reset_bump(people, credit_before, 'points', -a.points);
      people := public.reset_bump(people, credit_after, 'points', a.points);
    elsif p_kind = 'skip' then
      people := public.reset_bump(people, credit_before, 'points', -a.points);
    end if;
    if old_forfeit <> new_forfeit then
      people := public.reset_bump(people, a.user_id, 'forfeit', old_forfeit - new_forfeit);
      correction := correction or closed;
    end if;
    told := told || a.user_id || a.covered_by;
  end loop;

  for a in select * from public.assignments where id = any (flag_ids) loop
    n_flags := n_flags + 1;
    if a.done_at is not null then
      people := public.reset_bump(people, coalesce(a.covered_by, a.user_id), 'ticks', 1);
    end if;
    people := public.reset_bump(people, public.credited_to(a), 'points', -a.points);
    sharers := public.flag_sharers(a.john_id);
    foreach s in array sharers loop
      people := public.reset_bump(people, s, 'points', round(a.points::numeric / greatest(cardinality(sharers), 1), 2));
    end loop;
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    if old_forfeit <> 0 then
      people := public.reset_bump(people, a.user_id, 'forfeit', old_forfeit);
    end if;
    told := told || a.user_id || a.covered_by;
  end loop;

  if p_kind = 'skip' then
    -- What everyone owed for the week comes off too.
    declare
      sh record;
    begin
      for sh in select user_id, share from public.week_shares where week_id = w.id loop
        people := public.reset_bump(people, sh.user_id, 'points', sh.share);
        told := told || sh.user_id;
      end loop;
    end;
  end if;

  if p_kind = 'letoff' then
    -- The tally is the month's forfeits, per person.
    people := '{}'::jsonb;
    declare
      r record;
    begin
      for r in
        select user_id, -sum(amount_minor)::integer as amount from public.ledger_entries
        where house_id = p_house and ledger_entries.month = v_month and kind = 'forfeit' group by user_id
      loop
        people := public.reset_bump(people, r.user_id, 'forfeit', r.amount);
        told := told || r.user_id;
      end loop;
    end;
    correction := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = v_month);
  end if;

  select count(*) into n_disputes from public.disputes
  where resolution is null and (assignment_id = any (ids) or assignment_id = any (flag_ids));

  select coalesce(array_agg(distinct t), '{}') into told from unnest(told) t where t is not null and t <> p_actor;
  nothing := case p_kind
    when 'skip' then false
    when 'redeal' then false
    when 'letoff' then people = '{}'::jsonb
    else cardinality(ids) + cardinality(flag_ids) = 0 end;

  if not p_apply then
    return jsonb_build_object(
      'kind', p_kind,
      'week', case when w.id is null then null else jsonb_build_object(
        'id', w.id, 'starts_on', w.starts_on, 'starts_at', w.starts_at, 'ends_at', w.ends_at) end,
      'month', coalesce(v_month, w_month, to_char(target.due_at at time zone h.timezone, 'YYYY-MM')),
      'people', people,
      'told', to_jsonb(told),
      'reopened', reopened,
      'past_due', past_due,
      'flags', n_flags,
      'disputes', n_disputes,
      'correction', correction,
      'nothing', nothing
    );
  end if;

  if nothing then
    raise exception 'nothing_to_reset';
  end if;

  -- --- What undoing it needs: every row it changes, as it was.
  snapshot := jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(to_jsonb(x)) from public.assignments x
                             where x.id = any (ids) or x.id = any (flag_ids)
                                or (p_kind = 'redeal' and x.week_id = w.id)), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l)) from public.ledger_entries l
                        where l.kind = 'forfeit' and (l.assignment_id = any (ids) or l.assignment_id = any (flag_ids)
                          or (p_kind = 'letoff' and l.house_id = p_house and l.month = v_month))), '[]'::jsonb),
    'disputes', coalesce((select jsonb_agg(to_jsonb(d)) from public.disputes d
                          where d.assignment_id = any (ids) or d.assignment_id = any (flag_ids)), '[]'::jsonb),
    'votes', coalesce((select jsonb_agg(to_jsonb(v)) from public.dispute_votes v join public.disputes d on d.id = v.dispute_id
                       where d.assignment_id = any (ids) or d.assignment_id = any (flag_ids)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from public.events e
                        where (e.assignment_id = any (ids) or e.assignment_id = any (flag_ids))
                          and e.kind in ('done', 'late', 'covered', 'missed', 'flagged', 'disputed', 'immunity_used')), '[]'::jsonb),
    'shares', case when w.id is null then '[]'::jsonb else coalesce(
      (select jsonb_agg(to_jsonb(ws)) from public.week_shares ws where ws.week_id = w.id), '[]'::jsonb) end,
    'on_call', case when p_kind = 'redeal' then coalesce(
      (select jsonb_agg(to_jsonb(oc)) from public.on_call_picks oc where oc.week_id = w.id), '[]'::jsonb) else '[]'::jsonb end,
    'skipped_at', w.skipped_at
  );

  -- --- The change.
  if p_kind = 'result' then
    a := target;
    month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
    closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    new_forfeit := case v_outcome
      when 'late' then coalesce((p_forfeits ->> 'late')::integer, 0)
      when 'missed' then coalesce((p_forfeits ->> 'missed')::integer, 0)
      else 0 end;
    if closed then
      added := added || public.add_correction(p_house, a.user_id, old_forfeit - new_forfeit, month_now, a.id);
    else
      delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      if new_forfeit > 0 then
        insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id)
        values (p_house, a.user_id, 'forfeit', -new_forfeit, month_of, a.id)
        returning id into lid;
        added := added || lid;
      end if;
    end if;
    update public.assignments
    set outcome = v_outcome,
        settled_at = coalesce(settled_at, now()),
        excused = v_outcome = 'excused',
        covered_by = null,
        done_at = case when v_outcome in ('done', 'late') then coalesce(done_at, least(now(), due_at)) end,
        changed_by = p_actor,
        changed_at = now()
    where id = a.id;
    delete from public.events where assignment_id = a.id and kind in ('missed', 'covered')
      and v_outcome <> 'missed';
  elsif p_kind in ('person_week', 'week', 'redeal') then
    for a in select * from public.assignments where id = any (ids) or id = any (flag_ids) loop
      month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
      closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
      select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
      from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      if old_forfeit <> 0 and closed then
        added := added || public.add_correction(p_house, a.user_id, old_forfeit, month_now, a.id);
      else
        delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      end if;
    end loop;
    delete from public.disputes where assignment_id = any (ids) or assignment_id = any (flag_ids);
    delete from public.events
    where (assignment_id = any (ids)) and kind in ('done', 'late', 'covered', 'missed', 'immunity_used');
    -- A flag goes with its points (and, with it, its Wall post).
    for a in select * from public.assignments where id = any (flag_ids) loop
      sharers := public.flag_sharers(a.john_id);
      update public.week_shares
      set share = greatest(share - round(a.points::numeric / greatest(cardinality(sharers), 1), 2), 0)
      where week_id = a.week_id and user_id = any (sharers);
    end loop;
    delete from public.assignments where id = any (flag_ids);
    update public.assignments
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null,
        excused = false, changed_by = p_actor, changed_at = now()
    where id = any (ids);
  elsif p_kind = 'skip' then
    for a in select * from public.assignments where id = any (ids) loop
      month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
      closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
      select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
      from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      if old_forfeit <> 0 and closed then
        added := added || public.add_correction(p_house, a.user_id, old_forfeit, month_now, a.id);
      else
        delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      end if;
    end loop;
    delete from public.disputes where assignment_id = any (ids) and resolution is null;
    -- Whatever wasn't done is let off; whatever was keeps its mark.
    update public.assignments
    set excused = true, outcome = 'excused', settled_at = now()
    where id = any (ids) and outcome is null and done_at is null;
    update public.assignments
    set outcome = case when done_at <= due_at then 'done' else 'late' end, settled_at = now()
    where id = any (ids) and outcome is null;
    update public.weeks set skipped_at = now(), skipped_by = p_actor where id = w.id;
  elsif p_kind = 'letoff' then
    if correction then
      declare
        r record;
      begin
        -- The month's forfeits, cap refunds and shares, each person's net, handed back.
        for r in
          select user_id, sum(amount_minor)::integer as net from public.ledger_entries
          where house_id = p_house and ledger_entries.month = v_month and kind in ('forfeit', 'cap_refund', 'share')
          group by user_id having sum(amount_minor) <> 0
        loop
          insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month)
          values (p_house, r.user_id, 'correction', -r.net, month_now)
          returning id into lid;
          added := added || lid;
        end loop;
      end;
    else
      delete from public.ledger_entries where house_id = p_house and ledger_entries.month = v_month and kind = 'forfeit';
    end if;
    insert into public.month_let_offs (house_id, month, let_off_by) values (p_house, v_month, p_actor);
  end if;

  perform public.recount_streaks(p_house);

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (p_house, 'reset', p_actor, case when p_kind = 'result' then target.id end,
          jsonb_build_object('what', p_kind, 'name', v_name, 'subject', v_subject, 'outcome', v_outcome,
                             'starts_on', w.starts_on, 'month', v_month))
  returning id into event;

  insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
  values (p_house, p_actor, v_subject, 'reset', case when p_kind = 'result' then target.id end, w.id,
          jsonb_build_object('what', p_kind, 'name', v_name, 'outcome', v_outcome, 'starts_on', w.starts_on,
                             'month', coalesce(v_month, w_month), 'week_month', w_month, 'event', event,
                             'added', to_jsonb(added), 'told', to_jsonb(told), 'snapshot', snapshot))
  returning id into action;

  return jsonb_build_object('action', action, 'told', to_jsonb(told));
end;
$_$;


ALTER FUNCTION "public"."admin_reset"("p_actor" "uuid", "p_house" "uuid", "p_kind" "text", "p_target" "jsonb", "p_forfeits" "jsonb", "p_apply" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."answer_api_approval"("p_id" "uuid", "p_approve" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_first_party();
  a public.api_approvals;
begin
  select * into a from public.api_approvals where id = p_id and user_id = me for update;
  if not found then
    raise exception 'That request isn''t there.';
  end if;
  if a.approved_at is not null or a.declined_at is not null then
    raise exception 'You''ve already answered that.';
  end if;
  if a.expires_at <= now() then
    raise exception 'That request has expired. Ask again from the app.';
  end if;
  if p_approve then
    update public.api_approvals set approved_at = now() where id = p_id;
  else
    update public.api_approvals set declined_at = now() where id = p_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."answer_api_approval"("p_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."answer_api_approval"("p_id" "uuid", "p_approve" boolean) IS 'Approve or decline a connected app''s request, once, before it expires. Refuses a connected app''s own token.';



CREATE OR REPLACE FUNCTION "public"."answer_dispute"("p_dispute" "uuid", "p_photo_path" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  d public.disputes;
  a public.assignments;
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  select * into d from public.disputes where id = p_dispute for update;
  if d.id is null or not public.can(d.house_id, 'disputes:write_own') then
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


ALTER FUNCTION "public"."answer_dispute"("p_dispute" "uuid", "p_photo_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."answer_swap"("p_offer" "uuid", "p_accept" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  o public.swap_offers;
  given public.assignments;
  taken public.assignments;
begin
  select * into o from public.swap_offers where id = p_offer for update;
  if o.id is null or o.asked_user_id <> me or not public.can(o.house_id, 'swaps:write_own') then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if o.answer is not null or o.expires_at <= now() then
    raise exception 'swap_gone';
  end if;
  if not coalesce(p_accept, false) then
    update public.swap_offers set answer = 'declined', answered_at = now() where id = o.id;
    return;
  end if;
  select * into given from public.assignments where id = o.asker_assignment_id for update;
  select * into taken from public.assignments where id = o.asked_assignment_id for update;
  if given.id is null or taken.id is null or given.user_id <> o.asked_by or taken.user_id <> o.asked_user_id
     or given.done_at is not null or given.outcome is not null or given.absent_at is not null
     or taken.done_at is not null or taken.outcome is not null or taken.absent_at is not null then
    raise exception 'not_swappable';
  end if;
  update public.assignments set user_id = o.asked_user_id, reminded = 0 where id = given.id;
  update public.assignments set user_id = o.asked_by, reminded = 0 where id = taken.id;
  update public.swap_offers set answer = 'accepted', answered_at = now() where id = o.id;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (o.house_id, 'swap_used', o.asked_by, taken.id,
          jsonb_build_object('gave', given.name, 'took', taken.name, 'with', o.asked_user_id, 'asked', true));
end;
$$;


ALTER FUNCTION "public"."answer_swap"("p_offer" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."answer_tick"("p_assignment" "uuid", "p_ok" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ticker uuid;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(a.house_id, 'ticks:write') then
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
    delete from public.crew_members where job_id = coalesce(a.job_id, a.id) and created_at = a.done_at;
  end if;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, case when p_ok then 'okayed' else 'not_yet' end, me, a.id,
          jsonb_build_object('name', a.name, 'against', ticker));
  return ticker;
end;
$$;


ALTER FUNCTION "public"."answer_tick"("p_assignment" "uuid", "p_ok" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."api_approval"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'id', a.id,
    'operation', a.operation,
    'input', a.input,
    'house_id', a.house_id,
    'house_name', h.name,
    'created_at', a.created_at,
    'expires_at', a.expires_at,
    'approved_at', a.approved_at,
    'declined_at', a.declined_at,
    'used_at', a.used_at
  )
  from public.api_approvals a
  left join public.houses h on h.id = a.house_id
  where a.id = p_id and a.user_id = public.require_first_party();
$$;


ALTER FUNCTION "public"."api_approval"("p_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."api_approval"("p_id" "uuid") IS 'A connected app''s request of yours, for the approve page. Refuses a connected app''s own token.';



CREATE OR REPLACE FUNCTION "public"."api_audit_entries_forget_gone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.house_id is not null and not exists (select 1 from public.houses h where h.id = new.house_id) then
    new.house_id := null;
  end if;
  if new.user_id is not null and not exists (select 1 from public.profiles p where p.id = new.user_id) then
    new.user_id := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."api_audit_entries_forget_gone"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."api_audit_entries_forget_gone"() IS 'Before an API audit entry is written: a house or person the operation itself deleted is left out, not refused.';



CREATE OR REPLACE FUNCTION "public"."api_pre_request"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ? 'client_id' then
    raise exception 'Connected apps reach Jonz through https://api.jonz.app/mcp.' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."api_pre_request"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."api_pre_request"() IS 'PostgREST''s check before every request: a connected app''s token (client_id claim) is refused here; it goes through /mcp.';



CREATE OR REPLACE FUNCTION "public"."apply_house_kind"("p_house" "uuid", "p_kind" "text", "p_by" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."apply_house_kind"("p_house" "uuid", "p_kind" "text", "p_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_next_kind"("p_house" "uuid", "p_now" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."apply_next_kind"("p_house" "uuid", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ask_account_used"("p_user" "uuid", "p_since" timestamp with time zone) RETURNS TABLE("used" bigint, "oldest" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint, min(d.created_at)
  from public.house_drafts d
  where d.user_id = p_user and d.created_at >= p_since;
$$;


ALTER FUNCTION "public"."ask_account_used"("p_user" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ask_account_used"("p_user" "uuid", "p_since" timestamp with time zone) IS 'Server only. Ask Jonz tokens one person has used since a time, in any house, and when the oldest was.';



CREATE OR REPLACE FUNCTION "public"."ask_usage"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone) RETURNS TABLE("house_used" bigint, "mine_used" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint,
    coalesce(sum(d.input_tokens + d.output_tokens) filter (where d.user_id = p_user), 0)::bigint
  from public.house_drafts d
  where d.house_id = p_house and d.created_at >= p_since;
$$;


ALTER FUNCTION "public"."ask_usage"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ask_usage_people"("p_house" "uuid", "p_since" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "used" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select d.user_id, sum(d.input_tokens + d.output_tokens)::bigint
  from public.house_drafts d
  where d.house_id = p_house and d.created_at >= p_since
  group by d.user_id;
$$;


ALTER FUNCTION "public"."ask_usage_people"("p_house" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assignment_pay"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.john_id is not null and new.pay_minor = 0
     and exists (select 1 from public.houses h where h.id = new.house_id and h.kind = 'family') then
    select j.pay_minor into new.pay_minor from public.johns j where j.id = new.john_id;
    new.pay_minor := coalesce(new.pay_minor, 0);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assignment_pay"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor" "uuid",
    "action" "text" NOT NULL,
    "target_kind" "text" NOT NULL,
    "target_id" "text",
    "reason" "text",
    "before" "jsonb",
    "after" "jsonb",
    CONSTRAINT "admin_audit_action_check" CHECK (("action" ~ '^[a-z_]+\.[a-z_]+$'::"text")),
    CONSTRAINT "admin_audit_reason_check" CHECK (("char_length"("reason") <= 500))
);


ALTER TABLE "public"."admin_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_audit" IS 'Every owner action. Append only: never edited or deleted.';



CREATE OR REPLACE FUNCTION "public"."audit_row_words"("p_entry" "public"."admin_audit", "p_viewer" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  person text := case when p_entry.actor is not null and p_entry.actor = p_viewer then 'You' else 'The owner' end;
  kind text := case p_entry.after ->> 'kind'
                 when 'status' then 'a status notice'
                 when 'offer' then 'an offer'
                 when 'news' then 'a news notice'
                 else 'a notice'
               end;
  title text := p_entry.after ->> 'title';
  account text := 'Account ' || left(p_entry.target_id, 8);
  by_owner boolean := coalesce(p_entry.after ->> 'requested_by' = 'owner', false);
  who text;
  what text;
  place text;
  detail text;
begin
  case p_entry.action
    when 'notice.save' then
      who := person; what := case when p_entry.before is null then 'wrote ' else 'changed ' end || kind; place := 'Notices'; detail := title;
    when 'notice.end' then
      who := person; what := 'ended ' || kind; place := 'Notices'; detail := title;
    when 'account.delete_request' then
      who := case when by_owner then person else 'Someone' end;
      what := case when by_owner then 'started deleting an account' else 'asked to delete their account' end;
      place := account;
    when 'account.delete_keep' then
      who := 'Someone'; what := 'kept their account'; place := account;
    when 'account.delete_stop' then
      who := person; what := 'stopped a deletion'; place := account;
    when 'account.delete_now' then
      who := person; what := 'deleted an account sooner'; place := account;
    when 'account.delete_done' then
      -- The clock does it, on the day.
      who := 'Jonz'; what := 'deleted an account'; place := account;
    else
      who := case when p_entry.actor is null then 'Jonz' else person end; what := p_entry.action; place := p_entry.target_id;
  end case;
  return concat_ws(' ', nullif(who, ''), nullif(what, ''), nullif(place, ''), nullif(detail, ''));
end;
$$;


ALTER FUNCTION "public"."audit_row_words"("p_entry" "public"."admin_audit", "p_viewer" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."audit_row_words"("p_entry" "public"."admin_audit", "p_viewer" "uuid") IS 'How an audit log row reads to someone: core auditRowWords.';



CREATE OR REPLACE FUNCTION "public"."board_tick"("p_assignment" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.can(a.house_id, 'ticks:write') then
    raise exception 'not_your_john' using errcode = '42501';
  end if;
  if not exists (select 1 from public.houses h where h.id = a.house_id and h.kind = 'family') then
    raise exception 'not_a_family';
  end if;
  if not public.can(a.house_id, 'ticks:write') then
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
  if a.needs_photo and public.house_has_pass(a.house_id) then
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


ALTER FUNCTION "public"."board_tick"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can"("h" "uuid", "perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.user_can(h, (select auth.uid()), perm);
$$;


ALTER FUNCTION "public"."can"("h" "uuid", "perm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_app"("perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.app_role_permissions rp
    where rp.role = public.my_app_role() and rp.permission = perm
  );
$$;


ALTER FUNCTION "public"."can_app"("perm" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_app"("perm" "text") IS 'Whether the caller may do an app-scope permission (admin:read, reports:write…), with their code this session.';



CREATE OR REPLACE FUNCTION "public"."can_upload_proof"("object_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."can_upload_proof"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_away"("p_away" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.away_periods;
  tz text;
begin
  select * into a from public.away_periods where id = p_away;
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


ALTER FUNCTION "public"."cancel_away"("p_away" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cast_vote"("p_dispute" "uuid", "p_uphold" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  d public.disputes;
  a public.assignments;
begin
  select * into d from public.disputes where id = p_dispute;
  if d.id is null or not public.can(d.house_id, 'disputes:write_own') then
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


ALTER FUNCTION "public"."cast_vote"("p_dispute" "uuid", "p_uphold" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_john"("p_john" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint DEFAULT NULL::smallint, "p_week_of_month" smallint DEFAULT NULL::smallint, "p_anchor_month" integer DEFAULT NULL::integer, "p_anchor_week" integer DEFAULT NULL::integer, "p_when" "text" DEFAULT 'day'::"text", "p_respond_hours" smallint DEFAULT 12, "p_per_week" smallint DEFAULT 2, "p_crew" smallint DEFAULT 1, "p_keep_day" boolean DEFAULT false, "p_pay_minor" integer DEFAULT NULL::integer, "p_min_age" smallint DEFAULT NULL::smallint) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  c jsonb;
begin
  perform public.check_can((select j.house_id from public.johns j where j.id = p_john), 'johns:write');
  select public.john_columns(j.house_id, jsonb_build_object(
    'name', p_name, 'category', p_category, 'points', p_points, 'everyWeeks', p_every_weeks,
    'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month, 'anchorMonth', p_anchor_month,
    'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo, 'groupId', p_group,
    'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew, 'keepDay', p_keep_day
  ), now())
  into c
  from public.johns j
  where j.id = p_john;

  update public.johns
  set name = c ->> 'name',
      category = c ->> 'category',
      points = (c ->> 'points')::smallint,
      every_weeks = (c ->> 'every_weeks')::smallint,
      every_months = (c ->> 'every_months')::smallint,
      week_of_month = (c ->> 'week_of_month')::smallint,
      anchor_month = (c ->> 'anchor_month')::int,
      due_dow = (c ->> 'due_dow')::smallint,
      due_time = (c ->> 'due_time')::time,
      needs_photo = (c ->> 'needs_photo')::boolean,
      group_id = (c ->> 'group_id')::uuid,
      kind = c ->> 'kind',
      respond_hours = (c ->> 'respond_hours')::smallint,
      per_week = (c ->> 'per_week')::smallint,
      crew = (c ->> 'crew')::smallint,
      keep_day = (c ->> 'keep_day')::boolean,
      pay_minor = coalesce(p_pay_minor, pay_minor),
      min_age = case when p_min_age is null then min_age else p_min_age end
  where id = p_john and archived_at is null;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."change_john"("p_john" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."change_john"("p_john" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) IS 'Change a John on the list, from the next deal.';



CREATE OR REPLACE FUNCTION "public"."chat_title_of"("p_turns" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare
  line text;
  cut text;
  space_at int;
begin
  select regexp_replace(t ->> 'text', '\s+', ' ', 'g') into line
  from jsonb_array_elements(coalesce(p_turns, '[]'::jsonb)) with ordinality as e(t, n)
  where t ->> 'role' = 'user' order by n limit 1;
  line := btrim(coalesce(line, ''));
  if line = '' then
    return 'A chat with Jonz';
  elsif char_length(line) <= 44 then
    return line;
  end if;
  cut := left(line, 43);
  space_at := char_length(cut) - strpos(reverse(cut), ' ') + 1;
  if strpos(cut, ' ') > 0 and space_at - 1 > 22 then cut := left(cut, space_at - 1); end if;
  return regexp_replace(cut, '[\s,.;:–-]+$', '') || '…';
end;
$_$;


ALTER FUNCTION "public"."chat_title_of"("p_turns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."chat_title_of"("p_turns" "jsonb") IS 'A saved chat''s title from its turns: core chatTitle.';



CREATE OR REPLACE FUNCTION "public"."chat_turns_kept"("p_turns" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(t order by n), '[]'::jsonb)
  from (select t, n from jsonb_array_elements(coalesce(p_turns, '[]'::jsonb)) with ordinality as e(t, n) order by n desc limit 200) last_turns;
$$;


ALTER FUNCTION "public"."chat_turns_kept"("p_turns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."chat_turns_kept"("p_turns" "jsonb") IS 'The last 200 turns of a chat (core CHAT_SAVED_TURNS), the ones a saved chat keeps.';



CREATE OR REPLACE FUNCTION "public"."check_can"("p_house" "uuid", "p_perm" "text") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
begin
  if p_house is null or not public.is_member(p_house) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if not public.can(p_house, p_perm) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."check_can"("p_house" "uuid", "p_perm" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_can"("p_house" "uuid", "p_perm" "text") IS 'Refuses (42501) unless you hold a permission in a house: not_in_house, or admins_only.';



CREATE OR REPLACE FUNCTION "public"."check_can_app"("p_perm" "text") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
begin
  if not public.can_app(p_perm) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."check_can_app"("p_perm" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_can_app"("p_perm" "text") IS 'Refuses (42501, owner_only) unless you hold an app permission, with your second factor.';



CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "john_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "points" smallint NOT NULL,
    "needs_photo" boolean DEFAULT false NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "done_at" timestamp with time zone,
    "photo_path" "text",
    "excused" boolean DEFAULT false NOT NULL,
    "outcome" "text",
    "settled_at" timestamp with time zone,
    "reminded" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_name" "text",
    "original_due_at" timestamp with time zone,
    "covered_by" "uuid",
    "flagged_by" "uuid",
    "flagged_at" timestamp with time zone,
    "closes_at" timestamp with time zone,
    "dealt" "jsonb",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone,
    "job_id" "uuid",
    "absent_at" timestamp with time zone,
    "planned_at" timestamp with time zone,
    "awaits_ok" boolean DEFAULT false NOT NULL,
    "okayed_by" "uuid",
    "okayed_at" timestamp with time zone,
    "ok_asked_at" timestamp with time zone,
    "pay_minor" integer DEFAULT 0 NOT NULL,
    "handed_from_user_id" "uuid",
    "handed_by_away_period_id" "uuid",
    "cover_told_at" timestamp with time zone,
    "cover_hold_ends_at" timestamp with time zone,
    CONSTRAINT "assignments_absent_shape" CHECK ((("absent_at" IS NULL) OR (("done_at" IS NULL) AND ("covered_by" IS NULL) AND (NOT "excused")))),
    CONSTRAINT "assignments_check" CHECK ((("outcome" IS NULL) = ("settled_at" IS NULL))),
    CONSTRAINT "assignments_cover_shape" CHECK ((("covered_by" IS NULL) OR (("done_at" IS NOT NULL) AND ("covered_by" <> "user_id")))),
    CONSTRAINT "assignments_outcome_check" CHECK (("outcome" = ANY (ARRAY['done'::"text", 'late'::"text", 'missed'::"text", 'excused'::"text", 'covered'::"text"]))),
    CONSTRAINT "assignments_points_check" CHECK ((("points" >= 1) AND ("points" <= 20)))
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."assignments" IS 'One John given to one person in one week, and what happened to it.';



CREATE OR REPLACE FUNCTION "public"."checked_place"("a" "public"."assignments") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select c.assignment_id from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) limit 1),
    (select p.id from public.assignments p
     where a.job_id is not null and p.job_id = a.job_id and p.done_at = a.done_at
     order by p.id limit 1),
    a.id
  )
$$;


ALTER FUNCTION "public"."checked_place"("a" "public"."assignments") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_ask_turn"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone, "p_pool" bigint, "p_share" bigint, "p_user_day" integer, "p_reserve" integer, "p_account" bigint, "p_account_since" timestamp with time zone) RETURNS TABLE("turn" "uuid", "room" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  used record;
  account_used bigint;
  claimed uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('johns.drafts:' || p_house::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('johns.drafts.user:' || p_user::text, 0));
  if (select count(*) from public.house_drafts where user_id = p_user and created_at >= now() - interval '24 hours') >= p_user_day then
    raise exception 'draft_limit';
  end if;
  select * into used from public.ask_usage(p_house, p_user, p_since);
  if used.house_used >= p_pool then
    raise exception 'ask_pool_used';
  end if;
  if used.mine_used >= p_share then
    raise exception 'ask_share_used';
  end if;
  select a.used into account_used from public.ask_account_used(p_user, p_account_since) a;
  if account_used >= p_account then
    raise exception 'ask_account_used';
  end if;
  insert into public.house_drafts (house_id, user_id, outcome, input_tokens) values (p_house, p_user, 'ai', greatest(p_reserve, 0))
  returning id into claimed;
  return query select claimed, least(p_pool - used.house_used, p_share - used.mine_used, p_account - account_used);
end;
$$;


ALTER FUNCTION "public"."claim_ask_turn"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone, "p_pool" bigint, "p_share" bigint, "p_user_day" integer, "p_reserve" integer, "p_account" bigint, "p_account_since" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_ask_turn"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone, "p_pool" bigint, "p_share" bigint, "p_user_day" integer, "p_reserve" integer, "p_account" bigint, "p_account_since" timestamp with time zone) IS 'Server only. Counts and writes one Ask Jonz turn under the house, person and account limits; returns the room left.';



CREATE OR REPLACE FUNCTION "public"."claim_owner_ask"("p_question" "text", "p_limit" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  turn uuid;
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner.ask:' || me::text, 0));
  delete from public.owner_ask_turns where asked_at < now() - interval '90 days';
  if (select count(*) from public.owner_ask_turns where owner_id = me and asked_at >= now() - interval '24 hours') >= p_limit then
    raise exception 'ask_limit';
  end if;
  insert into public.owner_ask_turns (owner_id, question) values (me, left(coalesce(p_question, ''), 2000))
  returning id into turn;
  return turn;
end;
$$;


ALTER FUNCTION "public"."claim_owner_ask"("p_question" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_support_draft"("p_report" "uuid", "p_message" bigint, "p_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  d public.support_drafts;
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_message is not null and not exists (
    select 1 from public.report_messages m where m.id = p_message and m.report_id = p_report and not m.from_owner
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('support.draft:' || p_report::text, 0));
  select * into d from public.support_drafts
  where report_id = p_report and report_message_id is not distinct from p_message;
  if d.id is not null and not (d.state = 'failed' or (d.state = 'drafting' and d.updated_at < now() - interval '2 minutes')) then
    return jsonb_build_object('fresh', false, 'draft', public.support_draft_json(d));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('support.limit:' || me::text, 0));
  if (select count(*) from public.support_drafts where drafted_by = me and updated_at >= now() - interval '24 hours') >= p_limit then
    raise exception 'support_limit';
  end if;
  if d.id is null then
    insert into public.support_drafts (report_id, report_message_id, drafted_by)
    values (p_report, p_message, me)
    returning * into d;
  else
    update public.support_drafts
    set state = 'drafting', drafted_by = me, reply = '', action = 'none', same_as_report_id = null, why = ''
    where id = d.id
    returning * into d;
  end if;
  return jsonb_build_object('fresh', true, 'draft', public.support_draft_json(d));
end;
$$;


ALTER FUNCTION "public"."claim_support_draft"("p_report" "uuid", "p_message" bigint, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_plan_on_new_holder"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.user_id is distinct from old.user_id then
    new.planned_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."clear_plan_on_new_holder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_month"("p_house" "uuid", "p_month" "text", "p_entries" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inserted text;
begin
  insert into public.month_closes (house_id, month) values (p_house, p_month)
  on conflict do nothing
  returning month into inserted;
  if inserted is null then
    return false;
  end if;
  insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month)
  select p_house, (x ->> 'user_id')::uuid, x ->> 'kind', (x ->> 'amount')::integer, p_month
  from jsonb_array_elements(p_entries) x
  where (x ->> 'amount')::integer <> 0;
  insert into public.events (house_id, kind, data)
  values (p_house, 'month_closed', jsonb_build_object('month', p_month));
  return true;
end;
$$;


ALTER FUNCTION "public"."close_month"("p_house" "uuid", "p_month" "text", "p_entries" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_week"("p_week" "uuid", "p_members" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  w public.weeks;
  x jsonb;
  perk text;
  member uuid;
begin
  update public.weeks set closed_at = now()
  where id = p_week and closed_at is null
  returning * into w;
  if w.id is null then
    return false;
  end if;
  for x in select * from jsonb_array_elements(p_members) loop
    member := (x ->> 'user_id')::uuid;
    update public.members set streak = (x ->> 'streak')::smallint
    where house_id = w.house_id and user_id = member;
    for perk in select jsonb_array_elements_text(coalesce(x -> 'earn', '[]'::jsonb)) loop
      if perk = 'immunity' then
        update public.members set immunity_tokens = immunity_tokens + 1
        where house_id = w.house_id and user_id = member and immunity_tokens < 2;
      elsif perk = 'swap' then
        update public.members set swap_tokens = swap_tokens + 1
        where house_id = w.house_id and user_id = member and swap_tokens < 1;
      else
        continue;
      end if;
      if found then
        insert into public.events (house_id, kind, user_id, data)
        values (w.house_id, perk || '_earned', member,
                jsonb_build_object('streak', (x ->> 'streak')::int, 'week', w.starts_on));
      end if;
    end loop;
  end loop;
  return true;
end;
$$;


ALTER FUNCTION "public"."close_week"("p_week" "uuid", "p_members" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."closes_at"("a" "public"."assignments", "week_ends" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."closes_at"("a" "public"."assignments", "week_ends" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_payment"("p_house" "uuid", "p_from" "uuid", "p_amount" integer, "p_via" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  h public.houses;
  mine bigint;
  theirs bigint;
  month text;
begin
  if not public.can(p_house, 'payments:write_own') then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if p_from = me or p_amount <= 0 or (p_via is not null and p_via <> 'splitwise')
     or not exists (select 1 from public.members where house_id = p_house and user_id = p_from) then
    raise exception 'bad_payment' using errcode = '22023';
  end if;
  -- One payment at a time per house, so two confirmations cannot both fit
  -- under the same balance.
  perform pg_advisory_xact_lock(hashtextextended('johns.payment:' || p_house::text, 0));
  select coalesce(sum(l.amount_minor), 0) into mine
  from public.ledger_entries l
  where l.house_id = p_house and l.user_id = me
    and (l.kind = 'payment'
         or exists (select 1 from public.month_closes c where c.house_id = p_house and c.month = l.month));
  select coalesce(sum(l.amount_minor), 0) into theirs
  from public.ledger_entries l
  where l.house_id = p_house and l.user_id = p_from
    and (l.kind = 'payment'
         or exists (select 1 from public.month_closes c where c.house_id = p_house and c.month = l.month));
  if p_amount > mine or p_amount > -theirs then
    raise exception 'more_than_owed';
  end if;
  select * into h from public.houses where id = p_house;
  month := to_char(now() at time zone h.timezone, 'YYYY-MM');
  insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, counterparty_user_id)
  values (p_house, p_from, 'payment', p_amount, month, me),
         (p_house, me, 'payment', -p_amount, month, p_from);
  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'paid', p_from,
          jsonb_build_object('to', me, 'amount', p_amount)
            || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end);
end;
$$;


ALTER FUNCTION "public"."confirm_payment"("p_house" "uuid", "p_from" "uuid", "p_amount" integer, "p_via" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cover_john"("p_assignment" "uuid", "p_photo_path" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
  grace smallint;
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  holders uuid[];
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.can(a.house_id, 'swaps:write_own') then
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
  if a.cover_hold_ends_at is not null and now() < a.cover_hold_ends_at then
    raise exception 'cover_held';
  end if;
  if now() >= public.closes_at(a, ends) then
    raise exception 'week_closed';
  end if;
  if a.needs_photo and photo is null and public.house_has_pass(a.house_id) then
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


ALTER FUNCTION "public"."cover_john"("p_assignment" "uuid", "p_photo_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cover_opens_at"("a" "public"."assignments", "week_ends" timestamp with time zone, "grace" smallint) RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select a.due_at + least(
    make_interval(hours => grace),
    greatest(interval '0', (public.closes_at(a, week_ends) - a.due_at) / 2)
  )
$$;


ALTER FUNCTION "public"."cover_opens_at"("a" "public"."assignments", "week_ends" timestamp with time zone, "grace" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_house"("p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_kind" "text" DEFAULT 'housemates'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_house"("p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credited_to"("a" "public"."assignments") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when a.covered_by is not null then a.covered_by
    when a.outcome = 'missed' then null
    else a.user_id
  end;
$$;


ALTER FUNCTION "public"."credited_to"("a" "public"."assignments") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deal_week"("p_house" "uuid", "p_starts_on" "date", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_assignments" "jsonb", "p_shares" "jsonb", "p_replace" boolean DEFAULT false, "p_on_call" "jsonb" DEFAULT '[]'::"jsonb", "p_state" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  week uuid;
begin
  insert into public.weeks (house_id, starts_on, starts_at, ends_at)
  values (p_house, p_starts_on, p_starts_at, p_ends_at)
  on conflict (house_id, starts_on) do nothing
  returning id into week;

  if week is null then
    if not p_replace then
      return null;
    end if;
    select id into week from public.weeks where house_id = p_house and starts_on = p_starts_on for update;
    if exists (
      select 1 from public.assignments
      where week_id = week
        and (done_at is not null or absent_at is not null or outcome is not null or flagged_at is not null)
    ) then
      raise exception 'week_started';
    end if;
    delete from public.assignments where week_id = week;
    delete from public.week_shares where week_id = week;
    delete from public.on_call_picks where week_id = week;
  end if;

  insert into public.assignments
    (week_id, house_id, john_id, user_id, name, category, points, needs_photo, due_at, group_name, dealt, job_id)
  select week, p_house, (x ->> 'john_id')::uuid, (x ->> 'user_id')::uuid, x ->> 'name',
         x ->> 'category', (x ->> 'points')::smallint, coalesce((x ->> 'needs_photo')::boolean, false),
         (x ->> 'due_at')::timestamptz, x ->> 'group_name', x -> 'dealt', (x ->> 'job_id')::uuid
  from jsonb_array_elements(p_assignments) x;

  insert into public.week_shares (week_id, house_id, user_id, share)
  select week, p_house, (x ->> 'user_id')::uuid, (x ->> 'share')::numeric
  from jsonb_array_elements(p_shares) x;

  insert into public.on_call_picks (week_id, house_id, john_id, user_id)
  select week, p_house, (x ->> 'john_id')::uuid, (x ->> 'user_id')::uuid
  from jsonb_array_elements(p_on_call) x;

  update public.weeks
  set turns = case when jsonb_typeof(p_state -> 'turns') = 'object' then p_state -> 'turns' end,
      waiting = case when jsonb_typeof(p_state -> 'waiting') = 'object' then p_state -> 'waiting' else '{}'::jsonb end,
      ahead = case when jsonb_typeof(p_state -> 'ahead') = 'array' then p_state -> 'ahead' else '[]'::jsonb end
  where id = week;

  update public.houses set first_dealt_at = coalesce(first_dealt_at, now()) where id = p_house;
  insert into public.events (house_id, kind, data)
  values (p_house, 'week_dealt', jsonb_build_object(
    'starts_on', p_starts_on,
    'count', jsonb_array_length(p_assignments) + jsonb_array_length(p_on_call)
  ));
  return week;
end;
$$;


ALTER FUNCTION "public"."deal_week"("p_house" "uuid", "p_starts_on" "date", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_assignments" "jsonb", "p_shares" "jsonb", "p_replace" boolean, "p_on_call" "jsonb", "p_state" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_ask_chat"("p_chat" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  delete from public.ask_chats where id = p_chat;
$$;


ALTER FUNCTION "public"."delete_ask_chat"("p_chat" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_ask_chat"("p_chat" "uuid") IS 'Delete one of your Ask Jonz chats for good.';



CREATE OR REPLACE FUNCTION "public"."delete_group"("p_group" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  house uuid;
begin
  perform public.require_user();
  select house_id into house from public.groups where id = p_group;
  if house is null or not public.can(house, 'groups:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  delete from public.groups where id = p_group;
end;
$$;


ALTER FUNCTION "public"."delete_group"("p_group" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_owner_ask_chat"("p_chat" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  delete from public.owner_ask_chats where id = p_chat;
$$;


ALTER FUNCTION "public"."delete_owner_ask_chat"("p_chat" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_owner_ask_chat"("p_chat" "uuid") IS 'Delete one of your owner Ask Jonz chats for good.';



CREATE OR REPLACE FUNCTION "public"."deletion_away"("p_user" "uuid", "p_until" timestamp with time zone) RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  h public.houses;
  last_day date;
  free_from date;
  w public.away_periods;
  made uuid[] := '{}';
begin
  select houses.* into h
  from public.houses join public.members m on m.house_id = houses.id
  where m.user_id = p_user;
  if h.id is null then
    return made;
  end if;
  free_from := (now() at time zone h.timezone)::date;
  last_day := (p_until at time zone h.timezone)::date;
  for w in
    select * from public.away_periods
    where house_id = h.id and user_id = p_user and ends_on >= free_from and starts_on <= last_day
    order by starts_on
  loop
    if w.starts_on > free_from then
      perform public.start_away(p_user, free_from, w.starts_on - 1, null);
      made := made || (select a.id from public.away_periods a where a.house_id = h.id and a.user_id = p_user and a.starts_on = free_from);
    end if;
    free_from := greatest(free_from, w.ends_on + 1);
  end loop;
  if free_from <= last_day then
    perform public.start_away(p_user, free_from, last_day, null);
    made := made || (select a.id from public.away_periods a where a.house_id = h.id and a.user_id = p_user and a.starts_on = free_from);
  end if;
  return made;
end;
$$;


ALTER FUNCTION "public"."deletion_away"("p_user" "uuid", "p_until" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "raised_by" "uuid",
    "reason" "text" NOT NULL,
    "tick_at" timestamp with time zone NOT NULL,
    "closes_at" timestamp with time zone NOT NULL,
    "resolution" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_path" "text",
    CONSTRAINT "disputes_check" CHECK ((("resolution" IS NULL) = ("resolved_at" IS NULL))),
    CONSTRAINT "disputes_reason_check" CHECK ((("char_length"("btrim"("reason")) >= 1) AND ("char_length"("btrim"("reason")) <= 280))),
    CONSTRAINT "disputes_resolution_check" CHECK (("resolution" = ANY (ARRAY['upheld'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";


COMMENT ON TABLE "public"."disputes" IS 'A Not done check raised on a tick, and its verdict.';



CREATE OR REPLACE FUNCTION "public"."dispute_voters"("d" "public"."disputes") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select count(*)::integer
  from public.members m, public.assignments a
  where a.id = d.assignment_id and m.house_id = d.house_id
    and m.user_id <> coalesce(a.covered_by, a.user_id)
    and not public.owns_covered(a, m.user_id)
$$;


ALTER FUNCTION "public"."dispute_voters"("d" "public"."disputes") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drop_own_flag"("p_assignment" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.assignments;
  x public.house_actions;
begin
  select * into a from public.assignments where id = p_assignment;
  if a.id is null or a.flagged_at is null or a.flagged_by is distinct from a.user_id
     or a.done_at is not null or a.outcome is not null then
    return;
  end if;
  select * into x from public.house_actions
  where assignment_id = a.id and kind = 'flag' and undone_at is null
  order by created_at desc limit 1;
  if x.id is null or public.undo_reach(x) is null then
    return;
  end if;
  perform public.undo_action(x.id);
end;
$$;


ALTER FUNCTION "public"."drop_own_flag"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_account_deletion"("p_user" "uuid", "p_action" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  d public.account_deletions;
  away uuid;
begin
  select * into d from public.account_deletions where user_id = p_user and state = 'pending' for update;
  if d.id is null then
    raise exception 'no_deletion';
  end if;
  update public.account_deletions set state = 'kept', ended_at = now() where id = d.id;
  foreach away in array d.away_ids loop
    perform public.end_deletion_away(away);
  end loop;
  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (auth.uid(), p_action, 'account', p_user::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('state', 'pending', 'delete_after', d.deletes_at),
    jsonb_build_object('state', 'kept'));
end;
$$;


ALTER FUNCTION "public"."end_account_deletion"("p_user" "uuid", "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_away"("p_away" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.away_periods;
  tz text;
  today date;
begin
  select * into a from public.away_periods where id = p_away for update;
  if a.id is null then
    return;
  end if;
  select timezone into tz from public.houses where id = a.house_id;
  today := (now() at time zone tz)::date;
  if a.ends_on < today then
    return;
  end if;

  update public.assignments
  set due_at = original_due_at, original_due_at = null, reminded = 0
  where house_id = a.house_id and user_id = a.user_id
    and done_at is null and outcome is null
    and original_due_at is not null and original_due_at > now()
    and (original_due_at at time zone tz)::date between greatest(a.starts_on, today) and a.ends_on;

  update public.assignments x
  set user_id = x.handed_from_user_id, excused = false, reminded = 0, handed_from_user_id = null, handed_by_away_period_id = null
  where x.handed_by_away_period_id = a.id
    and x.done_at is null and x.outcome is null and x.covered_by is null and x.absent_at is null
    and (x.due_at at time zone tz)::date >= today
    and ((x.user_id = x.handed_from_user_id and x.excused) or (x.user_id <> x.handed_from_user_id and not x.excused))
    and exists (select 1 from public.members m where m.house_id = x.house_id and m.user_id = x.handed_from_user_id);

  if a.starts_on >= today then
    delete from public.away_periods where id = a.id;
    update public.events set data = data || jsonb_build_object('cancelled', true)
    where house_id = a.house_id and kind = 'away' and data ->> 'away' = a.id::text;
  else
    update public.away_periods set ends_on = today - 1 where id = a.id;
    update public.events set data = data || jsonb_build_object('back_on', today)
    where house_id = a.house_id and kind = 'away' and data ->> 'away' = a.id::text;
  end if;
end;
$$;


ALTER FUNCTION "public"."end_away"("p_away" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_deletion_away"("p_away" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.end_away(p_away);
end;
$$;


ALTER FUNCTION "public"."end_deletion_away"("p_away" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_notice"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  old_row public.notices;
  new_row public.notices;
begin
  if not public.can_app('notices:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into old_row from public.notices where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if old_row.ends_at is not null and old_row.ends_at <= now() then
    return;
  end if;
  update public.notices
  set ends_at = greatest(now(), starts_at + interval '1 second'), updated_at = now()
  where id = p_id
  returning * into new_row;

  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (auth.uid(), 'notice.end', 'notice', p_id::text, to_jsonb(old_row), to_jsonb(new_row));
end;
$$;


ALTER FUNCTION "public"."end_notice"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_account_deletion"("p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  m public.members;
  heir uuid;
begin
  select * into m from public.members where user_id = p_user;
  if m.house_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('johns.members:' || m.house_id::text, 0));
    if m.role = 'admin' and not exists (
      select 1 from public.members where house_id = m.house_id and role = 'admin' and user_id <> p_user
    ) then
      select x.user_id into heir from public.members x
      where x.house_id = m.house_id and x.user_id <> p_user
      order by x.joined_at, x.user_id
      limit 1;
      if heir is not null then
        update public.members set role = 'admin' where house_id = m.house_id and user_id = heir;
      end if;
    end if;
    delete from public.members where house_id = m.house_id and user_id = p_user;
  end if;

  update public.houses set pass_bought_by = null where pass_bought_by = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.swap_offers where (asked_by = p_user or asked_user_id = p_user) and answer is null;
  -- The Wall said their name when they moved out; it can't look it up now.
  update public.events set data = data || jsonb_build_object('who', 'Someone who left')
  where user_id = p_user and data ? 'who';
  update public.profiles
  set display_name = 'Someone who left', avatar_url = null, deleted_at = coalesce(deleted_at, now())
  where id = p_user;
  update public.reports set shots = '{}', from_email = null, from_name = null
  where user_id = p_user and (shots <> '{}' or from_email is not null or from_name is not null);
end;
$$;


ALTER FUNCTION "public"."finish_account_deletion"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_owner_ask"("p_turn" "uuid", "p_reply" "text", "p_input" integer, "p_output" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  update public.owner_ask_turns
  set reply = left(p_reply, 8000), input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0)
  where id = p_turn and owner_id = (select auth.uid());
end;
$$;


ALTER FUNCTION "public"."finish_owner_ask"("p_turn" "uuid", "p_reply" "text", "p_input" integer, "p_output" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_support_draft"("p_draft" "uuid", "p_reply" "text", "p_action" "text", "p_same_as" "uuid", "p_why" "text", "p_input" integer, "p_output" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  d public.support_drafts;
  r public.reports;
  act text := coalesce(p_action, 'none');
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into d from public.support_drafts where id = p_draft and state = 'drafting';
  if d.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = d.report_id;
  if act = 'same_as' and (p_same_as is null or p_same_as = r.id
      or not exists (select 1 from public.reports s where s.id = p_same_as)) then
    act := 'none';
  end if;
  if act = 'delete' and r.user_id is null then
    act := 'none';
  end if;
  if act not in ('none', 'same_as', 'delete') then
    act := 'none';
  end if;
  update public.support_drafts
  set state = case when btrim(coalesce(p_reply, '')) = '' then 'failed' else 'ready' end,
      reply = left(coalesce(p_reply, ''), 2000),
      action = act,
      same_as_report_id = case when act = 'same_as' then p_same_as end,
      why = left(coalesce(p_why, ''), 600),
      input_tokens = greatest(coalesce(p_input, 0), 0),
      output_tokens = greatest(coalesce(p_output, 0), 0)
  where id = d.id
  returning * into d;
  return public.support_draft_json(d);
end;
$$;


ALTER FUNCTION "public"."finish_support_draft"("p_draft" "uuid", "p_reply" "text", "p_action" "text", "p_same_as" "uuid", "p_why" "text", "p_input" integer, "p_output" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."first_john_month"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint, "p_week_of_month" smallint, "p_due_dow" smallint) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with this_week as (
    select public.week_starts_on(p_at, p_zone, p_week_starts) as starts_on
  ),
  days as (
    select w, (starts_on + 7 + w * 7 + ((p_due_dow - p_week_starts + 7) % 7))::date as day
    from this_week, generate_series(0, 79) w
  )
  select (extract(year from day)::int * 12 + extract(month from day)::int - 1)
  from days
  where case
    when p_week_of_month = 5 then extract(day from day)::int + 7 > extract(day from (date_trunc('month', day) + interval '1 month - 1 day'))::int
    else ceil(extract(day from day)::int / 7.0)::int = p_week_of_month
  end
  order by w
  limit 1;
$$;


ALTER FUNCTION "public"."first_john_month"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint, "p_week_of_month" smallint, "p_due_dow" smallint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."first_john_month"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint, "p_week_of_month" smallint, "p_due_dow" smallint) IS 'The month (year * 12 + month - 1) a new monthly John starts in: core startMonths(...)[0].month.';



CREATE OR REPLACE FUNCTION "public"."flag_sharers"("p_john" "uuid") RETURNS "uuid"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  j public.johns;
  sharers uuid[];
begin
  select * into j from public.johns where id = p_john;
  select coalesce(array_agg(gm.user_id), '{}') into sharers
  from public.group_members gm where gm.group_id = j.group_id and gm.house_id = j.house_id;
  if j.group_id is null or cardinality(sharers) = 0 then
    select coalesce(array_agg(m.user_id), '{}') into sharers from public.members m where m.house_id = j.house_id;
  end if;
  return sharers;
end;
$$;


ALTER FUNCTION "public"."flag_sharers"("p_john" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."follow_identity_photo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  photo text := public.identity_photo(new.identity_data);
begin
  if photo is not null then
    update public.profiles
    set avatar_url = photo
    where id = new.user_id and avatar_url is distinct from photo and deleted_at is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."follow_identity_photo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hand_over"("p_house" "uuid", "p_to" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
begin
  if not public.can(p_house, 'members:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_to = me or not exists (select 1 from public.members where house_id = p_house and user_id = p_to) then
    raise exception 'not_in_house' using errcode = '22023';
  end if;
  perform public.set_member_role(p_house, p_to, 'admin');
  perform public.remove_member(p_house, me);
end;
$$;


ALTER FUNCTION "public"."hand_over"("p_house" "uuid", "p_to" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Housemate'
    ), 60),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hold_cover"("p_assignment" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
  until timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.can(a.house_id, 'swaps:write_own') then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.user_id <> me then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if a.done_at is not null or a.outcome is not null or a.covered_by is not null or a.excused then
    raise exception 'already_done';
  end if;
  if a.cover_hold_ends_at is not null then
    raise exception 'cover_held_once';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  until := least(now() + interval '2 hours', public.closes_at(a, ends));
  update public.assignments set cover_hold_ends_at = until where id = a.id;
  return until;
end;
$$;


ALTER FUNCTION "public"."hold_cover"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."house_away"("p_house" "uuid", "p_from" "date") RETURNS SETOF "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'away:read');
  select jsonb_build_object('id', a.id, 'user_id', a.user_id, 'starts_on', a.starts_on, 'ends_on', a.ends_on, 'note', a.note)
  from public.away_periods a
  where a.house_id = p_house and a.ends_on >= p_from
  order by a.starts_on, a.id;
$$;


ALTER FUNCTION "public"."house_away"("p_house" "uuid", "p_from" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_away"("p_house" "uuid", "p_from" "date") IS 'Who is away, for times that end on or after a day.';



CREATE OR REPLACE FUNCTION "public"."house_balances"("p_house" "uuid", "p_before" "date") RETURNS TABLE("user_id" "uuid", "owed" numeric, "credited" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with past as (
    select w.id from public.weeks w
    where w.house_id = p_house and w.starts_on < p_before and w.skipped_at is null
  ),
  totals as (
    select s.week_id, sum(s.share) as total
    from public.week_shares s
    where s.week_id in (select id from past)
    group by s.week_id
  ),
  excused as (
    select a.week_id, sum(a.points)::numeric as points
    from public.assignments a
    where a.week_id in (select id from past)
      and a.covered_by is null
      and (a.excused or a.outcome is not distinct from 'excused')
    group by a.week_id
  ),
  owed as (
    select s.user_id,
           sum(s.share * case when t.total > 0 then greatest(0, 1 - coalesce(e.points, 0) / t.total) else 1 end) as owed
    from public.week_shares s
    join totals t on t.week_id = s.week_id
    left join excused e on e.week_id = s.week_id
    where s.week_id in (select id from past)
    group by s.user_id
  ),
  work as (
    select coalesce(a.covered_by, a.user_id) as user_id, a.points::numeric as points
    from public.assignments a
    where a.week_id in (select id from past)
      and (a.covered_by is not null or a.outcome is distinct from 'missed')
      and (a.covered_by is not null or not (a.excused or a.outcome is not distinct from 'excused'))
      and a.absent_at is null
      and not exists (
        select 1 from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) and c.user_id = a.user_id
      )
    union all
    select c.user_id, c.points
    from public.crew_members c
    join public.assignments a on a.id = c.assignment_id
    where a.week_id in (select id from past)
  ),
  credited as (
    select w.user_id, sum(w.points) as credited from work w group by w.user_id
  )
  select coalesce(o.user_id, c.user_id), coalesce(o.owed, 0), coalesce(c.credited, 0)
  from owed o
  full join credited c on c.user_id = o.user_id;
$$;


ALTER FUNCTION "public"."house_balances"("p_house" "uuid", "p_before" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."house_by_code"("p_code" "text") RETURNS TABLE("id" "uuid", "name" "text", "members" bigint, "kind" "text", "currency" "text", "stake_minor" integer, "late_forfeit_minor" integer, "missed_forfeit_minor" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select h.id, h.name, (select count(*) from public.members m where m.house_id = h.id), h.kind,
         h.currency, h.stake_minor, h.late_forfeit_minor, h.missed_forfeit_minor
  from public.houses h
  where h.join_code = upper(btrim(p_code)) and auth.uid() is not null
    and exists (select 1 from public.members m where m.house_id = h.id);
$$;


ALTER FUNCTION "public"."house_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."house_group_balances"("p_house" "uuid", "p_before" "date") RETURNS TABLE("user_id" "uuid", "group_id" "uuid", "owed" numeric, "credited" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with past as (
    select w.id from public.weeks w
    where w.house_id = p_house and w.starts_on < p_before and w.skipped_at is null
  ),
  totals as (
    select s.week_id, sum(s.share) as total
    from public.week_shares s
    where s.week_id in (select id from past)
    group by s.week_id
  ),
  excused as (
    select a.week_id, sum(a.points)::numeric as points
    from public.assignments a
    where a.week_id in (select id from past)
      and a.covered_by is null
      and (a.excused or a.outcome is not distinct from 'excused')
    group by a.week_id
  ),
  owed as (
    select g.user_id, g.group_id,
           sum(g.share * case when t.total > 0 then greatest(0, 1 - coalesce(e.points, 0) / t.total) else 1 end) as owed
    from public.week_group_shares g
    join totals t on t.week_id = g.week_id
    left join excused e on e.week_id = g.week_id
    where g.week_id in (select id from past)
    group by g.user_id, g.group_id
  ),
  kept as (
    select distinct g.week_id, g.group_id from public.week_group_shares g where g.week_id in (select id from past)
  ),
  grouped as (
    select a.*, j.group_id
    from public.assignments a
    join public.johns j on j.id = a.john_id
    join kept k on k.week_id = a.week_id and k.group_id = j.group_id
    where a.flagged_at is null
  ),
  work as (
    select coalesce(a.covered_by, a.user_id) as user_id, a.group_id, a.points::numeric as points
    from grouped a
    where (a.covered_by is not null or a.outcome is distinct from 'missed')
      and (a.covered_by is not null or not (a.excused or a.outcome is not distinct from 'excused'))
      and a.absent_at is null
      and not exists (
        select 1 from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) and c.user_id = a.user_id
      )
    union all
    select c.user_id, a.group_id, c.points
    from public.crew_members c
    join grouped a on a.id = c.assignment_id
  ),
  credited as (
    select w.user_id, w.group_id, sum(w.points) as credited from work w group by w.user_id, w.group_id
  )
  select coalesce(o.user_id, c.user_id), coalesce(o.group_id, c.group_id), coalesce(o.owed, 0), coalesce(c.credited, 0)
  from owed o
  full join credited c on c.user_id = o.user_id and c.group_id = o.group_id;
$$;


ALTER FUNCTION "public"."house_group_balances"("p_house" "uuid", "p_before" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_group_balances"("p_house" "uuid", "p_before" "date") IS 'Each housemate''s share of, and work on, each group''s Johns before a week: their balance in that group''s pool. Reads through RLS, as house_balances does.';



CREATE OR REPLACE FUNCTION "public"."house_has_paid_pass"("p_house" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.houses
    where id = p_house
      and (pass_plan = 'founding' or (pass_plan in ('monthly', 'yearly') and pass_ends_at > now()))
  );
$$;


ALTER FUNCTION "public"."house_has_paid_pass"("p_house" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."house_has_pass"("p_house" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.houses
    where id = p_house
      and (pass_plan = 'founding' or pass_ends_at > now())
  );
$$;


ALTER FUNCTION "public"."house_has_pass"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_has_pass"("p_house" "uuid") IS 'Whether the house has the House Pass now: Founding, or a free month or plan that has not ended.';



CREATE OR REPLACE FUNCTION "public"."house_history"("p_house" "uuid", "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 60) RETURNS TABLE("id" "uuid", "kind" "text", "done_by" "uuid", "subject_user_id" "uuid", "assignment_id" "uuid", "ref" "uuid", "data" "jsonb", "created_at" timestamp with time zone, "undone_at" timestamp with time zone, "undone_by" "uuid", "reach" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select x.id, x.kind, x.done_by, x.subject_user_id, x.assignment_id, x.ref, x.data - 'snapshot', x.created_at, x.undone_at, x.undone_by,
         public.undo_reach(x)
  from public.house_actions x
  where x.house_id = p_house and public.can(p_house, 'history:read')
    and (p_before is null or x.created_at < p_before)
    and (x.created_at >= now() - interval '28 days' or public.house_has_pass(p_house))
  order by x.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;


ALTER FUNCTION "public"."house_history"("p_house" "uuid", "p_before" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."house_live_since"("p_house" "uuid", "p_after" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.can(p_house, 'house:read') then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  return jsonb_build_object('latest', (
    select max(c.id) from public.live_changes c
    where c.house_id = p_house and c.id > coalesce(p_after, 0)
  ));
end;
$$;


ALTER FUNCTION "public"."house_live_since"("p_house" "uuid", "p_after" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."house_month"("p_house" "uuid", "p_month" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'weeks:read');
  with h as (
    select h.timezone, h.week_starts,
           (to_date(p_month, 'YYYY-MM')::timestamp at time zone h.timezone) as month_starts,
           ((to_date(p_month, 'YYYY-MM') + interval '1 month')::timestamp at time zone h.timezone) as month_ends,
           public.week_starts_on(now(), h.timezone, h.week_starts) as this_week
    from public.houses h where h.id = p_house
  ),
  recent as (
    select wk.id from public.weeks wk, h
    where wk.house_id = p_house and wk.starts_on < h.this_week
    order by wk.starts_on desc
    limit 12 -- core USUAL_WEEKS
  )
  select jsonb_build_object(
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'user_id', a.user_id, 'points', a.points, 'outcome', a.outcome, 'done_at', a.done_at,
        'due_at', a.due_at, 'excused', a.excused, 'covered_by', a.covered_by, 'flagged_at', a.flagged_at,
        'closes_at', a.closes_at, 'job_id', a.job_id, 'absent_at', a.absent_at, 'week_ends_at', wk.ends_at,
        'crew', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'helper', c.helper, 'points', c.points))
          from public.crew_members c where c.assignment_id = a.id
        ), '[]'::jsonb)
      ) order by a.due_at, a.id)
      from public.assignments a join public.weeks wk on wk.id = a.week_id
      where a.house_id = p_house and a.due_at >= h.month_starts and a.due_at < h.month_ends
    ), '[]'::jsonb),
    'recent_shares', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'share', s.share) order by s.week_id, s.user_id)
      from public.week_shares s where s.week_id in (select id from recent)
    ), '[]'::jsonb),
    'totals', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', b.user_id, 'owed', b.owed, 'credited', b.credited) order by b.user_id)
      from public.house_balances(p_house, h.this_week) b
    ), '[]'::jsonb)
  )
  from h;
$$;


ALTER FUNCTION "public"."house_month"("p_house" "uuid", "p_month" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_month"("p_house" "uuid", "p_month" "text") IS 'A month''s Johns for the table, the usual weeks'' shares before this one, and every earlier week summed.';



CREATE OR REPLACE FUNCTION "public"."house_pocket"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'pocket_money:read');
  select jsonb_build_object(
    'earnings', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', e.user_id, 'month', e.month, 'amount_minor', e.amount_minor) order by e.month, e.user_id)
      from public.pocket_earnings e where e.house_id = p_house
    ), '[]'::jsonb),
    'pays', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'month', p.month, 'amount_minor', p.amount_minor, 'paid_by', p.paid_by, 'created_at', p.created_at)
                       order by p.created_at, p.user_id)
      from public.pocket_pays p where p.house_id = p_house
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.houses where id = p_house);
$$;


ALTER FUNCTION "public"."house_pocket"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_pocket"("p_house" "uuid") IS 'In a family: what each kid has earned each month, and what they''ve been paid.';



CREATE OR REPLACE FUNCTION "public"."house_record"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'weeks:read');
  select jsonb_build_object(
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('id', wk.id, 'starts_on', wk.starts_on, 'starts_at', wk.starts_at, 'ends_at', wk.ends_at, 'skipped_at', wk.skipped_at)
                       order by wk.starts_on desc)
      from public.weeks wk where wk.house_id = p_house
    ), '[]'::jsonb),
    'away', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'user_id', a.user_id, 'starts_on', a.starts_on, 'ends_on', a.ends_on, 'note', a.note)
                       order by a.starts_on, a.id)
      from public.away_periods a where a.house_id = p_house
    ), '[]'::jsonb),
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object('week_id', s.week_id, 'user_id', s.user_id, 'share', s.share) order by s.week_id, s.user_id)
      from public.week_shares s where s.house_id = p_house
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'week_id', a.week_id, 'user_id', a.user_id, 'name', a.name, 'points', a.points, 'due_at', a.due_at,
        'done_at', a.done_at, 'outcome', a.outcome, 'excused', a.excused, 'covered_by', a.covered_by,
        'changed_by', a.changed_by, 'job_id', a.job_id, 'absent_at', a.absent_at
      ) order by a.id)
      from public.assignments a where a.house_id = p_house
    ), '[]'::jsonb),
    'crew', coalesce((
      select jsonb_agg(jsonb_build_object('job_id', c.job_id, 'assignment_id', c.assignment_id, 'user_id', c.user_id, 'helper', c.helper, 'points', c.points)
                       order by c.job_id, c.user_id)
      from public.crew_members c where c.house_id = p_house
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.houses where id = p_house);
$$;


ALTER FUNCTION "public"."house_record"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_record"("p_house" "uuid") IS 'Every week, time away, share and John the house has had, for its track record.';



CREATE OR REPLACE FUNCTION "public"."house_stake"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'payments:read');
  select jsonb_build_object(
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'user_id', l.user_id, 'kind', l.kind, 'amount_minor', l.amount_minor, 'month', l.month,
        'counterparty_user_id', l.counterparty_user_id, 'doers', l.doers, 'created_at', l.created_at,
        'john', case when a.id is null then null else jsonb_build_object('name', a.name, 'outcome', a.outcome, 'due_at', a.due_at) end
      ) order by l.id desc)
      from public.ledger_entries l
      left join public.assignments a on a.id = l.assignment_id
      where l.house_id = p_house
    ), '[]'::jsonb),
    'closed_months', coalesce((
      select jsonb_agg(mc.month order by mc.month) from public.month_closes mc where mc.house_id = p_house
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.houses where id = p_house);
$$;


ALTER FUNCTION "public"."house_stake"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_stake"("p_house" "uuid") IS 'The house''s money: every forfeit, payment and credit, newest first, and the months closed.';



CREATE OR REPLACE FUNCTION "public"."house_today"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'house:read');
  with h as (
    select * from public.houses where id = p_house
  ),
  w as (
    select wk.id, wk.starts_on, wk.starts_at, wk.ends_at, wk.waiting, wk.ahead
    from public.weeks wk, h
    where wk.house_id = p_house and wk.starts_on = public.week_starts_on(now(), h.timezone, h.week_starts)
  ),
  -- This week's Johns by when they're due, then any still open from before
  -- (a flag, or one due late on its last day): it stays with whoever had it.
  dealt as (
    select a.*, 0 as part from public.assignments a join w on a.week_id = w.id
    union all
    select a.*, 1 as part from public.assignments a, w
    where a.house_id = p_house and a.week_id <> w.id and a.outcome is null
  )
  select jsonb_build_object(
    'house', to_jsonb(h),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'role', m.role, 'streak', m.streak, 'immunity_tokens', m.immunity_tokens,
        'swap_tokens', m.swap_tokens, 'suits_days', to_jsonb(m.suits_days), 'best_time', m.best_time, 'rather', m.rather,
        'moving_out_on', m.moving_out_on, 'signs_in', m.signs_in, 'born_year', m.born_year,
        'name', p.display_name, 'photo', p.avatar_url
      ) order by m.joined_at)
      from public.members m left join public.profiles p on p.id = m.user_id
      where m.house_id = p_house
    ), '[]'::jsonb),
    'week', (select to_jsonb(w) from w),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(d) - 'part' || jsonb_build_object(
        'every_weeks', j.every_weeks,
        'every_months', j.every_months,
        'crew', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'helper', c.helper, 'points', c.points))
          from public.crew_members c where c.assignment_id = d.id
        ), '[]'::jsonb)
      ) order by d.part, case when d.part = 0 then d.due_at end, d.id)
      from dealt d left join public.johns j on j.id = d.john_id
    ), '[]'::jsonb),
    'disputes', case when exists (select 1 from w) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'assignment_id', x.assignment_id, 'raised_by', x.raised_by, 'reason', x.reason,
        'closes_at', x.closes_at, 'photo_path', x.photo_path,
        'votes', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', v.user_id, 'uphold', v.uphold))
          from public.dispute_votes v where v.dispute_id = x.id
        ), '[]'::jsonb)
      ) order by x.closes_at, x.id)
      from public.disputes x
      where x.house_id = p_house and x.resolution is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'on_call', coalesce((
      select jsonb_agg(jsonb_build_object(
        'john_id', o.john_id, 'user_id', o.user_id,
        'john', case when j.id is null then null else jsonb_build_object('name', j.name, 'category', j.category, 'needs_photo', j.needs_photo, 'archived_at', j.archived_at) end
      ) order by o.john_id, o.user_id)
      from public.on_call_picks o join w on o.week_id = w.id
      left join public.johns j on j.id = o.john_id
    ), '[]'::jsonb),
    'offers', case when exists (select 1 from w) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'mine', s.asker_assignment_id, 'theirs', s.asked_assignment_id,
        'asked_by', s.asked_by, 'asked_user_id', s.asked_user_id, 'expires_at', s.expires_at
      ) order by s.expires_at, s.id)
      from public.swap_offers s
      where s.house_id = p_house and s.answer is null and s.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end,
    'moves', jsonb_build_object(
      'last_moved_out', (select max(e.created_at) from public.events e where e.house_id = p_house and e.kind = 'moved_out'),
      'last_joined', (select max(e.created_at) from public.events e where e.house_id = p_house and e.kind = 'joined')
    )
  )
  from h;
$$;


ALTER FUNCTION "public"."house_today"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_today"("p_house" "uuid") IS 'One read of a house: its rules and people, this week, its Johns (and any still open from before), open disputes, who is on call, open swap asks, and when someone last moved out or in.';



CREATE OR REPLACE FUNCTION "public"."house_wall"("p_house" "uuid", "p_limit" integer DEFAULT 50, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "kind" "text", "user_id" "uuid", "assignment_id" "uuid", "data" "jsonb", "created_at" timestamp with time zone, "photo_path" "text", "reactions" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'wall:read');
  select e.id, e.kind, e.user_id, e.assignment_id, e.data, e.created_at, a.photo_path,
         coalesce((
           select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'kind', r.kind) order by r.created_at, r.user_id)
           from public.reactions r where r.event_id = e.id
         ), '[]'::jsonb)
  from public.events e
  left join public.assignments a on a.id = e.assignment_id
  where e.house_id = p_house
    and e.kind <> 'week_dealt'
    and (p_cursor_at is null or (e.created_at, e.id) < (p_cursor_at, p_cursor_id))
  order by e.created_at desc, e.id desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."house_wall"("p_house" "uuid", "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."house_wall"("p_house" "uuid", "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") IS 'The Wall, newest first, a page at a time, with each post''s photo and reactions.';



CREATE OR REPLACE FUNCTION "public"."identity_photo"("data" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select photo from (
    select coalesce(nullif(btrim(data ->> 'avatar_url'), ''), nullif(btrim(data ->> 'picture'), '')) as photo
  ) p
  where photo ~ '^https://';
$$;


ALTER FUNCTION "public"."identity_photo"("data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member"("h" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.members m
    where m.house_id = h and m.user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_member"("h" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.can_app('admin:read');
$$;


ALTER FUNCTION "public"."is_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_follows"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  tick timestamptz := old.done_at;
  n integer;
begin
  if old.covered_by is not null then
    -- A cover of a job taken back: the rest of what it covered opens again.
    if old.job_id is null then
      return null;
    end if;
    delete from public.ledger_entries l
    using public.assignments p
    where l.assignment_id = p.id and l.kind = 'forfeit'
      and p.job_id = old.job_id and p.id <> old.id
      and p.covered_by = old.covered_by and p.done_at = tick
      and public.month_open(p.house_id, p.due_at);
    update public.assignments p
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null
    where p.job_id = old.job_id and p.id <> old.id
      and p.covered_by = old.covered_by and p.done_at = tick;
    return null;
  end if;

  if exists (select 1 from public.crew_members where assignment_id = old.id and created_at = tick) then
    -- The place it was ticked from: the whole roll call goes.
    delete from public.crew_members where assignment_id = old.id and created_at = tick;
    if old.job_id is not null then
      delete from public.ledger_entries l
      using public.assignments p
      where l.assignment_id = p.id and l.kind = 'forfeit'
        and p.job_id = old.job_id and p.id <> old.id and p.covered_by is null
        and (p.done_at = tick or p.absent_at = tick)
        and public.month_open(p.house_id, p.due_at);
      update public.assignments p
      set done_at = null, photo_path = null, absent_at = null, outcome = null, settled_at = null
      where p.job_id = old.job_id and p.id <> old.id and p.covered_by is null
        and (p.done_at = tick or p.absent_at = tick);
    end if;
    return null;
  end if;

  -- Someone on a roll call whose own place opened again: off the crew, and
  -- their place's points out of the share.
  select count(*) into n from public.crew_members where job_id = coalesce(old.job_id, old.id) and created_at = tick;
  if n > 0 and exists (
    select 1 from public.crew_members where job_id = coalesce(old.job_id, old.id) and created_at = tick and user_id = old.user_id
  ) then
    delete from public.crew_members where job_id = coalesce(old.job_id, old.id) and created_at = tick and user_id = old.user_id;
    if n > 1 then
      update public.crew_members
      set points = greatest(points * n - old.points, 0) / (n - 1)
      where job_id = coalesce(old.job_id, old.id) and created_at = tick;
    end if;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."job_follows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."john_columns"("p_house" "uuid", "p_john" "jsonb", "p_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'name', p_john ->> 'name',
    'category', p_john ->> 'category',
    'points', (p_john ->> 'points')::smallint,
    'every_weeks', case when monthly then 1 else (p_john ->> 'everyWeeks')::smallint end,
    'every_months', case when monthly then (p_john ->> 'everyMonths')::smallint end,
    'week_of_month', case when monthly then (p_john ->> 'weekOfMonth')::smallint end,
    'anchor_month', case when monthly then coalesce(
      (p_john ->> 'anchorMonth')::int,
      public.first_john_month(p_at, h.timezone, h.week_starts, (p_john ->> 'weekOfMonth')::smallint, (p_john ->> 'dueDow')::smallint)
    ) end,
    'anchor_week', public.week_index_at(p_at, h.timezone, h.week_starts),
    'due_dow', (p_john ->> 'dueDow')::smallint,
    'due_time', (p_john ->> 'dueTime')::time,
    'needs_photo', (p_john ->> 'needsPhoto')::boolean,
    'group_id', (p_john ->> 'groupId')::uuid,
    'kind', p_john ->> 'when',
    'respond_hours', (p_john ->> 'respondHours')::smallint,
    'per_week', (p_john ->> 'perWeek')::smallint,
    'crew', case when p_john ->> 'when' = 'on_call' then 1 else (p_john ->> 'crew')::smallint end,
    'keep_day', p_john ->> 'when' <> 'on_call' and (p_john ->> 'keepDay')::boolean,
    'pay_minor', (p_john ->> 'payMinor')::int,
    'min_age', (p_john ->> 'minAge')::smallint
  )
  from public.houses h,
       lateral (select (p_john ->> 'everyMonths') is not null and (p_john ->> 'weekOfMonth') is not null as monthly) m
  where h.id = p_house;
$$;


ALTER FUNCTION "public"."john_columns"("p_house" "uuid", "p_john" "jsonb", "p_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."john_columns"("p_house" "uuid", "p_john" "jsonb", "p_at" timestamp with time zone) IS 'A John''s table columns from its fields (camelCase, as /v1 takes them), timed in its house''s zone.';



CREATE OR REPLACE FUNCTION "public"."john_list"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can(p_house, 'johns:read');
  select jsonb_build_object(
    'johns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'name', j.name, 'category', j.category, 'points', j.points, 'every_weeks', j.every_weeks,
        'every_months', j.every_months, 'week_of_month', j.week_of_month, 'anchor_month', j.anchor_month,
        'anchor_week', j.anchor_week, 'due_dow', j.due_dow, 'due_time', j.due_time, 'needs_photo', j.needs_photo,
        'group_id', j.group_id, 'kind', j.kind, 'respond_hours', j.respond_hours, 'per_week', j.per_week,
        'crew', j.crew, 'keep_day', j.keep_day, 'pay_minor', j.pay_minor, 'min_age', j.min_age
      ) order by j.created_at, j.id)
      from public.johns j
      where j.house_id = p_house and j.archived_at is null
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name,
        'members', coalesce((select jsonb_agg(gm.user_id order by gm.user_id) from public.group_members gm where gm.group_id = g.id), '[]'::jsonb)
      ) order by g.name, g.id)
      from public.groups g
      where g.house_id = p_house
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.houses where id = p_house);
$$;


ALTER FUNCTION "public"."john_list"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."john_list"("p_house" "uuid") IS 'The house''s list of Johns, oldest first, and its groups with who is in each.';



CREATE OR REPLACE FUNCTION "public"."john_pay_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.assignments a set pay_minor = new.pay_minor
  where a.john_id = new.id and a.outcome is null
    and exists (select 1 from public.houses h where h.id = a.house_id and h.kind = 'family');
  return new;
end;
$$;


ALTER FUNCTION "public"."john_pay_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_house"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  house uuid;
begin
  select id into house from public.houses where join_code = upper(btrim(p_code));
  if house is null then
    raise exception 'unknown_code';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || house::text, 0));
  if not exists (select 1 from public.members where house_id = house) then
    raise exception 'unknown_code';
  end if;
  if exists (select 1 from public.members where house_id = house and user_id = me) then
    return house;
  end if;
  if exists (select 1 from public.members where user_id = me) then
    raise exception 'already_in_house';
  end if;
  insert into public.members (house_id, user_id) values (house, me);
  insert into public.events (house_id, kind, user_id) values (house, 'joined', me);
  perform public.record_moved_on(me, house, 'joined');
  return house;
end;
$$;


ALTER FUNCTION "public"."join_house"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
begin
  if exists (select 1 from public.account_deletions where user_id = me and state = 'pending') then
    perform public.end_account_deletion(me, 'account.delete_keep', null);
  end if;
end;
$$;


ALTER FUNCTION "public"."keep_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_ask_chat"("p_house" "uuid", "p_turns" "jsonb") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.ask_chats (house_id, title, turns)
  values (p_house, public.chat_title_of(p_turns), public.chat_turns_kept(p_turns))
  returning id;
$$;


ALTER FUNCTION "public"."keep_ask_chat"("p_house" "uuid", "p_turns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keep_ask_chat"("p_house" "uuid", "p_turns" "jsonb") IS 'Keep a new Ask Jonz chat in a house; its id.';



CREATE OR REPLACE FUNCTION "public"."keep_owner_ask_chat"("p_turns" "jsonb") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  insert into public.owner_ask_chats (title, turns)
  values (public.chat_title_of(p_turns), public.chat_turns_kept(p_turns))
  returning id;
$$;


ALTER FUNCTION "public"."keep_owner_ask_chat"("p_turns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keep_owner_ask_chat"("p_turns" "jsonb") IS 'Keep a new owner Ask Jonz chat; its id.';



CREATE OR REPLACE FUNCTION "public"."leave_pass"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  o public.moves;
begin
  select * into o from public.moves
  where user_id = me and pass_state = 'waiting'
  order by left_at desc
  limit 1
  for update;
  if o.id is null then
    raise exception 'no_pass_to_leave';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || o.from_house_id::text, 0));
  if public.house_has_paid_pass(o.from_house_id) then
    update public.moves set pass_state = 'left' where id = o.id;
  else
    perform public.place_pass(o.id, o.from_house_id, 'left');
  end if;
end;
$$;


ALTER FUNCTION "public"."leave_pass"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."left_off_settled"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  n integer;
begin
  new.absent_at := null;
  select count(*) into n from public.crew_members where job_id = old.job_id and created_at = old.absent_at;
  if n > 0 then
    update public.crew_members
    set points = greatest(points - old.points::numeric / n, 0)
    where job_id = old.job_id and created_at = old.absent_at;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."left_off_settled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."like_escaped"("p_words" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select replace(replace(replace(p_words, '\', '\\'), '%', '\%'), '_', '\_');
$$;


ALTER FUNCTION "public"."like_escaped"("p_words" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."like_escaped"("p_words" "text") IS 'Words to put inside a LIKE pattern, matched as they are.';



CREATE OR REPLACE FUNCTION "public"."live_notices"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link_label', n.link_label,
                                               'link_url', n.link_url, 'starts_at', n.starts_at, 'ends_at', n.ends_at) order by n.starts_at desc), '[]'::jsonb)
  from (select * from public.notices where starts_at <= now() and (ends_at is null or ends_at > now()) order by starts_at desc limit 50) n;
$$;


ALTER FUNCTION "public"."live_notices"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."live_notices"() IS 'The notices on now, the latest first.';



CREATE OR REPLACE FUNCTION "public"."live_topic"("p_house_id" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select 'live:' || (abs(hashtext(p_house_id::text)) % 16)::text;
$$;


ALTER FUNCTION "public"."live_topic"("p_house_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_done"("p_assignment" "uuid", "p_photo_path" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.assignments := public.my_open_assignment(p_assignment);
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  if a.done_at is not null then
    raise exception 'already_done';
  end if;
  if a.job_id is not null then
    raise exception 'roll_call_needed';
  end if;
  if a.needs_photo and photo is null and public.house_has_pass(a.house_id) then
    raise exception 'photo_required';
  end if;
  if photo is not null and photo not like a.house_id::text || '/' || a.id::text || '/%' then
    raise exception 'photo_path' using errcode = '22023';
  end if;
  update public.assignments set done_at = now(), photo_path = photo where id = a.id;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (
    a.house_id,
    case when now() > a.due_at then 'late' else 'done' end,
    a.user_id,
    a.id,
    jsonb_build_object('name', a.name, 'points', a.points, 'photo', photo is not null)
  );
end;
$$;


ALTER FUNCTION "public"."mark_done"("p_assignment" "uuid", "p_photo_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."month_open"("p_house" "uuid", "p_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select not exists (
    select 1 from public.month_closes c join public.houses h on h.id = c.house_id
    where c.house_id = p_house and c.month = to_char(p_at at time zone h.timezone, 'YYYY-MM')
  );
$$;


ALTER FUNCTION "public"."month_open"("p_house" "uuid", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moving_on"() RETURNS TABLE("from_house_id" "uuid", "house_name" "text", "johns" bigint, "left_at" timestamp with time zone, "pass_plan" "text", "pass_state" "text", "house_pass_until" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.from_house_id, h.name,
    (select count(*) from public.johns j where j.house_id = o.from_house_id and j.archived_at is null),
    o.left_at, o.pass_plan, o.pass_state,
    case when h.pass_plan = 'trial' then (h.pass_ends_at at time zone h.timezone)::date end
  from public.moves o join public.houses h on h.id = o.from_house_id
  where o.user_id = auth.uid() and o.how is null and o.left_at > now() - interval '90 days'
  order by o.left_at desc
  limit 1;
$$;


ALTER FUNCTION "public"."moving_on"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_app_access"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('client_id', a.client_id, 'access', a.access) order by a.client_id), '[]'::jsonb)
  from public.connected_apps a
  where a.user_id = public.require_first_party();
$$;


ALTER FUNCTION "public"."my_app_access"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_app_access"() IS 'What each app you connected to Jonz may do. Refuses a connected app''s own token.';



CREATE OR REPLACE FUNCTION "public"."my_app_permissions"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(array_agg(rp.permission order by rp.permission), '{}')
  from public.app_role_permissions rp
  where rp.role = public.my_app_role();
$$;


ALTER FUNCTION "public"."my_app_permissions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_app_permissions"() IS 'Every app-scope permission the caller holds now (none without an app role and their code).';



CREATE OR REPLACE FUNCTION "public"."my_app_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.role from public.app_owners o
  where o.user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;


ALTER FUNCTION "public"."my_app_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_app_role"() IS 'The caller''s app role (owner or support), or null: not one, or no authenticator code this session.';



CREATE OR REPLACE FUNCTION "public"."my_ask_chat"("p_chat" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('id', c.id, 'title', c.title, 'turns', c.turns) from public.ask_chats c where c.id = p_chat;
$$;


ALTER FUNCTION "public"."my_ask_chat"("p_chat" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_ask_chat"("p_chat" "uuid") IS 'One of your Ask Jonz chats, with its turns.';



CREATE OR REPLACE FUNCTION "public"."my_ask_chats"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'updated_at', c.updated_at) order by c.updated_at desc), '[]'::jsonb)
  from (select id, title, updated_at from public.ask_chats where house_id = p_house order by updated_at desc limit 200) c;
$$;


ALTER FUNCTION "public"."my_ask_chats"("p_house" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_ask_chats"("p_house" "uuid") IS 'Your Ask Jonz chats in a house, the latest first.';



CREATE OR REPLACE FUNCTION "public"."my_house"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('house_id', m.house_id, 'name', h.name, 'kind', h.kind)
  from public.members m
  join public.houses h on h.id = m.house_id
  where m.user_id = (select auth.uid())
  limit 1;
$$;


ALTER FUNCTION "public"."my_house"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_house"() IS 'The house you''re in (id, name, kind), or null.';



CREATE OR REPLACE FUNCTION "public"."my_language"() RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select p.language from public.profiles p where p.id = (select auth.uid());
$$;


ALTER FUNCTION "public"."my_language"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_language"() IS 'The language you read Jonz in, or null before the app has saved one.';



CREATE OR REPLACE FUNCTION "public"."my_notifications"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('reminders', p.reminders, 'checks', p.checks, 'flags', p.flags, 'deal', p.deal,
                            'quiet_from', p.quiet_from, 'quiet_until', p.quiet_until, 'timezone', p.timezone)
  from public.notification_prefs p
  where p.user_id = (select auth.uid());
$$;


ALTER FUNCTION "public"."my_notifications"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_notifications"() IS 'What to push you and when to keep quiet, or null for the defaults (everything on).';



CREATE OR REPLACE FUNCTION "public"."my_open_assignment"("p_assignment" "uuid", "p_permission" "text" DEFAULT 'ticks:write_own'::"text") RETURNS "public"."assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."my_open_assignment"("p_assignment" "uuid", "p_permission" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_open_assignment"("p_assignment" "uuid", "p_permission" "text") IS 'The caller''s own open John (or one they act for), locked, if they hold the permission in its house; otherwise raises.';



CREATE OR REPLACE FUNCTION "public"."my_permissions"("h" "uuid") RETURNS SETOF "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select rp.permission
  from public.members m
  join public.role_permissions rp on rp.role = m.role
  where m.house_id = h and m.user_id = (select auth.uid())
  order by rp.permission;
$$;


ALTER FUNCTION "public"."my_permissions"("h" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_report"("p_report" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'report', jsonb_build_object('id', r.id, 'user_id', r.user_id, 'kind', r.kind, 'state', r.state, 'words', r.words,
                                 'details', r.details, 'shots', r.shots, 'created_at', r.created_at, 'source', r.source, 'subject', r.subject),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'created_at', m.created_at)
                       order by m.created_at, m.id)
      from public.report_messages m where m.report_id = r.id), '[]'::jsonb))
  from public.reports r
  where r.id = p_report;
$$;


ALTER FUNCTION "public"."my_report"("p_report" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_report"("p_report" "uuid") IS 'One of your reports with its conversation, or null.';



CREATE OR REPLACE FUNCTION "public"."my_reports"() RETURNS TABLE("id" "uuid", "kind" "text", "state" "text", "words" "text", "created_at" timestamp with time zone, "last_activity_at" timestamp with time zone, "replies" integer, "unread" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select r.id, r.kind, r.state, r.words, r.created_at, r.last_activity_at,
    (select count(*)::integer from public.report_messages m where m.report_id = r.id and m.from_owner),
    exists (select 1 from public.report_messages m where m.report_id = r.id and m.from_owner and m.created_at > r.seen_at)
  from public.reports r
  where r.user_id = (select auth.uid())
  order by r.created_at desc, r.id desc
  limit 200;
$$;


ALTER FUNCTION "public"."my_reports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."new_join_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return code;
end;
$$;


ALTER FUNCTION "public"."new_join_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."note_live_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  house uuid := case when tg_op = 'DELETE' then old.house_id else new.house_id end;
  change bigint;
begin
  if house is null then
    return null;
  end if;
  -- A house being deleted takes its rows with it: nobody is left to tell.
  insert into public.live_changes (house_id)
  select h.id from public.houses h where h.id = house
  returning id into change;
  if change is null then
    return null;
  end if;
  -- Now and then, forget what's two days old: a stream gone that long reads the house afresh.
  if random() < 0.01 then
    delete from public.live_changes where created_at < now() - interval '2 days';
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('house', house, 'id', change),
      'change',
      public.live_topic(house),
      true
    );
  exception when others then
    -- A missed message only delays the screen: the stream's next look catches it.
    null;
  end;
  return null;
end;
$$;


ALTER FUNCTION "public"."note_live_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."offer_swap"("p_mine" "uuid", "p_theirs" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  given public.assignments := public.my_open_assignment(p_mine, 'swaps:write_own');
  taken public.assignments;
  zone text;
  offer uuid;
begin
  select * into taken from public.assignments where id = p_theirs;
  if taken.id is null or taken.house_id <> given.house_id or taken.week_id <> given.week_id
     or taken.user_id = given.user_id
     or given.done_at is not null or given.flagged_at is not null or given.job_id is not null
     or taken.done_at is not null or taken.outcome is not null or taken.absent_at is not null
     or taken.flagged_at is not null or taken.job_id is not null then
    raise exception 'not_swappable';
  end if;
  if not exists (
    select 1 from public.members m
    where m.house_id = given.house_id and m.user_id = taken.user_id and m.rather -> (given.john_id::text) = '1'::jsonb
  ) then
    raise exception 'not_swappable';
  end if;
  -- An ask that ran out unanswered is let go, so the John can be asked about again.
  delete from public.swap_offers where swap_offers.asker_assignment_id = p_mine and answer is null and expires_at <= now();
  select h.timezone into zone from public.houses h where h.id = given.house_id;
  insert into public.swap_offers (house_id, asker_assignment_id, asked_assignment_id, asked_by, asked_user_id, expires_at)
  values (given.house_id, given.id, taken.id, given.user_id, taken.user_id,
          (date_trunc('day', now() at time zone zone) + interval '1 day') at time zone zone)
  on conflict (asker_assignment_id) where answer is null do nothing
  returning id into offer;
  if offer is null then
    raise exception 'already_asked';
  end if;
  return offer;
end;
$$;


ALTER FUNCTION "public"."offer_swap"("p_mine" "uuid", "p_theirs" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_flag"("p_john" "uuid", "p_at" timestamp with time zone, "p_by" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  j public.johns;
  h public.houses;
  w public.weeks;
  today date;
  holder uuid;
  sharers uuid[];
  existing uuid;
  flag uuid;
  group_label text;
begin
  select * into j from public.johns where id = p_john for update;
  if j.id is null or j.archived_at is not null or j.kind <> 'on_call' then
    raise exception 'not_on_call';
  end if;
  select * into h from public.houses where id = j.house_id;
  select * into w from public.weeks
  where house_id = j.house_id and starts_at <= p_at and ends_at > p_at;
  if w.id is null then
    raise exception 'not_dealt';
  end if;

  select id into existing from public.assignments
  where john_id = j.id and flagged_at is not null and done_at is null and outcome is null
  order by flagged_at desc limit 1;
  if existing is not null then
    return existing;
  end if;

  today := (p_at at time zone h.timezone)::date;
  select coalesce(array_agg(gm.user_id), '{}') into sharers
  from public.group_members gm
  where gm.group_id = j.group_id and gm.house_id = j.house_id;
  if j.group_id is null or cardinality(sharers) = 0 then
    select array_agg(m.user_id) into sharers from public.members m where m.house_id = j.house_id;
  else
    select g.name into group_label from public.groups g where g.id = j.group_id;
  end if;

  select oc.user_id into holder from public.on_call_picks oc
  where oc.week_id = w.id and oc.john_id = j.id
    and oc.user_id = any (sharers)
    and not exists (
      select 1 from public.away_periods a
      where a.house_id = j.house_id and a.user_id = oc.user_id and today between a.starts_on and a.ends_on
    );
  if holder is null then
    select s.id into holder
    from unnest(sharers) as s (id)
    where not exists (
      select 1 from public.away_periods a
      where a.house_id = j.house_id and a.user_id = s.id and today between a.starts_on and a.ends_on
    )
    order by (
      select coalesce(sum(x.points), 0) from public.assignments x where x.week_id = w.id and x.user_id = s.id
    ), s.id
    limit 1;
  end if;
  if holder is null then
    raise exception 'nobody_home';
  end if;

  -- reminded = 1: the flag's own push says it needs doing, so the clock only
  -- sends the "due soon" one.
  insert into public.assignments
    (week_id, house_id, john_id, user_id, name, category, points, needs_photo, due_at,
     group_name, flagged_by, flagged_at, reminded)
  values
    (w.id, j.house_id, j.id, holder, j.name, j.category, j.points, j.needs_photo,
     p_at + make_interval(hours => j.respond_hours), group_label, p_by, p_at, 1)
  returning id into flag;

  insert into public.week_shares (week_id, house_id, user_id, share)
  select w.id, j.house_id, s.id, round(j.points::numeric / cardinality(sharers), 2)
  from unnest(sharers) as s (id)
  on conflict (week_id, user_id) do update set share = public.week_shares.share + excluded.share;

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (j.house_id, 'flagged', holder, flag,
          jsonb_build_object('name', j.name, 'by', p_by, 'due_at', p_at + make_interval(hours => j.respond_hours)));
  return flag;
end;
$$;


ALTER FUNCTION "public"."open_flag"("p_john" "uuid", "p_at" timestamp with time zone, "p_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_ask_chat"("p_chat" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select jsonb_build_object('id', c.id, 'title', c.title, 'turns', c.turns) from public.owner_ask_chats c where c.id = p_chat;
$$;


ALTER FUNCTION "public"."owner_ask_chat"("p_chat" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_ask_chat"("p_chat" "uuid") IS 'One of your owner Ask Jonz chats, with its turns.';



CREATE OR REPLACE FUNCTION "public"."owner_ask_chats"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'updated_at', c.updated_at) order by c.updated_at desc), '[]'::jsonb)
  from (select id, title, updated_at from public.owner_ask_chats order by updated_at desc limit 200) c;
$$;


ALTER FUNCTION "public"."owner_ask_chats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_ask_chats"() IS 'Your saved owner Ask Jonz chats, the latest first.';



CREATE OR REPLACE FUNCTION "public"."owner_audit_count"("p_q" "text" DEFAULT NULL::"text", "p_who" "text" DEFAULT NULL::"text", "p_what" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select count(*)::int from public.owner_audit_matching(p_q, p_who, p_what, p_after, p_before);
$$;


ALTER FUNCTION "public"."owner_audit_count"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_audit_count"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) IS 'How many audit entries a filter matches.';



CREATE OR REPLACE FUNCTION "public"."owner_audit_entry"("p_entry" bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select jsonb_build_object('id', a.id, 'created_at', a.created_at, 'actor', a.actor, 'action', a.action, 'target_kind', a.target_kind,
                            'target_id', a.target_id, 'reason', a.reason, 'before', a.before, 'after', a.after)
  from public.admin_audit a
  where a.id = p_entry;
$$;


ALTER FUNCTION "public"."owner_audit_entry"("p_entry" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_audit_entry"("p_entry" bigint) IS 'One entry of the audit log, or null.';



CREATE OR REPLACE FUNCTION "public"."owner_audit_matching"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) RETURNS SETOF "public"."admin_audit"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $_$
  select a.*
  from public.admin_audit a,
       lateral (select public.search_words(p_q) as words) w
  where (p_who is null or p_who = 'anyone'
         or (p_who = 'you' and a.actor = (select auth.uid()))
         or (p_who = 'others' and a.actor is not null and a.actor <> (select auth.uid()))
         or (p_who = 'jonz' and a.actor is null))
    and (p_what is null or p_what = 'anything'
         or (p_what = 'notices' and a.action like 'notice.%')
         or (p_what = 'accounts' and a.action like 'account.%'))
    and (p_after is null or a.created_at > p_after)
    and (p_before is null or a.created_at <= p_before)
    and (w.words is null
         or (w.words ~ '^#?\d{1,15}$'
             and (a.id = replace(w.words, '#', '')::bigint
                  or a.target_id ilike public.like_escaped(replace(w.words, '#', '')) || '%'))
         or (w.words !~ '^#?\d{1,15}$'
             and not exists (
               select 1
               from (select lower(concat_ws(' ', public.audit_row_words(a, (select auth.uid())), a.reason,
                                            a.after ->> 'title', a.before ->> 'title', a.target_id)) as words) shown,
                    unnest(string_to_array(lower(w.words), ' ')) typed (word)
               where strpos(shown.words, typed.word) = 0)));
$_$;


ALTER FUNCTION "public"."owner_audit_matching"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_audit_matching"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) IS 'The audit entries an audit log filter matches.';



CREATE OR REPLACE FUNCTION "public"."owner_audit_page"("p_q" "text" DEFAULT NULL::"text", "p_who" "text" DEFAULT NULL::"text", "p_what" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("id" bigint, "created_at" timestamp with time zone, "actor" "uuid", "action" "text", "target_kind" "text", "target_id" "text", "reason" "text", "before" "jsonb", "after" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select a.id, a.created_at, a.actor, a.action, a.target_kind, a.target_id, a.reason, a.before, a.after
  from public.owner_audit_matching(p_q, p_who, p_what, p_after, p_before) a
  where p_cursor_at is null or (a.created_at, a.id) < (p_cursor_at, p_cursor_id)
  order by a.created_at desc, a.id desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."owner_audit_page"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_audit_page"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" bigint) IS 'The audit log, newest first, a page at a time.';



CREATE OR REPLACE FUNCTION "public"."owner_delete_house"("p_house" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_subject" "text" DEFAULT NULL::"text", "p_body" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  h public.houses;
  sub text;
  people integer;
  msg uuid;
begin
  if not public.can_app('houses:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into h from public.houses where id = p_house for update;
  if h.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (p_subject is null) <> (p_body is null)
    or p_subject is not null and (char_length(btrim(p_subject)) not between 1 and 80 or char_length(btrim(p_body)) not between 1 and 500) then
    raise exception 'message_who' using errcode = 'P0001';
  end if;

  select b.stripe_subscription_id into sub from public.house_pass_billing b where b.house_id = h.id;
  select count(*) into people from public.members m where m.house_id = h.id;

  -- Told before it goes, while the house still says who lives there.
  if p_subject is not null then
    select count(*) into people from public.owner_message_people('house', null, h.id);
    if people > 0 then
      insert into public.owner_messages (sent_by, audience, house_id, subject, body, by_push, by_wall, by_email, people, walls)
      values (auth.uid(), 'house', h.id, btrim(p_subject), btrim(p_body), true, false, true, people, 0)
      returning id into msg;
      insert into public.owner_message_outbox (message_id, user_id)
      select msg, w.user_id from public.owner_message_people('house', null, h.id) w;
    end if;
  end if;

  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (
    auth.uid(), 'house.delete', 'house', h.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object(
      'name', h.name, 'kind', h.kind, 'people', people, 'created_at', h.created_at,
      'pass_plan', h.pass_plan, 'pass_ends_at', h.pass_ends_at, 'subscription', sub
    ),
    jsonb_build_object('told', msg is not null, 'message', msg)
  );

  delete from public.houses where id = h.id;

  return jsonb_build_object('name', h.name, 'people', people, 'subscription', sub, 'message', msg);
end;
$$;


ALTER FUNCTION "public"."owner_delete_house"("p_house" "uuid", "p_reason" "text", "p_subject" "text", "p_body" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_delete_house"("p_house" "uuid", "p_reason" "text", "p_subject" "text", "p_body" "text") IS 'The owner deletes a whole house (houses:write): tells its people when given the words, writes the audit entry, and answers the subscription to stop.';



CREATE OR REPLACE FUNCTION "public"."owner_delete_now"("p_user" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  d public.account_deletions;
begin
  if not public.can_app('deletions:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into d from public.account_deletions where user_id = p_user and state = 'pending' for update;
  if d.id is null then
    raise exception 'no_deletion';
  end if;
  update public.account_deletions set deletes_at = least(deletes_at, now()) where id = d.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (auth.uid(), 'account.delete_now', 'account', p_user::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('delete_after', d.deletes_at),
    jsonb_build_object('delete_after', least(d.deletes_at, now())));
end;
$$;


ALTER FUNCTION "public"."owner_delete_now"("p_user" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_deletions"() RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "house_name" "text", "requested_at" timestamp with time zone, "deletes_at" timestamp with time zone, "requested_by" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select d.user_id, p.display_name, u.email::text, h.name, d.requested_at, d.deletes_at, d.requested_by
    from public.account_deletions d
    join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    left join public.members m on m.user_id = d.user_id
    left join public.houses h on h.id = m.house_id
    where d.state = 'pending'
    order by d.deletes_at, d.user_id;
end;
$$;


ALTER FUNCTION "public"."owner_deletions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_deletions_count"("p_q" "text" DEFAULT ''::"text", "p_by" "text" DEFAULT NULL::"text", "p_goes" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return (select count(*) from public.owner_deletions_find(p_q, p_by, p_goes, p_after, p_before));
end;
$$;


ALTER FUNCTION "public"."owner_deletions_count"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_deletions_find"("p_q" "text" DEFAULT ''::"text", "p_by" "text" DEFAULT NULL::"text", "p_goes" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "house_name" "text", "requested_at" timestamp with time zone, "deletes_at" timestamp with time zone, "requested_by" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  -- What was typed, with LIKE's own wildcards taken as letters.
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select d.user_id, p.display_name, u.email::text, h.name, d.requested_at, d.deletes_at, d.requested_by
    from public.account_deletions d
    join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    left join public.members m on m.user_id = d.user_id
    left join public.houses h on h.id = m.house_id
    where d.state = 'pending'
      and (p_by is null or d.requested_by = p_by)
      and (p_goes is null
        or d.deletes_at <= now() + case p_goes when 'day' then interval '1 day' else interval '7 days' end)
      and (p_after is null or d.requested_at > p_after)
      and (p_before is null or d.requested_at <= p_before)
      and (q = ''
        or d.user_id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(u.email::text) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%');
end;
$$;


ALTER FUNCTION "public"."owner_deletions_find"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_deletions_page"("p_q" "text" DEFAULT ''::"text", "p_by" "text" DEFAULT NULL::"text", "p_goes" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_user" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 51) RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "house_name" "text", "requested_at" timestamp with time zone, "deletes_at" timestamp with time zone, "requested_by" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
    select f.*
    from public.owner_deletions_find(p_q, p_by, p_goes, p_after, p_before) f
    where p_cursor_at is null or (f.deletes_at, f.user_id) > (p_cursor_at, p_cursor_user)
    order by f.deletes_at, f.user_id
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;


ALTER FUNCTION "public"."owner_deletions_page"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_user" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_fix_report"("p_report" "uuid", "p_note" "text" DEFAULT NULL::"text", "p_tell" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  note text := nullif(btrim(coalesce(p_note, '')), '');
  body text;
  signed text;
  r public.reports;
  told jsonb := '[]'::jsonb;
  n integer := 0;
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if note is not null and char_length(note) > 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  perform 1 from public.reports where id = p_report for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select split_part(btrim(p.display_name), ' ', 1) into signed from public.profiles p where p.id = me;
  body := coalesce(note, 'This is fixed now. Thank you for telling us.');

  for r in
    select * from public.reports x
    where (x.id = p_report or x.same_as_report_id = p_report) and x.state <> 'fixed'
    order by x.created_at, x.id
    for update
  loop
    update public.reports set state = 'fixed', last_activity_at = now() where id = r.id;
    n := n + 1;
    if coalesce(p_tell, false) then
      insert into public.report_messages (report_id, from_owner, written_by, author_name, body)
      values (r.id, true, me, nullif(signed, ''), body);
      told := told || jsonb_build_array(public.report_recipient(r));
    end if;
  end loop;

  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.fixed', 'report', p_report::text, jsonb_build_object('state', 'waiting'),
    jsonb_build_object('state', 'fixed', 'reports', n, 'told', jsonb_array_length(told), 'note', note));
  return jsonb_build_object('fixed', n, 'signed', nullif(signed, ''), 'body', body, 'told', told);
end;
$$;


ALTER FUNCTION "public"."owner_fix_report"("p_report" "uuid", "p_note" "text", "p_tell" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_house"("p_house" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'kind', h.kind,
    'joinCode', h.join_code,
    'createdAt', h.created_at,
    'firstDealtAt', h.first_dealt_at,
    'timezone', h.timezone,
    'currency', h.currency,
    'dealMode', h.deal_mode,
    'passPlan', h.pass_plan,
    'passUntil', h.pass_ends_at,
    'passBuyer', (select p.display_name from public.profiles p where p.id = h.pass_bought_by),
    'billed', exists (select 1 from public.house_pass_billing b where b.house_id = h.id and b.stripe_subscription_id is not null),
    'lastActive', (select max(a.done_at) from public.assignments a where a.house_id = h.id and a.done_at is not null),
    'johns', (select count(*) from public.johns j where j.house_id = h.id),
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.user_id,
        'name', p.display_name,
        'role', m.role,
        'joinedAt', m.joined_at,
        'movingOutOn', m.moving_out_on,
        'onTime', t.on_time,
        'settled', t.settled,
        'awayUntil', (
          select max(w.ends_on) from public.away_periods w
          where w.house_id = h.id and w.user_id = m.user_id
            and w.starts_on <= (now() at time zone h.timezone)::date
            and w.ends_on >= (now() at time zone h.timezone)::date
        )
      ) order by (m.role = 'admin') desc, m.joined_at, m.user_id), '[]'::jsonb)
      from public.members m
      join public.profiles p on p.id = m.user_id
      cross join lateral (
        select count(*) filter (where a.outcome in ('done', 'covered')) as on_time, count(*) as settled
        from public.assignments a
        where a.house_id = h.id and a.user_id = m.user_id
          and a.due_at > now() - interval '28 days' and a.due_at <= now()
          and a.outcome in ('done', 'covered', 'late', 'missed')
      ) t
      where m.house_id = h.id
    )
  )
  into result
  from public.houses h
  where h.id = p_house;
  return result;
end;
$$;


ALTER FUNCTION "public"."owner_house"("p_house" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_houses_count"("p_q" "text" DEFAULT ''::"text", "p_pass" "text" DEFAULT NULL::"text", "p_active" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return (select count(*) from public.owner_houses_match(p_q, p_pass, p_active, p_after, p_before));
end;
$$;


ALTER FUNCTION "public"."owner_houses_count"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_houses_find"("p_q" "text") RETURNS TABLE("id" "uuid", "name" "text", "people" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if q = '' then
    return;
  end if;
  return query
    select h.id, h.name, (select count(*) from public.members m where m.house_id = h.id)
    from public.houses h
    where h.id::text like q || '%'
      or lower(h.join_code) = q
      or lower(h.name) like '%' || q || '%'
    order by lower(h.name), h.id
    limit 8;
end;
$$;


ALTER FUNCTION "public"."owner_houses_find"("p_q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_houses_match"("p_q" "text" DEFAULT ''::"text", "p_pass" "text" DEFAULT NULL::"text", "p_active" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "name" "text", "join_code" "text", "people" bigint, "pass_plan" "text", "pass_ends_at" timestamp with time zone, "last_active" timestamp with time zone, "on_time" bigint, "settled" bigint, "created_at" timestamp with time zone, "sort_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select h.id, h.name, h.join_code,
      (select count(*) from public.members m where m.house_id = h.id),
      h.pass_plan, h.pass_ends_at, l.last_active, t.on_time, t.settled, h.created_at,
      coalesce(l.last_active, '-infinity'::timestamptz)
    from public.houses h
    cross join lateral (
      select max(a.done_at) as last_active from public.assignments a where a.house_id = h.id and a.done_at is not null
    ) l
    cross join lateral (
      select count(*) filter (where a.outcome in ('done', 'covered')) as on_time, count(*) as settled
      from public.assignments a
      where a.house_id = h.id and a.due_at > now() - interval '28 days' and a.due_at <= now()
        and a.outcome in ('done', 'covered', 'late', 'missed')
    ) t
    where (p_pass is null
        or (p_pass = 'paid' and h.pass_plan in ('monthly', 'yearly', 'founding') and (h.pass_ends_at is null or h.pass_ends_at > now()))
        or (p_pass = 'trial' and h.pass_plan = 'trial' and h.pass_ends_at > now())
        or (p_pass = 'none' and h.pass_ends_at <= now()))
      and (p_active is null
        or (p_active = 'week' and l.last_active > now() - interval '7 days')
        or (p_active = 'month' and l.last_active > now() - interval '30 days')
        or (p_active = 'quiet' and (l.last_active is null or l.last_active <= now() - interval '30 days')))
      and (p_after is null or h.created_at > p_after)
      and (p_before is null or h.created_at <= p_before)
      and (q = ''
        or h.id::text like q || '%'
        or lower(h.join_code) like q || '%'
        or lower(h.name) like '%' || q || '%'
        or exists (
          select 1 from public.members m
          join public.profiles p on p.id = m.user_id
          left join auth.users u on u.id = m.user_id
          where m.house_id = h.id
            and (lower(p.display_name) like '%' || q || '%' or lower(u.email::text) like '%' || q || '%')
        ));
end;
$$;


ALTER FUNCTION "public"."owner_houses_match"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_houses_page"("p_q" "text" DEFAULT ''::"text", "p_pass" "text" DEFAULT NULL::"text", "p_active" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 51) RETURNS TABLE("id" "uuid", "name" "text", "join_code" "text", "people" bigint, "pass_plan" "text", "pass_ends_at" timestamp with time zone, "last_active" timestamp with time zone, "on_time" bigint, "settled" bigint, "created_at" timestamp with time zone, "sort_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
    select f.*
    from public.owner_houses_match(p_q, p_pass, p_active, p_after, p_before) f
    where p_cursor_at is null or (f.sort_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.sort_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;


ALTER FUNCTION "public"."owner_houses_page"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_make_promotion"("p_code" "text", "p_name" "text", "p_note" "text", "p_kind" "text", "p_percent" integer, "p_amount" "jsonb", "p_duration" "text", "p_months" integer, "p_plans" "text"[], "p_audience" "text", "p_people" "text"[], "p_ends_at" timestamp with time zone, "p_max_uses" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  promo public.promotions;
  people text[];
begin
  if not public.can_app('promotions:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(btrim(e))), '{}') into people
  from unnest(coalesce(p_people, '{}')) e
  where btrim(e) <> '';
  if p_audience = 'named' and cardinality(people) = 0 then
    raise exception 'promotion_needs_people' using errcode = 'P0001';
  end if;
  if p_audience = 'anyone' and cardinality(people) > 0 then
    raise exception 'promotion_bad' using errcode = 'P0001';
  end if;
  if cardinality(people) > 500 then
    raise exception 'promotion_too_many' using errcode = 'P0001';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'promotion_ends_past' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.promotions where code = upper(btrim(p_code))) then
    raise exception 'promotion_code_taken' using errcode = 'P0001';
  end if;

  begin
    insert into public.promotions (
      code, name, note, kind, percent_off, amount_off, duration, months, plans,
      audience, ends_at, max_uses, state, made_by
    )
    values (
      upper(btrim(p_code)), btrim(p_name), nullif(btrim(coalesce(p_note, '')), ''), p_kind, p_percent, p_amount,
      p_duration, p_months, coalesce(p_plans, '{}'), p_audience, p_ends_at,
      case when p_audience = 'anyone' then p_max_uses end,
      -- Months free and a free Pass need nothing from Stripe.
      case when p_kind in ('trial', 'gift') then 'live' else 'making' end,
      auth.uid()
    )
    returning * into promo;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'promotion_bad' using errcode = 'P0001';
  end;

  begin
    insert into public.promotion_people (promotion_id, email)
    select promo.id, e from unnest(people) e;
  exception
    when check_violation then
      raise exception 'promotion_bad_email' using errcode = 'P0001';
  end;

  -- Named by id and counts only: the emails stay on the promotion.
  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (
    auth.uid(), 'promotion.make', 'promotion', promo.id::text,
    jsonb_build_object(
      'code', promo.code, 'name', promo.name, 'kind', promo.kind,
      'percent_off', promo.percent_off, 'amount_off', promo.amount_off,
      'duration', promo.duration, 'months', promo.months, 'plans', promo.plans,
      'audience', promo.audience, 'people', cardinality(people),
      'ends_at', promo.ends_at, 'max_uses', promo.max_uses
    )
  );
  return promo.id;
end;
$$;


ALTER FUNCTION "public"."owner_make_promotion"("p_code" "text", "p_name" "text", "p_note" "text", "p_kind" "text", "p_percent" integer, "p_amount" "jsonb", "p_duration" "text", "p_months" integer, "p_plans" "text"[], "p_audience" "text", "p_people" "text"[], "p_ends_at" timestamp with time zone, "p_max_uses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_message_people"("p_audience" "text", "p_person" "uuid", "p_house" "uuid") RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p.id
  from public.profiles p
  where p.deleted_at is null
    and not exists (
      select 1 from public.account_deletions d where d.user_id = p.id and d.state = 'pending'
    )
    and case p_audience
      when 'test' then p.id = auth.uid()
      when 'person' then p.id = p_person
      when 'house' then exists (select 1 from public.members m where m.user_id = p.id and m.house_id = p_house)
      when 'everyone' then true
      else false
    end;
$$;


ALTER FUNCTION "public"."owner_message_people"("p_audience" "text", "p_person" "uuid", "p_house" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_message_reach"("p_audience" "text", "p_person" "uuid" DEFAULT NULL::"uuid", "p_house" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  result jsonb;
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'people', count(*),
    'push', count(*) filter (where exists (select 1 from public.push_subscriptions s where s.user_id = w.user_id)),
    'email', count(*) filter (where exists (select 1 from auth.users u where u.id = w.user_id and u.email is not null)),
    'houses', case p_audience
      when 'house' then (select count(*) from public.houses h where h.id = p_house)
      when 'everyone' then (select count(distinct m.house_id) from public.members m)
      else 0
    end
  ) into result
  from public.owner_message_people(p_audience, p_person, p_house) w;
  return result;
end;
$$;


ALTER FUNCTION "public"."owner_message_reach"("p_audience" "text", "p_person" "uuid", "p_house" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_messages_count"("p_q" "text" DEFAULT ''::"text", "p_audience" "text" DEFAULT NULL::"text", "p_way" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return (select count(*) from public.owner_messages_find(p_q, p_audience, p_way, p_after, p_before));
end;
$$;


ALTER FUNCTION "public"."owner_messages_count"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_messages_find"("p_q" "text" DEFAULT ''::"text", "p_audience" "text" DEFAULT NULL::"text", "p_way" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "sent_at" timestamp with time zone, "audience" "text", "to_name" "text", "subject" "text", "body" "text", "by_push" boolean, "by_wall" boolean, "by_email" boolean, "people" integer, "walls" integer, "waiting" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select m.id, m.sent_at, m.audience,
      case m.audience when 'person' then p.display_name when 'house' then h.name end,
      m.subject, m.body, m.by_push, m.by_wall, m.by_email, m.people, m.walls,
      (select count(*) from public.owner_message_outbox o where o.message_id = m.id)
    from public.owner_messages m
    left join public.profiles p on p.id = m.person_id
    left join public.houses h on h.id = m.house_id
    where (p_audience is null or m.audience = p_audience)
      and (p_way is null
        or (p_way = 'push' and m.by_push)
        or (p_way = 'wall' and m.by_wall)
        or (p_way = 'email' and m.by_email))
      and (p_after is null or m.sent_at > p_after)
      and (p_before is null or m.sent_at <= p_before)
      and (q = ''
        or m.id::text like q || '%'
        or lower(m.subject) like '%' || q || '%'
        or lower(m.body) like '%' || q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%');
end;
$$;


ALTER FUNCTION "public"."owner_messages_find"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_messages_page"("p_q" "text" DEFAULT ''::"text", "p_audience" "text" DEFAULT NULL::"text", "p_way" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 51) RETURNS TABLE("id" "uuid", "sent_at" timestamp with time zone, "audience" "text", "to_name" "text", "subject" "text", "body" "text", "by_push" boolean, "by_wall" boolean, "by_email" boolean, "people" integer, "walls" integer, "waiting" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
    select f.*
    from public.owner_messages_find(p_q, p_audience, p_way, p_after, p_before) f
    where p_cursor_at is null or (f.sent_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.sent_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;


ALTER FUNCTION "public"."owner_messages_page"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_notices_count"("p_q" "text" DEFAULT NULL::"text", "p_kind" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select count(*)::int from public.owner_notices_matching(p_q, p_kind, p_state, p_after, p_before);
$$;


ALTER FUNCTION "public"."owner_notices_count"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_notices_count"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) IS 'How many notices a filter matches.';



CREATE TABLE IF NOT EXISTS "public"."notices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "link_label" "text",
    "link_url" "text",
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notices_body_check" CHECK (("char_length"("body") <= 240)),
    CONSTRAINT "notices_check" CHECK ((("link_label" IS NULL) = ("link_url" IS NULL))),
    CONSTRAINT "notices_check1" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "notices_kind_check" CHECK (("kind" = ANY (ARRAY['status'::"text", 'offer'::"text", 'news'::"text"]))),
    CONSTRAINT "notices_link_label_check" CHECK ((("char_length"("link_label") >= 1) AND ("char_length"("link_label") <= 30))),
    CONSTRAINT "notices_link_url_check" CHECK ((("link_url" ~ '^(/[^/\\]|/$|https://)'::"text") AND ("char_length"("link_url") <= 300))),
    CONSTRAINT "notices_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 80)))
);


ALTER TABLE "public"."notices" OWNER TO "postgres";


COMMENT ON TABLE "public"."notices" IS 'Banners the owner shows in the app.';



CREATE OR REPLACE FUNCTION "public"."owner_notices_matching"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) RETURNS SETOF "public"."notices"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select n.*
  from public.notices n,
       lateral (select '%' || public.like_escaped(public.search_words(p_q)) || '%' as pattern) w
  where (p_kind is null or n.kind = p_kind)
    and (p_state is null
         or (p_state = 'scheduled' and n.starts_at > now())
         or (p_state = 'live' and n.starts_at <= now() and (n.ends_at is null or n.ends_at > now()))
         or (p_state = 'ended' and n.ends_at <= now()))
    and (p_after is null or n.starts_at > p_after)
    and (p_before is null or n.starts_at <= p_before)
    and (w.pattern is null or n.title ilike w.pattern or n.body ilike w.pattern);
$$;


ALTER FUNCTION "public"."owner_notices_matching"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_notices_matching"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) IS 'The notices an Every notice filter matches.';



CREATE OR REPLACE FUNCTION "public"."owner_notices_page"("p_q" "text" DEFAULT NULL::"text", "p_kind" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "kind" "text", "title" "text", "body" "text", "link_label" "text", "link_url" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  select n.id, n.kind, n.title, n.body, n.link_label, n.link_url, n.starts_at, n.ends_at
  from public.owner_notices_matching(p_q, p_kind, p_state, p_after, p_before) n
  where p_cursor_at is null or (n.starts_at, n.id) < (p_cursor_at, p_cursor_id)
  order by n.starts_at desc, n.id desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."owner_notices_page"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_notices_page"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") IS 'Every notice, newest start first, a page at a time.';



CREATE OR REPLACE FUNCTION "public"."owner_open_report"("p_report" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.reports;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  update public.reports set state = 'open' where id = p_report and state = 'new' returning * into r;
  if r.id is null then
    select * into r from public.reports where id = p_report;
  end if;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', r.id,
    'user_id', r.user_id,
    'name', coalesce((select p.display_name from public.profiles p where p.id = r.user_id), r.from_name, r.from_email),
    'email', coalesce((select u.email::text from auth.users u join public.profiles p on p.id = u.id
      where u.id = r.user_id and p.deleted_at is null), r.from_email),
    'house_id', r.house_id,
    'house_name', (select h.name from public.houses h where h.id = r.house_id),
    'role', (select m.role from public.members m where m.user_id = r.user_id and m.house_id = r.house_id),
    'kind', r.kind,
    'state', r.state,
    'words', r.words,
    'details', r.details,
    'shots', to_jsonb(r.shots),
    'created_at', r.created_at,
    'updated_at', r.last_activity_at,
    'source', r.source,
    'subject', r.subject,
    'same_as', case when r.same_as_report_id is null then null else (
      select jsonb_build_object('id', s.id, 'words', s.words, 'state', s.state,
        'name', coalesce(p.display_name, s.from_name, s.from_email))
      from public.reports s left join public.profiles p on p.id = s.user_id where s.id = r.same_as_report_id
    ) end,
    'also', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'words', d.words, 'state', d.state, 'created_at', d.created_at,
        'name', coalesce(p.display_name, d.from_name, d.from_email)) order by d.created_at, d.id)
      from public.reports d left join public.profiles p on p.id = d.user_id where d.same_as_report_id = r.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id::text, 'from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'at', m.created_at) order by m.created_at, m.id)
      from public.report_messages m where m.report_id = r.id
    ), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."owner_open_report"("p_report" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_overview"("p_span" "text" DEFAULT 'week'::"text", "p_zone" "text" DEFAULT 'Europe/London'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  span text := case when p_span = 'month' then 'month' else 'week' end;
  zone text := case when exists (select 1 from pg_catalog.pg_timezone_names where name = p_zone) then p_zone else 'Europe/London' end;
  step interval := case when p_span = 'month' then interval '1 month' else interval '1 week' end;
  since timestamptz := date_trunc(span, now() at time zone zone) at time zone zone;
  before timestamptz := (date_trunc(span, now() at time zone zone) - step) at time zone zone;
  before_now timestamptz := now() - step;
  result jsonb;
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'span', span,
    'from', since,
    'houses', (select count(*) from public.houses),
    'housesNew', (select count(*) from public.houses where created_at >= since),
    'housesNewBefore', (select count(*) from public.houses where created_at >= before and created_at <= before_now),
    'people', (select count(*) from public.profiles where deleted_at is null),
    'inHouses', (select count(distinct m.user_id) from public.members m),
    'active', (select count(distinct a.house_id) from public.assignments a where a.done_at >= since),
    'passes', (
      select jsonb_build_object(
        'monthly', count(*) filter (where pass_plan = 'monthly'),
        'yearly', count(*) filter (where pass_plan = 'yearly'),
        'founding', count(*) filter (where pass_plan = 'founding'),
        'trial', count(*) filter (where pass_plan = 'trial')
      )
      from public.houses
      where pass_ends_at is null or pass_ends_at > now()
    ),
    'onTime', (
      select jsonb_build_object(
        'onTime', count(*) filter (where outcome in ('done', 'covered')),
        'late', count(*) filter (where outcome = 'late'),
        'missed', count(*) filter (where outcome = 'missed')
      )
      from public.assignments
      where due_at >= since and due_at <= now() and outcome in ('done', 'covered', 'late', 'missed')
    ),
    'ask', (
      select jsonb_build_object(
        'turns', count(*),
        'failed', count(*) filter (where outcome = 'failed')
      )
      from public.house_drafts
      where created_at >= since
    ),
    -- Ten weeks of active houses, oldest first, the last ending now.
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object('ends', w.ends, 'active', w.active) order by w.ends), '[]'::jsonb)
      from (
        select k.ends,
          (select count(distinct a.house_id) from public.assignments a
            where a.done_at > k.ends - interval '7 days' and a.done_at <= k.ends) as active
        from (select now() - make_interval(weeks => g) as ends from generate_series(0, 9) g) k
      ) w
    ),
    'clock', (select max(ticked_at) from public.houses),
    'reports', (select count(*) from public.reports where state = 'new'),
    'needs', (
      select coalesce(jsonb_agg(n order by n->>'at'), '[]'::jsonb)
      from (
        (
          select jsonb_build_object(
            'kind', 'report', 'id', r.id, 'name', p.display_name, 'words', left(r.words, 120),
            'house', h.name, 'at', r.created_at
          ) as n
          from public.reports r
          left join public.profiles p on p.id = r.user_id
          left join public.houses h on h.id = r.house_id
          where r.state = 'new'
          order by r.created_at
          limit 3
        )
        union all
        (
          select jsonb_build_object(
            'kind', 'deletion', 'id', d.user_id, 'name', p.display_name, 'words', null,
            'house', h.name, 'at', d.deletes_at
          )
          from public.account_deletions d
          join public.profiles p on p.id = d.user_id
          left join public.members m on m.user_id = d.user_id
          left join public.houses h on h.id = m.house_id
          where d.state = 'pending' and d.deletes_at <= now() + interval '1 day'
          order by d.deletes_at
          limit 3
        )
      ) x
    )
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."owner_overview"("p_span" "text", "p_zone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_people_find"("p_q" "text") RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "house_id" "uuid", "house_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if q = '' then
    return;
  end if;
  return query
    select p.id, p.display_name, u.email::text, h.id, h.name
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.members m on m.user_id = p.id
    left join public.houses h on h.id = m.house_id
    where p.deleted_at is null
      and (p.id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(u.email::text) like '%' || q || '%')
    order by lower(p.display_name), p.id
    limit 8;
end;
$$;


ALTER FUNCTION "public"."owner_people_find"("p_q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_promotion"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  promo public.promotions;
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id;
  if promo.id is null then
    return null;
  end if;
  return to_jsonb(promo) - 'stripe_coupon_id' - 'stripe_promotion_code_id' || jsonb_build_object(
    'state', public.promotion_state(promo),
    'uses', (select count(*) from public.promotion_uses u where u.promotion_id = p_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', pp.email, 'opened_at', pp.opened_at, 'emailed_at', pp.emailed_at, 'used_at', pp.used_at,
        'name', (
          select p.display_name
          from auth.users u join public.profiles p on p.id = u.id
          where lower(u.email) = pp.email and p.deleted_at is null
          limit 1
        )
      ) order by pp.used_at desc nulls last, pp.opened_at desc nulls last, pp.email)
      from public.promotion_people pp where pp.promotion_id = p_id
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('house', r.house_name, 'house_id', r.house_id, 'plan', r.plan, 'at', r.created_at) order by r.created_at desc)
      from (
        select h.name as house_name, u.house_id, u.plan, u.created_at
        from public.promotion_uses u
        left join public.houses h on h.id = u.house_id
        where u.promotion_id = p_id
        order by u.created_at desc
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."owner_promotion"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_promotion_emails"("p_id" "uuid") RETURNS TABLE("email" "text", "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  promo public.promotions;
  taken integer;
begin
  if not public.can_app('promotions:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    raise exception 'promotion_unknown' using errcode = 'P0001';
  end if;
  if public.promotion_state(promo) <> 'live' then
    raise exception 'offer_ended' using errcode = 'P0001';
  end if;
  return query
    with sent as (
      update public.promotion_people pp
      set emailed_at = now()
      where pp.promotion_id = p_id and pp.emailed_at is null and pp.used_at is null
      returning pp.email
    )
    select s.email, (
      select p.display_name
      from auth.users u join public.profiles p on p.id = u.id
      where lower(u.email) = s.email and p.deleted_at is null
      limit 1
    )
    from sent s
    order by s.email;
  get diagnostics taken = row_count;
  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (auth.uid(), 'promotion.email', 'promotion', p_id::text, jsonb_build_object('people', taken));
end;
$$;


ALTER FUNCTION "public"."owner_promotion_emails"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_promotions_count"("p_q" "text" DEFAULT ''::"text", "p_who" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return (select count(*) from public.owner_promotions_find(p_q, p_who, p_state));
end;
$$;


ALTER FUNCTION "public"."owner_promotions_count"("p_q" "text", "p_who" "text", "p_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_promotions_find"("p_q" "text" DEFAULT ''::"text", "p_who" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "made_at" timestamp with time zone, "code" "text", "name" "text", "kind" "text", "percent_off" integer, "amount_off" "jsonb", "duration" "text", "months" integer, "plans" "text"[], "audience" "text", "people" integer, "uses" bigint, "max_uses" integer, "ends_at" timestamp with time zone, "state" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select f.* from (
      select p.id, p.made_at, p.code, p.name, p.kind, p.percent_off, p.amount_off, p.duration, p.months,
        p.plans, p.audience,
        (select count(*)::integer from public.promotion_people pp where pp.promotion_id = p.id),
        (select count(*) from public.promotion_uses u where u.promotion_id = p.id),
        p.max_uses, p.ends_at, public.promotion_state(p) as state
      from public.promotions p
      where (p_who is null or p.audience = p_who)
        and (q = ''
          or p.id::text like q || '%'
          or lower(p.code) like '%' || q || '%'
          or lower(p.name) like '%' || q || '%'
          or exists (select 1 from public.promotion_people pp where pp.promotion_id = p.id and pp.email like '%' || q || '%'))
    ) f
    where p_state is null or f.state = p_state;
end;
$$;


ALTER FUNCTION "public"."owner_promotions_find"("p_q" "text", "p_who" "text", "p_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_promotions_page"("p_q" "text" DEFAULT ''::"text", "p_who" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text", "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 51) RETURNS TABLE("id" "uuid", "made_at" timestamp with time zone, "code" "text", "name" "text", "kind" "text", "percent_off" integer, "amount_off" "jsonb", "duration" "text", "months" integer, "plans" "text"[], "audience" "text", "people" integer, "uses" bigint, "max_uses" integer, "ends_at" timestamp with time zone, "state" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
    select f.*
    from public.owner_promotions_find(p_q, p_who, p_state) f
    where p_cursor_at is null or (f.made_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.made_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;


ALTER FUNCTION "public"."owner_promotions_page"("p_q" "text", "p_who" "text", "p_state" "text", "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_reply_report"("p_report" "uuid", "p_body" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  body text := btrim(coalesce(p_body, ''));
  r public.reports;
  signed text;
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select split_part(btrim(p.display_name), ' ', 1) into signed from public.profiles p where p.id = me;
  insert into public.report_messages (report_id, from_owner, written_by, author_name, body)
  values (r.id, true, me, nullif(signed, ''), body);
  update public.reports set state = 'replied', last_activity_at = now() where id = r.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.reply', 'report', r.id::text, jsonb_build_object('state', r.state), jsonb_build_object('state', 'replied', 'reply', body));
  return public.report_recipient(r) || jsonb_build_object('signed', nullif(signed, ''));
end;
$$;


ALTER FUNCTION "public"."owner_reply_report"("p_report" "uuid", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_reports_count"("p_q" "text" DEFAULT ''::"text", "p_state" "text" DEFAULT NULL::"text", "p_kind" "text" DEFAULT NULL::"text", "p_from" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return (select count(*) from public.owner_reports_find(p_q, p_state, p_kind, p_from, p_after, p_before));
end;
$$;


ALTER FUNCTION "public"."owner_reports_count"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_reports_find"("p_q" "text" DEFAULT ''::"text", "p_state" "text" DEFAULT NULL::"text", "p_kind" "text" DEFAULT NULL::"text", "p_from" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "user_id" "uuid", "name" "text", "email" "text", "house_name" "text", "kind" "text", "state" "text", "words" "text", "created_at" timestamp with time zone, "last_activity_at" timestamp with time zone, "source" "text", "subject" "text", "same_as_report_id" "uuid", "also" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  -- What was typed, with LIKE's own wildcards taken as letters.
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select r.id, r.user_id,
      coalesce(p.display_name, r.from_name, r.from_email),
      coalesce(case when p.deleted_at is null then u.email::text end, r.from_email),
      h.name, r.kind, r.state, r.words, r.created_at, r.last_activity_at,
      r.source, r.subject, r.same_as_report_id,
      (select count(*)::integer from public.reports d where d.same_as_report_id = r.id)
    from public.reports r
    left join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.houses h on h.id = r.house_id
    where (p_state is null
        or (p_state = 'waiting' and (r.state = 'new' or (r.state = 'open' and r.same_as_report_id is null)))
        or (p_state = 'answered' and not (r.state = 'new' or (r.state = 'open' and r.same_as_report_id is null)))
        or r.state = p_state)
      and (p_kind is null or r.kind = p_kind)
      and (p_from is null or r.source = p_from)
      and (p_after is null or r.created_at > p_after)
      and (p_before is null or r.created_at <= p_before)
      and (q = ''
        or r.id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or (p.deleted_at is null and lower(u.email::text) like '%' || q || '%')
        or lower(r.from_email) like '%' || q || '%'
        or lower(r.from_name) like '%' || q || '%'
        or lower(r.subject) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%'
        or lower(r.words) like '%' || q || '%');
end;
$$;


ALTER FUNCTION "public"."owner_reports_find"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_reports_page"("p_q" "text" DEFAULT ''::"text", "p_state" "text" DEFAULT NULL::"text", "p_kind" "text" DEFAULT NULL::"text", "p_from" "text" DEFAULT NULL::"text", "p_after" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cursor_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 51) RETURNS TABLE("id" "uuid", "user_id" "uuid", "name" "text", "email" "text", "house_name" "text", "kind" "text", "state" "text", "words" "text", "created_at" timestamp with time zone, "last_activity_at" timestamp with time zone, "source" "text", "subject" "text", "same_as_report_id" "uuid", "also" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
    select f.*
    from public.owner_reports_find(p_q, p_state, p_kind, p_from, p_after, p_before) f
    where p_cursor_at is null or (f.created_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.created_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;


ALTER FUNCTION "public"."owner_reports_page"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_request_deletion"("p_email" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  who uuid;
  d public.account_deletions;
begin
  if not public.can_app('deletions:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select u.id into who from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.deleted_at is null
    and exists (select 1 from public.profiles p where p.id = u.id and p.deleted_at is null);
  if who is null then
    raise exception 'no_account';
  end if;
  if exists (select 1 from public.account_deletions where user_id = who and state = 'pending') then
    raise exception 'already_deleting';
  end if;
  insert into public.account_deletions (user_id, deletes_at, requested_by)
  values (who, now() + interval '30 days', 'owner')
  returning * into d;
  perform public.quietly(true);
  update public.account_deletions set away_ids = public.deletion_away(who, d.deletes_at) where id = d.id;
  perform public.quietly(false);
  insert into public.admin_audit (actor, action, target_kind, target_id, reason, after)
  values (auth.uid(), 'account.delete_request', 'account', who::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('requested_by', 'owner', 'delete_after', d.deletes_at));
  return who;
end;
$$;


ALTER FUNCTION "public"."owner_request_deletion"("p_email" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_reset_house_data"("p_house" "uuid", "p_everything" boolean DEFAULT false, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."owner_reset_house_data"("p_house" "uuid", "p_everything" boolean, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."owner_reset_house_data"("p_house" "uuid", "p_everything" boolean, "p_reason" "text") IS 'The owner (houses:write) resets any house''s history, or everything in it, and writes the audit entry. Can''t be undone.';



CREATE OR REPLACE FUNCTION "public"."owner_same_as"("p_report" "uuid", "p_main" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  was uuid;
  main uuid := p_main;
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select r.same_as_report_id into was from public.reports r where r.id = p_report for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if main is not null then
    -- Onto the top of its own pile.
    select coalesce(m.same_as_report_id, m.id) into main from public.reports m where m.id = main;
    if main is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if main = p_report then
      raise exception 'report_same' using errcode = 'P0001';
    end if;
    update public.reports set same_as_report_id = main where same_as_report_id = p_report;
  end if;
  -- Folding it is reading it: a new one becomes open, so it leaves Waiting.
  update public.reports
  set same_as_report_id = main, state = case when main is not null and state = 'new' then 'open' else state end
  where id = p_report;
  if was is distinct from main then
    insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
    values (me, 'report.same_as', 'report', p_report::text, jsonb_build_object('same_as', was), jsonb_build_object('same_as', main));
  end if;
  return main;
end;
$$;


ALTER FUNCTION "public"."owner_same_as"("p_report" "uuid", "p_main" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_same_as_find"("p_report" "uuid", "p_q" "text" DEFAULT ''::"text") RETURNS TABLE("id" "uuid", "name" "text", "words" "text", "state" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.can_app('admin:read') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select r.id, coalesce(p.display_name, r.from_name, r.from_email), r.words, r.state, r.created_at
    from public.reports r
    left join public.profiles p on p.id = r.user_id
    where r.id <> p_report
      and r.same_as_report_id is null
      and (q = '' or r.id::text like q || '%' or lower(r.words) like '%' || q || '%' or lower(r.subject) like '%' || q || '%')
    order by r.created_at desc, r.id desc
    limit 20;
end;
$$;


ALTER FUNCTION "public"."owner_same_as_find"("p_report" "uuid", "p_q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_send_message"("p_audience" "text", "p_person" "uuid", "p_house" "uuid", "p_subject" "text", "p_body" "text", "p_push" boolean, "p_wall" boolean, "p_email" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  msg public.owner_messages;
  wall boolean := coalesce(p_wall, false) and p_audience in ('house', 'everyone');
  n integer;
  houses integer := 0;
begin
  if not public.can_app('messages:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_audience not in ('person', 'house', 'everyone', 'test') then
    raise exception 'message_audience' using errcode = 'P0001';
  end if;
  if p_audience = 'person' and p_person is null or p_audience = 'house' and p_house is null then
    raise exception 'message_who' using errcode = 'P0001';
  end if;
  -- A Wall is the whole house's: a message to one person never goes on it.
  if coalesce(p_wall, false) and p_audience = 'person' then
    raise exception 'message_wall_person' using errcode = 'P0001';
  end if;
  if not (coalesce(p_push, false) or wall or coalesce(p_email, false)) then
    raise exception 'message_no_way' using errcode = 'P0001';
  end if;

  select count(*) into n from public.owner_message_people(p_audience, p_person, p_house);
  if wall then
    select count(distinct m.house_id) into houses
    from public.members m
    where p_audience = 'everyone' or m.house_id = p_house;
  end if;
  if n = 0 and houses = 0 then
    raise exception 'message_nobody' using errcode = 'P0001';
  end if;

  insert into public.owner_messages (
    sent_by, audience, person_id, house_id, subject, body, by_push, by_wall, by_email, people, walls
  )
  values (
    auth.uid(), p_audience,
    case when p_audience = 'person' then p_person end,
    case when p_audience = 'house' then p_house end,
    btrim(p_subject), btrim(p_body),
    coalesce(p_push, false), wall, coalesce(p_email, false), n, houses
  )
  returning * into msg;

  if msg.by_push or msg.by_email then
    insert into public.owner_message_outbox (message_id, user_id)
    select msg.id, w.user_id from public.owner_message_people(p_audience, p_person, p_house) w;
  end if;

  if wall then
    insert into public.events (house_id, kind, data)
    select distinct m.house_id, 'jonz_message',
      jsonb_build_object('subject', msg.subject, 'body', msg.body, 'message', msg.id)
    from public.members m
    where p_audience = 'everyone' or m.house_id = p_house;
  end if;

  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (
    auth.uid(),
    case when p_audience = 'test' then 'message.test' else 'message.send' end,
    'message', msg.id::text,
    jsonb_build_object(
      'audience', msg.audience, 'person', msg.person_id, 'house', msg.house_id,
      'subject', msg.subject, 'body', msg.body,
      'push', msg.by_push, 'wall', msg.by_wall, 'email', msg.by_email,
      'people', msg.people, 'walls', msg.walls
    )
  );

  return jsonb_build_object('id', msg.id, 'people', msg.people, 'walls', msg.walls);
end;
$$;


ALTER FUNCTION "public"."owner_send_message"("p_audience" "text", "p_person" "uuid", "p_house" "uuid", "p_subject" "text", "p_body" "text", "p_push" boolean, "p_wall" boolean, "p_email" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_set_report_state"("p_report" "uuid", "p_state" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  was text;
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_state is null or p_state not in ('fixed', 'open') then
    raise exception 'report_state' using errcode = 'P0001';
  end if;
  select state into was from public.reports where id = p_report for update;
  if was is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if was = p_state then
    return;
  end if;
  update public.reports set state = p_state, last_activity_at = now() where id = p_report;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (
    me, case p_state when 'fixed' then 'report.fixed' else 'report.reopen' end, 'report', p_report::text,
    jsonb_build_object('state', was), jsonb_build_object('state', p_state)
  );
end;
$$;


ALTER FUNCTION "public"."owner_set_report_state"("p_report" "uuid", "p_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_set_support_draft"("p_draft" "uuid", "p_state" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.can_app('reports:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_state not in ('used', 'dismissed') then
    raise exception 'bad_state' using errcode = 'P0001';
  end if;
  update public.support_drafts set state = p_state where id = p_draft and state = 'ready';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;


ALTER FUNCTION "public"."owner_set_support_draft"("p_draft" "uuid", "p_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_status"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'owner', exists (select 1 from public.app_owners o where o.user_id = (select auth.uid())),
    'mfa', coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2',
    'role', public.my_app_role(),
    'permissions', to_jsonb(public.my_app_permissions())
  );
$$;


ALTER FUNCTION "public"."owner_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_stop_deletion"("p_user" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.can_app('deletions:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  perform public.quietly(true);
  perform public.end_account_deletion(p_user, 'account.delete_stop', p_reason);
  perform public.quietly(false);
end;
$$;


ALTER FUNCTION "public"."owner_stop_deletion"("p_user" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_stop_promotion"("p_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  promo public.promotions;
begin
  if not public.can_app('promotions:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    raise exception 'promotion_unknown' using errcode = 'P0001';
  end if;
  if promo.state <> 'stopped' then
    update public.promotions set state = 'stopped', stopped_at = now() where id = p_id;
    insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
    values (
      auth.uid(), 'promotion.stop', 'promotion', p_id::text,
      jsonb_build_object('state', public.promotion_state(promo)), jsonb_build_object('state', 'stopped')
    );
  end if;
  return promo.stripe_promotion_code_id;
end;
$$;


ALTER FUNCTION "public"."owner_stop_promotion"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_covered"("a" "public"."assignments", "me" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select a.covered_by is not null and (
    a.user_id = me
    or (a.job_id is not null and exists (
      select 1 from public.assignments x where x.job_id = a.job_id and x.user_id = me
    ))
  )
$$;


ALTER FUNCTION "public"."owns_covered"("a" "public"."assignments", "me" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_pocket_money"("p_house" "uuid", "p_kid" "uuid", "p_month" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  me uuid := public.require_user();
  h public.houses;
  owed bigint;
begin
  if not public.is_member(p_house) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(p_house, 'pocket_money:write') then
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
$_$;


ALTER FUNCTION "public"."pay_pocket_money"("p_house" "uuid", "p_kid" "uuid", "p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_pass"("p_move" "uuid", "p_house" "uuid", "p_state" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  o public.moves;
  bill public.moving_pass_billing;
begin
  select * into o from public.moves where id = p_move;
  update public.houses
  set pass_plan = o.pass_plan, pass_ends_at = o.pass_ends_at, pass_bought_by = o.user_id
  where id = p_house;
  select * into bill from public.moving_pass_billing where move_id = p_move;
  if bill.move_id is not null then
    insert into public.house_pass_billing (house_id, stripe_customer_id, stripe_subscription_id)
    values (p_house, bill.stripe_customer_id, bill.stripe_subscription_id)
    on conflict (house_id) do update
      set stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        updated_at = now();
  end if;
  update public.moves set pass_state = p_state, pass_placed_at = now() where id = p_move;
end;
$$;


ALTER FUNCTION "public"."place_pass"("p_move" "uuid", "p_house" "uuid", "p_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_john"("p_assignment" "uuid", "p_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.can(a.house_id, 'ticks:write_own') then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if a.user_id <> me then
    raise exception 'not_your_john' using errcode = '42501';
  end if;
  if a.outcome is not null or a.done_at is not null or a.absent_at is not null then
    raise exception 'already_settled';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  if p_at is not null and (p_at < now() - interval '5 minutes' or p_at > ends) then
    raise exception 'plan_time';
  end if;
  -- A new plan gets its own reminder.
  update public.assignments
  set planned_at = p_at, reminded = case when reminded = 3 then 0 else reminded end
  where id = p_assignment;
end;
$$;


ALTER FUNCTION "public"."plan_john"("p_assignment" "uuid", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pocket_earn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pocket_earn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_rule_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."post_rule_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promotion_opened"("p_id" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.promotion_people
  set opened_at = coalesce(opened_at, now())
  where promotion_id = p_id and email = lower(btrim(p_email));
$$;


ALTER FUNCTION "public"."promotion_opened"("p_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promotion_ready"("p_id" "uuid", "p_coupon" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.promotions
  set stripe_coupon_id = p_coupon, stripe_promotion_code_id = p_code, state = 'live'
  where id = p_id and state = 'making';
$$;


ALTER FUNCTION "public"."promotion_ready"("p_id" "uuid", "p_coupon" "text", "p_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "note" "text",
    "kind" "text" NOT NULL,
    "percent_off" integer,
    "amount_off" "jsonb",
    "duration" "text",
    "months" integer,
    "plans" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "audience" "text" NOT NULL,
    "ends_at" timestamp with time zone,
    "max_uses" integer,
    "state" "text" DEFAULT 'making'::"text" NOT NULL,
    "stripe_coupon_id" "text",
    "stripe_promotion_code_id" "text",
    "made_by" "uuid",
    "made_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stopped_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotions_amount_off_check" CHECK ((("amount_off" IS NULL) OR ("jsonb_typeof"("amount_off") = 'object'::"text"))),
    CONSTRAINT "promotions_audience_check" CHECK (("audience" = ANY (ARRAY['anyone'::"text", 'named'::"text"]))),
    CONSTRAINT "promotions_check" CHECK ((("kind" = 'percent'::"text") = ("percent_off" IS NOT NULL))),
    CONSTRAINT "promotions_check1" CHECK ((("kind" = 'amount'::"text") = ("amount_off" IS NOT NULL))),
    CONSTRAINT "promotions_check2" CHECK ((("kind" = ANY (ARRAY['percent'::"text", 'amount'::"text"])) = ("duration" IS NOT NULL))),
    CONSTRAINT "promotions_check3" CHECK (((("kind" = 'trial'::"text") OR ("duration" = 'months'::"text")) <= ("months" IS NOT NULL))),
    CONSTRAINT "promotions_check4" CHECK ((("months" IS NULL) OR ("kind" = ANY (ARRAY['trial'::"text", 'gift'::"text"])) OR ("duration" = 'months'::"text"))),
    CONSTRAINT "promotions_check5" CHECK ((("kind" = 'gift'::"text") = ("cardinality"("plans") = 0))),
    CONSTRAINT "promotions_check6" CHECK ((("kind" <> 'trial'::"text") OR ("plans" <@ ARRAY['yearly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "promotions_check7" CHECK ((("state" <> 'live'::"text") OR ("kind" = ANY (ARRAY['trial'::"text", 'gift'::"text"])) OR ("stripe_promotion_code_id" IS NOT NULL))),
    CONSTRAINT "promotions_check8" CHECK ((("state" = 'stopped'::"text") = ("stopped_at" IS NOT NULL))),
    CONSTRAINT "promotions_code_check" CHECK (("code" ~ '^[A-Z0-9]{4,20}$'::"text")),
    CONSTRAINT "promotions_duration_check" CHECK (("duration" = ANY (ARRAY['once'::"text", 'months'::"text", 'always'::"text"]))),
    CONSTRAINT "promotions_kind_check" CHECK (("kind" = ANY (ARRAY['percent'::"text", 'amount'::"text", 'trial'::"text", 'gift'::"text"]))),
    CONSTRAINT "promotions_max_uses_check" CHECK (("max_uses" > 0)),
    CONSTRAINT "promotions_months_check" CHECK ((("months" >= 1) AND ("months" <= 24))),
    CONSTRAINT "promotions_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 60))),
    CONSTRAINT "promotions_note_check" CHECK ((("note" IS NULL) OR (("char_length"("btrim"("note")) >= 1) AND ("char_length"("btrim"("note")) <= 200)))),
    CONSTRAINT "promotions_percent_off_check" CHECK ((("percent_off" >= 1) AND ("percent_off" <= 100))),
    CONSTRAINT "promotions_plans_check" CHECK (("plans" <@ ARRAY['yearly'::"text", 'monthly'::"text", 'founding'::"text"])),
    CONSTRAINT "promotions_state_check" CHECK (("state" = ANY (ARRAY['making'::"text", 'live'::"text", 'stopped'::"text"])))
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


COMMENT ON TABLE "public"."promotions" IS 'Server only. Owner promotions: the offer, who it is for, and its Stripe coupon.';



CREATE OR REPLACE FUNCTION "public"."promotion_state"("p" "public"."promotions") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when p.state = 'stopped' then 'stopped'
    when p.state = 'making' then 'making'
    when p.ends_at is not null and p.ends_at <= now() then 'ended'
    when p.max_uses is not null
      and (select count(*) from public.promotion_uses u where u.promotion_id = p.id) >= p.max_uses then 'ended'
    else 'live'
  end;
$$;


ALTER FUNCTION "public"."promotion_state"("p" "public"."promotions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promotion_use"("p_id" "uuid", "p_house" "uuid", "p_user" "uuid", "p_email" "text", "p_session" "text", "p_plan" "text", "p_strict" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  promo public.promotions;
  v_email text := lower(btrim(p_email));
  added integer;
begin
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    return false;
  end if;
  if p_strict then
    if public.promotion_state(promo) <> 'live' then
      return false;
    end if;
    if promo.audience = 'named' and not exists (
      select 1 from public.promotion_people pp
      where pp.promotion_id = p_id and pp.email = v_email and pp.used_at is null
    ) then
      return false;
    end if;
  end if;
  insert into public.promotion_uses (promotion_id, house_id, user_id, email, session, plan)
  values (p_id, p_house, p_user, v_email, p_session, p_plan)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.promotion_people
    set used_at = coalesce(used_at, now())
    where promotion_id = p_id and promotion_people.email = v_email;
  end if;
  return added > 0;
end;
$$;


ALTER FUNCTION "public"."promotion_use"("p_id" "uuid", "p_house" "uuid", "p_user" "uuid", "p_email" "text", "p_session" "text", "p_plan" "text", "p_strict" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."proof_house"("object_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception
  when others then
    return null;
end;
$$;


ALTER FUNCTION "public"."proof_house"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_action"("p_user" "uuid", "p_assignment" "uuid", "p_dispute" "uuid", "p_uphold" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_user is null or (p_assignment is null) = (p_dispute is null)
     or (p_dispute is not null and p_uphold is null) then
    raise exception 'push_action' using errcode = '22023';
  end if;
  -- auth.uid() reads these; is_local, so they end with this call.
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if p_assignment is not null then
    perform public.mark_done(p_assignment, null);
  else
    perform public.cast_vote(p_dispute, p_uphold);
  end if;
end;
$$;


ALTER FUNCTION "public"."push_action"("p_user" "uuid", "p_assignment" "uuid", "p_dispute" "uuid", "p_uphold" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quietly"("p_on" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  perform set_config('johns.undoing', case when p_on then 'on' else '' end, true);
end;
$$;


ALTER FUNCTION "public"."quietly"("p_on" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."raise_dispute"("p_assignment" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  h public.houses;
  checked uuid;
  dispute uuid;
begin
  select * into a from public.assignments where id = p_assignment;
  if a.id is null or not public.can(a.house_id, 'disputes:write_own') then
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


ALTER FUNCTION "public"."raise_dispute"("p_assignment" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."raise_flag"("p_john" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  j public.johns;
  on_call_now boolean;
begin
  select * into j from public.johns where id = p_john;
  if j.id is null or not public.can(j.house_id, 'flags:write_own') then
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
    select 1 from public.on_call_picks oc join public.weeks w on w.id = oc.week_id
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


ALTER FUNCTION "public"."raise_flag"("p_john" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."react"("p_event" "uuid", "p_kind" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select public.check_can((select e.house_id from public.events e where e.id = p_event), 'wall:write_own');
  insert into public.reactions (event_id, kind) values (p_event, p_kind)
  on conflict do nothing;
$$;


ALTER FUNCTION "public"."react"("p_event" "uuid", "p_kind" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."react"("p_event" "uuid", "p_kind" "text") IS 'React to something on the Wall.';



CREATE OR REPLACE FUNCTION "public"."receive_email"("p_email_id" "text", "p_from" "text", "p_name" "text", "p_subject" "text", "p_topic" "text", "p_ref" "text", "p_body" "text", "p_trusted" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  addr text := lower(btrim(coalesce(p_from, '')));
  body text := left(btrim(coalesce(p_body, '')), 2000);
  subject text := nullif(left(btrim(coalesce(p_subject, '')), 300), '');
  topic text := lower(btrim(coalesce(p_topic, '')));
  account uuid;
  home uuid;
  found_id uuid;
  made uuid;
begin
  if p_email_id is null or addr = '' or addr !~ '^[^@\s]+@[^@\s]+$' then
    return jsonb_build_object('did', 'skipped', 'why', 'address');
  end if;
  if exists (select 1 from public.reports where email_id = p_email_id)
    or exists (select 1 from public.report_messages where email_id = p_email_id) then
    return jsonb_build_object('did', 'skipped', 'why', 'again');
  end if;
  if body = '' then
    body := coalesce(subject, '');
  end if;
  if body = '' then
    return jsonb_build_object('did', 'skipped', 'why', 'empty');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jonz.reports.email:' || addr, 0));

  if coalesce(p_trusted, false) then
    select u.id into account
    from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email::text) = addr and p.deleted_at is null
    limit 1;
  end if;

  -- A reply to one of ours: the report it names, if it's this sender's.
  if p_ref ~ '^[0-9a-f]{8}$' then
    select r.id into found_id
    from public.reports r
    where r.id::text like p_ref || '%'
      and (lower(r.from_email) = addr or (account is not null and r.user_id = account))
    order by r.created_at desc
    limit 1;
  end if;
  -- Or the same conversation, by its subject.
  if found_id is null and topic <> '' then
    select r.id into found_id
    from public.reports r
    where lower(r.from_email) = addr
      and r.state <> 'fixed'
      and r.created_at > now() - interval '30 days'
      and lower(regexp_replace(coalesce(r.subject, ''), '^((re|fwd?|aw|sv)\s*:\s*)+', '', 'i')) = topic
    order by r.created_at desc
    limit 1;
  end if;

  if found_id is not null then
    if (select count(*) from public.report_messages m join public.reports r on r.id = m.report_id
        where not m.from_owner and m.email_id is not null and lower(r.from_email) = addr
          and m.created_at > now() - interval '1 day') >= 30 then
      return jsonb_build_object('did', 'skipped', 'why', 'limit');
    end if;
    insert into public.report_messages (report_id, from_owner, written_by, body, email_id)
    values (found_id, false, account, body, p_email_id);
    update public.reports set state = 'new', last_activity_at = now() where id = found_id;
    return jsonb_build_object('did', 'message', 'report', found_id,
      'user_id', (select r.user_id from public.reports r where r.id = found_id));
  end if;

  if (select count(*) from public.reports r
      where r.source = 'email' and lower(r.from_email) = addr and r.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('did', 'skipped', 'why', 'limit');
  end if;

  if account is not null then
    select m.house_id into home from public.members m where m.user_id = account;
  end if;
  insert into public.reports (user_id, house_id, kind, words, source, from_email, from_name, subject, email_id)
  values (account, home, 'question', body, 'email', addr, nullif(left(btrim(coalesce(p_name, '')), 200), ''), subject, p_email_id)
  returning id into made;
  return jsonb_build_object('did', 'report', 'report', made, 'user_id', account);
end;
$_$;


ALTER FUNCTION "public"."receive_email"("p_email_id" "text", "p_from" "text", "p_name" "text", "p_subject" "text", "p_topic" "text", "p_ref" "text", "p_body" "text", "p_trusted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_event_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  a public.assignments;
  j public.johns;
  sharers uuid[];
  other uuid;
begin
  if not public.recording() then
    return null;
  end if;
  if new.kind in ('done', 'late') then
    select * into a from public.assignments where id = new.assignment_id;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, new.user_id, 'tick', new.assignment_id,
            jsonb_build_object('name', a.name, 'done_at', a.done_at, 'late', new.kind = 'late', 'event', new.id));
  elsif new.kind = 'covered' then
    select * into a from public.assignments where id = new.assignment_id;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, a.user_id, 'cover', new.assignment_id,
            jsonb_build_object('name', a.name, 'done_at', a.done_at, 'event', new.id));
  elsif new.kind = 'flagged' then
    -- Who shared the flag's points when it was raised, as open_flag counted
    -- them, so undoing it can take them back off.
    select * into a from public.assignments where id = new.assignment_id;
    select * into j from public.johns where id = a.john_id;
    select coalesce(array_agg(gm.user_id), '{}') into sharers
    from public.group_members gm where gm.group_id = j.group_id and gm.house_id = j.house_id;
    if j.group_id is null or cardinality(sharers) = 0 then
      select array_agg(m.user_id) into sharers from public.members m where m.house_id = new.house_id;
    end if;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, new.user_id, 'flag', new.assignment_id,
            jsonb_build_object('name', a.name, 'points', a.points, 'sharers', to_jsonb(sharers)));
  elsif new.kind = 'swap_used' then
    -- new.assignment_id is the John taken; the one given away now belongs
    -- to whoever it was taken from.
    select x.id into other from public.assignments x
    join public.assignments t on t.id = new.assignment_id
    where x.week_id = t.week_id and x.user_id = (new.data ->> 'with')::uuid
      and x.name = new.data ->> 'gave' and x.done_at is null and x.outcome is null
    order by x.due_at limit 1;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
    values (new.house_id, me, (new.data ->> 'with')::uuid, 'swap', new.assignment_id, other,
            jsonb_build_object('name', new.data ->> 'took', 'gave', new.data ->> 'gave', 'event', new.id));
  elsif new.kind = 'immunity_used' then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, new.user_id, 'immunity', new.assignment_id,
            jsonb_build_object('name', new.data ->> 'name', 'event', new.id));
  elsif new.kind = 'disputed' then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
    select new.house_id, me, (new.data ->> 'against')::uuid, 'dispute', new.assignment_id, d.id,
           jsonb_build_object('name', new.data ->> 'name', 'event', new.id)
    from public.disputes d
    where d.assignment_id = new.assignment_id and d.resolution is null;
  elsif new.kind = 'paid' then
    -- Both halves of the payment were written in this same call.
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, data)
    select new.house_id, me, new.user_id, 'payment',
           jsonb_build_object('amount', (new.data ->> 'amount')::integer, 'event', new.id,
                              'ledger', coalesce(jsonb_agg(l.id), '[]'::jsonb))
    from public.ledger_entries l
    where l.house_id = new.house_id and l.kind = 'payment' and l.created_at = new.created_at
      and ((l.user_id = new.user_id and l.counterparty_user_id = me) or (l.user_id = me and l.counterparty_user_id = new.user_id));
  elsif new.kind = 'away' then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, ref, data)
    values (new.house_id, me, new.user_id, 'away', (new.data ->> 'away')::uuid,
            jsonb_build_object('starts_on', new.data ->> 'starts_on', 'ends_on', new.data ->> 'ends_on'));
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."record_event_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_member_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
begin
  if not public.recording() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.house_actions (house_id, done_by, subject_user_id, kind, data)
      values (new.house_id, me, new.user_id, 'role', jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  elsif old.user_id <> me and exists (select 1 from public.houses where id = old.house_id) then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, data)
    values (old.house_id, me, old.user_id, 'remove', jsonb_build_object(
      'role', old.role, 'joined_at', old.joined_at, 'streak', old.streak,
      'immunity_tokens', old.immunity_tokens, 'swap_tokens', old.swap_tokens));
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."record_member_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_moved_on"("p_user" "uuid", "p_to" "uuid", "p_how" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  carried public.moves;
begin
  update public.moves set to_house_id = p_to, how = p_how, moved_at = now()
  where id = (
    select id from public.moves
    where user_id = p_user and how is null and from_house_id <> p_to
    order by left_at desc
    limit 1
  );
  select * into carried from public.moves
  where user_id = p_user and pass_state in ('waiting', 'lapsed')
    and (pass_plan = 'founding' or pass_ends_at > now())
  order by left_at desc
  limit 1;
  if carried.id is not null and not public.house_has_paid_pass(p_to) then
    perform public.place_pass(carried.id, p_to, 'moved');
  end if;
end;
$$;


ALTER FUNCTION "public"."record_moved_on"("p_user" "uuid", "p_to" "uuid", "p_how" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_vote_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  d public.disputes;
  a public.assignments;
begin
  if not public.recording() then
    return null;
  end if;
  select * into d from public.disputes where id = new.dispute_id;
  if d.raised_by = new.user_id then
    return null;
  end if;
  select * into a from public.assignments where id = d.assignment_id;
  insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
  values (d.house_id, new.user_id, coalesce(a.covered_by, a.user_id), 'vote', a.id, d.id,
          jsonb_build_object('name', a.name, 'uphold', new.uphold));
  return null;
end;
$$;


ALTER FUNCTION "public"."record_vote_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recording"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null and coalesce(current_setting('johns.undoing', true), '') <> 'on';
$$;


ALTER FUNCTION "public"."recording"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recount_streaks"("p_house" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with weeks as (
    select w.starts_on, a.user_id, coalesce(bool_and(a.outcome in ('done', 'excused')), false) as clean
    from public.weeks w
    join public.assignments a on a.week_id = w.id
    where w.house_id = p_house and w.closed_at is not null and w.skipped_at is null
    group by w.starts_on, a.user_id
  ),
  last_broken as (
    select user_id, max(starts_on) filter (where not clean) as broke from weeks group by user_id
  ),
  counted as (
    select w.user_id, count(*) filter (where b.broke is null or w.starts_on > b.broke) as streak
    from weeks w join last_broken b on b.user_id = w.user_id
    group by w.user_id
  )
  update public.members m
  set streak = least(coalesce(c.streak, 0), 32767)
  from public.members m2
  left join counted c on c.user_id = m2.user_id
  where m.house_id = p_house and m2.house_id = p_house and m2.user_id = m.user_id
    and m.streak is distinct from least(coalesce(c.streak, 0), 32767);
$$;


ALTER FUNCTION "public"."recount_streaks"("p_house" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redo_hours"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$ select 12 $$;


ALTER FUNCTION "public"."redo_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_flag"("p_assignment" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
  x public.house_actions;
  sharers uuid[];
  n integer;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.can(a.house_id, 'flags:write_own') then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.flagged_at is null then
    raise exception 'not_a_flag';
  end if;
  if a.done_at is not null or a.outcome is not null then
    raise exception 'flag_settled';
  end if;
  select * into x from public.house_actions
  where assignment_id = a.id and kind = 'flag' and undone_at is null
  order by created_at desc limit 1;
  if x.id is not null and public.undo_reach(x) is not null then
    perform public.undo_action(x.id);
    return;
  end if;
  if x.id is null and a.flagged_by is null and public.can(a.house_id, 'flags:write') then
    -- Opened again by the clock: as the flag's undo does, with today's sharers.
    sharers := public.flag_sharers(a.john_id);
    n := greatest(cardinality(sharers), 1);
    update public.week_shares
    set share = greatest(share - round(a.points::numeric / n, 2), 0)
    where week_id = a.week_id and user_id = any (sharers);
    delete from public.assignments where id = a.id;
    return;
  end if;
  raise exception 'not_your_flag' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."remove_flag"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_john"("p_john" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  perform public.check_can((select j.house_id from public.johns j where j.id = p_john), 'johns:write');
  update public.johns set archived_at = now() where id = p_john and archived_at is null;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."remove_john"("p_john" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."remove_john"("p_john" "uuid") IS 'Take a John off the list; weeks already dealt keep it.';



CREATE OR REPLACE FUNCTION "public"."remove_member"("p_house" "uuid", "p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  leaving public.members;
  h public.houses;
  move uuid;
  grace timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  if not public.can(p_house, case when p_user = me then 'members:write_own' else 'members:write' end) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.members where house_id = p_house and user_id = p_user and role = 'admin'
  ) and not exists (
    select 1 from public.members where house_id = p_house and role = 'admin' and user_id <> p_user
  ) and exists (
    select 1 from public.members where house_id = p_house and user_id <> p_user
  ) then
    raise exception 'last_admin';
  end if;
  delete from public.members where house_id = p_house and user_id = p_user
  returning * into leaving;
  if leaving.user_id is null then
    return;
  end if;
  if p_user <> me then
    update public.houses set join_code = public.new_join_code() where id = p_house;
  end if;
  if p_user = me or leaving.moving_out_on is not null then
    insert into public.moves (user_id, from_house_id) values (p_user, p_house) returning id into move;

    -- The buyer leaving themselves takes the Pass, unless it moved in the last 30 days.
    select * into h from public.houses where id = p_house for update;
    if p_user = me and h.pass_bought_by = me and public.house_has_paid_pass(p_house)
      and not exists (
        select 1 from public.moves
        where user_id = me and pass_state = 'moved' and pass_placed_at > now() - interval '30 days'
      )
    then
      update public.moves
      set pass_plan = h.pass_plan, pass_ends_at = h.pass_ends_at, pass_state = 'waiting'
      where id = move;
      insert into public.moving_pass_billing (move_id, stripe_customer_id, stripe_subscription_id)
      select move, b.stripe_customer_id, b.stripe_subscription_id
      from public.house_pass_billing b where b.house_id = p_house;
      delete from public.house_pass_billing where house_id = p_house;
      -- The house keeps the extras for 30 days (no longer than was paid for), as a free month it can buy from.
      grace := least(coalesce(h.pass_ends_at, 'infinity'), now() + interval '30 days');
      update public.houses set pass_plan = 'trial', pass_ends_at = grace, pass_bought_by = null where id = p_house;
    end if;

    -- Their name goes with the post: once they've gone, the Wall can't look it up.
    -- With the Pass gone too, the day the house's extras last until.
    if exists (select 1 from public.members where house_id = p_house) then
      insert into public.events (house_id, kind, user_id, data)
      select p_house, 'moved_out', p_user,
        jsonb_build_object('who', p.display_name)
          || case when grace is null then '{}'::jsonb else jsonb_build_object('pass_until', (grace at time zone h.timezone)::date) end
      from public.profiles p where p.id = p_user;
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."remove_member"("p_house" "uuid", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_push_device"("p_endpoint" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;


ALTER FUNCTION "public"."remove_push_device"("p_endpoint" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."remove_push_device"("p_endpoint" "text") IS 'Stop sending reminders to this device.';



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "house_id" "uuid",
    "kind" "text" NOT NULL,
    "state" "text" DEFAULT 'new'::"text" NOT NULL,
    "words" "text" NOT NULL,
    "details" "jsonb",
    "shots" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'app'::"text" NOT NULL,
    "from_email" "text",
    "from_name" "text",
    "subject" "text",
    "email_id" "text",
    "same_as_report_id" "uuid",
    CONSTRAINT "reports_details_check" CHECK ((("details" IS NULL) OR (("jsonb_typeof"("details") = 'object'::"text") AND ("octet_length"(("details")::"text") <= 4000)))),
    CONSTRAINT "reports_email_id_check" CHECK ((("email_id" IS NULL) OR ("char_length"("email_id") <= 100))),
    CONSTRAINT "reports_from_email_check" CHECK ((("from_email" IS NULL) OR ("char_length"("from_email") <= 320))),
    CONSTRAINT "reports_from_name_check" CHECK ((("from_name" IS NULL) OR ("char_length"("from_name") <= 200))),
    CONSTRAINT "reports_kind_check" CHECK (("kind" = ANY (ARRAY['problem'::"text", 'idea'::"text", 'question'::"text"]))),
    CONSTRAINT "reports_not_same_as_itself" CHECK ((("same_as_report_id" IS NULL) OR ("same_as_report_id" <> "id"))),
    CONSTRAINT "reports_shots_check" CHECK (("cardinality"("shots") <= 3)),
    CONSTRAINT "reports_source_check" CHECK (("source" = ANY (ARRAY['app'::"text", 'email'::"text"]))),
    CONSTRAINT "reports_state_check" CHECK (("state" = ANY (ARRAY['new'::"text", 'open'::"text", 'replied'::"text", 'fixed'::"text"]))),
    CONSTRAINT "reports_subject_check" CHECK ((("subject" IS NULL) OR ("char_length"("subject") <= 300))),
    CONSTRAINT "reports_words_check" CHECK ((("char_length"("words") >= 1) AND ("char_length"("words") <= 2000)))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."reports" IS 'Problems, ideas and questions people sent from the app.';



CREATE OR REPLACE FUNCTION "public"."report_recipient"("r" "public"."reports") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'report', r.id,
    'user_id', (select p.id from public.profiles p where p.id = r.user_id and p.deleted_at is null),
    'email', case when r.user_id is null then r.from_email end,
    'name', coalesce((select p.display_name from public.profiles p where p.id = r.user_id and p.deleted_at is null), r.from_name),
    'kind', r.kind,
    'words', r.words,
    'subject', r.subject,
    'source', r.source,
    'zone', (select h.timezone from public.houses h where h.id = r.house_id)
  );
$$;


ALTER FUNCTION "public"."report_recipient"("r" "public"."reports") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_account_deletion"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  d public.account_deletions;
begin
  select * into d from public.account_deletions where user_id = me and state = 'pending';
  if d.id is not null then
    return d.deletes_at;
  end if;
  insert into public.account_deletions (user_id, deletes_at, requested_by)
  values (me, now() + interval '30 days', 'self')
  returning * into d;
  update public.account_deletions set away_ids = public.deletion_away(me, d.deletes_at) where id = d.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (me, 'account.delete_request', 'account', me::text,
    jsonb_build_object('requested_by', 'self', 'delete_after', d.deletes_at));
  return d.deletes_at;
end;
$$;


ALTER FUNCTION "public"."request_account_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'johns_tick_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'johns_tick_secret';
  if url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;


ALTER FUNCTION "public"."request_tick"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_first_party"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
begin
  if (select auth.jwt()) ? 'client_id' then
    raise exception 'Only you can approve this, in Jonz itself.' using errcode = '42501';
  end if;
  return me;
end;
$$;


ALTER FUNCTION "public"."require_first_party"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."require_first_party"() IS 'The caller, if they are signed in to Jonz itself and not through a connected app (no client_id claim).';



CREATE OR REPLACE FUNCTION "public"."require_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  return me;
end;
$$;


ALTER FUNCTION "public"."require_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_bump"("acc" "jsonb", "p_user" "uuid", "field" "text", "n" numeric) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case when p_user is null or n = 0 then acc else
    jsonb_set(acc, array[p_user::text],
      coalesce(acc -> p_user::text, '{}'::jsonb)
      || jsonb_build_object(field, coalesce((acc -> p_user::text ->> field)::numeric, 0) + n))
  end;
$$;


ALTER FUNCTION "public"."reset_bump"("acc" "jsonb", "p_user" "uuid", "field" "text", "n" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_house_data"("p_house" "uuid", "p_everything" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
begin
  if not public.can(p_house, 'house_reset:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  return public.wipe_house_data(p_house, me, coalesce(p_everything, false));
end;
$$;


ALTER FUNCTION "public"."reset_house_data"("p_house" "uuid", "p_everything" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reset_house_data"("p_house" "uuid", "p_everything" boolean) IS 'A house admin (house_reset:write) resets the house''s history, or everything in it, back to before its first deal. Can''t be undone.';



CREATE OR REPLACE FUNCTION "public"."reset_join_code"("p_house" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  code text;
begin
  perform public.require_user();
  if not public.can(p_house, 'house:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.houses set join_code = public.new_join_code() where id = p_house
  returning join_code into code;
  return code;
end;
$$;


ALTER FUNCTION "public"."reset_join_code"("p_house" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."house_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "done_by" "uuid",
    "subject_user_id" "uuid",
    "kind" "text" NOT NULL,
    "assignment_id" "uuid",
    "ref" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "undone_at" timestamp with time zone,
    "undone_by" "uuid",
    CONSTRAINT "house_actions_kind_check" CHECK (("kind" = ANY (ARRAY['reset'::"text", 'tick'::"text", 'cover'::"text", 'flag'::"text", 'swap'::"text", 'immunity'::"text", 'dispute'::"text", 'vote'::"text", 'payment'::"text", 'away'::"text", 'role'::"text", 'remove'::"text"])))
);


ALTER TABLE "public"."house_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."house_actions" IS 'The house''s history of changes, used by Undo.';



CREATE OR REPLACE FUNCTION "public"."reset_reach"("x" "public"."house_actions") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  ids uuid[];
  h public.houses;
begin
  if not public.can(x.house_id, 'history:write') then
    return null;
  end if;
  select * into h from public.houses where id = x.house_id;
  if exists (
    select 1 from public.month_closes c
    where c.house_id = x.house_id
      and c.month in (x.data ->> 'month', x.data ->> 'week_month', to_char(x.created_at at time zone h.timezone, 'YYYY-MM'))
  ) and x.data ->> 'what' <> 'letoff' then
    return null;
  end if;
  if x.data ->> 'what' = 'letoff' and exists (
    select 1 from public.month_closes c
    where c.house_id = x.house_id and c.month = to_char(x.created_at at time zone h.timezone, 'YYYY-MM')
  ) then
    return null;
  end if;
  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into ids
  from jsonb_array_elements(x.data -> 'snapshot' -> 'assignments') s;
  if exists (
    select 1 from public.assignments a
    where (a.id = any (ids) or (x.data ->> 'what' in ('week', 'redeal') and a.week_id = x.ref))
      and (a.done_at > x.created_at or a.flagged_at > x.created_at)
  ) then
    return null;
  end if;
  return 'admin';
end;
$$;


ALTER FUNCTION "public"."reset_reach"("x" "public"."house_actions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_dispute"("p_dispute" "uuid", "p_resolution" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    delete from public.crew_members where assignment_id = d.assignment_id and created_at = d.tick_at;
  end if;
  insert into public.events (house_id, kind, assignment_id, data)
  values (d.house_id, p_resolution, d.assignment_id,
          jsonb_build_object('name', a.name, 'against', coalesce(a.covered_by, a.user_id)));
  return true;
end;
$$;


ALTER FUNCTION "public"."resolve_dispute"("p_dispute" "uuid", "p_resolution" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roll_call"("p_assignment" "uuid", "p_crew" "uuid"[], "p_photo_path" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.assignments := public.my_open_assignment(p_assignment);
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  job uuid := coalesce(a.job_id, a.id);
  people uuid[];
  total integer;
  absent uuid[];
  tick timestamptz := now();
begin
  if a.done_at is not null then
    raise exception 'already_done';
  end if;
  select coalesce(array_agg(distinct x), '{}') into people from unnest(p_crew) as x where x is not null;
  if not (a.user_id = any (people)) then
    raise exception 'not_in_crew';
  end if;
  if exists (
    select 1 from unnest(people) as x
    where not exists (select 1 from public.members m where m.house_id = a.house_id and m.user_id = x)
  ) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.needs_photo and photo is null and public.house_has_pass(a.house_id) then
    raise exception 'photo_required';
  end if;
  if photo is not null and photo not like a.house_id::text || '/' || a.id::text || '/%' then
    raise exception 'photo_path' using errcode = '22023';
  end if;

  -- The job's places, locked: two roll calls racing settle it once.
  perform 1 from public.assignments where a.job_id is not null and job_id = a.job_id for update;
  if exists (
    select 1 from public.assignments
    where a.job_id is not null and job_id = a.job_id and (done_at is not null or absent_at is not null)
  ) then
    raise exception 'already_done';
  end if;

  select coalesce(sum(p.points), 0) into total
  from public.assignments p
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.done_at is null and p.covered_by is null
    and ((p.outcome is null and not p.excused) or (p.excused and p.user_id = any (people)));

  update public.assignments p
  set done_at = tick, photo_path = case when p.id = a.id then photo end
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.outcome is null and p.done_at is null and not p.excused
    and p.user_id = any (people);

  with left_off as (
    update public.assignments p
    set absent_at = tick
    where a.job_id is not null and p.job_id = a.job_id
      and p.outcome is null and p.done_at is null and p.absent_at is null and not p.excused
      and not (p.user_id = any (people))
    returning p.user_id
  )
  select coalesce(array_agg(user_id), '{}') into absent from left_off;

  insert into public.crew_members (job_id, user_id, assignment_id, house_id, helper, points, created_at)
  select job, x, a.id, a.house_id,
         not exists (
           select 1 from public.assignments p
           where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
             and p.user_id = x and (p.done_at = tick or p.excused)
         ),
         total::numeric / cardinality(people), tick
  from unnest(people) as x;

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (
    a.house_id,
    case when tick > a.due_at then 'late' else 'done' end,
    a.user_id,
    a.id,
    jsonb_build_object(
      'name', a.name, 'points', a.points, 'photo', photo is not null,
      'with', to_jsonb(array_remove(people, a.user_id)), 'absent', to_jsonb(absent), 'total', total
    )
  );
  return cardinality(people);
end;
$$;


ALTER FUNCTION "public"."roll_call"("p_assignment" "uuid", "p_crew" "uuid"[], "p_photo_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."runs_for"("p_house" "uuid", "p_kid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.can(p_house, 'members:write')
    and exists (select 1 from public.houses h where h.id = p_house and h.kind = 'family')
    and exists (
      select 1 from public.members m
      where m.house_id = p_house and m.user_id = p_kid and m.role = 'member' and not m.signs_in
    );
$$;


ALTER FUNCTION "public"."runs_for"("p_house" "uuid", "p_kid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_group"("p_house" "uuid", "p_group" "uuid", "p_name" "text", "p_members" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  g uuid := p_group;
begin
  perform public.require_user();
  if not public.can(p_house, 'groups:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_members), 0) = 0 then
    raise exception 'group_empty';
  end if;
  if exists (
    select 1 from unnest(p_members) as u (id)
    where not exists (select 1 from public.members m where m.house_id = p_house and m.user_id = u.id)
  ) then
    raise exception 'not_housemates' using errcode = '22023';
  end if;
  if g is null then
    insert into public.groups (house_id, name) values (p_house, btrim(p_name)) returning id into g;
  else
    update public.groups set name = btrim(p_name) where id = g and house_id = p_house;
    if not found then
      raise exception 'unknown_group' using errcode = '22023';
    end if;
    delete from public.group_members where group_id = g;
  end if;
  insert into public.group_members (group_id, house_id, user_id)
  select distinct g, p_house, u.id from unnest(p_members) as u (id);
  return g;
exception
  when unique_violation then
    raise exception 'group_name_taken';
end;
$$;


ALTER FUNCTION "public"."save_group"("p_house" "uuid", "p_group" "uuid", "p_name" "text", "p_members" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_house_rules"("p_house" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_stake_minor" integer, "p_late_forfeit_minor" integer, "p_missed_forfeit_minor" integer, "p_dispute_hours" smallint, "p_away_makeup" smallint, "p_cover_grace_hours" smallint DEFAULT NULL::smallint, "p_late_hours" smallint DEFAULT NULL::smallint, "p_settle_in" "text" DEFAULT NULL::"text", "p_deal_mode" "text" DEFAULT NULL::"text", "p_deal_budget" smallint DEFAULT NULL::smallint, "p_pocket_cap_minor" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  perform public.check_can(p_house, 'house:write');
  update public.houses
  set name = p_name,
      timezone = p_timezone,
      currency = p_currency,
      week_starts = p_week_starts,
      stake_minor = p_stake_minor,
      late_forfeit_minor = p_late_forfeit_minor,
      missed_forfeit_minor = p_missed_forfeit_minor,
      dispute_hours = p_dispute_hours,
      away_makeup = p_away_makeup,
      cover_grace_hours = coalesce(p_cover_grace_hours, cover_grace_hours),
      late_hours = coalesce(p_late_hours, late_hours),
      settle_in = coalesce(p_settle_in, settle_in),
      deal_mode = coalesce(p_deal_mode, deal_mode),
      deal_budget = coalesce(p_deal_budget, deal_budget),
      pocket_cap_minor = coalesce(p_pocket_cap_minor, pocket_cap_minor)
  where id = p_house;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."save_house_rules"("p_house" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_stake_minor" integer, "p_late_forfeit_minor" integer, "p_missed_forfeit_minor" integer, "p_dispute_hours" smallint, "p_away_makeup" smallint, "p_cover_grace_hours" smallint, "p_late_hours" smallint, "p_settle_in" "text", "p_deal_mode" "text", "p_deal_budget" smallint, "p_pocket_cap_minor" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_house_rules"("p_house" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_stake_minor" integer, "p_late_forfeit_minor" integer, "p_missed_forfeit_minor" integer, "p_dispute_hours" smallint, "p_away_makeup" smallint, "p_cover_grace_hours" smallint, "p_late_hours" smallint, "p_settle_in" "text", "p_deal_mode" "text", "p_deal_budget" smallint, "p_pocket_cap_minor" integer) IS 'Change the house''s name and rules.';



CREATE OR REPLACE FUNCTION "public"."save_notice"("p_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_link_label" "text", "p_link_url" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  old_row public.notices;
  new_row public.notices;
begin
  if not public.can_app('notices:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()) then
    raise exception 'notice_ends_first';
  end if;

  if p_id is null then
    insert into public.notices (kind, title, body, link_label, link_url, starts_at, ends_at, created_by)
    values (
      p_kind, btrim(p_title), coalesce(btrim(p_body), ''), nullif(btrim(p_link_label), ''),
      nullif(btrim(p_link_url), ''), coalesce(p_starts_at, now()), p_ends_at, auth.uid()
    )
    returning * into new_row;
  else
    select * into old_row from public.notices where id = p_id for update;
    if not found then
      raise exception 'not_found';
    end if;
    update public.notices set
      kind = p_kind,
      title = btrim(p_title),
      body = coalesce(btrim(p_body), ''),
      link_label = nullif(btrim(p_link_label), ''),
      link_url = nullif(btrim(p_link_url), ''),
      starts_at = coalesce(p_starts_at, old_row.starts_at),
      ends_at = p_ends_at,
      updated_at = now()
    where id = p_id
    returning * into new_row;
  end if;

  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (
    auth.uid(), 'notice.save', 'notice', new_row.id::text,
    case when old_row.id is null then null else to_jsonb(old_row) end, to_jsonb(new_row)
  );
  return new_row.id;
end;
$$;


ALTER FUNCTION "public"."save_notice"("p_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_link_label" "text", "p_link_url" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_notifications"("p_reminders" boolean, "p_checks" boolean, "p_flags" boolean, "p_deal" boolean, "p_quiet_from" smallint, "p_quiet_until" smallint, "p_timezone" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.notification_prefs (user_id, reminders, checks, flags, deal, quiet_from, quiet_until, timezone, updated_at)
  values ((select auth.uid()), p_reminders, p_checks, p_flags, p_deal, p_quiet_from, p_quiet_until, p_timezone, now())
  on conflict (user_id) do update
    set reminders = excluded.reminders, checks = excluded.checks, flags = excluded.flags, deal = excluded.deal,
        quiet_from = excluded.quiet_from, quiet_until = excluded.quiet_until, timezone = excluded.timezone,
        updated_at = excluded.updated_at;
$$;


ALTER FUNCTION "public"."save_notifications"("p_reminders" boolean, "p_checks" boolean, "p_flags" boolean, "p_deal" boolean, "p_quiet_from" smallint, "p_quiet_until" smallint, "p_timezone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_notifications"("p_reminders" boolean, "p_checks" boolean, "p_flags" boolean, "p_deal" boolean, "p_quiet_from" smallint, "p_quiet_until" smallint, "p_timezone" "text") IS 'Save what to push you and when to keep quiet.';



CREATE OR REPLACE FUNCTION "public"."save_prefs"("p_house" "uuid", "p_days" smallint[], "p_best_time" "text", "p_rather" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  kept jsonb;
begin
  if not public.can(p_house, 'profile:write_own') then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if p_best_time is not null and p_best_time not in ('morning', 'afternoon', 'evening') then
    raise exception 'bad_prefs';
  end if;
  if p_days is not null and not (p_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]) then
    raise exception 'bad_prefs';
  end if;
  if p_rather is not null and jsonb_typeof(p_rather) <> 'object' then
    raise exception 'bad_prefs';
  end if;
  -- Only this house's Johns, and only rather do (1) or rather not (-1).
  select coalesce(jsonb_object_agg(r.key, (r.value #>> '{}')::smallint), '{}'::jsonb) into kept
  from jsonb_each(coalesce(p_rather, '{}'::jsonb)) r
  join public.johns j on j.id::text = r.key and j.house_id = p_house and j.archived_at is null
  where r.value #>> '{}' in ('1', '-1');

  update public.members
  set suits_days = (select coalesce(array_agg(distinct d order by d), '{}') from unnest(coalesce(p_days, '{}')) d),
      best_time = p_best_time,
      rather = kept
  where house_id = p_house and user_id = me;
end;
$$;


ALTER FUNCTION "public"."save_prefs"("p_house" "uuid", "p_days" smallint[], "p_best_time" "text", "p_rather" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_words"("p_q" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select nullif(left(btrim(regexp_replace(regexp_replace(normalize(coalesce(p_q, ''), nfkc), '[^[:alpha:][:digit:] @._''-]', ' ', 'g'), '\s+', ' ', 'g')), 100), '');
$$;


ALTER FUNCTION "public"."search_words"("p_q" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_words"("p_q" "text") IS 'The search box''s words, kept to letters, digits, spaces and @ . _ '' -: core searchWords.';



CREATE OR REPLACE FUNCTION "public"."see_report"("p_report" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.reports set seen_at = now()
  where id = p_report and user_id = (select auth.uid());
$$;


ALTER FUNCTION "public"."see_report"("p_report" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_report"("p_kind" "text", "p_words" "text", "p_details" "jsonb" DEFAULT NULL::"jsonb", "p_shots" "text"[] DEFAULT '{}'::"text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  me uuid := (select auth.uid());
  words text := btrim(coalesce(p_words, ''));
  shots text[] := coalesce(p_shots, '{}');
  shot text;
  home uuid;
  made uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('problem', 'idea', 'question') then
    raise exception 'report_kind' using errcode = 'P0001';
  end if;
  if char_length(words) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  if cardinality(shots) > 3 then
    raise exception 'report_shot' using errcode = 'P0001';
  end if;
  foreach shot in array shots loop
    if shot is null
      or shot !~ ('^' || me::text || '/[0-9a-f-]{36}\.jpg$')
      or not exists (select 1 from storage.objects o where o.bucket_id = 'report-shots' and o.name = shot) then
      raise exception 'report_shot' using errcode = 'P0001';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('jonz.reports:' || me::text, 0));
  if (select count(*) from public.reports r where r.user_id = me and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;

  select m.house_id into home from public.members m where m.user_id = me;
  insert into public.reports (user_id, house_id, kind, words, details, shots)
  values (me, home, p_kind, words, p_details, shots)
  returning id into made;
  return made;
end;
$_$;


ALTER FUNCTION "public"."send_report"("p_kind" "text", "p_words" "text", "p_details" "jsonb", "p_shots" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_app_access"("p_client_id" "text", "p_access" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_first_party();
begin
  if p_client_id is null or char_length(p_client_id) not between 1 and 100 then
    raise exception 'Which app?' using errcode = '22023';
  end if;
  if p_access is null or p_access not in ('read', 'write') then
    raise exception 'An app can read, or read and change.' using errcode = '22023';
  end if;
  insert into public.connected_apps (user_id, client_id, access)
  values (me, p_client_id, p_access)
  on conflict on constraint connected_apps_user_id_client_id_key do update set access = excluded.access;
end;
$$;


ALTER FUNCTION "public"."set_app_access"("p_client_id" "text", "p_access" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_app_access"("p_client_id" "text", "p_access" "text") IS 'Set what one of your connected apps may do: read, or write. Refuses a connected app''s own token.';



CREATE OR REPLACE FUNCTION "public"."set_away"("p_starts" "date", "p_ends" "date", "p_note" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return public.start_away(public.require_user(), p_starts, p_ends, p_note);
end;
$$;


ALTER FUNCTION "public"."set_away"("p_starts" "date", "p_ends" "date", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_closes_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.flagged_at is null then
    new.closes_at := new.due_at + make_interval(hours => (
      select h.late_hours from public.houses h where h.id = new.house_id
    ));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_closes_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_deal_mode"("p_house" "uuid", "p_mode" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  perform public.check_can(p_house, 'house:write');
  update public.houses set deal_mode = p_mode where id = p_house;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_deal_mode"("p_house" "uuid", "p_mode" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_deal_mode"("p_house" "uuid", "p_mode" "text") IS 'Choose how the house shares its Johns: Smart or Classic.';



CREATE OR REPLACE FUNCTION "public"."set_house_kind"("p_house" "uuid", "p_kind" "text") RETURNS "date"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  h public.houses;
  local_today date;
  first_next date;
begin
  if not public.is_member(p_house) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(p_house, 'house:write') then
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


ALTER FUNCTION "public"."set_house_kind"("p_house" "uuid", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_role"("p_house" "uuid", "p_user" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.require_user();
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  if not public.can(p_house, 'members:write') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if p_role = 'member' and not exists (
    select 1 from public.members
    where house_id = p_house and role = 'admin' and user_id <> p_user
  ) then
    raise exception 'last_admin';
  end if;
  update public.members set role = p_role where house_id = p_house and user_id = p_user;
end;
$$;


ALTER FUNCTION "public"."set_member_role"("p_house" "uuid", "p_user" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_moving_out"("p_on" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  h public.houses;
  today date;
  was date;
begin
  select houses.* into h
  from public.houses join public.members m on m.house_id = houses.id
  where m.user_id = me;
  if h.id is null then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  today := (now() at time zone h.timezone)::date;
  if p_on is not null and p_on < today then
    raise exception 'moving_in_past';
  end if;
  if p_on is not null and p_on > today + 365 then
    raise exception 'moving_too_far';
  end if;
  select moving_out_on into was from public.members where house_id = h.id and user_id = me for update;
  if was is not distinct from p_on then
    return;
  end if;
  update public.members set moving_out_on = p_on where house_id = h.id and user_id = me;
  insert into public.events (house_id, kind, user_id, data)
  values (h.id, 'moving_out', me, jsonb_build_object('on', p_on));
end;
$$;


ALTER FUNCTION "public"."set_moving_out"("p_on" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_language"("p_language" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  update public.profiles set language = p_language where id = (select auth.uid());
$$;


ALTER FUNCTION "public"."set_my_language"("p_language" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_my_language"("p_language" "text") IS 'Change the language you read Jonz in.';



CREATE OR REPLACE FUNCTION "public"."set_my_name"("p_name" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  update public.profiles set display_name = p_name where id = (select auth.uid());
$$;


ALTER FUNCTION "public"."set_my_name"("p_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_my_name"("p_name" "text") IS 'Rename yourself.';



CREATE OR REPLACE FUNCTION "public"."set_my_photo"("photo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if photo is null or photo !~ (
    '^(https://[^/?#]+|http://(127\.0\.0\.1|localhost)(:[0-9]+)?)/(storage/v1/object/public|files/photo)/avatars/'
    || me::text || '/[A-Za-z0-9][A-Za-z0-9._-]*(\?v=[0-9]+)?$'
  ) then
    raise exception 'That photo isn''t yours.' using errcode = '22023';
  end if;
  update public.profiles set avatar_url = photo where id = me;
end;
$_$;


ALTER FUNCTION "public"."set_my_photo"("photo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_assignments"("p_items" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  x jsonb;
  a public.assignments;
  n integer := 0;
begin
  for x in select * from jsonb_array_elements(p_items) loop
    update public.assignments
    set outcome = x ->> 'outcome', settled_at = now()
    where id = (x ->> 'id')::uuid and outcome is null
    returning * into a;
    if a.id is null then
      continue;
    end if;
    n := n + 1;
    if coalesce((x ->> 'forfeit')::integer, 0) > 0 then
      insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id, counterparty_user_id, doers)
      values (a.house_id, a.user_id, 'forfeit', -(x ->> 'forfeit')::integer, x ->> 'month', a.id,
              case when a.outcome = 'covered' then a.covered_by end,
              case when a.absent_at is not null then (
                select array_agg(c.user_id order by c.user_id) from public.crew_members c where c.job_id = a.job_id
              ) end)
      on conflict do nothing;
    end if;
    if a.outcome = 'missed' then
      insert into public.events (house_id, kind, user_id, assignment_id, data)
      values (a.house_id, 'missed', a.user_id, a.id, jsonb_build_object('name', a.name));
    end if;
    a := null;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."settle_assignments"("p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_house"("other" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.members mine
    join public.members theirs on theirs.house_id = mine.house_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;


ALTER FUNCTION "public"."shares_house"("other" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_away"("p_user" "uuid", "p_starts" "date", "p_ends" "date", "p_note" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    select 1 from public.away_periods
    where house_id = h.id and user_id = me and starts_on <= p_ends and ends_on >= p_starts
  ) then
    raise exception 'away_overlaps';
  end if;

  insert into public.away_periods (house_id, user_id, starts_on, ends_on, note)
  values (h.id, me, p_starts, p_ends, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into away_id;

  departure := (p_starts::timestamp at time zone h.timezone) - interval '1 minute';
  soon := departure < now() + interval '12 hours';

  if not soon then
    update public.assignments x
    set original_due_at = coalesce(x.original_due_at, x.due_at), due_at = departure, reminded = 0
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
        select 1 from public.away_periods w
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
      update public.assignments set excused = true, handed_from_user_id = me, handed_by_away_period_id = away_id where id = a.id;
      excused := excused + 1;
    else
      update public.assignments set user_id = holder, reminded = 0, handed_from_user_id = me, handed_by_away_period_id = away_id where id = a.id;
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


ALTER FUNCTION "public"."start_away"("p_user" "uuid", "p_starts" "date", "p_ends" "date", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_house_from"("p_from" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  house uuid;
begin
  if not exists (
    select 1 from public.moves
    where user_id = me and from_house_id = p_from and how is null and left_at > now() - interval '90 days'
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
  update public.moves set how = 'copied'
  where user_id = me and to_house_id = house;
  return house;
end;
$$;


ALTER FUNCTION "public"."start_house_from"("p_from" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "report_message_id" bigint,
    "drafted_by" "uuid",
    "state" "text" DEFAULT 'drafting'::"text" NOT NULL,
    "reply" "text" DEFAULT ''::"text" NOT NULL,
    "action" "text" DEFAULT 'none'::"text" NOT NULL,
    "same_as_report_id" "uuid",
    "why" "text" DEFAULT ''::"text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_drafts_action_check" CHECK (("action" = ANY (ARRAY['none'::"text", 'same_as'::"text", 'delete'::"text"]))),
    CONSTRAINT "support_drafts_input_tokens_check" CHECK (("input_tokens" >= 0)),
    CONSTRAINT "support_drafts_output_tokens_check" CHECK (("output_tokens" >= 0)),
    CONSTRAINT "support_drafts_reply_check" CHECK (("char_length"("reply") <= 2000)),
    CONSTRAINT "support_drafts_state_check" CHECK (("state" = ANY (ARRAY['drafting'::"text", 'ready'::"text", 'used'::"text", 'dismissed'::"text", 'failed'::"text"]))),
    CONSTRAINT "support_drafts_why_check" CHECK (("char_length"("why") <= 600))
);


ALTER TABLE "public"."support_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_drafts" IS 'The support agent''s suggested replies and steps on reports, for the owner.';



CREATE OR REPLACE FUNCTION "public"."support_draft_json"("d" "public"."support_drafts") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'id', d.id,
    'state', d.state,
    'reply', d.reply,
    'action', d.action,
    'why', d.why,
    'same_as', case when d.same_as_report_id is null then null else (
      select jsonb_build_object('id', s.id, 'words', s.words, 'state', s.state,
        'name', coalesce(p.display_name, s.from_name, s.from_email))
      from public.reports s left join public.profiles p on p.id = s.user_id
      where s.id = d.same_as_report_id
    ) end
  );
$$;


ALTER FUNCTION "public"."support_draft_json"("d" "public"."support_drafts") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."take_message_outbox"("p_limit" integer DEFAULT 200, "p_message" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("message_id" "uuid", "user_id" "uuid", "subject" "text", "body" "text", "by_push" boolean, "by_wall" boolean, "by_email" boolean, "email" "text", "name" "text", "zone" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with taken as (
    delete from public.owner_message_outbox o
    where (o.message_id, o.user_id) in (
      select x.message_id, x.user_id
      from public.owner_message_outbox x
      where p_message is null or x.message_id = p_message
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
      for update skip locked
    )
    returning o.message_id, o.user_id
  )
  select t.message_id, t.user_id, m.subject, m.body, m.by_push, m.by_wall, m.by_email,
    u.email::text, p.display_name,
    coalesce(np.timezone, h.timezone, 'UTC')
  from taken t
  join public.owner_messages m on m.id = t.message_id
  join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = t.user_id
  left join public.notification_prefs np on np.user_id = t.user_id
  left join public.members mb on mb.user_id = t.user_id
  left join public.houses h on h.id = mb.house_id;
$$;


ALTER FUNCTION "public"."take_message_outbox"("p_limit" integer, "p_message" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tick_awaits_ok"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
      and not public.can(new.house_id, 'ticks:write');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tick_awaits_ok"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tidy_api_bookkeeping"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  delete from public.api_idempotency_keys where created_at < now() - interval '24 hours';
  delete from public.api_rate_limits where window_started_at < now() - interval '1 hour';
  delete from public.api_approvals where created_at < now() - interval '24 hours';
$$;


ALTER FUNCTION "public"."tidy_api_bookkeeping"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tidy_api_bookkeeping"() IS 'Clears idempotency keys and approvals older than a day and rate-limit windows older than an hour. Run by cron.';



CREATE OR REPLACE FUNCTION "public"."undo_action"("p_action" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  x public.house_actions;
  reach text;
  a public.assignments;
  b public.assignments;
  aw public.away_periods;
  tz text;
  today date;
  s jsonb;
  n integer;
begin
  select * into x from public.house_actions where id = p_action for update;
  if x.id is null or not public.can(x.house_id, 'history:write_own') then
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
    delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
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
    update public.assignments set user_id = x.done_by, reminded = 0 where id = b.id;
    update public.assignments set user_id = x.subject_user_id, reminded = 0 where id = a.id;
    update public.members set swap_tokens = swap_tokens + 1
    where house_id = x.house_id and user_id = x.done_by and swap_tokens < 1;
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
    delete from public.dispute_votes where dispute_id = x.ref and user_id = x.done_by;
  when 'payment' then
    delete from public.ledger_entries
    where house_id = x.house_id and kind = 'payment'
      and id in (select (jsonb_array_elements_text(x.data -> 'ledger'))::bigint);
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'away' then
    -- As cancel_away, for whoever it was.
    perform public.end_away(x.ref);
  when 'role' then
    if x.data ->> 'from' = 'member' and not exists (
      select 1 from public.members where house_id = x.house_id and role = 'admin' and user_id <> x.subject_user_id
    ) then
      raise exception 'last_admin';
    end if;
    update public.members set role = x.data ->> 'from' where house_id = x.house_id and user_id = x.subject_user_id;
  when 'remove' then
    insert into public.members (house_id, user_id, role, joined_at, streak, immunity_tokens, swap_tokens)
    values (x.house_id, x.subject_user_id, x.data ->> 'role', (x.data ->> 'joined_at')::timestamptz,
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
  if x.done_by is not null and x.done_by <> me then
    insert into public.events (house_id, kind, user_id, assignment_id, data)
    values (x.house_id, 'undone', x.done_by,
            case when x.kind = 'flag' then null else x.assignment_id end,
            jsonb_build_object('by', me, 'what', x.kind, 'name', x.data ->> 'name', 'action', x.id));
  end if;
end;
$$;


ALTER FUNCTION "public"."undo_action"("p_action" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_cover"("p_assignment" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  a public.assignments;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or a.covered_by is distinct from me or not public.can(a.house_id, 'swaps:write_own') then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if a.outcome is not null then
    raise exception 'already_settled';
  end if;
  if exists (
    select 1 from public.disputes d join public.assignments p on p.id = d.assignment_id
    where d.resolution is null and (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
  ) then
    raise exception 'under_dispute';
  end if;
  update public.assignments p set done_at = null, photo_path = null, covered_by = null
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.outcome is null and p.covered_by = me and p.done_at = a.done_at;
  delete from public.events
  where assignment_id = a.id and kind = 'covered' and created_at >= a.done_at;
end;
$$;


ALTER FUNCTION "public"."undo_cover"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_done"("p_assignment" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.assignments := public.my_open_assignment(p_assignment);
  ticked_from uuid;
begin
  if a.done_at is null then
    return;
  end if;
  if a.covered_by is not null then
    raise exception 'john_covered';
  end if;
  select c.assignment_id into ticked_from from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) limit 1;
  if ticked_from is not null and ticked_from <> a.id then
    raise exception 'not_your_tick';
  end if;
  if exists (select 1 from public.disputes where assignment_id = a.id and resolution is null) then
    raise exception 'under_dispute';
  end if;
  update public.assignments p set done_at = null, photo_path = null, absent_at = null
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.outcome is null and p.covered_by is null and (p.done_at = a.done_at or p.absent_at = a.done_at);
  delete from public.crew_members where assignment_id = a.id;
  delete from public.events
  where assignment_id = a.id and kind in ('done', 'late') and created_at >= a.done_at;
  perform public.drop_own_flag(a.id);
end;
$$;


ALTER FUNCTION "public"."undo_done"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_latest"("p_kind" "text", "p_about" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := public.require_user();
  found_id uuid;
begin
  select id into found_id from public.house_actions
  where done_by = me and kind = p_kind and undone_at is null
    and (p_about is null or assignment_id = p_about or ref = p_about or subject_user_id = p_about)
  order by created_at desc limit 1;
  if found_id is null then
    raise exception 'cannot_undo';
  end if;
  perform public.undo_action(found_id);
  return found_id;
end;
$$;


ALTER FUNCTION "public"."undo_latest"("p_kind" "text", "p_about" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_reach"("x" "public"."house_actions") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  mine boolean;
  admin boolean;
  a public.assignments;
  b public.assignments;
  w public.weeks;
  d public.disputes;
  aw public.away_periods;
  tz text;
  open_dispute boolean;
  month_ok boolean;
begin
  if me is null or x.undone_at is not null or not public.is_member(x.house_id) then
    return null;
  end if;
  if x.kind = 'reset' then
    return public.reset_reach(x);
  end if;
  mine := x.done_by = me;
  admin := public.can(x.house_id, 'history:write');
  select timezone into tz from public.houses where id = x.house_id;

  if x.kind in ('tick', 'cover', 'flag', 'swap', 'immunity') then
    select * into a from public.assignments where id = x.assignment_id;
    if a.id is null then
      return null;
    end if;
    select * into w from public.weeks where id = a.week_id;
    open_dispute := exists (select 1 from public.disputes where assignment_id = a.id and resolution is null);
    month_ok := public.month_open(x.house_id, a.due_at)
      and not exists (
        select 1 from public.ledger_entries l join public.month_closes c on c.house_id = l.house_id and c.month = l.month
        where l.assignment_id = a.id and l.kind = 'forfeit'
      );
  end if;

  case x.kind
  when 'tick' then
    -- Still this tick (not struck and ticked again), not under dispute, not covered.
    if a.done_at is distinct from (x.data ->> 'done_at')::timestamptz or a.covered_by is not null or open_dispute then
      return null;
    end if;
    if mine and a.user_id = me and a.outcome is null and now() < public.closes_at(a, w.ends_at) then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'cover' then
    if a.done_at is distinct from (x.data ->> 'done_at')::timestamptz or a.covered_by is distinct from x.done_by
       or open_dispute then
      return null;
    end if;
    if mine and a.outcome is null then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'flag' then
    if a.done_at is not null or a.outcome is not null then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'swap' then
    select * into b from public.assignments where id = x.ref;
    if b.id is null or a.user_id is distinct from x.done_by or b.user_id is distinct from x.subject_user_id
       or a.done_at is not null or b.done_at is not null or a.outcome is not null or b.outcome is not null
       or now() >= w.ends_at then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'immunity' then
    if a.outcome is distinct from 'excused' then
      return null;
    end if;
    if mine and w.closed_at is null then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'dispute' then
    select * into d from public.disputes where id = x.ref;
    if d.id is null or d.resolution is not null then
      return null;
    end if;
    if mine and not exists (select 1 from public.dispute_votes v where v.dispute_id = d.id and v.user_id <> me) then
      return 'own';
    end if;
    return case when admin then 'admin' end;
  when 'vote' then
    select * into d from public.disputes where id = x.ref;
    if d.id is null or d.resolution is not null or now() >= d.closes_at
       or not exists (select 1 from public.dispute_votes v where v.dispute_id = d.id and v.user_id = x.done_by) then
      return null;
    end if;
    return case when mine then 'own' end;
  when 'payment' then
    if not exists (
      select 1 from public.ledger_entries l where l.id in (select (jsonb_array_elements_text(x.data -> 'ledger'))::bigint)
    ) then
      return null;
    end if;
    if mine and now() < x.created_at + interval '7 days' then
      return 'own';
    end if;
    return case when admin and public.month_open(x.house_id, x.created_at) then 'admin' end;
  when 'away' then
    select * into aw from public.away_periods where id = x.ref;
    if aw.id is null or aw.ends_on < (now() at time zone tz)::date then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'role' then
    if not exists (
      select 1 from public.members where house_id = x.house_id and user_id = x.subject_user_id and role = x.data ->> 'to'
    ) then
      return null;
    end if;
    return case when admin and public.month_open(x.house_id, x.created_at) then 'admin' end;
  when 'remove' then
    if now() >= x.created_at + interval '7 days'
       or exists (select 1 from public.members where user_id = x.subject_user_id) then
      return null;
    end if;
    return case when admin then 'admin' end;
  else
    return null;
  end case;
end;
$$;


ALTER FUNCTION "public"."undo_reach"("x" "public"."house_actions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_reset"("x" "public"."house_actions") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  snap jsonb := x.data -> 'snapshot';
  ids uuid[];
begin
  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into ids from jsonb_array_elements(snap -> 'assignments') s;

  if x.data ->> 'what' = 'redeal' then
    -- The new deal goes; the old one comes back below.
    delete from public.assignments where week_id = x.ref and not (id = any (ids));
    delete from public.on_call_picks where week_id = x.ref;
    insert into public.on_call_picks select * from jsonb_populate_recordset(null::public.on_call_picks, snap -> 'on_call');
  end if;

  -- Money: whatever the reset (or the clock, since) charged on these Johns,
  -- and its corrections, go; the forfeits it took away come back.
  delete from public.ledger_entries where kind = 'forfeit' and assignment_id = any (ids);
  delete from public.ledger_entries where id in (select (jsonb_array_elements_text(x.data -> 'added'))::bigint);
  if x.data ->> 'what' = 'letoff' then
    delete from public.ledger_entries where house_id = x.house_id and month = x.data ->> 'month' and kind = 'forfeit';
    delete from public.month_let_offs where house_id = x.house_id and month = x.data ->> 'month';
  end if;

  update public.assignments t
  set user_id = r.user_id, done_at = r.done_at, photo_path = r.photo_path, covered_by = r.covered_by,
      outcome = r.outcome, settled_at = r.settled_at, excused = r.excused, due_at = r.due_at,
      changed_by = r.changed_by, changed_at = r.changed_at
  from jsonb_populate_recordset(null::public.assignments, snap -> 'assignments') r
  where t.id = r.id;
  insert into public.assignments
  select r.* from jsonb_populate_recordset(null::public.assignments, snap -> 'assignments') r
  where not exists (select 1 from public.assignments t where t.id = r.id);

  insert into public.ledger_entries overriding system value
  select r.* from jsonb_populate_recordset(null::public.ledger_entries, snap -> 'ledger') r
  where not exists (select 1 from public.ledger_entries l where l.id = r.id);

  insert into public.disputes
  select r.* from jsonb_populate_recordset(null::public.disputes, snap -> 'disputes') r
  where not exists (select 1 from public.disputes d where d.id = r.id);
  insert into public.dispute_votes
  select r.* from jsonb_populate_recordset(null::public.dispute_votes, snap -> 'votes') r
  on conflict do nothing;
  insert into public.events
  select r.* from jsonb_populate_recordset(null::public.events, snap -> 'events') r
  where not exists (select 1 from public.events e where e.id = r.id);

  if x.ref is not null and x.data ->> 'what' <> 'result' then
    delete from public.week_shares where week_id = x.ref;
    insert into public.week_shares select * from jsonb_populate_recordset(null::public.week_shares, snap -> 'shares');
    update public.weeks set skipped_at = (snap ->> 'skipped_at')::timestamptz,
      skipped_by = case when snap ->> 'skipped_at' is null then null else skipped_by end
    where id = x.ref;
  end if;

  delete from public.events where id = (x.data ->> 'event')::uuid;
  perform public.recount_streaks(x.house_id);
end;
$$;


ALTER FUNCTION "public"."undo_reset"("x" "public"."house_actions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unreact"("p_event" "uuid", "p_kind" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select public.check_can((select e.house_id from public.events e where e.id = p_event), 'wall:write_own');
  delete from public.reactions where event_id = p_event and user_id = (select auth.uid()) and kind = p_kind;
$$;


ALTER FUNCTION "public"."unreact"("p_event" "uuid", "p_kind" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."unreact"("p_event" "uuid", "p_kind" "text") IS 'Take back your reaction.';



CREATE OR REPLACE FUNCTION "public"."update_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  update public.ask_chats
  set title = public.chat_title_of(p_turns), turns = public.chat_turns_kept(p_turns)
  where id = p_chat;
$$;


ALTER FUNCTION "public"."update_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") IS 'Keep an Ask Jonz chat as it now stands.';



CREATE OR REPLACE FUNCTION "public"."update_owner_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select public.check_can_app('admin:read');
  update public.owner_ask_chats
  set title = public.chat_title_of(p_turns), turns = public.chat_turns_kept(p_turns)
  where id = p_chat;
$$;


ALTER FUNCTION "public"."update_owner_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_owner_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") IS 'Keep an owner Ask Jonz chat as it now stands.';



CREATE OR REPLACE FUNCTION "public"."use_immunity"("p_assignment" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.assignments := public.my_open_assignment(p_assignment, 'perks:write_own');
begin
  if a.done_at is not null then
    raise exception 'already_done';
  end if;
  update public.members set immunity_tokens = immunity_tokens - 1
  where house_id = a.house_id and user_id = a.user_id and immunity_tokens > 0;
  if not found then
    raise exception 'no_immunity';
  end if;
  update public.assignments
  set excused = true, outcome = 'excused', settled_at = now()
  where id = a.id;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, 'immunity_used', a.user_id, a.id, jsonb_build_object('name', a.name));
end;
$$;


ALTER FUNCTION "public"."use_immunity"("p_assignment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."use_swap"("p_mine" "uuid", "p_theirs" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  mine public.assignments := public.my_open_assignment(p_mine, 'perks:write_own');
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


ALTER FUNCTION "public"."use_swap"("p_mine" "uuid", "p_theirs" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can"("h" "uuid", "who" "uuid", "perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.members m
    join public.role_permissions rp on rp.role = m.role
    where m.house_id = h and m.user_id = who and rp.permission = perm
  );
$$;


ALTER FUNCTION "public"."user_can"("h" "uuid", "who" "uuid", "perm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_house"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_house"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."week_index_at"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select floor((public.week_starts_on(p_at, p_zone, p_week_starts) - date '1970-01-05')::numeric / 7)::int;
$$;


ALTER FUNCTION "public"."week_index_at"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."week_index_at"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) IS 'Which week (weeks since 5 Jan 1970) a moment falls in, in a time zone and with a week start: core weekIndex(weekWindow(...)).';



CREATE OR REPLACE FUNCTION "public"."week_starts_on"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) RETURNS "date"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select d - ((extract(isodow from d)::int - p_week_starts + 7) % 7)
  from (select (p_at at time zone p_zone)::date as d) local;
$$;


ALTER FUNCTION "public"."week_starts_on"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."week_starts_on"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) IS 'The local date a moment''s week starts on, in a time zone and with a week start: core weekWindow(...).startsOn.';



CREATE OR REPLACE FUNCTION "public"."wipe_house_data"("p_house" "uuid", "p_by" "uuid", "p_everything" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."wipe_house_data"("p_house" "uuid", "p_by" "uuid", "p_everything" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."wipe_house_data"("p_house" "uuid", "p_by" "uuid", "p_everything" boolean) IS 'Puts a house back to before its first deal (and, with p_everything, clears its list, groups, time away and rules): the wipe reset_house_data and owner_reset_house_data share, after their own checks.';



CREATE OR REPLACE FUNCTION "public"."write_back"("p_report" "uuid", "p_body" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me uuid := (select auth.uid());
  body text := btrim(coalesce(p_body, ''));
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  perform 1 from public.reports where id = p_report and user_id = me for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Twenty a day, so a stuck button cannot fill the Inbox this way either.
  if (select count(*) from public.report_messages m join public.reports r on r.id = m.report_id
      where r.user_id = me and not m.from_owner and m.created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;
  insert into public.report_messages (report_id, from_owner, written_by, body) values (p_report, false, me, body);
  update public.reports set state = 'new', last_activity_at = now(), seen_at = now() where id = p_report;
  return p_report;
end;
$$;


ALTER FUNCTION "public"."write_back"("p_report" "uuid", "p_body" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_deletions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deletes_at" timestamp with time zone NOT NULL,
    "requested_by" "text" NOT NULL,
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ended_at" timestamp with time zone,
    "away_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "stripe_subscription_id" "text",
    "pass_stopped_at" timestamp with time zone,
    "pass_resumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_deletions_check" CHECK ((("state" = 'pending'::"text") = ("ended_at" IS NULL))),
    CONSTRAINT "account_deletions_requested_by_check" CHECK (("requested_by" = ANY (ARRAY['self'::"text", 'owner'::"text"]))),
    CONSTRAINT "account_deletions_state_check" CHECK (("state" = ANY (ARRAY['pending'::"text", 'kept'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."account_deletions" OWNER TO "postgres";


COMMENT ON TABLE "public"."account_deletions" IS 'Server only. A request to delete an account, its wait, and how it ended.';



ALTER TABLE "public"."admin_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."admin_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."api_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "input" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "house_id" "uuid",
    "client_id" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "approved_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_approvals_answered_once_check" CHECK ((("approved_at" IS NULL) OR ("declined_at" IS NULL))),
    CONSTRAINT "api_approvals_client_id_check" CHECK (("char_length"("client_id") <= 100)),
    CONSTRAINT "api_approvals_operation_check" CHECK ((("char_length"("operation") >= 1) AND ("char_length"("operation") <= 100))),
    CONSTRAINT "api_approvals_request_hash_check" CHECK (("request_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "api_approvals_used_if_approved_check" CHECK ((("used_at" IS NULL) OR ("approved_at" IS NOT NULL)))
);


ALTER TABLE "public"."api_approvals" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_approvals" IS 'Server only. A connected app''s request to do something that can''t be undone, and whether the person approved it in Jonz.';



CREATE TABLE IF NOT EXISTS "public"."api_audit_entries" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "operation" "text" NOT NULL,
    "house_id" "uuid",
    "via" "text" NOT NULL,
    "client" "text",
    "request_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_audit_entries_client_check" CHECK (("char_length"("client") <= 100)),
    CONSTRAINT "api_audit_entries_request_id_check" CHECK (("char_length"("request_id") <= 100)),
    CONSTRAINT "api_audit_entries_via_check" CHECK (("via" = ANY (ARRAY['api'::"text", 'mcp'::"text", 'ask'::"text"])))
);


ALTER TABLE "public"."api_audit_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_audit_entries" IS 'Server only. Every write made through the /v1 API or MCP, by whom and from which client.';



ALTER TABLE "public"."api_audit_entries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."api_audit_entries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."api_idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "status" integer NOT NULL,
    "response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_idempotency_keys_key_check" CHECK ((("char_length"("key") >= 1) AND ("char_length"("key") <= 255))),
    CONSTRAINT "api_idempotency_keys_request_hash_check" CHECK (("request_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "api_idempotency_keys_status_check" CHECK ((("status" >= 200) AND ("status" <= 299)))
);


ALTER TABLE "public"."api_idempotency_keys" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_idempotency_keys" IS 'Server only. The first answer to each write sent with an Idempotency-Key, kept 24 hours.';



CREATE TABLE IF NOT EXISTS "public"."api_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "hits" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_rate_limits_bucket_check" CHECK (("bucket" ~ '^[0-9a-f-]{36}:(read|write)$'::"text")),
    CONSTRAINT "api_rate_limits_hits_check" CHECK (("hits" >= 0))
);


ALTER TABLE "public"."api_rate_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_rate_limits" IS 'Server only. How many requests each person made in each minute, for the API''s rate limits.';



CREATE TABLE IF NOT EXISTS "public"."app_owners" (
    "user_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    CONSTRAINT "app_owners_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'support'::"text"])))
);


ALTER TABLE "public"."app_owners" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_owners" IS 'Server only. Who owns the app. Changed only by migration.';



COMMENT ON COLUMN "public"."app_owners"."role" IS 'What this person may do on the admin pages: owner (everything) or support (read, and answer the Inbox).';



CREATE TABLE IF NOT EXISTS "public"."app_role_permissions" (
    "role" "text" NOT NULL,
    "permission" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_role_permissions_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'support'::"text"])))
);


ALTER TABLE "public"."app_role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_role_permissions" IS 'What each app role (owner, support) may do on the admin pages; only migrations change it.';



CREATE TABLE IF NOT EXISTS "public"."ask_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "turns" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ask_chats_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 80))),
    CONSTRAINT "ask_chats_turns_check" CHECK ((("jsonb_typeof"("turns") = 'array'::"text") AND ("pg_column_size"("turns") <= 512000)))
);


ALTER TABLE "public"."ask_chats" OWNER TO "postgres";


COMMENT ON TABLE "public"."ask_chats" IS 'A person''s saved Ask Jonz chats.';



CREATE TABLE IF NOT EXISTS "public"."away_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "away_periods_check" CHECK ((("ends_on" >= "starts_on") AND (("ends_on" - "starts_on") <= 91))),
    CONSTRAINT "away_periods_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 60)))
);


ALTER TABLE "public"."away_periods" OWNER TO "postgres";


COMMENT ON TABLE "public"."away_periods" IS 'A housemate''s time away: first and last local day, inclusive.';



CREATE TABLE IF NOT EXISTS "public"."connected_apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "access" "text" DEFAULT 'read'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "connected_apps_access_check" CHECK (("access" = ANY (ARRAY['read'::"text", 'write'::"text"]))),
    CONSTRAINT "connected_apps_client_id_check" CHECK ((("char_length"("client_id") >= 1) AND ("char_length"("client_id") <= 100)))
);


ALTER TABLE "public"."connected_apps" OWNER TO "postgres";


COMMENT ON TABLE "public"."connected_apps" IS 'Server only. Each app a person connected to Jonz and what it may do: read, or write (what they can, with anything that can''t be undone still approved in Jonz). No row means read.';



CREATE TABLE IF NOT EXISTS "public"."crew_members" (
    "job_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "helper" boolean DEFAULT false NOT NULL,
    "points" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crew_members_points_check" CHECK (("points" >= (0)::numeric))
);


ALTER TABLE "public"."crew_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."crew_members" IS 'Who did a shared John, and each person''s share of its points.';



CREATE TABLE IF NOT EXISTS "public"."dispute_votes" (
    "dispute_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "uphold" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dispute_votes" OWNER TO "postgres";


COMMENT ON TABLE "public"."dispute_votes" IS 'Each housemate''s Done or Not done vote on a check.';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "user_id" "uuid",
    "assignment_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "told_at" timestamp with time zone,
    CONSTRAINT "events_kind_check" CHECK (("kind" = ANY (ARRAY['started_over'::"text", 'rules'::"text", 'kind_changed'::"text", 'pocket_paid'::"text", 'okayed'::"text", 'not_yet'::"text", 'jonz_message'::"text", 'moved_out'::"text", 'moving_out'::"text", 'reset'::"text", 'undone'::"text", 'joined'::"text", 'done'::"text", 'late'::"text", 'missed'::"text", 'disputed'::"text", 'upheld'::"text", 'rejected'::"text", 'immunity_earned'::"text", 'immunity_used'::"text", 'swap_earned'::"text", 'swap_used'::"text", 'week_dealt'::"text", 'month_closed'::"text", 'paid'::"text", 'away'::"text", 'flagged'::"text", 'covered'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON TABLE "public"."events" IS 'Posts on the Wall.';



CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "group_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."group_members" IS 'Who is in each group.';



CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "groups_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 40)))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."groups" IS 'Named groups of housemates inside a house.';



CREATE TABLE IF NOT EXISTS "public"."house_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid",
    "user_id" "uuid",
    "outcome" "text" NOT NULL,
    "johns" smallint DEFAULT 0 NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "house_drafts_input_tokens_check" CHECK (("input_tokens" >= 0)),
    CONSTRAINT "house_drafts_johns_check" CHECK (("johns" >= 0)),
    CONSTRAINT "house_drafts_outcome_check" CHECK (("outcome" = ANY (ARRAY['ai'::"text", 'failed'::"text"]))),
    CONSTRAINT "house_drafts_output_tokens_check" CHECK (("output_tokens" >= 0))
);


ALTER TABLE "public"."house_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."house_drafts" IS 'Server only. Each Describe your house try, for the daily limit and its cost.';



CREATE TABLE IF NOT EXISTS "public"."house_pass_billing" (
    "house_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "stripe_subscription_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."house_pass_billing" OWNER TO "postgres";


COMMENT ON TABLE "public"."house_pass_billing" IS 'Server only. The Stripe customer and subscription behind a house''s Pass.';



CREATE TABLE IF NOT EXISTS "public"."houses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "join_code" "text" DEFAULT "public"."new_join_code"() NOT NULL,
    "timezone" "text" DEFAULT 'Europe/London'::"text" NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "week_starts" smallint DEFAULT 1 NOT NULL,
    "stake_minor" integer DEFAULT 2000 NOT NULL,
    "late_forfeit_minor" integer DEFAULT 100 NOT NULL,
    "missed_forfeit_minor" integer DEFAULT 300 NOT NULL,
    "dispute_hours" smallint DEFAULT 24 NOT NULL,
    "first_dealt_at" timestamp with time zone,
    "ticked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "away_makeup" smallint DEFAULT 100 NOT NULL,
    "cover_grace_hours" smallint DEFAULT 3 NOT NULL,
    "late_hours" smallint DEFAULT 24 NOT NULL,
    "pass_plan" "text" DEFAULT 'trial'::"text" NOT NULL,
    "pass_ends_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "pass_bought_by" "uuid",
    "deal_mode" "text" DEFAULT 'smart'::"text" NOT NULL,
    "deal_budget" smallint DEFAULT 4 NOT NULL,
    "settle_in" "text" DEFAULT 'jonz'::"text" NOT NULL,
    "kind" "text" DEFAULT 'housemates'::"text" NOT NULL,
    "pocket_cap_minor" integer DEFAULT 0 NOT NULL,
    "next_kind" "text",
    "next_kind_on" "date",
    CONSTRAINT "houses_away_makeup_check" CHECK (("away_makeup" = ANY (ARRAY[0, 50, 100]))),
    CONSTRAINT "houses_cover_grace_hours_check" CHECK ((("cover_grace_hours" >= 0) AND ("cover_grace_hours" <= 48))),
    CONSTRAINT "houses_currency_check" CHECK (("currency" = ANY (ARRAY['GBP'::"text", 'CAD'::"text", 'USD'::"text", 'EUR'::"text"]))),
    CONSTRAINT "houses_deal_budget_check" CHECK (("deal_budget" = ANY (ARRAY[0, 2, 4, 6]))),
    CONSTRAINT "houses_deal_mode_check" CHECK (("deal_mode" = ANY (ARRAY['smart'::"text", 'classic'::"text"]))),
    CONSTRAINT "houses_dispute_hours_check" CHECK ((("dispute_hours" >= 0) AND ("dispute_hours" <= 72))),
    CONSTRAINT "houses_dispute_hours_fair" CHECK ((("kind" = 'family'::"text") OR ("dispute_hours" >= 12))),
    CONSTRAINT "houses_family_no_stake" CHECK ((("kind" = 'housemates'::"text") OR (("stake_minor" = 0) AND ("late_forfeit_minor" = 0) AND ("missed_forfeit_minor" = 0)))),
    CONSTRAINT "houses_family_no_window" CHECK ((("kind" = 'housemates'::"text") OR ("dispute_hours" = 0))),
    CONSTRAINT "houses_kind_check" CHECK (("kind" = ANY (ARRAY['housemates'::"text", 'family'::"text"]))),
    CONSTRAINT "houses_late_forfeit_minor_check" CHECK ((("late_forfeit_minor" >= 0) AND ("late_forfeit_minor" <= 100000))),
    CONSTRAINT "houses_late_hours_check" CHECK ((("late_hours" >= 1) AND ("late_hours" <= 72))),
    CONSTRAINT "houses_missed_forfeit_minor_check" CHECK ((("missed_forfeit_minor" >= 0) AND ("missed_forfeit_minor" <= 100000))),
    CONSTRAINT "houses_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 60))),
    CONSTRAINT "houses_next_kind" CHECK (((("next_kind" IS NULL) AND ("next_kind_on" IS NULL)) OR (("next_kind" = ANY (ARRAY['housemates'::"text", 'family'::"text"])) AND ("next_kind_on" IS NOT NULL) AND ("next_kind" <> "kind")))),
    CONSTRAINT "houses_pass_plan_check" CHECK (("pass_plan" = ANY (ARRAY['trial'::"text", 'monthly'::"text", 'yearly'::"text", 'founding'::"text"]))),
    CONSTRAINT "houses_pass_shape" CHECK ((("pass_plan" = 'founding'::"text") = ("pass_ends_at" IS NULL))),
    CONSTRAINT "houses_pocket_cap" CHECK ((("pocket_cap_minor" >= 0) AND ("pocket_cap_minor" <= 1000000))),
    CONSTRAINT "houses_settle_in_check" CHECK (("settle_in" = ANY (ARRAY['jonz'::"text", 'splitwise'::"text"]))),
    CONSTRAINT "houses_stake_minor_check" CHECK ((("stake_minor" >= 0) AND ("stake_minor" <= 100000))),
    CONSTRAINT "houses_week_starts_check" CHECK ((("week_starts" >= 1) AND ("week_starts" <= 7)))
);


ALTER TABLE "public"."houses" OWNER TO "postgres";


COMMENT ON TABLE "public"."houses" IS 'A house and its rules: timezone, currency, stake and forfeits, deal mode, House Pass.';



CREATE TABLE IF NOT EXISTS "public"."johns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "points" smallint DEFAULT 2 NOT NULL,
    "every_weeks" smallint DEFAULT 1 NOT NULL,
    "anchor_week" integer NOT NULL,
    "due_dow" smallint DEFAULT 7 NOT NULL,
    "due_time" time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL,
    "needs_photo" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_id" "uuid",
    "kind" "text" DEFAULT 'day'::"text" NOT NULL,
    "respond_hours" smallint DEFAULT 12 NOT NULL,
    "per_week" smallint DEFAULT 2 NOT NULL,
    "every_months" smallint,
    "week_of_month" smallint,
    "anchor_month" integer,
    "crew" smallint DEFAULT 1 NOT NULL,
    "keep_day" boolean DEFAULT false NOT NULL,
    "pay_minor" integer DEFAULT 0 NOT NULL,
    "min_age" smallint,
    CONSTRAINT "johns_category_check" CHECK (("category" = ANY (ARRAY['kitchen'::"text", 'bathroom'::"text", 'bins'::"text", 'floors'::"text", 'errands'::"text", 'other'::"text"]))),
    CONSTRAINT "johns_crew_check" CHECK ((("crew" >= 0) AND ("crew" <= 6))),
    CONSTRAINT "johns_crew_on_call" CHECK ((("kind" = 'day'::"text") OR ("crew" = 1))),
    CONSTRAINT "johns_due_dow_check" CHECK ((("due_dow" >= 1) AND ("due_dow" <= 7))),
    CONSTRAINT "johns_every_months_check" CHECK ((("every_months" >= 1) AND ("every_months" <= 60))),
    CONSTRAINT "johns_every_weeks_check" CHECK ((("every_weeks" >= 1) AND ("every_weeks" <= 26))),
    CONSTRAINT "johns_keep_day_on_call" CHECK ((("kind" = 'day'::"text") OR (NOT "keep_day"))),
    CONSTRAINT "johns_kind_check" CHECK (("kind" = ANY (ARRAY['day'::"text", 'on_call'::"text"]))),
    CONSTRAINT "johns_min_age" CHECK ((("min_age" IS NULL) OR (("min_age" >= 2) AND ("min_age" <= 18)))),
    CONSTRAINT "johns_monthly_check" CHECK (((("every_months" IS NULL) = ("week_of_month" IS NULL)) AND (("every_months" IS NULL) OR ("anchor_month" IS NOT NULL)))),
    CONSTRAINT "johns_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 60))),
    CONSTRAINT "johns_pay" CHECK ((("pay_minor" >= 0) AND ("pay_minor" <= 100000))),
    CONSTRAINT "johns_per_week_check" CHECK ((("per_week" >= 1) AND ("per_week" <= 14))),
    CONSTRAINT "johns_points_check" CHECK ((("points" >= 1) AND ("points" <= 20))),
    CONSTRAINT "johns_respond_hours_check" CHECK ((("respond_hours" >= 1) AND ("respond_hours" <= 72))),
    CONSTRAINT "johns_week_of_month_check" CHECK ((("week_of_month" >= 1) AND ("week_of_month" <= 5)))
);


ALTER TABLE "public"."johns" OWNER TO "postgres";


COMMENT ON TABLE "public"."johns" IS 'The house''s list of Johns: how often, points, due day and time.';



CREATE TABLE IF NOT EXISTS "public"."ledger_entries" (
    "id" bigint NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount_minor" integer NOT NULL,
    "month" "text" NOT NULL,
    "assignment_id" "uuid",
    "counterparty_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "doers" "uuid"[],
    CONSTRAINT "ledger_entries_amount_minor_check" CHECK (("amount_minor" <> 0)),
    CONSTRAINT "ledger_entries_kind_check" CHECK (("kind" = ANY (ARRAY['correction'::"text", 'forfeit'::"text", 'cap_refund'::"text", 'share'::"text", 'payment'::"text"]))),
    CONSTRAINT "ledger_entries_month_check" CHECK (("month" ~ '^\d{4}-\d{2}$'::"text"))
);


ALTER TABLE "public"."ledger_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."ledger_entries" IS 'Every money line of a house: shares, forfeits, payments, corrections.';



ALTER TABLE "public"."ledger_entries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."live_changes" (
    "id" bigint NOT NULL,
    "house_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."live_changes" OWNER TO "postgres";


COMMENT ON TABLE "public"."live_changes" IS 'Server only: each change to what a house''s screens show, for the API''s live streams (house_live_since). Kept two days.';



ALTER TABLE "public"."live_changes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."live_changes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."members" (
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "streak" smallint DEFAULT 0 NOT NULL,
    "immunity_tokens" smallint DEFAULT 0 NOT NULL,
    "swap_tokens" smallint DEFAULT 0 NOT NULL,
    "suits_days" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "best_time" "text",
    "rather" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "moving_out_on" "date",
    "signs_in" boolean DEFAULT true NOT NULL,
    "born_year" smallint,
    CONSTRAINT "members_best_time_check" CHECK (("best_time" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text"]))),
    CONSTRAINT "members_born_year" CHECK ((("born_year" IS NULL) OR (("born_year" >= 1900) AND ("born_year" <= 2100)))),
    CONSTRAINT "members_immunity_tokens_check" CHECK ((("immunity_tokens" >= 0) AND ("immunity_tokens" <= 2))),
    CONSTRAINT "members_rather_check" CHECK (("jsonb_typeof"("rather") = 'object'::"text")),
    CONSTRAINT "members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "members_streak_check" CHECK (("streak" >= 0)),
    CONSTRAINT "members_suits_days_check" CHECK (("suits_days" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])),
    CONSTRAINT "members_swap_tokens_check" CHECK ((("swap_tokens" >= 0) AND ("swap_tokens" <= 1)))
);


ALTER TABLE "public"."members" OWNER TO "postgres";


COMMENT ON TABLE "public"."members" IS 'Who is in which house: their role, streak, tokens and preferences.';



CREATE TABLE IF NOT EXISTS "public"."month_closes" (
    "house_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "month_closes_month_check" CHECK (("month" ~ '^\d{4}-\d{2}$'::"text"))
);


ALTER TABLE "public"."month_closes" OWNER TO "postgres";


COMMENT ON TABLE "public"."month_closes" IS 'Months whose Stake has been settled.';



CREATE TABLE IF NOT EXISTS "public"."month_let_offs" (
    "house_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "let_off_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "month_let_offs_month_check" CHECK (("month" ~ '^\d{4}-\d{2}$'::"text"))
);


ALTER TABLE "public"."month_let_offs" OWNER TO "postgres";


COMMENT ON TABLE "public"."month_let_offs" IS 'Months an admin let everyone off.';



CREATE TABLE IF NOT EXISTS "public"."moves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "from_house_id" "uuid" NOT NULL,
    "left_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "to_house_id" "uuid",
    "how" "text",
    "moved_at" timestamp with time zone,
    "reminded_at" timestamp with time zone,
    "pass_plan" "text",
    "pass_ends_at" timestamp with time zone,
    "pass_state" "text",
    "pass_placed_at" timestamp with time zone,
    "pass_stopped_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moves_check" CHECK (((("how" IS NULL) = ("moved_at" IS NULL)) AND (("how" IS NOT NULL) OR ("to_house_id" IS NULL)))),
    CONSTRAINT "moves_check1" CHECK ((("pass_plan" IS NULL) = ("pass_state" IS NULL))),
    CONSTRAINT "moves_check2" CHECK ((("pass_plan" = 'founding'::"text") = (("pass_plan" IS NOT NULL) AND ("pass_ends_at" IS NULL)))),
    CONSTRAINT "moves_how_check" CHECK (("how" = ANY (ARRAY['copied'::"text", 'started'::"text", 'joined'::"text"]))),
    CONSTRAINT "moves_pass_plan_check" CHECK (("pass_plan" = ANY (ARRAY['monthly'::"text", 'yearly'::"text", 'founding'::"text"]))),
    CONSTRAINT "moves_pass_state_check" CHECK (("pass_state" = ANY (ARRAY['waiting'::"text", 'moved'::"text", 'left'::"text", 'lapsed'::"text"])))
);


ALTER TABLE "public"."moves" OWNER TO "postgres";


COMMENT ON TABLE "public"."moves" IS 'Each move out of a house, and where the person went next.';



CREATE TABLE IF NOT EXISTS "public"."moving_pass_billing" (
    "move_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "stripe_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."moving_pass_billing" OWNER TO "postgres";


COMMENT ON TABLE "public"."moving_pass_billing" IS 'Server only. The Stripe ids of a Pass that is moving to a new house.';



CREATE TABLE IF NOT EXISTS "public"."notification_prefs" (
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "reminders" boolean DEFAULT true NOT NULL,
    "checks" boolean DEFAULT true NOT NULL,
    "flags" boolean DEFAULT true NOT NULL,
    "deal" boolean DEFAULT true NOT NULL,
    "quiet_from" smallint,
    "quiet_until" smallint,
    "timezone" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_prefs_check" CHECK ((("quiet_from" IS NULL) = ("quiet_until" IS NULL))),
    CONSTRAINT "notification_prefs_check1" CHECK ((("quiet_from" IS NULL) OR ("quiet_from" <> "quiet_until"))),
    CONSTRAINT "notification_prefs_quiet_from_check" CHECK ((("quiet_from" >= 0) AND ("quiet_from" <= 23))),
    CONSTRAINT "notification_prefs_quiet_until_check" CHECK ((("quiet_until" >= 0) AND ("quiet_until" <= 23))),
    CONSTRAINT "notification_prefs_timezone_check" CHECK ((("timezone" IS NULL) OR (("length"("timezone") >= 1) AND ("length"("timezone") <= 64))))
);


ALTER TABLE "public"."notification_prefs" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_prefs" IS 'Which kinds of push a person wants, and their quiet hours. No row means everything on.';



CREATE TABLE IF NOT EXISTS "public"."on_call_picks" (
    "week_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "john_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."on_call_picks" OWNER TO "postgres";


COMMENT ON TABLE "public"."on_call_picks" IS 'Who holds each on-call John in each week.';



CREATE TABLE IF NOT EXISTS "public"."owner_ask_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "turns" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "owner_ask_chats_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 80))),
    CONSTRAINT "owner_ask_chats_turns_check" CHECK ((("jsonb_typeof"("turns") = 'array'::"text") AND ("pg_column_size"("turns") <= 512000)))
);


ALTER TABLE "public"."owner_ask_chats" OWNER TO "postgres";


COMMENT ON TABLE "public"."owner_ask_chats" IS 'The owner''s saved Ask Jonz chats.';



CREATE TABLE IF NOT EXISTS "public"."owner_ask_turns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "asked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question" "text" NOT NULL,
    "reply" "text",
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "owner_ask_turns_input_tokens_check" CHECK (("input_tokens" >= 0)),
    CONSTRAINT "owner_ask_turns_output_tokens_check" CHECK (("output_tokens" >= 0)),
    CONSTRAINT "owner_ask_turns_question_check" CHECK (("char_length"("question") <= 2000)),
    CONSTRAINT "owner_ask_turns_reply_check" CHECK (("char_length"("reply") <= 8000))
);


ALTER TABLE "public"."owner_ask_turns" OWNER TO "postgres";


COMMENT ON TABLE "public"."owner_ask_turns" IS 'The owner''s Ask Jonz questions and replies.';



CREATE TABLE IF NOT EXISTS "public"."owner_message_outbox" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."owner_message_outbox" OWNER TO "postgres";


COMMENT ON TABLE "public"."owner_message_outbox" IS 'Server only. Who still has to get each owner message.';



CREATE TABLE IF NOT EXISTS "public"."owner_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_by" "uuid",
    "audience" "text" NOT NULL,
    "person_id" "uuid",
    "house_id" "uuid",
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "by_push" boolean NOT NULL,
    "by_wall" boolean NOT NULL,
    "by_email" boolean NOT NULL,
    "people" integer NOT NULL,
    "walls" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "owner_messages_audience_check" CHECK (("audience" = ANY (ARRAY['person'::"text", 'house'::"text", 'everyone'::"text", 'test'::"text"]))),
    CONSTRAINT "owner_messages_body_check" CHECK ((("char_length"("btrim"("body")) >= 1) AND ("char_length"("btrim"("body")) <= 500))),
    CONSTRAINT "owner_messages_check" CHECK (("by_push" OR "by_wall" OR "by_email")),
    CONSTRAINT "owner_messages_check1" CHECK (((NOT "by_wall") OR ("audience" = ANY (ARRAY['house'::"text", 'everyone'::"text"])))),
    CONSTRAINT "owner_messages_people_check" CHECK (("people" >= 0)),
    CONSTRAINT "owner_messages_subject_check" CHECK ((("char_length"("btrim"("subject")) >= 1) AND ("char_length"("btrim"("subject")) <= 80))),
    CONSTRAINT "owner_messages_walls_check" CHECK (("walls" >= 0))
);


ALTER TABLE "public"."owner_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."owner_messages" IS 'Server only. Messages the owner sent, and how many people each reached.';



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "name" "text" NOT NULL,
    "about" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope" "text" DEFAULT 'house'::"text" NOT NULL,
    CONSTRAINT "permissions_name_check" CHECK (("name" ~ '^[a-z_]+:(read|write_own|write)$'::"text")),
    CONSTRAINT "permissions_scope_check" CHECK (("scope" = ANY (ARRAY['house'::"text", 'app'::"text"])))
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."permissions" IS 'Every action a role can be allowed to do. Mirrors PERMISSIONS in packages/core.';



COMMENT ON COLUMN "public"."permissions"."scope" IS 'house: asked with can(house, …) and held by a house role; app: asked with can_app(…) and held by an app role.';



CREATE TABLE IF NOT EXISTS "public"."pocket_earnings" (
    "assignment_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "amount_minor" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pocket_earnings_amount_minor_check" CHECK (("amount_minor" > 0)),
    CONSTRAINT "pocket_earnings_month_check" CHECK (("month" ~ '^\d{4}-\d{2}$'::"text"))
);


ALTER TABLE "public"."pocket_earnings" OWNER TO "postgres";


COMMENT ON TABLE "public"."pocket_earnings" IS 'Family houses: pocket money a kid earned for a John.';



CREATE TABLE IF NOT EXISTS "public"."pocket_pays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "amount_minor" integer NOT NULL,
    "paid_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pocket_pays_amount_minor_check" CHECK (("amount_minor" > 0)),
    CONSTRAINT "pocket_pays_month_check" CHECK (("month" ~ '^\d{4}-\d{2}$'::"text"))
);


ALTER TABLE "public"."pocket_pays" OWNER TO "postgres";


COMMENT ON TABLE "public"."pocket_pays" IS 'Family houses: pocket money paid out for a month.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "language" "text",
    CONSTRAINT "profiles_display_name_check" CHECK ((("char_length"("btrim"("display_name")) >= 1) AND ("char_length"("btrim"("display_name")) <= 60))),
    CONSTRAINT "profiles_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'fr'::"text", 'en-XA'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'A person: name and photo. Made by handle_new_user when someone first signs in; its id is their sign-in id.';



COMMENT ON COLUMN "public"."profiles"."language" IS 'The language this person reads Jonz in; null until the app saves their phone''s.';



CREATE TABLE IF NOT EXISTS "public"."promotion_people" (
    "promotion_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "opened_at" timestamp with time zone,
    "emailed_at" timestamp with time zone,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_people_email_check" CHECK ((("email" = "lower"("btrim"("email"))) AND ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text")))
);


ALTER TABLE "public"."promotion_people" OWNER TO "postgres";


COMMENT ON TABLE "public"."promotion_people" IS 'Server only. The people a promotion was made for, and when each opened, got and used it.';



CREATE TABLE IF NOT EXISTS "public"."promotion_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "house_id" "uuid",
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "session" "text",
    "plan" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promotion_uses" OWNER TO "postgres";


COMMENT ON TABLE "public"."promotion_uses" IS 'Server only. Each time a promotion code was used at checkout.';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_subscriptions_known_service" CHECK ((("endpoint" ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'::"text") AND ("char_length"("endpoint") <= 2048)))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_subscriptions" IS 'Each phone or browser that gets a person''s pushes.';



CREATE TABLE IF NOT EXISTS "public"."reactions" (
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reactions_kind_check" CHECK (("kind" = ANY (ARRAY['nice'::"text", 'fire'::"text", 'sparkle'::"text", 'eyes'::"text"])))
);


ALTER TABLE "public"."reactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."reactions" IS 'Reactions to Wall posts.';



CREATE TABLE IF NOT EXISTS "public"."report_messages" (
    "id" bigint NOT NULL,
    "report_id" "uuid" NOT NULL,
    "from_owner" boolean NOT NULL,
    "written_by" "uuid",
    "author_name" "text",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_id" "text",
    CONSTRAINT "report_messages_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 2000))),
    CONSTRAINT "report_messages_email_id_check" CHECK ((("email_id" IS NULL) OR ("char_length"("email_id") <= 100)))
);


ALTER TABLE "public"."report_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_messages" IS 'The conversation on a report, between its sender and the owner.';



ALTER TABLE "public"."report_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."report_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role" "text" NOT NULL,
    "permission" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "role_permissions_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissions" IS 'Which role may do which action. Mirrors ROLE_PERMISSIONS in packages/core.';



CREATE TABLE IF NOT EXISTS "public"."swap_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "asker_assignment_id" "uuid" NOT NULL,
    "asked_assignment_id" "uuid" NOT NULL,
    "asked_by" "uuid" NOT NULL,
    "asked_user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "answer" "text",
    "answered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "swap_offers_answer_check" CHECK (("answer" = ANY (ARRAY['accepted'::"text", 'declined'::"text"]))),
    CONSTRAINT "swap_offers_check" CHECK ((("answer" IS NULL) = ("answered_at" IS NULL)))
);


ALTER TABLE "public"."swap_offers" OWNER TO "postgres";


COMMENT ON TABLE "public"."swap_offers" IS 'An ask to swap two Johns between housemates, and its answer.';



CREATE TABLE IF NOT EXISTS "public"."week_group_shares" (
    "week_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "share" numeric(7,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "week_group_shares_share_check" CHECK (("share" >= (0)::numeric))
);


ALTER TABLE "public"."week_group_shares" OWNER TO "postgres";


COMMENT ON TABLE "public"."week_group_shares" IS 'The part of each housemate''s share of a week that was one group''s Johns, so the deal balances each group''s Johns within the group. Members read it (weeks:read); only the server writes it.';



CREATE TABLE IF NOT EXISTS "public"."week_shares" (
    "week_id" "uuid" NOT NULL,
    "house_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "share" numeric(7,2) NOT NULL,
    CONSTRAINT "week_shares_share_check" CHECK (("share" >= (0)::numeric))
);


ALTER TABLE "public"."week_shares" OWNER TO "postgres";


COMMENT ON TABLE "public"."week_shares" IS 'Each housemate''s fair share of a week.';



CREATE TABLE IF NOT EXISTS "public"."weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "house_id" "uuid" NOT NULL,
    "starts_on" "date" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "skipped_at" timestamp with time zone,
    "skipped_by" "uuid",
    "turns" "jsonb",
    "waiting" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ahead" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "weeks_ahead_check" CHECK (("jsonb_typeof"("ahead") = 'array'::"text")),
    CONSTRAINT "weeks_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "weeks_waiting_check" CHECK (("jsonb_typeof"("waiting") = 'object'::"text"))
);


ALTER TABLE "public"."weeks" OWNER TO "postgres";


COMMENT ON TABLE "public"."weeks" IS 'One week of a house, from the deal to its close.';



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit"
    ADD CONSTRAINT "admin_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_approvals"
    ADD CONSTRAINT "api_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_audit_entries"
    ADD CONSTRAINT "api_audit_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_idempotency_keys"
    ADD CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_idempotency_keys"
    ADD CONSTRAINT "api_idempotency_keys_user_id_key_key" UNIQUE ("user_id", "key");



ALTER TABLE ONLY "public"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_bucket_window_started_at_key" UNIQUE ("bucket", "window_started_at");



ALTER TABLE ONLY "public"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_owners"
    ADD CONSTRAINT "app_owners_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_pkey" PRIMARY KEY ("role", "permission");



ALTER TABLE ONLY "public"."ask_chats"
    ADD CONSTRAINT "ask_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_id_house_id_key" UNIQUE ("id", "house_id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."away_periods"
    ADD CONSTRAINT "away_periods_id_house_id_key" UNIQUE ("id", "house_id");



ALTER TABLE ONLY "public"."away_periods"
    ADD CONSTRAINT "away_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connected_apps"
    ADD CONSTRAINT "connected_apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connected_apps"
    ADD CONSTRAINT "connected_apps_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."crew_members"
    ADD CONSTRAINT "crew_members_pkey" PRIMARY KEY ("job_id", "user_id");



ALTER TABLE ONLY "public"."dispute_votes"
    ADD CONSTRAINT "dispute_votes_pkey" PRIMARY KEY ("dispute_id", "user_id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_assignment_id_tick_at_key" UNIQUE ("assignment_id", "tick_at");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_house_id_name_key" UNIQUE ("house_id", "name");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_id_house_id_key" UNIQUE ("id", "house_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."house_actions"
    ADD CONSTRAINT "house_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."house_drafts"
    ADD CONSTRAINT "house_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."house_pass_billing"
    ADD CONSTRAINT "house_pass_billing_pkey" PRIMARY KEY ("house_id");



ALTER TABLE ONLY "public"."houses"
    ADD CONSTRAINT "houses_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."houses"
    ADD CONSTRAINT "houses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."johns"
    ADD CONSTRAINT "johns_id_house_id_key" UNIQUE ("id", "house_id");



ALTER TABLE ONLY "public"."johns"
    ADD CONSTRAINT "johns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_changes"
    ADD CONSTRAINT "live_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("house_id", "user_id");



ALTER TABLE ONLY "public"."month_closes"
    ADD CONSTRAINT "month_closes_pkey" PRIMARY KEY ("house_id", "month");



ALTER TABLE ONLY "public"."month_let_offs"
    ADD CONSTRAINT "month_let_offs_pkey" PRIMARY KEY ("house_id", "month");



ALTER TABLE ONLY "public"."moves"
    ADD CONSTRAINT "moves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moving_pass_billing"
    ADD CONSTRAINT "moving_pass_billing_pkey" PRIMARY KEY ("move_id");



ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_prefs"
    ADD CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."on_call_picks"
    ADD CONSTRAINT "on_call_picks_pkey" PRIMARY KEY ("week_id", "john_id");



ALTER TABLE ONLY "public"."owner_ask_chats"
    ADD CONSTRAINT "owner_ask_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owner_ask_turns"
    ADD CONSTRAINT "owner_ask_turns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owner_message_outbox"
    ADD CONSTRAINT "owner_message_outbox_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."owner_messages"
    ADD CONSTRAINT "owner_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."pocket_earnings"
    ADD CONSTRAINT "pocket_earnings_pkey" PRIMARY KEY ("assignment_id");



ALTER TABLE ONLY "public"."pocket_pays"
    ADD CONSTRAINT "pocket_pays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_people"
    ADD CONSTRAINT "promotion_people_pkey" PRIMARY KEY ("promotion_id", "email");



ALTER TABLE ONLY "public"."promotion_uses"
    ADD CONSTRAINT "promotion_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_uses"
    ADD CONSTRAINT "promotion_uses_promotion_id_house_id_key" UNIQUE ("promotion_id", "house_id");



ALTER TABLE ONLY "public"."promotion_uses"
    ADD CONSTRAINT "promotion_uses_session_key" UNIQUE ("session");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_pkey" PRIMARY KEY ("event_id", "user_id", "kind");



ALTER TABLE ONLY "public"."report_messages"
    ADD CONSTRAINT "report_messages_email_id_key" UNIQUE ("email_id");



ALTER TABLE ONLY "public"."report_messages"
    ADD CONSTRAINT "report_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_email_id_key" UNIQUE ("email_id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role", "permission");



ALTER TABLE ONLY "public"."support_drafts"
    ADD CONSTRAINT "support_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."swap_offers"
    ADD CONSTRAINT "swap_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."week_group_shares"
    ADD CONSTRAINT "week_group_shares_pkey" PRIMARY KEY ("week_id", "group_id", "user_id");



ALTER TABLE ONLY "public"."week_shares"
    ADD CONSTRAINT "week_shares_pkey" PRIMARY KEY ("week_id", "user_id");



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_house_id_starts_on_key" UNIQUE ("house_id", "starts_on");



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_id_house_id_key" UNIQUE ("id", "house_id");



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_pkey" PRIMARY KEY ("id");



CREATE INDEX "account_deletions_deletes_at_idx" ON "public"."account_deletions" USING "btree" ("deletes_at") WHERE ("state" = 'pending'::"text");



CREATE UNIQUE INDEX "account_deletions_user_id_pending_key" ON "public"."account_deletions" USING "btree" ("user_id") WHERE ("state" = 'pending'::"text");



CREATE INDEX "admin_audit_created_at_idx" ON "public"."admin_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "api_approvals_created_at_idx" ON "public"."api_approvals" USING "btree" ("created_at");



CREATE INDEX "api_approvals_house_id_idx" ON "public"."api_approvals" USING "btree" ("house_id");



CREATE INDEX "api_approvals_user_id_idx" ON "public"."api_approvals" USING "btree" ("user_id");



CREATE INDEX "api_audit_entries_created_at_idx" ON "public"."api_audit_entries" USING "btree" ("created_at" DESC);



CREATE INDEX "api_audit_entries_house_id_idx" ON "public"."api_audit_entries" USING "btree" ("house_id");



CREATE INDEX "api_audit_entries_user_id_idx" ON "public"."api_audit_entries" USING "btree" ("user_id");



CREATE INDEX "api_idempotency_keys_created_at_idx" ON "public"."api_idempotency_keys" USING "btree" ("created_at");



CREATE INDEX "api_rate_limits_window_started_at_idx" ON "public"."api_rate_limits" USING "btree" ("window_started_at");



CREATE INDEX "app_role_permissions_permission_idx" ON "public"."app_role_permissions" USING "btree" ("permission");



CREATE INDEX "ask_chats_user_id_house_id_updated_at_idx" ON "public"."ask_chats" USING "btree" ("user_id", "house_id", "updated_at" DESC);



CREATE INDEX "assignments_changed_by_idx" ON "public"."assignments" USING "btree" ("changed_by");



CREATE INDEX "assignments_covered_by_idx" ON "public"."assignments" USING "btree" ("covered_by") WHERE ("covered_by" IS NOT NULL);



CREATE INDEX "assignments_flagged_by_idx" ON "public"."assignments" USING "btree" ("flagged_by");



CREATE INDEX "assignments_handed_by_away_period_id_house_id_idx" ON "public"."assignments" USING "btree" ("handed_by_away_period_id", "house_id");



CREATE INDEX "assignments_handed_by_away_period_id_idx" ON "public"."assignments" USING "btree" ("handed_by_away_period_id") WHERE ("handed_by_away_period_id" IS NOT NULL);



CREATE INDEX "assignments_handed_from_user_id_idx" ON "public"."assignments" USING "btree" ("handed_from_user_id");



CREATE INDEX "assignments_house_id_awaits_ok_idx" ON "public"."assignments" USING "btree" ("house_id") WHERE "awaits_ok";



CREATE INDEX "assignments_house_id_done_at_idx" ON "public"."assignments" USING "btree" ("house_id", "done_at" DESC) WHERE ("done_at" IS NOT NULL);



CREATE INDEX "assignments_house_id_due_at_idx" ON "public"."assignments" USING "btree" ("house_id", "due_at" DESC);



CREATE INDEX "assignments_house_id_open_idx" ON "public"."assignments" USING "btree" ("house_id") WHERE ("outcome" IS NULL);



CREATE INDEX "assignments_job_id_idx" ON "public"."assignments" USING "btree" ("job_id") WHERE ("job_id" IS NOT NULL);



CREATE UNIQUE INDEX "assignments_job_id_user_id_key" ON "public"."assignments" USING "btree" ("job_id", "user_id") WHERE ("job_id" IS NOT NULL);



CREATE INDEX "assignments_john_id_due_at_idx" ON "public"."assignments" USING "btree" ("john_id", "due_at" DESC);



CREATE INDEX "assignments_john_id_house_id_idx" ON "public"."assignments" USING "btree" ("john_id", "house_id");



CREATE INDEX "assignments_john_id_open_flags_idx" ON "public"."assignments" USING "btree" ("john_id") WHERE (("flagged_at" IS NOT NULL) AND ("outcome" IS NULL));



CREATE INDEX "assignments_okayed_by_idx" ON "public"."assignments" USING "btree" ("okayed_by");



CREATE INDEX "assignments_user_id_idx" ON "public"."assignments" USING "btree" ("user_id");



CREATE INDEX "assignments_week_id_house_id_idx" ON "public"."assignments" USING "btree" ("week_id", "house_id");



CREATE INDEX "away_periods_house_id_ends_on_idx" ON "public"."away_periods" USING "btree" ("house_id", "ends_on");



CREATE INDEX "away_periods_house_id_user_id_idx" ON "public"."away_periods" USING "btree" ("house_id", "user_id");



CREATE INDEX "crew_members_assignment_id_house_id_idx" ON "public"."crew_members" USING "btree" ("assignment_id", "house_id");



CREATE INDEX "crew_members_house_id_idx" ON "public"."crew_members" USING "btree" ("house_id");



CREATE INDEX "crew_members_user_id_idx" ON "public"."crew_members" USING "btree" ("user_id");



CREATE INDEX "dispute_votes_user_id_idx" ON "public"."dispute_votes" USING "btree" ("user_id");



CREATE INDEX "disputes_assignment_id_house_id_idx" ON "public"."disputes" USING "btree" ("assignment_id", "house_id");



CREATE UNIQUE INDEX "disputes_assignment_id_open_key" ON "public"."disputes" USING "btree" ("assignment_id") WHERE ("resolution" IS NULL);



CREATE INDEX "disputes_house_id_idx" ON "public"."disputes" USING "btree" ("house_id");



CREATE INDEX "disputes_raised_by_idx" ON "public"."disputes" USING "btree" ("raised_by");



CREATE INDEX "events_assignment_id_house_id_idx" ON "public"."events" USING "btree" ("assignment_id", "house_id");



CREATE INDEX "events_house_id_created_at_idx" ON "public"."events" USING "btree" ("house_id", "created_at" DESC);



CREATE INDEX "events_house_id_untold_idx" ON "public"."events" USING "btree" ("house_id") WHERE ("told_at" IS NULL);



CREATE INDEX "events_user_id_idx" ON "public"."events" USING "btree" ("user_id");



CREATE INDEX "group_members_group_id_house_id_idx" ON "public"."group_members" USING "btree" ("group_id", "house_id");



CREATE INDEX "group_members_house_id_user_id_idx" ON "public"."group_members" USING "btree" ("house_id", "user_id");



CREATE INDEX "house_actions_assignment_id_house_id_idx" ON "public"."house_actions" USING "btree" ("assignment_id", "house_id");



CREATE INDEX "house_actions_done_by_created_at_idx" ON "public"."house_actions" USING "btree" ("done_by", "created_at" DESC) WHERE ("undone_at" IS NULL);



CREATE INDEX "house_actions_house_id_created_at_idx" ON "public"."house_actions" USING "btree" ("house_id", "created_at" DESC);



CREATE INDEX "house_actions_subject_user_id_idx" ON "public"."house_actions" USING "btree" ("subject_user_id");



CREATE INDEX "house_actions_undone_by_idx" ON "public"."house_actions" USING "btree" ("undone_by");



CREATE INDEX "house_drafts_house_id_created_at_idx" ON "public"."house_drafts" USING "btree" ("house_id", "created_at");



CREATE INDEX "house_drafts_user_id_created_at_idx" ON "public"."house_drafts" USING "btree" ("user_id", "created_at");



CREATE INDEX "houses_created_by_idx" ON "public"."houses" USING "btree" ("created_by");



CREATE INDEX "houses_pass_bought_by_idx" ON "public"."houses" USING "btree" ("pass_bought_by");



CREATE INDEX "johns_group_id_house_id_idx" ON "public"."johns" USING "btree" ("group_id", "house_id");



CREATE INDEX "johns_house_id_live_idx" ON "public"."johns" USING "btree" ("house_id") WHERE ("archived_at" IS NULL);



CREATE UNIQUE INDEX "ledger_entries_assignment_id_forfeit_key" ON "public"."ledger_entries" USING "btree" ("assignment_id") WHERE ("kind" = 'forfeit'::"text");



CREATE INDEX "ledger_entries_assignment_id_house_id_idx" ON "public"."ledger_entries" USING "btree" ("assignment_id", "house_id");



CREATE INDEX "ledger_entries_counterparty_user_id_idx" ON "public"."ledger_entries" USING "btree" ("counterparty_user_id");



CREATE INDEX "ledger_entries_house_id_month_idx" ON "public"."ledger_entries" USING "btree" ("house_id", "month");



CREATE UNIQUE INDEX "ledger_entries_month_close_key" ON "public"."ledger_entries" USING "btree" ("house_id", "month", "user_id", "kind") WHERE ("kind" = ANY (ARRAY['cap_refund'::"text", 'share'::"text"]));



CREATE INDEX "ledger_entries_user_id_idx" ON "public"."ledger_entries" USING "btree" ("user_id");



CREATE INDEX "live_changes_created_at_idx" ON "public"."live_changes" USING "btree" ("created_at");



CREATE INDEX "live_changes_house_id_idx" ON "public"."live_changes" USING "btree" ("house_id", "id");



CREATE UNIQUE INDEX "members_user_id_key" ON "public"."members" USING "btree" ("user_id");



CREATE INDEX "month_let_offs_let_off_by_idx" ON "public"."month_let_offs" USING "btree" ("let_off_by");



CREATE INDEX "moves_from_house_id_idx" ON "public"."moves" USING "btree" ("from_house_id");



CREATE INDEX "moves_left_at_waiting_idx" ON "public"."moves" USING "btree" ("left_at") WHERE (("how" IS NULL) AND ("reminded_at" IS NULL));



CREATE INDEX "moves_to_house_id_idx" ON "public"."moves" USING "btree" ("to_house_id");



CREATE INDEX "moves_user_id_left_at_idx" ON "public"."moves" USING "btree" ("user_id", "left_at" DESC);



CREATE INDEX "moving_pass_billing_stripe_subscription_id_idx" ON "public"."moving_pass_billing" USING "btree" ("stripe_subscription_id");



CREATE INDEX "notices_created_by_idx" ON "public"."notices" USING "btree" ("created_by");



CREATE INDEX "notices_starts_at_ends_at_idx" ON "public"."notices" USING "btree" ("starts_at", "ends_at");



CREATE INDEX "on_call_picks_house_id_idx" ON "public"."on_call_picks" USING "btree" ("house_id");



CREATE INDEX "on_call_picks_john_id_house_id_idx" ON "public"."on_call_picks" USING "btree" ("john_id", "house_id");



CREATE INDEX "on_call_picks_user_id_idx" ON "public"."on_call_picks" USING "btree" ("user_id");



CREATE INDEX "on_call_picks_week_id_house_id_idx" ON "public"."on_call_picks" USING "btree" ("week_id", "house_id");



CREATE INDEX "owner_ask_chats_user_id_updated_at_idx" ON "public"."owner_ask_chats" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "owner_ask_turns_owner_id_asked_at_idx" ON "public"."owner_ask_turns" USING "btree" ("owner_id", "asked_at" DESC);



CREATE INDEX "owner_message_outbox_user_id_idx" ON "public"."owner_message_outbox" USING "btree" ("user_id");



CREATE INDEX "owner_messages_house_id_idx" ON "public"."owner_messages" USING "btree" ("house_id");



CREATE INDEX "owner_messages_person_id_idx" ON "public"."owner_messages" USING "btree" ("person_id");



CREATE INDEX "owner_messages_sent_at_id_idx" ON "public"."owner_messages" USING "btree" ("sent_at" DESC, "id" DESC);



CREATE INDEX "owner_messages_sent_by_idx" ON "public"."owner_messages" USING "btree" ("sent_by");



CREATE INDEX "pocket_earnings_assignment_id_house_id_idx" ON "public"."pocket_earnings" USING "btree" ("assignment_id", "house_id");



CREATE INDEX "pocket_earnings_house_id_month_idx" ON "public"."pocket_earnings" USING "btree" ("house_id", "month");



CREATE INDEX "pocket_earnings_user_id_idx" ON "public"."pocket_earnings" USING "btree" ("user_id");



CREATE INDEX "pocket_pays_house_id_month_idx" ON "public"."pocket_pays" USING "btree" ("house_id", "month");



CREATE INDEX "pocket_pays_paid_by_idx" ON "public"."pocket_pays" USING "btree" ("paid_by");



CREATE INDEX "pocket_pays_user_id_idx" ON "public"."pocket_pays" USING "btree" ("user_id");



CREATE INDEX "promotion_uses_house_id_idx" ON "public"."promotion_uses" USING "btree" ("house_id");



CREATE INDEX "promotion_uses_promotion_id_created_at_idx" ON "public"."promotion_uses" USING "btree" ("promotion_id", "created_at" DESC);



CREATE INDEX "promotion_uses_user_id_idx" ON "public"."promotion_uses" USING "btree" ("user_id");



CREATE INDEX "promotions_made_at_id_idx" ON "public"."promotions" USING "btree" ("made_at" DESC, "id" DESC);



CREATE INDEX "promotions_made_by_idx" ON "public"."promotions" USING "btree" ("made_by");



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "reactions_user_id_idx" ON "public"."reactions" USING "btree" ("user_id");



CREATE INDEX "report_messages_report_id_created_at_idx" ON "public"."report_messages" USING "btree" ("report_id", "created_at");



CREATE INDEX "report_messages_written_by_idx" ON "public"."report_messages" USING "btree" ("written_by");



CREATE INDEX "reports_created_at_id_idx" ON "public"."reports" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "reports_created_at_id_waiting_idx" ON "public"."reports" USING "btree" ("created_at" DESC, "id" DESC) WHERE ("state" = ANY (ARRAY['new'::"text", 'open'::"text"]));



CREATE INDEX "reports_from_email_created_at_idx" ON "public"."reports" USING "btree" ("lower"("from_email"), "created_at" DESC) WHERE ("from_email" IS NOT NULL);



CREATE INDEX "reports_house_id_idx" ON "public"."reports" USING "btree" ("house_id");



CREATE INDEX "reports_same_as_report_id_idx" ON "public"."reports" USING "btree" ("same_as_report_id") WHERE ("same_as_report_id" IS NOT NULL);



CREATE INDEX "reports_user_id_created_at_idx" ON "public"."reports" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "role_permissions_permission_idx" ON "public"."role_permissions" USING "btree" ("permission");



CREATE INDEX "support_drafts_drafted_by_created_at_idx" ON "public"."support_drafts" USING "btree" ("drafted_by", "created_at" DESC);



CREATE UNIQUE INDEX "support_drafts_report_id_report_message_id_key" ON "public"."support_drafts" USING "btree" ("report_id", "report_message_id") NULLS NOT DISTINCT;



CREATE INDEX "support_drafts_report_message_id_idx" ON "public"."support_drafts" USING "btree" ("report_message_id");



CREATE INDEX "support_drafts_same_as_report_id_idx" ON "public"."support_drafts" USING "btree" ("same_as_report_id");



CREATE INDEX "swap_offers_asked_assignment_id_house_id_idx" ON "public"."swap_offers" USING "btree" ("asked_assignment_id", "house_id");



CREATE INDEX "swap_offers_asked_by_idx" ON "public"."swap_offers" USING "btree" ("asked_by");



CREATE INDEX "swap_offers_asked_user_id_idx" ON "public"."swap_offers" USING "btree" ("asked_user_id");



CREATE INDEX "swap_offers_asker_assignment_id_house_id_idx" ON "public"."swap_offers" USING "btree" ("asker_assignment_id", "house_id");



CREATE UNIQUE INDEX "swap_offers_asker_assignment_id_open_key" ON "public"."swap_offers" USING "btree" ("asker_assignment_id") WHERE ("answer" IS NULL);



CREATE INDEX "swap_offers_house_id_created_at_idx" ON "public"."swap_offers" USING "btree" ("house_id", "created_at" DESC);



CREATE INDEX "week_group_shares_group_id_house_id_idx" ON "public"."week_group_shares" USING "btree" ("group_id", "house_id");



CREATE INDEX "week_group_shares_user_id_idx" ON "public"."week_group_shares" USING "btree" ("user_id");



CREATE INDEX "week_group_shares_week_id_house_id_idx" ON "public"."week_group_shares" USING "btree" ("week_id", "house_id");



CREATE INDEX "week_shares_house_id_idx" ON "public"."week_shares" USING "btree" ("house_id");



CREATE INDEX "week_shares_user_id_idx" ON "public"."week_shares" USING "btree" ("user_id");



CREATE INDEX "week_shares_week_id_house_id_idx" ON "public"."week_shares" USING "btree" ("week_id", "house_id");



CREATE INDEX "weeks_skipped_by_idx" ON "public"."weeks" USING "btree" ("skipped_by");



CREATE OR REPLACE TRIGGER "admin_audit_append_only" BEFORE DELETE OR UPDATE ON "public"."admin_audit" FOR EACH ROW EXECUTE FUNCTION "public"."admin_audit_append_only"();



CREATE OR REPLACE TRIGGER "admin_audit_no_truncate" BEFORE TRUNCATE ON "public"."admin_audit" FOR EACH STATEMENT EXECUTE FUNCTION "public"."admin_audit_append_only"();



CREATE OR REPLACE TRIGGER "api_approvals_set_updated_at" BEFORE UPDATE ON "public"."api_approvals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "api_audit_entries_forget_gone" BEFORE INSERT ON "public"."api_audit_entries" FOR EACH ROW EXECUTE FUNCTION "public"."api_audit_entries_forget_gone"();



CREATE OR REPLACE TRIGGER "api_rate_limits_set_updated_at" BEFORE UPDATE ON "public"."api_rate_limits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ask_chats_set_updated_at" BEFORE UPDATE ON "public"."ask_chats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "assignments_clear_plan" BEFORE UPDATE OF "user_id" ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."clear_plan_on_new_holder"();



CREATE OR REPLACE TRIGGER "assignments_pay" BEFORE INSERT ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."assignment_pay"();



CREATE OR REPLACE TRIGGER "assignments_pocket_earn" AFTER UPDATE OF "outcome" ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."pocket_earn"();



CREATE OR REPLACE TRIGGER "assignments_tick_awaits_ok" BEFORE UPDATE OF "done_at" ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."tick_awaits_ok"();



CREATE OR REPLACE TRIGGER "connected_apps_set_updated_at" BEFORE UPDATE ON "public"."connected_apps" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "house_pass_billing_set_updated_at" BEFORE UPDATE ON "public"."house_pass_billing" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "job_follows" AFTER UPDATE OF "done_at", "covered_by" ON "public"."assignments" FOR EACH ROW WHEN ((("old"."done_at" IS NOT NULL) AND ("new"."done_at" IS NULL))) EXECUTE FUNCTION "public"."job_follows"();



CREATE OR REPLACE TRIGGER "johns_pay_changed" AFTER UPDATE OF "pay_minor" ON "public"."johns" FOR EACH ROW WHEN (("old"."pay_minor" IS DISTINCT FROM "new"."pay_minor")) EXECUTE FUNCTION "public"."john_pay_changed"();



CREATE OR REPLACE TRIGGER "left_off_settled" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW WHEN ((("old"."absent_at" IS NOT NULL) AND ("new"."absent_at" IS NOT NULL) AND (("new"."done_at" IS NOT NULL) OR "new"."excused" OR ("new"."covered_by" IS NOT NULL) OR (("old"."outcome" IS NOT NULL) AND ("new"."outcome" IS NULL)) OR ("new"."outcome" = ANY (ARRAY['done'::"text", 'late'::"text", 'excused'::"text"]))))) EXECUTE FUNCTION "public"."left_off_settled"();



CREATE OR REPLACE TRIGGER "live_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."note_live_change"();



CREATE OR REPLACE TRIGGER "live_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."disputes" FOR EACH ROW EXECUTE FUNCTION "public"."note_live_change"();



CREATE OR REPLACE TRIGGER "live_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."note_live_change"();



CREATE OR REPLACE TRIGGER "notices_set_updated_at" BEFORE UPDATE ON "public"."notices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "notification_prefs_set_updated_at" BEFORE UPDATE ON "public"."notification_prefs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "owner_ask_chats_set_updated_at" BEFORE UPDATE ON "public"."owner_ask_chats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "post_rule_change" AFTER UPDATE ON "public"."houses" FOR EACH ROW EXECUTE FUNCTION "public"."post_rule_change"();



CREATE OR REPLACE TRIGGER "record_event_action" AFTER INSERT ON "public"."events" FOR EACH ROW WHEN (("new"."kind" = ANY (ARRAY['done'::"text", 'late'::"text", 'covered'::"text", 'flagged'::"text", 'swap_used'::"text", 'immunity_used'::"text", 'disputed'::"text", 'paid'::"text", 'away'::"text"]))) EXECUTE FUNCTION "public"."record_event_action"();



CREATE OR REPLACE TRIGGER "record_member_action" AFTER DELETE OR UPDATE OF "role" ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."record_member_action"();



CREATE OR REPLACE TRIGGER "record_vote_action" AFTER INSERT OR UPDATE OF "uphold" ON "public"."dispute_votes" FOR EACH ROW EXECUTE FUNCTION "public"."record_vote_action"();



CREATE OR REPLACE TRIGGER "set_closes_at" BEFORE INSERT OR UPDATE OF "due_at" ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_closes_at"();



CREATE OR REPLACE TRIGGER "support_drafts_set_updated_at" BEFORE UPDATE ON "public"."support_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "validate_house" BEFORE INSERT OR UPDATE OF "timezone" ON "public"."houses" FOR EACH ROW EXECUTE FUNCTION "public"."validate_house"();



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_approvals"
    ADD CONSTRAINT "api_approvals_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_approvals"
    ADD CONSTRAINT "api_approvals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_audit_entries"
    ADD CONSTRAINT "api_audit_entries_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_audit_entries"
    ADD CONSTRAINT "api_audit_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_idempotency_keys"
    ADD CONSTRAINT "api_idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_owners"
    ADD CONSTRAINT "app_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_permission_fkey" FOREIGN KEY ("permission") REFERENCES "public"."permissions"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ask_chats"
    ADD CONSTRAINT "ask_chats_house_id_user_id_fkey" FOREIGN KEY ("house_id", "user_id") REFERENCES "public"."members"("house_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_covered_by_fkey" FOREIGN KEY ("covered_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_handed_by_away_period_id_house_id_fkey" FOREIGN KEY ("handed_by_away_period_id", "house_id") REFERENCES "public"."away_periods"("id", "house_id") ON DELETE SET NULL ("handed_by_away_period_id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_handed_from_user_id_fkey" FOREIGN KEY ("handed_from_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_john_id_house_id_fkey" FOREIGN KEY ("john_id", "house_id") REFERENCES "public"."johns"("id", "house_id") ON DELETE SET NULL ("john_id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_okayed_by_fkey" FOREIGN KEY ("okayed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_week_id_house_id_fkey" FOREIGN KEY ("week_id", "house_id") REFERENCES "public"."weeks"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."away_periods"
    ADD CONSTRAINT "away_periods_house_id_user_id_fkey" FOREIGN KEY ("house_id", "user_id") REFERENCES "public"."members"("house_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connected_apps"
    ADD CONSTRAINT "connected_apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crew_members"
    ADD CONSTRAINT "crew_members_assignment_id_house_id_fkey" FOREIGN KEY ("assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crew_members"
    ADD CONSTRAINT "crew_members_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crew_members"
    ADD CONSTRAINT "crew_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispute_votes"
    ADD CONSTRAINT "dispute_votes_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispute_votes"
    ADD CONSTRAINT "dispute_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_assignment_id_house_id_fkey" FOREIGN KEY ("assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_assignment_id_house_id_fkey" FOREIGN KEY ("assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_house_id_fkey" FOREIGN KEY ("group_id", "house_id") REFERENCES "public"."groups"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_house_id_user_id_fkey" FOREIGN KEY ("house_id", "user_id") REFERENCES "public"."members"("house_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."house_actions"
    ADD CONSTRAINT "house_actions_assignment_id_house_id_fkey" FOREIGN KEY ("assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE SET NULL ("assignment_id");



ALTER TABLE ONLY "public"."house_actions"
    ADD CONSTRAINT "house_actions_done_by_fkey" FOREIGN KEY ("done_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."house_actions"
    ADD CONSTRAINT "house_actions_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."house_actions"
    ADD CONSTRAINT "house_actions_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."house_actions"
    ADD CONSTRAINT "house_actions_undone_by_fkey" FOREIGN KEY ("undone_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."house_drafts"
    ADD CONSTRAINT "house_drafts_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."house_drafts"
    ADD CONSTRAINT "house_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."house_pass_billing"
    ADD CONSTRAINT "house_pass_billing_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."houses"
    ADD CONSTRAINT "houses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."houses"
    ADD CONSTRAINT "houses_pass_bought_by_fkey" FOREIGN KEY ("pass_bought_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."johns"
    ADD CONSTRAINT "johns_group_in_house" FOREIGN KEY ("group_id", "house_id") REFERENCES "public"."groups"("id", "house_id") ON DELETE SET NULL ("group_id");



ALTER TABLE ONLY "public"."johns"
    ADD CONSTRAINT "johns_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_assignment_id_house_id_fkey" FOREIGN KEY ("assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE SET NULL ("assignment_id");



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_counterparty_user_id_fkey" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_changes"
    ADD CONSTRAINT "live_changes_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."month_closes"
    ADD CONSTRAINT "month_closes_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."month_let_offs"
    ADD CONSTRAINT "month_let_offs_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."month_let_offs"
    ADD CONSTRAINT "month_let_offs_let_off_by_fkey" FOREIGN KEY ("let_off_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moves"
    ADD CONSTRAINT "moves_from_house_id_fkey" FOREIGN KEY ("from_house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moves"
    ADD CONSTRAINT "moves_to_house_id_fkey" FOREIGN KEY ("to_house_id") REFERENCES "public"."houses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moves"
    ADD CONSTRAINT "moves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_pass_billing"
    ADD CONSTRAINT "moving_pass_billing_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_prefs"
    ADD CONSTRAINT "notification_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."on_call_picks"
    ADD CONSTRAINT "on_call_picks_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."on_call_picks"
    ADD CONSTRAINT "on_call_picks_john_id_house_id_fkey" FOREIGN KEY ("john_id", "house_id") REFERENCES "public"."johns"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."on_call_picks"
    ADD CONSTRAINT "on_call_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."on_call_picks"
    ADD CONSTRAINT "on_call_picks_week_id_house_id_fkey" FOREIGN KEY ("week_id", "house_id") REFERENCES "public"."weeks"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_ask_chats"
    ADD CONSTRAINT "owner_ask_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_ask_turns"
    ADD CONSTRAINT "owner_ask_turns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_message_outbox"
    ADD CONSTRAINT "owner_message_outbox_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."owner_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_message_outbox"
    ADD CONSTRAINT "owner_message_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_messages"
    ADD CONSTRAINT "owner_messages_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."owner_messages"
    ADD CONSTRAINT "owner_messages_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."owner_messages"
    ADD CONSTRAINT "owner_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pocket_earnings"
    ADD CONSTRAINT "pocket_earnings_assignment_id_house_id_fkey" FOREIGN KEY ("assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pocket_earnings"
    ADD CONSTRAINT "pocket_earnings_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pocket_earnings"
    ADD CONSTRAINT "pocket_earnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pocket_pays"
    ADD CONSTRAINT "pocket_pays_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pocket_pays"
    ADD CONSTRAINT "pocket_pays_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pocket_pays"
    ADD CONSTRAINT "pocket_pays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_people"
    ADD CONSTRAINT "promotion_people_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_uses"
    ADD CONSTRAINT "promotion_uses_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_uses"
    ADD CONSTRAINT "promotion_uses_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_uses"
    ADD CONSTRAINT "promotion_uses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_made_by_fkey" FOREIGN KEY ("made_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_messages"
    ADD CONSTRAINT "report_messages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_messages"
    ADD CONSTRAINT "report_messages_written_by_fkey" FOREIGN KEY ("written_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_same_as_report_id_fkey" FOREIGN KEY ("same_as_report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_fkey" FOREIGN KEY ("permission") REFERENCES "public"."permissions"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_drafts"
    ADD CONSTRAINT "support_drafts_drafted_by_fkey" FOREIGN KEY ("drafted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_drafts"
    ADD CONSTRAINT "support_drafts_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_drafts"
    ADD CONSTRAINT "support_drafts_report_message_id_fkey" FOREIGN KEY ("report_message_id") REFERENCES "public"."report_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_drafts"
    ADD CONSTRAINT "support_drafts_same_as_report_id_fkey" FOREIGN KEY ("same_as_report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."swap_offers"
    ADD CONSTRAINT "swap_offers_asked_assignment_id_house_id_fkey" FOREIGN KEY ("asked_assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swap_offers"
    ADD CONSTRAINT "swap_offers_asked_by_fkey" FOREIGN KEY ("asked_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swap_offers"
    ADD CONSTRAINT "swap_offers_asked_user_id_fkey" FOREIGN KEY ("asked_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swap_offers"
    ADD CONSTRAINT "swap_offers_asker_assignment_id_house_id_fkey" FOREIGN KEY ("asker_assignment_id", "house_id") REFERENCES "public"."assignments"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swap_offers"
    ADD CONSTRAINT "swap_offers_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_group_shares"
    ADD CONSTRAINT "week_group_shares_group_id_house_id_fkey" FOREIGN KEY ("group_id", "house_id") REFERENCES "public"."groups"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_group_shares"
    ADD CONSTRAINT "week_group_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_group_shares"
    ADD CONSTRAINT "week_group_shares_week_id_house_id_fkey" FOREIGN KEY ("week_id", "house_id") REFERENCES "public"."weeks"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_shares"
    ADD CONSTRAINT "week_shares_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_shares"
    ADD CONSTRAINT "week_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_shares"
    ADD CONSTRAINT "week_shares_week_id_house_id_fkey" FOREIGN KEY ("week_id", "house_id") REFERENCES "public"."weeks"("id", "house_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weeks"
    ADD CONSTRAINT "weeks_skipped_by_fkey" FOREIGN KEY ("skipped_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE "public"."account_deletions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "add your device" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."admin_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins add Johns" ON "public"."johns" FOR INSERT TO "authenticated" WITH CHECK ("public"."can"("house_id", 'johns:write'::"text"));



CREATE POLICY "admins change the house" ON "public"."houses" FOR UPDATE TO "authenticated" USING ("public"."can"("id", 'house:write'::"text")) WITH CHECK ("public"."can"("id", 'house:write'::"text"));



CREATE POLICY "admins edit Johns" ON "public"."johns" FOR UPDATE TO "authenticated" USING ("public"."can"("house_id", 'johns:write'::"text")) WITH CHECK ("public"."can"("house_id", 'johns:write'::"text"));



CREATE POLICY "anyone reads the notices that are on" ON "public"."notices" FOR SELECT TO "anon" USING ((("starts_at" <= "now"()) AND (("ends_at" IS NULL) OR ("ends_at" > "now"()))));



CREATE POLICY "anyone signed in reads the app roles" ON "public"."app_role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "anyone signed in reads the permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "anyone signed in reads who has them" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."api_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_audit_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_idempotency_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_owners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ask_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."away_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "change your settings" ON "public"."notification_prefs" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."connected_apps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crew_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dispute_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."house_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."house_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."house_pass_billing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."houses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."johns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_changes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members see assignments" ON "public"."assignments" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'weeks:read'::"text"));



CREATE POLICY "members see disputes" ON "public"."disputes" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'disputes:read'::"text"));



CREATE POLICY "members see each other" ON "public"."members" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'members:read'::"text"));



CREATE POLICY "members see group shares" ON "public"."week_group_shares" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'weeks:read'::"text"));



CREATE POLICY "members see groups" ON "public"."groups" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'groups:read'::"text"));



CREATE POLICY "members see let-off months" ON "public"."month_let_offs" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'payments:read'::"text"));



CREATE POLICY "members see month closes" ON "public"."month_closes" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'payments:read'::"text"));



CREATE POLICY "members see pay day" ON "public"."pocket_pays" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'pocket_money:read'::"text"));



CREATE POLICY "members see pocket money" ON "public"."pocket_earnings" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'pocket_money:read'::"text"));



CREATE POLICY "members see reactions" ON "public"."reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "reactions"."event_id") AND "public"."can"("e"."house_id", 'wall:read'::"text")))));



CREATE POLICY "members see shares" ON "public"."week_shares" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'weeks:read'::"text"));



CREATE POLICY "members see the house" ON "public"."houses" FOR SELECT TO "authenticated" USING ("public"."can"("id", 'house:read'::"text"));



CREATE POLICY "members see the house's history" ON "public"."house_actions" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'history:read'::"text"));



CREATE POLICY "members see the ledger" ON "public"."ledger_entries" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'payments:read'::"text"));



CREATE POLICY "members see the list" ON "public"."johns" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'johns:read'::"text"));



CREATE POLICY "members see the wall" ON "public"."events" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'wall:read'::"text"));



CREATE POLICY "members see time away" ON "public"."away_periods" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'away:read'::"text"));



CREATE POLICY "members see votes" ON "public"."dispute_votes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."disputes" "d"
  WHERE (("d"."id" = "dispute_votes"."dispute_id") AND "public"."can"("d"."house_id", 'disputes:read'::"text")))));



CREATE POLICY "members see weeks" ON "public"."weeks" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'weeks:read'::"text"));



CREATE POLICY "members see who did a John" ON "public"."crew_members" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'weeks:read'::"text"));



CREATE POLICY "members see who is in a group" ON "public"."group_members" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'groups:read'::"text"));



CREATE POLICY "members see who is on call" ON "public"."on_call_picks" FOR SELECT TO "authenticated" USING ("public"."can"("house_id", 'weeks:read'::"text"));



ALTER TABLE "public"."month_closes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."month_let_offs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moving_pass_billing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_prefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."on_call_picks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owner_ask_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owner_ask_turns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_ask_turns_owner_reads" ON "public"."owner_ask_turns" FOR SELECT TO "authenticated" USING ((( SELECT "public"."can_app"('admin:read'::"text") AS "can_app") AND ("owner_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."owner_message_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owner_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "people read the notices that are on, the owner reads every noti" ON "public"."notices" FOR SELECT TO "authenticated" USING (((("starts_at" <= "now"()) AND (("ends_at" IS NULL) OR ("ends_at" > "now"()))) OR ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app")));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pocket_earnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pocket_pays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_uses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "react as yourself" ON "public"."reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "reactions"."event_id") AND "public"."is_member"("e"."house_id"))))));



ALTER TABLE "public"."reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "remove your device" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rename yourself" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."report_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "save your settings" ON "public"."notification_prefs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "see yourself and housemates" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."shares_house"("id")));



ALTER TABLE "public"."support_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."swap_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "take back your reaction" ON "public"."reactions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "the API counts requests" ON "public"."api_rate_limits" TO "jonz_api" USING (true) WITH CHECK (true);



CREATE POLICY "the API keeps approvals" ON "public"."api_approvals" TO "jonz_api" USING (true) WITH CHECK (true);



CREATE POLICY "the API keeps idempotency keys" ON "public"."api_idempotency_keys" TO "jonz_api" USING (true) WITH CHECK (true);



CREATE POLICY "the API reads connected apps" ON "public"."connected_apps" FOR SELECT TO "jonz_api" USING (true);



CREATE POLICY "the API writes the audit" ON "public"."api_audit_entries" FOR INSERT TO "jonz_api" WITH CHECK (true);



CREATE POLICY "the owner carries on their own chats" ON "public"."owner_ask_chats" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app")));



CREATE POLICY "the owner deletes their own chats" ON "public"."owner_ask_chats" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app")));



CREATE POLICY "the owner reads the audit log" ON "public"."admin_audit" FOR SELECT TO "authenticated" USING (( SELECT "public"."can_app"('admin:read'::"text") AS "can_app"));



CREATE POLICY "the owner reads their own chats" ON "public"."owner_ask_chats" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app")));



CREATE POLICY "the owner sees support drafts" ON "public"."support_drafts" FOR SELECT TO "authenticated" USING (( SELECT "public"."can_app"('reports:write'::"text") AS "can_app"));



CREATE POLICY "the owner starts a chat" ON "public"."owner_ask_chats" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app")));



CREATE POLICY "the two of them see an ask" ON "public"."swap_offers" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "asked_by") OR (( SELECT "auth"."uid"() AS "uid") = "asked_user_id")));



ALTER TABLE "public"."week_group_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."week_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "you carry on your own chats" ON "public"."ask_chats" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "you delete your own chats" ON "public"."ask_chats" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "you read the replies to yours" ON "public"."report_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "report_messages"."report_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "you read the reports you sent" ON "public"."reports" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "you read your own chats" ON "public"."ask_chats" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "you start a chat in your house" ON "public"."ask_chats" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_member"("house_id")));



CREATE POLICY "your own devices" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "your own moves" ON "public"."moves" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "your own settings" ON "public"."notification_prefs" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."assignments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dispute_votes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."disputes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."on_call_picks";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "jonz_api";

















































































































































































REVOKE ALL ON FUNCTION "public"."account_deletion_preview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."account_deletion_preview"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."account_deletion_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."account_deletion_status"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_correction"("p_house" "uuid", "p_user" "uuid", "p_amount" integer, "p_month" "text", "p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_correction"("p_house" "uuid", "p_user" "uuid", "p_amount" integer, "p_month" "text", "p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_john"("p_house" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_john"("p_house" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_johns"("p_house" "uuid", "p_johns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_johns"("p_house" "uuid", "p_johns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_kid"("p_parent" "uuid", "p_kid" "uuid", "p_born" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_kid"("p_parent" "uuid", "p_kid" "uuid", "p_born" smallint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_push_device"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_push_device"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_audit_append_only"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_reset"("p_actor" "uuid", "p_house" "uuid", "p_kind" "text", "p_target" "jsonb", "p_forfeits" "jsonb", "p_apply" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_reset"("p_actor" "uuid", "p_house" "uuid", "p_kind" "text", "p_target" "jsonb", "p_forfeits" "jsonb", "p_apply" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."answer_api_approval"("p_id" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."answer_api_approval"("p_id" "uuid", "p_approve" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."answer_dispute"("p_dispute" "uuid", "p_photo_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."answer_dispute"("p_dispute" "uuid", "p_photo_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."answer_dispute"("p_dispute" "uuid", "p_photo_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."answer_swap"("p_offer" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."answer_swap"("p_offer" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."answer_swap"("p_offer" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."answer_tick"("p_assignment" "uuid", "p_ok" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."answer_tick"("p_assignment" "uuid", "p_ok" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."answer_tick"("p_assignment" "uuid", "p_ok" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."api_approval"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."api_approval"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."api_audit_entries_forget_gone"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."api_pre_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."api_pre_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."api_pre_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."api_pre_request"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_house_kind"("p_house" "uuid", "p_kind" "text", "p_by" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."apply_next_kind"("p_house" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_next_kind"("p_house" "uuid", "p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ask_account_used"("p_user" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ask_account_used"("p_user" "uuid", "p_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ask_usage"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ask_usage"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ask_usage_people"("p_house" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ask_usage_people"("p_house" "uuid", "p_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assignment_pay"() FROM PUBLIC;



-- Every table starts with no rights for the three API roles: each gets back
-- below only what it was given on purpose.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated", "service_role";

GRANT SELECT ON TABLE "public"."admin_audit" TO "authenticated";
GRANT SELECT,INSERT ON TABLE "public"."admin_audit" TO "service_role";



REVOKE ALL ON FUNCTION "public"."board_tick"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."board_tick"("p_assignment" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."board_tick"("p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can"("h" "uuid", "perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can"("h" "uuid", "perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can"("h" "uuid", "perm" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_app"("perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_app"("perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_app"("perm" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_upload_proof"("object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_upload_proof"("object_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."can_upload_proof"("object_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_away"("p_away" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_away"("p_away" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."cancel_away"("p_away" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cast_vote"("p_dispute" "uuid", "p_uphold" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cast_vote"("p_dispute" "uuid", "p_uphold" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."cast_vote"("p_dispute" "uuid", "p_uphold" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."change_john"("p_john" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."change_john"("p_john" "uuid", "p_name" "text", "p_category" "text", "p_points" smallint, "p_every_weeks" smallint, "p_due_dow" smallint, "p_due_time" "text", "p_needs_photo" boolean, "p_group" "uuid", "p_every_months" smallint, "p_week_of_month" smallint, "p_anchor_month" integer, "p_anchor_week" integer, "p_when" "text", "p_respond_hours" smallint, "p_per_week" smallint, "p_crew" smallint, "p_keep_day" boolean, "p_pay_minor" integer, "p_min_age" smallint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."chat_title_of"("p_turns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_title_of"("p_turns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."chat_turns_kept"("p_turns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_turns_kept"("p_turns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_can"("p_house" "uuid", "p_perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_can"("p_house" "uuid", "p_perm" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_can_app"("p_perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_can_app"("p_perm" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."assignments" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."checked_place"("a" "public"."assignments") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checked_place"("a" "public"."assignments") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_ask_turn"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone, "p_pool" bigint, "p_share" bigint, "p_user_day" integer, "p_reserve" integer, "p_account" bigint, "p_account_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_ask_turn"("p_house" "uuid", "p_user" "uuid", "p_since" timestamp with time zone, "p_pool" bigint, "p_share" bigint, "p_user_day" integer, "p_reserve" integer, "p_account" bigint, "p_account_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_owner_ask"("p_question" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_owner_ask"("p_question" "text", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."claim_support_draft"("p_report" "uuid", "p_message" bigint, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_support_draft"("p_report" "uuid", "p_message" bigint, "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."clear_plan_on_new_holder"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."close_month"("p_house" "uuid", "p_month" "text", "p_entries" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_month"("p_house" "uuid", "p_month" "text", "p_entries" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_week"("p_week" "uuid", "p_members" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_week"("p_week" "uuid", "p_members" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."closes_at"("a" "public"."assignments", "week_ends" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."closes_at"("a" "public"."assignments", "week_ends" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_payment"("p_house" "uuid", "p_from" "uuid", "p_amount" integer, "p_via" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_payment"("p_house" "uuid", "p_from" "uuid", "p_amount" integer, "p_via" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_payment"("p_house" "uuid", "p_from" "uuid", "p_amount" integer, "p_via" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cover_john"("p_assignment" "uuid", "p_photo_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cover_john"("p_assignment" "uuid", "p_photo_path" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."cover_john"("p_assignment" "uuid", "p_photo_path" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cover_opens_at"("a" "public"."assignments", "week_ends" timestamp with time zone, "grace" smallint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."create_house"("p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_house"("p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_house"("p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."credited_to"("a" "public"."assignments") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."credited_to"("a" "public"."assignments") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deal_week"("p_house" "uuid", "p_starts_on" "date", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_assignments" "jsonb", "p_shares" "jsonb", "p_replace" boolean, "p_on_call" "jsonb", "p_state" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deal_week"("p_house" "uuid", "p_starts_on" "date", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_assignments" "jsonb", "p_shares" "jsonb", "p_replace" boolean, "p_on_call" "jsonb", "p_state" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_ask_chat"("p_chat" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_ask_chat"("p_chat" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_group"("p_group" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_group"("p_group" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_group"("p_group" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_owner_ask_chat"("p_chat" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_owner_ask_chat"("p_chat" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."deletion_away"("p_user" "uuid", "p_until" timestamp with time zone) FROM PUBLIC;



GRANT ALL ON TABLE "public"."disputes" TO "service_role";
GRANT SELECT ON TABLE "public"."disputes" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."dispute_voters"("d" "public"."disputes") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispute_voters"("d" "public"."disputes") TO "service_role";



REVOKE ALL ON FUNCTION "public"."drop_own_flag"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."drop_own_flag"("p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_account_deletion"("p_user" "uuid", "p_action" "text", "p_reason" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."end_away"("p_away" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_away"("p_away" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_deletion_away"("p_away" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_deletion_away"("p_away" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_notice"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_notice"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finish_account_deletion"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_account_deletion"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_owner_ask"("p_turn" "uuid", "p_reply" "text", "p_input" integer, "p_output" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_owner_ask"("p_turn" "uuid", "p_reply" "text", "p_input" integer, "p_output" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finish_support_draft"("p_draft" "uuid", "p_reply" "text", "p_action" "text", "p_same_as" "uuid", "p_why" "text", "p_input" integer, "p_output" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_support_draft"("p_draft" "uuid", "p_reply" "text", "p_action" "text", "p_same_as" "uuid", "p_why" "text", "p_input" integer, "p_output" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."first_john_month"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint, "p_week_of_month" smallint, "p_due_dow" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."first_john_month"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint, "p_week_of_month" smallint, "p_due_dow" smallint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."flag_sharers"("p_john" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."flag_sharers"("p_john" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."follow_identity_photo"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."hand_over"("p_house" "uuid", "p_to" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hand_over"("p_house" "uuid", "p_to" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hand_over"("p_house" "uuid", "p_to" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hold_cover"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hold_cover"("p_assignment" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hold_cover"("p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_away"("p_house" "uuid", "p_from" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_away"("p_house" "uuid", "p_from" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_balances"("p_house" "uuid", "p_before" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_balances"("p_house" "uuid", "p_before" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."house_balances"("p_house" "uuid", "p_before" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."house_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_group_balances"("p_house" "uuid", "p_before" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_group_balances"("p_house" "uuid", "p_before" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."house_group_balances"("p_house" "uuid", "p_before" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_has_paid_pass"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_has_paid_pass"("p_house" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_has_pass"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_has_pass"("p_house" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_history"("p_house" "uuid", "p_before" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_history"("p_house" "uuid", "p_before" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."house_history"("p_house" "uuid", "p_before" timestamp with time zone, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_live_since"("p_house" "uuid", "p_after" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_live_since"("p_house" "uuid", "p_after" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."house_live_since"("p_house" "uuid", "p_after" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."house_month"("p_house" "uuid", "p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_month"("p_house" "uuid", "p_month" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_pocket"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_pocket"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_record"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_record"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_stake"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_stake"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_today"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_today"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."house_wall"("p_house" "uuid", "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."house_wall"("p_house" "uuid", "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."identity_photo"("data" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_member"("h" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_member"("h" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member"("h" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."job_follows"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."john_columns"("p_house" "uuid", "p_john" "jsonb", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."john_columns"("p_house" "uuid", "p_john" "jsonb", "p_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."john_list"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."john_list"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."john_pay_changed"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."join_house"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_house"("p_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."join_house"("p_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."keep_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keep_account"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."keep_ask_chat"("p_house" "uuid", "p_turns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keep_ask_chat"("p_house" "uuid", "p_turns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."keep_owner_ask_chat"("p_turns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keep_owner_ask_chat"("p_turns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."leave_pass"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_pass"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_pass"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."left_off_settled"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."like_escaped"("p_words" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."like_escaped"("p_words" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."live_notices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."live_notices"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."live_topic"("p_house_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."live_topic"("p_house_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_done"("p_assignment" "uuid", "p_photo_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_done"("p_assignment" "uuid", "p_photo_path" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_done"("p_assignment" "uuid", "p_photo_path" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."month_open"("p_house" "uuid", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."month_open"("p_house" "uuid", "p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."moving_on"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moving_on"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moving_on"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_app_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_app_access"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_app_permissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_app_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_app_permissions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_app_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_app_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_app_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_ask_chat"("p_chat" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_ask_chat"("p_chat" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_ask_chats"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_ask_chats"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_house"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_house"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_language"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_language"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_notifications"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_open_assignment"("p_assignment" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_open_assignment"("p_assignment" "uuid", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_permissions"("h" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_permissions"("h" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_permissions"("h" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_report"("p_report" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_report"("p_report" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_reports"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_reports"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."new_join_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."new_join_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."note_live_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."offer_swap"("p_mine" "uuid", "p_theirs" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."offer_swap"("p_mine" "uuid", "p_theirs" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."offer_swap"("p_mine" "uuid", "p_theirs" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_flag"("p_john" "uuid", "p_at" timestamp with time zone, "p_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_flag"("p_john" "uuid", "p_at" timestamp with time zone, "p_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_ask_chat"("p_chat" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_ask_chat"("p_chat" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_ask_chats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_ask_chats"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_audit_count"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_audit_count"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_audit_entry"("p_entry" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_audit_entry"("p_entry" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_audit_matching"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_audit_matching"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_audit_page"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_audit_page"("p_q" "text", "p_who" "text", "p_what" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_delete_house"("p_house" "uuid", "p_reason" "text", "p_subject" "text", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_delete_house"("p_house" "uuid", "p_reason" "text", "p_subject" "text", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owner_delete_house"("p_house" "uuid", "p_reason" "text", "p_subject" "text", "p_body" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_delete_now"("p_user" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_delete_now"("p_user" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_deletions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_deletions"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_deletions_count"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_deletions_count"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_deletions_find"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."owner_deletions_page"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_user" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_deletions_page"("p_q" "text", "p_by" "text", "p_goes" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_user" "uuid", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_fix_report"("p_report" "uuid", "p_note" "text", "p_tell" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_fix_report"("p_report" "uuid", "p_note" "text", "p_tell" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_house"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_house"("p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_houses_count"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_houses_count"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_houses_find"("p_q" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_houses_find"("p_q" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_houses_match"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."owner_houses_page"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_houses_page"("p_q" "text", "p_pass" "text", "p_active" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_make_promotion"("p_code" "text", "p_name" "text", "p_note" "text", "p_kind" "text", "p_percent" integer, "p_amount" "jsonb", "p_duration" "text", "p_months" integer, "p_plans" "text"[], "p_audience" "text", "p_people" "text"[], "p_ends_at" timestamp with time zone, "p_max_uses" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_make_promotion"("p_code" "text", "p_name" "text", "p_note" "text", "p_kind" "text", "p_percent" integer, "p_amount" "jsonb", "p_duration" "text", "p_months" integer, "p_plans" "text"[], "p_audience" "text", "p_people" "text"[], "p_ends_at" timestamp with time zone, "p_max_uses" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_message_people"("p_audience" "text", "p_person" "uuid", "p_house" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."owner_message_reach"("p_audience" "text", "p_person" "uuid", "p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_message_reach"("p_audience" "text", "p_person" "uuid", "p_house" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_messages_count"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_messages_count"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_messages_find"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_messages_find"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_messages_page"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_messages_page"("p_q" "text", "p_audience" "text", "p_way" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_notices_count"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_notices_count"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



GRANT ALL ON TABLE "public"."notices" TO "service_role";
GRANT SELECT ON TABLE "public"."notices" TO "anon";
GRANT SELECT ON TABLE "public"."notices" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_notices_matching"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_notices_matching"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_notices_page"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_notices_page"("p_q" "text", "p_kind" "text", "p_state" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_limit" integer, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_open_report"("p_report" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_open_report"("p_report" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_overview"("p_span" "text", "p_zone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_overview"("p_span" "text", "p_zone" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_people_find"("p_q" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_people_find"("p_q" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_promotion"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_promotion"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_promotion_emails"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_promotion_emails"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_promotions_count"("p_q" "text", "p_who" "text", "p_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_promotions_count"("p_q" "text", "p_who" "text", "p_state" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_promotions_find"("p_q" "text", "p_who" "text", "p_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_promotions_find"("p_q" "text", "p_who" "text", "p_state" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_promotions_page"("p_q" "text", "p_who" "text", "p_state" "text", "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_promotions_page"("p_q" "text", "p_who" "text", "p_state" "text", "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_reply_report"("p_report" "uuid", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_reply_report"("p_report" "uuid", "p_body" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_reports_count"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_reports_count"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_reports_find"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."owner_reports_page"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_reports_page"("p_q" "text", "p_state" "text", "p_kind" "text", "p_from" "text", "p_after" timestamp with time zone, "p_before" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_request_deletion"("p_email" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_request_deletion"("p_email" "text", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_reset_house_data"("p_house" "uuid", "p_everything" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_reset_house_data"("p_house" "uuid", "p_everything" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owner_reset_house_data"("p_house" "uuid", "p_everything" boolean, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_same_as"("p_report" "uuid", "p_main" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_same_as"("p_report" "uuid", "p_main" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_same_as_find"("p_report" "uuid", "p_q" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_same_as_find"("p_report" "uuid", "p_q" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_send_message"("p_audience" "text", "p_person" "uuid", "p_house" "uuid", "p_subject" "text", "p_body" "text", "p_push" boolean, "p_wall" boolean, "p_email" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_send_message"("p_audience" "text", "p_person" "uuid", "p_house" "uuid", "p_subject" "text", "p_body" "text", "p_push" boolean, "p_wall" boolean, "p_email" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_set_report_state"("p_report" "uuid", "p_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_set_report_state"("p_report" "uuid", "p_state" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_set_support_draft"("p_draft" "uuid", "p_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_set_support_draft"("p_draft" "uuid", "p_state" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."owner_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_stop_deletion"("p_user" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_stop_deletion"("p_user" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owner_stop_promotion"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_stop_promotion"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."owns_covered"("a" "public"."assignments", "me" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_covered"("a" "public"."assignments", "me" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_pocket_money"("p_house" "uuid", "p_kid" "uuid", "p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_pocket_money"("p_house" "uuid", "p_kid" "uuid", "p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_pocket_money"("p_house" "uuid", "p_kid" "uuid", "p_month" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."place_pass"("p_move" "uuid", "p_house" "uuid", "p_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."place_pass"("p_move" "uuid", "p_house" "uuid", "p_state" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."plan_john"("p_assignment" "uuid", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."plan_john"("p_assignment" "uuid", "p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_john"("p_assignment" "uuid", "p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pocket_earn"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."post_rule_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."promotion_opened"("p_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."promotion_opened"("p_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."promotion_ready"("p_id" "uuid", "p_coupon" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."promotion_ready"("p_id" "uuid", "p_coupon" "text", "p_code" "text") TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."promotion_state"("p" "public"."promotions") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."promotion_state"("p" "public"."promotions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."promotion_use"("p_id" "uuid", "p_house" "uuid", "p_user" "uuid", "p_email" "text", "p_session" "text", "p_plan" "text", "p_strict" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."promotion_use"("p_id" "uuid", "p_house" "uuid", "p_user" "uuid", "p_email" "text", "p_session" "text", "p_plan" "text", "p_strict" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."proof_house"("object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."proof_house"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."proof_house"("object_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_action"("p_user" "uuid", "p_assignment" "uuid", "p_dispute" "uuid", "p_uphold" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_action"("p_user" "uuid", "p_assignment" "uuid", "p_dispute" "uuid", "p_uphold" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."quietly"("p_on" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."raise_dispute"("p_assignment" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."raise_dispute"("p_assignment" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."raise_dispute"("p_assignment" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."raise_flag"("p_john" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."raise_flag"("p_john" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."raise_flag"("p_john" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."react"("p_event" "uuid", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."react"("p_event" "uuid", "p_kind" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."receive_email"("p_email_id" "text", "p_from" "text", "p_name" "text", "p_subject" "text", "p_topic" "text", "p_ref" "text", "p_body" "text", "p_trusted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_email"("p_email_id" "text", "p_from" "text", "p_name" "text", "p_subject" "text", "p_topic" "text", "p_ref" "text", "p_body" "text", "p_trusted" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_event_action"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_event_action"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_member_action"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_member_action"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_moved_on"("p_user" "uuid", "p_to" "uuid", "p_how" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_moved_on"("p_user" "uuid", "p_to" "uuid", "p_how" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_vote_action"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_vote_action"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recording"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recording"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recount_streaks"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recount_streaks"("p_house" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."redo_hours"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redo_hours"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_flag"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_flag"("p_assignment" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_flag"("p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_john"("p_john" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_john"("p_john" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_member"("p_house" "uuid", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_member"("p_house" "uuid", "p_user" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."remove_member"("p_house" "uuid", "p_user" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_push_device"("p_endpoint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_push_device"("p_endpoint" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."reports" TO "service_role";
GRANT SELECT ON TABLE "public"."reports" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."report_recipient"("r" "public"."reports") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."request_account_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_account_deletion"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."request_tick"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."require_first_party"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."require_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_bump"("acc" "jsonb", "p_user" "uuid", "field" "text", "n" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_bump"("acc" "jsonb", "p_user" "uuid", "field" "text", "n" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_house_data"("p_house" "uuid", "p_everything" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_house_data"("p_house" "uuid", "p_everything" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_house_data"("p_house" "uuid", "p_everything" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_join_code"("p_house" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_join_code"("p_house" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_join_code"("p_house" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."house_actions" TO "service_role";
GRANT SELECT ON TABLE "public"."house_actions" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reset_reach"("x" "public"."house_actions") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_reach"("x" "public"."house_actions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_dispute"("p_dispute" "uuid", "p_resolution" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute" "uuid", "p_resolution" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."roll_call"("p_assignment" "uuid", "p_crew" "uuid"[], "p_photo_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roll_call"("p_assignment" "uuid", "p_crew" "uuid"[], "p_photo_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."roll_call"("p_assignment" "uuid", "p_crew" "uuid"[], "p_photo_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."runs_for"("p_house" "uuid", "p_kid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."runs_for"("p_house" "uuid", "p_kid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."runs_for"("p_house" "uuid", "p_kid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_group"("p_house" "uuid", "p_group" "uuid", "p_name" "text", "p_members" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_group"("p_house" "uuid", "p_group" "uuid", "p_name" "text", "p_members" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_group"("p_house" "uuid", "p_group" "uuid", "p_name" "text", "p_members" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_house_rules"("p_house" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_stake_minor" integer, "p_late_forfeit_minor" integer, "p_missed_forfeit_minor" integer, "p_dispute_hours" smallint, "p_away_makeup" smallint, "p_cover_grace_hours" smallint, "p_late_hours" smallint, "p_settle_in" "text", "p_deal_mode" "text", "p_deal_budget" smallint, "p_pocket_cap_minor" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_house_rules"("p_house" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint, "p_stake_minor" integer, "p_late_forfeit_minor" integer, "p_missed_forfeit_minor" integer, "p_dispute_hours" smallint, "p_away_makeup" smallint, "p_cover_grace_hours" smallint, "p_late_hours" smallint, "p_settle_in" "text", "p_deal_mode" "text", "p_deal_budget" smallint, "p_pocket_cap_minor" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_notice"("p_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_link_label" "text", "p_link_url" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_notice"("p_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_link_label" "text", "p_link_url" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_notifications"("p_reminders" boolean, "p_checks" boolean, "p_flags" boolean, "p_deal" boolean, "p_quiet_from" smallint, "p_quiet_until" smallint, "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_notifications"("p_reminders" boolean, "p_checks" boolean, "p_flags" boolean, "p_deal" boolean, "p_quiet_from" smallint, "p_quiet_until" smallint, "p_timezone" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_prefs"("p_house" "uuid", "p_days" smallint[], "p_best_time" "text", "p_rather" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_prefs"("p_house" "uuid", "p_days" smallint[], "p_best_time" "text", "p_rather" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_prefs"("p_house" "uuid", "p_days" smallint[], "p_best_time" "text", "p_rather" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_words"("p_q" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_words"("p_q" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."see_report"("p_report" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."see_report"("p_report" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."send_report"("p_kind" "text", "p_words" "text", "p_details" "jsonb", "p_shots" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_report"("p_kind" "text", "p_words" "text", "p_details" "jsonb", "p_shots" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_app_access"("p_client_id" "text", "p_access" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_app_access"("p_client_id" "text", "p_access" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_away"("p_starts" "date", "p_ends" "date", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_away"("p_starts" "date", "p_ends" "date", "p_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_away"("p_starts" "date", "p_ends" "date", "p_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_closes_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_deal_mode"("p_house" "uuid", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_deal_mode"("p_house" "uuid", "p_mode" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_house_kind"("p_house" "uuid", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_house_kind"("p_house" "uuid", "p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_house_kind"("p_house" "uuid", "p_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_member_role"("p_house" "uuid", "p_user" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_member_role"("p_house" "uuid", "p_user" "uuid", "p_role" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_member_role"("p_house" "uuid", "p_user" "uuid", "p_role" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_moving_out"("p_on" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_moving_out"("p_on" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_moving_out"("p_on" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_my_language"("p_language" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_language"("p_language" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_my_name"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_name"("p_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_my_photo"("photo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_photo"("photo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_photo"("photo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."settle_assignments"("p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_assignments"("p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."shares_house"("other" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shares_house"("other" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_house"("other" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_away"("p_user" "uuid", "p_starts" "date", "p_ends" "date", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_away"("p_user" "uuid", "p_starts" "date", "p_ends" "date", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_house_from"("p_from" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_house_from"("p_from" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_house_from"("p_from" "uuid", "p_name" "text", "p_timezone" "text", "p_currency" "text", "p_week_starts" smallint) TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."support_drafts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."support_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."support_drafts" TO "service_role";



REVOKE ALL ON FUNCTION "public"."support_draft_json"("d" "public"."support_drafts") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."take_message_outbox"("p_limit" integer, "p_message" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."take_message_outbox"("p_limit" integer, "p_message" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."tick_awaits_ok"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."tidy_api_bookkeeping"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."undo_action"("p_action" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_action"("p_action" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."undo_action"("p_action" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."undo_cover"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_cover"("p_assignment" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."undo_cover"("p_assignment" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."undo_done"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_done"("p_assignment" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."undo_done"("p_assignment" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."undo_latest"("p_kind" "text", "p_about" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_latest"("p_kind" "text", "p_about" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."undo_latest"("p_kind" "text", "p_about" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."undo_reach"("x" "public"."house_actions") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_reach"("x" "public"."house_actions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."undo_reset"("x" "public"."house_actions") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_reset"("x" "public"."house_actions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unreact"("p_event" "uuid", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unreact"("p_event" "uuid", "p_kind" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_owner_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_owner_ask_chat"("p_chat" "uuid", "p_turns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."use_immunity"("p_assignment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."use_immunity"("p_assignment" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."use_immunity"("p_assignment" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."use_swap"("p_mine" "uuid", "p_theirs" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."use_swap"("p_mine" "uuid", "p_theirs" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."use_swap"("p_mine" "uuid", "p_theirs" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."user_can"("h" "uuid", "who" "uuid", "perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_can"("h" "uuid", "who" "uuid", "perm" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_house"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_house"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."week_index_at"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."week_index_at"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."week_starts_on"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."week_starts_on"("p_at" timestamp with time zone, "p_zone" "text", "p_week_starts" smallint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."wipe_house_data"("p_house" "uuid", "p_by" "uuid", "p_everything" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."write_back"("p_report" "uuid", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_back"("p_report" "uuid", "p_body" "text") TO "authenticated";
























GRANT ALL ON TABLE "public"."account_deletions" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."admin_audit_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."admin_audit_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."admin_audit_id_seq" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."api_approvals" TO "jonz_api";



GRANT INSERT ON TABLE "public"."api_audit_entries" TO "jonz_api";



GRANT UPDATE ON SEQUENCE "public"."api_audit_entries_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."api_audit_entries_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."api_audit_entries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."api_idempotency_keys" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."api_idempotency_keys" TO "jonz_api";



GRANT ALL ON TABLE "public"."api_rate_limits" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."api_rate_limits" TO "jonz_api";



GRANT ALL ON TABLE "public"."app_owners" TO "service_role";



GRANT ALL ON TABLE "public"."app_role_permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."app_role_permissions" TO "authenticated";



GRANT ALL ON TABLE "public"."ask_chats" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."ask_chats" TO "authenticated";



GRANT UPDATE("title") ON TABLE "public"."ask_chats" TO "authenticated";



GRANT UPDATE("turns") ON TABLE "public"."ask_chats" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."ask_chats" TO "authenticated";



GRANT ALL ON TABLE "public"."away_periods" TO "service_role";
GRANT SELECT ON TABLE "public"."away_periods" TO "authenticated";



GRANT SELECT ON TABLE "public"."connected_apps" TO "jonz_api";



GRANT ALL ON TABLE "public"."crew_members" TO "service_role";
GRANT SELECT ON TABLE "public"."crew_members" TO "authenticated";



GRANT ALL ON TABLE "public"."dispute_votes" TO "service_role";
GRANT SELECT ON TABLE "public"."dispute_votes" TO "authenticated";



GRANT ALL ON TABLE "public"."events" TO "service_role";
GRANT SELECT ON TABLE "public"."events" TO "authenticated";



GRANT ALL ON TABLE "public"."group_members" TO "service_role";
GRANT SELECT ON TABLE "public"."group_members" TO "authenticated";



GRANT ALL ON TABLE "public"."groups" TO "service_role";
GRANT SELECT ON TABLE "public"."groups" TO "authenticated";



GRANT ALL ON TABLE "public"."house_drafts" TO "service_role";



GRANT UPDATE("outcome") ON TABLE "public"."house_drafts" TO "service_role";



GRANT UPDATE("johns") ON TABLE "public"."house_drafts" TO "service_role";



GRANT UPDATE("input_tokens") ON TABLE "public"."house_drafts" TO "service_role";



GRANT UPDATE("output_tokens") ON TABLE "public"."house_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."house_pass_billing" TO "service_role";



GRANT ALL ON TABLE "public"."houses" TO "service_role";
GRANT SELECT ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("name") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("timezone") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("currency") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("week_starts") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("stake_minor") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("late_forfeit_minor") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("missed_forfeit_minor") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("dispute_hours") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("away_makeup") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("cover_grace_hours") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("late_hours") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("deal_mode") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("deal_budget") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("settle_in") ON TABLE "public"."houses" TO "authenticated";



GRANT UPDATE("pocket_cap_minor") ON TABLE "public"."houses" TO "authenticated";



GRANT ALL ON TABLE "public"."johns" TO "service_role";
GRANT SELECT ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("house_id") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("category"),UPDATE("category") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("points"),UPDATE("points") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("every_weeks"),UPDATE("every_weeks") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("anchor_week") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("due_dow"),UPDATE("due_dow") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("due_time"),UPDATE("due_time") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("needs_photo"),UPDATE("needs_photo") ON TABLE "public"."johns" TO "authenticated";



GRANT UPDATE("archived_at") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("group_id"),UPDATE("group_id") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("kind"),UPDATE("kind") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("respond_hours"),UPDATE("respond_hours") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("per_week"),UPDATE("per_week") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("every_months"),UPDATE("every_months") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("week_of_month"),UPDATE("week_of_month") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("anchor_month"),UPDATE("anchor_month") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("crew"),UPDATE("crew") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("keep_day"),UPDATE("keep_day") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("pay_minor"),UPDATE("pay_minor") ON TABLE "public"."johns" TO "authenticated";



GRANT INSERT("min_age"),UPDATE("min_age") ON TABLE "public"."johns" TO "authenticated";



GRANT ALL ON TABLE "public"."ledger_entries" TO "service_role";
GRANT SELECT ON TABLE "public"."ledger_entries" TO "authenticated";



GRANT UPDATE ON SEQUENCE "public"."ledger_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."live_changes" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."live_changes_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."live_changes_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."live_changes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "service_role";
GRANT SELECT ON TABLE "public"."members" TO "authenticated";



GRANT ALL ON TABLE "public"."month_closes" TO "service_role";
GRANT SELECT ON TABLE "public"."month_closes" TO "authenticated";



GRANT ALL ON TABLE "public"."month_let_offs" TO "service_role";
GRANT SELECT ON TABLE "public"."month_let_offs" TO "authenticated";



GRANT ALL ON TABLE "public"."moves" TO "service_role";
GRANT SELECT ON TABLE "public"."moves" TO "authenticated";



GRANT ALL ON TABLE "public"."moving_pass_billing" TO "service_role";



GRANT ALL ON TABLE "public"."notification_prefs" TO "service_role";
GRANT SELECT ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("user_id"),UPDATE("user_id") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("reminders"),UPDATE("reminders") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("checks"),UPDATE("checks") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("flags"),UPDATE("flags") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("deal"),UPDATE("deal") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("quiet_from"),UPDATE("quiet_from") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("quiet_until"),UPDATE("quiet_until") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("timezone"),UPDATE("timezone") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT INSERT("updated_at"),UPDATE("updated_at") ON TABLE "public"."notification_prefs" TO "authenticated";



GRANT ALL ON TABLE "public"."on_call_picks" TO "service_role";
GRANT SELECT ON TABLE "public"."on_call_picks" TO "authenticated";



GRANT ALL ON TABLE "public"."owner_ask_chats" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."owner_ask_chats" TO "authenticated";



GRANT UPDATE("title") ON TABLE "public"."owner_ask_chats" TO "authenticated";



GRANT UPDATE("turns") ON TABLE "public"."owner_ask_chats" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."owner_ask_turns" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."owner_ask_turns" TO "authenticated";
GRANT ALL ON TABLE "public"."owner_ask_turns" TO "service_role";



GRANT ALL ON TABLE "public"."owner_message_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."owner_messages" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."permissions" TO "authenticated";



GRANT ALL ON TABLE "public"."pocket_earnings" TO "service_role";
GRANT SELECT ON TABLE "public"."pocket_earnings" TO "authenticated";



GRANT ALL ON TABLE "public"."pocket_pays" TO "service_role";
GRANT SELECT ON TABLE "public"."pocket_pays" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("language") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."promotion_people" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_uses" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."push_subscriptions" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."push_subscriptions" TO "authenticated";



GRANT INSERT("endpoint") ON TABLE "public"."push_subscriptions" TO "authenticated";



GRANT INSERT("p256dh") ON TABLE "public"."push_subscriptions" TO "authenticated";



GRANT INSERT("auth") ON TABLE "public"."push_subscriptions" TO "authenticated";



GRANT ALL ON TABLE "public"."reactions" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."reactions" TO "authenticated";



GRANT INSERT("event_id") ON TABLE "public"."reactions" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."reactions" TO "authenticated";



GRANT INSERT("kind") ON TABLE "public"."reactions" TO "authenticated";



GRANT ALL ON TABLE "public"."report_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."report_messages" TO "authenticated";



GRANT UPDATE ON SEQUENCE "public"."report_messages_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."report_messages_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."report_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."role_permissions" TO "authenticated";



GRANT ALL ON TABLE "public"."swap_offers" TO "service_role";
GRANT SELECT ON TABLE "public"."swap_offers" TO "authenticated";



GRANT ALL ON TABLE "public"."week_group_shares" TO "service_role";
GRANT SELECT ON TABLE "public"."week_group_shares" TO "authenticated";



GRANT ALL ON TABLE "public"."week_shares" TO "service_role";
GRANT SELECT ON TABLE "public"."week_shares" TO "authenticated";



GRANT ALL ON TABLE "public"."weeks" TO "service_role";
GRANT SELECT ON TABLE "public"."weeks" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_identity_photo" AFTER INSERT OR UPDATE OF "identity_data" ON "auth"."identities" FOR EACH ROW EXECUTE FUNCTION "public"."follow_identity_photo"();



CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE POLICY "connected apps change no files" ON "storage"."objects" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT COALESCE((( SELECT "auth"."jwt"() AS "jwt") ? 'client_id'::"text"), false)));



CREATE POLICY "connected apps delete no files" ON "storage"."objects" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((NOT COALESCE((( SELECT "auth"."jwt"() AS "jwt") ? 'client_id'::"text"), false)));



CREATE POLICY "connected apps replace no files" ON "storage"."objects" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT COALESCE((( SELECT "auth"."jwt"() AS "jwt") ? 'client_id'::"text"), false)));



CREATE POLICY "housemates see proofs" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'proofs'::"text") AND "public"."is_member"("public"."proof_house"("name"))));



CREATE POLICY "replace your own photo" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text"))) WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "see your own photo" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "see your screenshots, or any as the owner" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'report-shots'::"text") AND ((("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text") OR ( SELECT "public"."can_app"('admin:read'::"text") AS "can_app"))));



CREATE POLICY "upload a proof for your own John" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'proofs'::"text") AND "public"."can_upload_proof"("name")));



CREATE POLICY "upload screenshots for a report" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'report-shots'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "upload your own photo" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));

-- ---------------------------------------------------------------------------
-- What the schema alone doesn't carry: a setting on a role, the rows the app
-- can't run without (what each role may do, the storage buckets) and the
-- scheduled jobs.
-- ---------------------------------------------------------------------------
alter role authenticator set pgrst.db_pre_request = 'public.api_pre_request';

insert into public.permissions (name, about, scope) values ('ticks:write_own', 'Tick off your own Johns, and take a tick back', 'house');
insert into public.permissions (name, about, scope) values ('away:write_own', 'Book and cancel your own time away', 'house');
insert into public.permissions (name, about, scope) values ('swaps:write_own', 'Ask someone to swap a John, answer a swap ask, and cover someone else''s overdue John', 'house');
insert into public.permissions (name, about, scope) values ('flags:write_own', 'Flag an on-call John, and take back your own flag', 'house');
insert into public.permissions (name, about, scope) values ('disputes:write_own', 'Question a tick, and vote on one', 'house');
insert into public.permissions (name, about, scope) values ('wall:write_own', 'React on the Wall', 'house');
insert into public.permissions (name, about, scope) values ('perks:write_own', 'Use an immunity or a swap token', 'house');
insert into public.permissions (name, about, scope) values ('profile:write_own', 'Change your own name, photo, notification settings and preferences', 'house');
insert into public.permissions (name, about, scope) values ('members:write_own', 'Leave the house', 'house');
insert into public.permissions (name, about, scope) values ('house:write', 'Change the house''s name and rules, and make a new join code', 'house');
insert into public.permissions (name, about, scope) values ('johns:write', 'Add Johns to the list, change them, and take them off', 'house');
insert into public.permissions (name, about, scope) values ('groups:write', 'Make, change and delete groups', 'house');
insert into public.permissions (name, about, scope) values ('weeks:write', 'Deal the week', 'house');
insert into public.permissions (name, about, scope) values ('history:write', 'Put a result, a week or a month''s forfeits right, and undo anyone''s move from History', 'house');
insert into public.permissions (name, about, scope) values ('flags:write', 'Remove anyone''s flag', 'house');
insert into public.permissions (name, about, scope) values ('ticks:write', 'OK a kid''s tick, or send it back', 'house');
insert into public.permissions (name, about, scope) values ('pocket_money:write', 'Mark pocket money paid', 'house');
insert into public.permissions (name, about, scope) values ('members:write', 'Remove someone from the house, make someone an admin or hand admin over, and add a child without a sign-in and act for them', 'house');
insert into public.permissions (name, about, scope) values ('admin:read', 'See every admin page: Overview, Inbox, Houses, Messages, Notices, Promotions, Deletions and the audit log', 'app');
insert into public.permissions (name, about, scope) values ('reports:write', 'Reply to a report (its sender gets a push and an email), mark it fixed or open it again, and fold it into one that says the same thing', 'app');
insert into public.permissions (name, about, scope) values ('notices:write', 'Put up a notice, change one, or end one', 'app');
insert into public.permissions (name, about, scope) values ('messages:write', 'Send a message to a person, a house or everyone, by push, the Wall or email', 'app');
insert into public.permissions (name, about, scope) values ('promotions:write', 'Make a promotion, stop one, email the people it names, or try its Stripe set-up again', 'app');
insert into public.permissions (name, about, scope) values ('deletions:write', 'Delete an account now, stop a deletion, or start one for someone who asked by email', 'app');
insert into public.permissions (name, about, scope) values ('history:write_own', 'Undo your own moves from History', 'house');
insert into public.permissions (name, about, scope) values ('payments:write_own', 'Mark money paid between housemates', 'house');
insert into public.permissions (name, about, scope) values ('billing:write_own', 'Buy the House Pass, and open billing for one you bought', 'house');
insert into public.permissions (name, about, scope) values ('house:read', 'See the house itself: its name, rules and settings', 'house');
insert into public.permissions (name, about, scope) values ('johns:read', 'See the John list', 'house');
insert into public.permissions (name, about, scope) values ('weeks:read', 'See the weeks: who has which John, shares, who is on call and who helped', 'house');
insert into public.permissions (name, about, scope) values ('away:read', 'See who is away', 'house');
insert into public.permissions (name, about, scope) values ('disputes:read', 'See questioned ticks and their votes', 'house');
insert into public.permissions (name, about, scope) values ('wall:read', 'See the Wall and its reactions', 'house');
insert into public.permissions (name, about, scope) values ('groups:read', 'See the groups and who is in them', 'house');
insert into public.permissions (name, about, scope) values ('history:read', 'See the house''s history', 'house');
insert into public.permissions (name, about, scope) values ('payments:read', 'See money owed and paid, and closed months', 'house');
insert into public.permissions (name, about, scope) values ('pocket_money:read', 'See pocket money earned and paid', 'house');
insert into public.permissions (name, about, scope) values ('members:read', 'See who lives in the house, and their roles', 'house');
insert into public.permissions (name, about, scope) values ('houses:write', 'Reset or delete a whole house: everyone in it is told, and it can''t be undone', 'app');
insert into public.permissions (name, about, scope) values ('house_reset:write', 'Reset the house''s history, or everything in it, back to before its first deal: it can''t be undone', 'house');

insert into public.role_permissions (role, permission) values ('member', 'wall:write_own');
insert into public.role_permissions (role, permission) values ('member', 'house:read');
insert into public.role_permissions (role, permission) values ('admin', 'history:write');
insert into public.role_permissions (role, permission) values ('member', 'flags:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'flags:write_own');
insert into public.role_permissions (role, permission) values ('member', 'profile:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'flags:write');
insert into public.role_permissions (role, permission) values ('admin', 'profile:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'members:write');
insert into public.role_permissions (role, permission) values ('admin', 'disputes:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'swaps:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'members:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'house:write');
insert into public.role_permissions (role, permission) values ('admin', 'johns:write');
insert into public.role_permissions (role, permission) values ('member', 'ticks:write_own');
insert into public.role_permissions (role, permission) values ('member', 'members:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'groups:write');
insert into public.role_permissions (role, permission) values ('admin', 'house:read');
insert into public.role_permissions (role, permission) values ('admin', 'weeks:write');
insert into public.role_permissions (role, permission) values ('member', 'away:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'away:write_own');
insert into public.role_permissions (role, permission) values ('member', 'swaps:write_own');
insert into public.role_permissions (role, permission) values ('member', 'perks:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'ticks:write');
insert into public.role_permissions (role, permission) values ('admin', 'pocket_money:write');
insert into public.role_permissions (role, permission) values ('admin', 'perks:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'ticks:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'wall:write_own');
insert into public.role_permissions (role, permission) values ('member', 'disputes:write_own');
insert into public.role_permissions (role, permission) values ('member', 'history:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'history:write_own');
insert into public.role_permissions (role, permission) values ('member', 'payments:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'payments:write_own');
insert into public.role_permissions (role, permission) values ('member', 'billing:write_own');
insert into public.role_permissions (role, permission) values ('admin', 'billing:write_own');
insert into public.role_permissions (role, permission) values ('member', 'johns:read');
insert into public.role_permissions (role, permission) values ('admin', 'johns:read');
insert into public.role_permissions (role, permission) values ('member', 'weeks:read');
insert into public.role_permissions (role, permission) values ('admin', 'weeks:read');
insert into public.role_permissions (role, permission) values ('member', 'away:read');
insert into public.role_permissions (role, permission) values ('admin', 'away:read');
insert into public.role_permissions (role, permission) values ('member', 'disputes:read');
insert into public.role_permissions (role, permission) values ('admin', 'disputes:read');
insert into public.role_permissions (role, permission) values ('member', 'wall:read');
insert into public.role_permissions (role, permission) values ('admin', 'wall:read');
insert into public.role_permissions (role, permission) values ('member', 'groups:read');
insert into public.role_permissions (role, permission) values ('admin', 'groups:read');
insert into public.role_permissions (role, permission) values ('member', 'history:read');
insert into public.role_permissions (role, permission) values ('admin', 'history:read');
insert into public.role_permissions (role, permission) values ('member', 'payments:read');
insert into public.role_permissions (role, permission) values ('admin', 'payments:read');
insert into public.role_permissions (role, permission) values ('member', 'pocket_money:read');
insert into public.role_permissions (role, permission) values ('admin', 'pocket_money:read');
insert into public.role_permissions (role, permission) values ('member', 'members:read');
insert into public.role_permissions (role, permission) values ('admin', 'members:read');
insert into public.role_permissions (role, permission) values ('admin', 'house_reset:write');

insert into public.app_role_permissions (role, permission) values ('owner', 'admin:read');
insert into public.app_role_permissions (role, permission) values ('owner', 'reports:write');
insert into public.app_role_permissions (role, permission) values ('owner', 'notices:write');
insert into public.app_role_permissions (role, permission) values ('owner', 'messages:write');
insert into public.app_role_permissions (role, permission) values ('owner', 'promotions:write');
insert into public.app_role_permissions (role, permission) values ('owner', 'deletions:write');
insert into public.app_role_permissions (role, permission) values ('support', 'admin:read');
insert into public.app_role_permissions (role, permission) values ('support', 'reports:write');
insert into public.app_role_permissions (role, permission) values ('owner', 'houses:write');

insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, type) values ('proofs', 'proofs', false, false, 5242880, '{image/jpeg,image/png,image/webp}', 'STANDARD');
insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, type) values ('report-shots', 'report-shots', false, false, 5242880, '{image/jpeg}', 'STANDARD');
insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, type) values ('avatars', 'avatars', false, false, 1048576, '{image/jpeg,image/png}', 'STANDARD');

select cron.schedule('johns-tick', '*/10 * * * *', 'select public.request_tick()');
select cron.schedule('tidy-api-bookkeeping', '7 * * * *', 'select public.tidy_api_bookkeeping()');
