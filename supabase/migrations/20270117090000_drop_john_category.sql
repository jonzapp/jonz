-- Each John's older category goes (docs/specs/john-kinds.md). #259 kept it
-- in step from the John's kind, for an app or assistant still writing it;
-- now a John's kind is its john_kind_id alone, and nothing reads or writes
-- a category: not the app, Ask Jonz, /v1 or the assistants. A dealt John
-- (assignments) no longer keeps a copy either: its lid is its John's kind's
-- colour, or grey when it has none. Glyn's pick, 14 November 2026.
--
-- A John written without a kind now has none (it sits under No kind until
-- an admin gives it one); before, it went in Everything else.

-- --- The old field and what kept it -----------------------------------------------------------

drop trigger johns_kind_kept on public.johns;
drop function public.john_kind_kept();
drop function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint);
drop function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint);
drop function public.john_kind_for(uuid, uuid, text, text);

alter table public.johns drop column category;
alter table public.assignments drop column category;

comment on column public.john_kinds.preset is 'Which of the six starting kinds it began as: a starter list''s Johns go in it. Null for a kind the house made.';

-- --- Writing a John with its kind --------------------------------------------------------------

-- The kind a John is written with: one of the house's by id, or one by name
-- (made, in the next free colour, if the house has none by that name). Null
-- when given neither.
create function public.john_kind_for(p_house uuid, p_kind uuid, p_kind_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k uuid;
  taken text[];
begin
  if p_kind is not null then
    select x.id into k from public.john_kinds x where x.id = p_kind and x.house_id = p_house;
    if k is null then
      raise exception 'unknown_kind' using errcode = '22023';
    end if;
    return k;
  end if;
  if nullif(btrim(p_kind_name), '') is not null then
    select x.id into k from public.john_kinds x
    where x.house_id = p_house and lower(x.name) = lower(btrim(p_kind_name));
    if k is null then
      select coalesce(array_agg(x.colour), '{}') into taken from public.john_kinds x where x.house_id = p_house;
      k := public.add_kind(p_house, p_kind_name, coalesce(
        (select c from unnest(public.kind_colours()) with ordinality as u (c, n) where c <> all (taken) order by n limit 1),
        (public.kind_colours())[cardinality(taken) % cardinality(public.kind_colours()) + 1]
      ));
    end if;
  end if;
  return k;
end;
$$;
comment on function public.john_kind_for(uuid, uuid, text) is 'The kind a John is written with, by id or by name (made if new).';

create or replace function public.john_columns(p_house uuid, p_john jsonb, p_at timestamp with time zone)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name', p_john ->> 'name',
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

create or replace function public.add_johns(p_house uuid, p_johns jsonb)
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
  perform public.check_can(p_house, 'johns:write');
  for j in select value from jsonb_array_elements(p_johns) with ordinality order by ordinality loop
    c := public.john_columns(p_house, j, now());
    if c is null then
      raise exception 'admins_only' using errcode = '42501';
    end if;
    insert into public.johns (house_id, anchor_week, name, john_kind_id, points, every_weeks, every_months,
                              week_of_month, anchor_month, due_dow, due_time, needs_photo, group_id, kind, respond_hours,
                              per_week, crew, keep_day, pay_minor, min_age)
    values (p_house, (c ->> 'anchor_week')::int, c ->> 'name',
            public.john_kind_for(p_house, (j ->> 'kindId')::uuid, j ->> 'kindName'), (c ->> 'points')::smallint,
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

create function public.add_john(
  p_house uuid,
  p_name text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_kind uuid default null,
  p_kind_name text default null,
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
    'name', p_name, 'kindId', p_kind, 'kindName', p_kind_name, 'points', p_points,
    'everyWeeks', p_every_weeks, 'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month,
    'anchorMonth', p_anchor_month, 'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo,
    'groupId', p_group, 'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew,
    'keepDay', p_keep_day, 'payMinor', p_pay_minor, 'minAge', p_min_age
  ))));
$$;
comment on function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) is 'Add a John to the list, counting from this week; gives its id.';

-- Changes apply from the next deal. Its week (anchor_week) is kept; its
-- kind, pay and the youngest age stay as they are when not given.
create function public.change_john(
  p_john uuid,
  p_name text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_kind uuid default null,
  p_kind_name text default null,
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
  h uuid := (select j.house_id from public.johns j where j.id = p_john);
  c jsonb;
  k uuid;
begin
  perform public.check_can(h, 'johns:write');
  c := public.john_columns(h, jsonb_build_object(
    'name', p_name, 'points', p_points, 'everyWeeks', p_every_weeks,
    'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month, 'anchorMonth', p_anchor_month,
    'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo, 'groupId', p_group,
    'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew, 'keepDay', p_keep_day
  ), now());
  k := public.john_kind_for(h, p_kind, p_kind_name);

  update public.johns
  set name = c ->> 'name',
      john_kind_id = coalesce(k, john_kind_id),
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
comment on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) is 'Change a John on the list, from the next deal.';

-- --- Dealing and flagging ----------------------------------------------------------------------

