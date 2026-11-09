-- The house's own writes as database functions (docs/specs/api.md, step C2):
-- reactions on the Wall, the John list, and the house rules. Each does what
-- the app's own table writes do today, and is security invoker, so Row Level
-- Security and the column grants still decide.

-- --- When a John comes round ----------------------------------------------------------------
-- The same sums as packages/core (week.ts weekIndex/weekWindow, repeat.ts
-- repeatColumns/startMonths); apps/v1/tests/db/house-writes.test.ts checks
-- the two agree across time zones, week starts and months.

-- weekIndex of the week `p_at` falls in, in the house's time zone: weeks since Monday 5 January 1970.
create function public.week_index_at(p_at timestamptz, p_zone text, p_week_starts smallint)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select floor(((d - ((extract(isodow from d)::int - p_week_starts + 7) % 7)) - date '1970-01-05')::numeric / 7)::int
  from (select (p_at at time zone p_zone)::date as d) local;
$$;
comment on function public.week_index_at(timestamptz, text, smallint) is 'Which week (weeks since 5 Jan 1970) a moment falls in, in a time zone and with a week start: core weekIndex(weekWindow(...)).';

-- The first month a monthly John lands in, from the week after the one `p_at`
-- is in (that week is already dealt): core startMonths(...)[0].month, a
-- monthIndex (year * 12 + month - 1). Null when it never lands in 80 weeks.
create function public.first_john_month(
  p_at timestamptz,
  p_zone text,
  p_week_starts smallint,
  p_week_of_month smallint,
  p_due_dow smallint
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with this_week as (
    select d - ((extract(isodow from d)::int - p_week_starts + 7) % 7) as starts_on
    from (select (p_at at time zone p_zone)::date as d) local
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
comment on function public.first_john_month(timestamptz, text, smallint, smallint, smallint) is 'The month (year * 12 + month - 1) a new monthly John starts in: core startMonths(...)[0].month.';

-- --- Reactions --------------------------------------------------------------------------------

-- A second tap that raced the first is already what was asked for.
create function public.react(p_event uuid, p_kind text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.reactions (event_id, kind) values (p_event, p_kind)
  on conflict do nothing;
$$;
comment on function public.react(uuid, text) is 'React to something on the Wall.';

create function public.unreact(p_event uuid, p_kind text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.reactions where event_id = p_event and user_id = (select auth.uid()) and kind = p_kind;
$$;
comment on function public.unreact(uuid, text) is 'Take back your reaction.';

-- --- The John list ----------------------------------------------------------------------------

-- One John's columns from its fields, as the app's saveJohn writes them: a
-- monthly John keeps its month or starts from the first it lands in after
-- this week; a weekly one clears the monthly columns. On call is always one
-- person and has no day to keep.
create function public.john_columns(p_house uuid, p_john jsonb, p_at timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.john_columns(uuid, jsonb, timestamptz) is 'A John''s table columns from its fields (camelCase, as /v1 takes them), timed in its house''s zone.';

-- Every John added at once, in order, counting from this week: all or none.
create function public.add_johns(p_house uuid, p_johns jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j jsonb;
  c jsonb;
  new_id uuid;
begin
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
comment on function public.add_johns(uuid, jsonb) is 'Add several Johns at once, all or none; gives their ids in order.';

create function public.add_john(
  p_house uuid,
  p_name text,
  p_category text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_every_months smallint default null,
  p_week_of_month smallint default null,
  p_anchor_month integer default null,
  p_anchor_week integer default null,
  p_when text default 'day',
  p_respond_hours smallint default 12,
  p_per_week smallint default 2,
  p_crew smallint default 1,
  p_keep_day boolean default false,
  p_pay_minor integer default null,
  p_min_age smallint default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.add_johns(p_house, jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'name', p_name, 'category', p_category, 'points', p_points, 'everyWeeks', p_every_weeks,
    'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month, 'anchorMonth', p_anchor_month,
    'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo, 'groupId', p_group,
    'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew,
    'keepDay', p_keep_day, 'payMinor', p_pay_minor, 'minAge', p_min_age
  ))));
$$;
comment on function public.add_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) is 'Add a John to the list, counting from this week; gives its id.';

-- Changes apply from the next deal. Its week (anchor_week) is kept; pay and
-- the youngest age stay as they are when not given.
create function public.change_john(
  p_john uuid,
  p_name text,
  p_category text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_every_months smallint default null,
  p_week_of_month smallint default null,
  p_anchor_month integer default null,
  p_anchor_week integer default null,
  p_when text default 'day',
  p_respond_hours smallint default 12,
  p_per_week smallint default 2,
  p_crew smallint default 1,
  p_keep_day boolean default false,
  p_pay_minor integer default null,
  p_min_age smallint default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c jsonb;
begin
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
comment on function public.change_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) is 'Change a John on the list, from the next deal.';

create function public.remove_john(p_john uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.johns set archived_at = now() where id = p_john and archived_at is null;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;
comment on function public.remove_john(uuid) is 'Take a John off the list; weeks already dealt keep it.';

-- --- The house rules --------------------------------------------------------------------------

-- A rule left out (an older form that doesn't show it) stays as it is.
create function public.save_house_rules(
  p_house uuid,
  p_name text,
  p_timezone text,
  p_currency text,
  p_week_starts smallint,
  p_stake_minor integer,
  p_late_forfeit_minor integer,
  p_missed_forfeit_minor integer,
  p_dispute_hours smallint,
  p_away_makeup smallint,
  p_cover_grace_hours smallint default null,
  p_late_hours smallint default null,
  p_settle_in text default null,
  p_deal_mode text default null,
  p_deal_budget smallint default null,
  p_pocket_cap_minor integer default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
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
comment on function public.save_house_rules(uuid, text, text, text, smallint, integer, integer, integer, smallint, smallint, smallint, smallint, text, text, smallint, integer) is 'Change the house''s name and rules.';

create function public.set_deal_mode(p_house uuid, p_mode text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.houses set deal_mode = p_mode where id = p_house;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;
comment on function public.set_deal_mode(uuid, text) is 'Choose how the house shares its Johns: Smart or Classic.';

-- --- Who can call them ------------------------------------------------------------------------

revoke all on function public.week_index_at(timestamptz, text, smallint) from public, anon;
revoke all on function public.first_john_month(timestamptz, text, smallint, smallint, smallint) from public, anon;
revoke all on function public.john_columns(uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.react(uuid, text) from public, anon;
revoke all on function public.unreact(uuid, text) from public, anon;
revoke all on function public.add_johns(uuid, jsonb) from public, anon;
revoke all on function public.add_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) from public, anon;
revoke all on function public.change_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) from public, anon;
revoke all on function public.remove_john(uuid) from public, anon;
revoke all on function public.save_house_rules(uuid, text, text, text, smallint, integer, integer, integer, smallint, smallint, smallint, smallint, text, text, smallint, integer) from public, anon;
revoke all on function public.set_deal_mode(uuid, text) from public, anon;

grant execute on function public.week_index_at(timestamptz, text, smallint) to authenticated;
grant execute on function public.first_john_month(timestamptz, text, smallint, smallint, smallint) to authenticated;
grant execute on function public.john_columns(uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.react(uuid, text) to authenticated;
grant execute on function public.unreact(uuid, text) to authenticated;
grant execute on function public.add_johns(uuid, jsonb) to authenticated;
grant execute on function public.add_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) to authenticated;
grant execute on function public.change_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) to authenticated;
grant execute on function public.remove_john(uuid) to authenticated;
grant execute on function public.save_house_rules(uuid, text, text, text, smallint, integer, integer, integer, smallint, smallint, smallint, smallint, text, text, smallint, integer) to authenticated;
grant execute on function public.set_deal_mode(uuid, text) to authenticated;
