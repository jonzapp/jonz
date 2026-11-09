-- The house's reads as database functions (docs/specs/api.md, step C2): one
-- call each for what the app reads today with several table queries. Each is
-- security invoker, so Row Level Security still decides every row: a row the
-- person can't see is left out, as it was from the app's own queries. A house
-- they can't see answers null (404 on /v1).

-- --- Today: the house, its people and this week ---------------------------------------------

create function public.house_today(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.house_today(uuid) is 'One read of a house: its rules and people, this week, its Johns (and any still open from before), open disputes, who is on call, open swap asks, and when someone last moved out or in.';

-- --- The John list ----------------------------------------------------------------------------

create function public.john_list(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.john_list(uuid) is 'The house''s list of Johns, oldest first, and its groups with who is in each.';

-- --- The Wall ---------------------------------------------------------------------------------

-- Newest first, a page at a time: rows after the cursor (p_cursor_at, p_cursor_id).
create function public.house_wall(
  p_house uuid,
  p_limit integer,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  kind text,
  user_id uuid,
  assignment_id uuid,
  data jsonb,
  created_at timestamptz,
  photo_path text,
  reactions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.house_wall(uuid, integer, timestamptz, uuid) is 'The Wall, newest first, a page at a time, with each post''s photo and reactions.';

-- --- Who's away -------------------------------------------------------------------------------

create function public.house_away(p_house uuid, p_from date)
returns setof jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('id', a.id, 'user_id', a.user_id, 'starts_on', a.starts_on, 'ends_on', a.ends_on, 'note', a.note)
  from public.away_periods a
  where a.house_id = p_house and a.ends_on >= p_from
  order by a.starts_on, a.id;
$$;
comment on function public.house_away(uuid, date) is 'Who is away, for times that end on or after a day.';

-- --- The month's table ------------------------------------------------------------------------

create function public.house_month(p_house uuid, p_month text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.house_month(uuid, text) is 'A month''s Johns for the table, the usual weeks'' shares before this one, and every earlier week summed.';

-- --- Track record -----------------------------------------------------------------------------

create function public.house_record(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.house_record(uuid) is 'Every week, time away, share and John the house has had, for its track record.';

-- --- Money ------------------------------------------------------------------------------------

create function public.house_stake(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.house_stake(uuid) is 'The house''s money: every forfeit, payment and credit, newest first, and the months closed.';

create function public.house_pocket(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
comment on function public.house_pocket(uuid) is 'In a family: what each kid has earned each month, and what they''ve been paid.';

-- --- Who can call them ------------------------------------------------------------------------

revoke all on function public.house_today(uuid) from public, anon;
revoke all on function public.john_list(uuid) from public, anon;
revoke all on function public.house_wall(uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.house_away(uuid, date) from public, anon;
revoke all on function public.house_month(uuid, text) from public, anon;
revoke all on function public.house_record(uuid) from public, anon;
revoke all on function public.house_stake(uuid) from public, anon;
revoke all on function public.house_pocket(uuid) from public, anon;

grant execute on function public.house_today(uuid) to authenticated;
grant execute on function public.john_list(uuid) to authenticated;
grant execute on function public.house_wall(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.house_away(uuid, date) to authenticated;
grant execute on function public.house_month(uuid, text) to authenticated;
grant execute on function public.house_record(uuid) to authenticated;
grant execute on function public.house_stake(uuid) to authenticated;
grant execute on function public.house_pocket(uuid) to authenticated;