create or replace function public.deal_week(p_house uuid, p_starts_on date, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_assignments jsonb, p_shares jsonb, p_replace boolean default false, p_on_call jsonb default '[]'::jsonb, p_state jsonb default null::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    (week_id, house_id, john_id, user_id, name, points, needs_photo, due_at, group_name, dealt, job_id)
  select week, p_house, (x ->> 'john_id')::uuid, (x ->> 'user_id')::uuid, x ->> 'name',
         (x ->> 'points')::smallint, coalesce((x ->> 'needs_photo')::boolean, false),
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

create or replace function public.open_flag(p_john uuid, p_at timestamp with time zone, p_by uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    (week_id, house_id, john_id, user_id, name, points, needs_photo, due_at,
     group_name, flagged_by, flagged_at, reminded)
  values
    (w.id, j.house_id, j.id, holder, j.name, j.points, j.needs_photo,
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

-- --- Reading the list --------------------------------------------------------------------------

create or replace function public.john_list(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can(p_house, 'johns:read');
  select jsonb_build_object(
    'johns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'name', j.name, 'john_kind_id', j.john_kind_id, 'points', j.points,
        'every_weeks', j.every_weeks, 'every_months', j.every_months, 'week_of_month', j.week_of_month,
        'anchor_month', j.anchor_month, 'anchor_week', j.anchor_week, 'due_dow', j.due_dow, 'due_time', j.due_time,
        'needs_photo', j.needs_photo, 'group_id', j.group_id, 'kind', j.kind, 'respond_hours', j.respond_hours,
        'per_week', j.per_week, 'crew', j.crew, 'keep_day', j.keep_day, 'pay_minor', j.pay_minor, 'min_age', j.min_age
      ) order by j.created_at, j.id)
      from public.johns j
      where j.house_id = p_house and j.archived_at is null
    ), '[]'::jsonb),
    'kinds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'colour', k.colour, 'position', k.position, 'preset', k.preset
      ) order by k.position, k.created_at, k.id)
      from public.john_kinds k
      where k.house_id = p_house
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
comment on function public.john_list(uuid) is 'The house''s list of Johns, oldest first, its kinds in order, and its groups with who is in each.';

-- Each John dealt (and each on call) says its kind as the list has it now.
create or replace function public.house_today(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
        -- '' for a John with no kind; null when the John is gone.
        'kind_name', case when j.id is not null then coalesce(k.name, '') end,
        'kind_colour', k.colour,
        'crew', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'helper', c.helper, 'points', c.points))
          from public.crew_members c where c.assignment_id = d.id
        ), '[]'::jsonb)
      ) order by d.part, case when d.part = 0 then d.due_at end, d.id)
      from dealt d
      left join public.johns j on j.id = d.john_id
      left join public.john_kinds k on k.id = j.john_kind_id
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
        'john', case when j.id is null then null else jsonb_build_object(
          'name', j.name, 'kind_name', coalesce(k.name, ''), 'kind_colour', k.colour,
          'needs_photo', j.needs_photo, 'archived_at', j.archived_at
        ) end
      ) order by o.john_id, o.user_id)
      from public.on_call_picks o join w on o.week_id = w.id
      left join public.johns j on j.id = o.john_id
      left join public.john_kinds k on k.id = j.john_kind_id
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

-- --- Starting again ----------------------------------------------------------------------------

-- A house started from an old one takes its kinds, and its Johns in the
-- kind of the same name; a John with no kind comes with none.
create or replace function public.start_house_from(p_from uuid, p_name text, p_timezone text, p_currency text, p_week_starts smallint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  delete from public.john_kinds where house_id = house;
  insert into public.john_kinds (house_id, name, colour, position, preset)
  select house, k.name, k.colour, k.position, k.preset
  from public.john_kinds k
  where k.house_id = p_from;
  insert into public.johns (
    house_id, name, john_kind_id, points, every_weeks, anchor_week, every_months, anchor_month,
    week_of_month, due_dow, due_time, needs_photo, kind, respond_hours, per_week, crew, keep_day, pay_minor
  )
  select house, j.name, nk.id, j.points, j.every_weeks, j.anchor_week, j.every_months, j.anchor_month,
    j.week_of_month, j.due_dow, j.due_time, j.needs_photo, j.kind, j.respond_hours, j.per_week, j.crew, j.keep_day, j.pay_minor
  from public.johns j
  left join public.john_kinds ok on ok.id = j.john_kind_id
  left join public.john_kinds nk on nk.house_id = house and nk.name = ok.name
  where j.house_id = p_from and j.archived_at is null
  order by j.created_at;
  update public.moves set how = 'copied'
  where user_id = me and to_house_id = house;
  return house;
end;
$$;

-- --- Who may call them -------------------------------------------------------------------------

revoke all on function public.john_kind_for(uuid, uuid, text) from public, anon;
revoke all on function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) from public, anon;
revoke all on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) from public, anon;

grant execute on function public.john_kind_for(uuid, uuid, text) to authenticated;
grant execute on function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) to authenticated;
grant execute on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) to authenticated;
