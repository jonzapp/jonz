-- The owner's Overview and Houses (docs/specs/owner-admin.md, "Overview"
-- and "Houses").
--
-- Overview: is Jonz healthy, and does anything need the owner? One read
-- answers it: what's waiting (new reports, deletions due within a day), the
-- clock's last tick, a window's totals and ten weeks of active houses.
--
-- Houses: every house as a busy list (search, three filters, keyset paging
-- and a count), and one house's people and Pass, read only. Nothing here
-- changes a house, so nothing is written to the audit log.

-- Finding a house's last tick and its on-time share without reading every
-- assignment it ever had.
create index if not exists assignments_house_done on public.assignments (house_id, done_at desc) where done_at is not null;
create index if not exists assignments_house_due on public.assignments (house_id, due_at desc);

-- --- Overview ---------------------------------------------------------------------------

-- Totals over the last p_days days (7 or 30), and the weeks before for the
-- trend. "Active" is a house where someone ticked a John in the window.
-- On time counts Johns that came due in the window and were settled: done
-- or covered is on time, late and missed aren't, excused doesn't count.
create function public.owner_overview(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  days integer := case when p_days = 30 then 30 else 7 end;
  since timestamptz := now() - make_interval(days => days);
  before timestamptz := now() - make_interval(days => days * 2);
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'days', days,
    'houses', (select count(*) from public.houses),
    'housesNew', (select count(*) from public.houses where created_at > since),
    'housesNewBefore', (select count(*) from public.houses where created_at > before and created_at <= since),
    'people', (select count(*) from public.profiles where deleted_at is null),
    'inHouses', (select count(distinct m.user_id) from public.members m),
    'active', (select count(distinct a.house_id) from public.assignments a where a.done_at > since),
    'passes', (
      select jsonb_build_object(
        'monthly', count(*) filter (where pass_plan = 'monthly'),
        'yearly', count(*) filter (where pass_plan = 'yearly'),
        'founding', count(*) filter (where pass_plan = 'founding'),
        'trial', count(*) filter (where pass_plan = 'trial')
      )
      from public.houses
      where pass_until is null or pass_until > now()
    ),
    'onTime', (
      select jsonb_build_object(
        'onTime', count(*) filter (where outcome in ('done', 'covered')),
        'late', count(*) filter (where outcome = 'late'),
        'missed', count(*) filter (where outcome = 'missed')
      )
      from public.assignments
      where due_at > since and due_at <= now() and outcome in ('done', 'covered', 'late', 'missed')
    ),
    'ask', (
      select jsonb_build_object(
        'turns', count(*),
        'failed', count(*) filter (where outcome = 'failed')
      )
      from public.house_drafts
      where created_at > since
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
            'house', h.name, 'at', d.delete_after
          )
          from public.account_deletions d
          join public.profiles p on p.id = d.user_id
          left join public.members m on m.user_id = d.user_id
          left join public.houses h on h.id = m.house_id
          where d.state = 'pending' and d.delete_after <= now() + interval '1 day'
          order by d.delete_after
          limit 3
        )
      ) x
    )
  ) into result;
  return result;
end;
$$;

-- --- Houses -----------------------------------------------------------------------------

-- Every house that matches: the words (its name, an id or join code that
-- starts with them, or someone in it by name or email), its Pass (paid,
-- trial, none), how lately it was used (this week, this month, quiet for a
-- month), and when it started.
create function public.owner_houses_match(
  p_q text default '',
  p_pass text default null,
  p_active text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns table (
  id uuid,
  name text,
  join_code text,
  people bigint,
  pass_plan text,
  pass_until timestamptz,
  last_active timestamptz,
  on_time bigint,
  settled bigint,
  created_at timestamptz,
  sort_at timestamptz
)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select h.id, h.name, h.join_code,
      (select count(*) from public.members m where m.house_id = h.id),
      h.pass_plan, h.pass_until, l.last_active, t.on_time, t.settled, h.created_at,
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
        or (p_pass = 'paid' and h.pass_plan in ('monthly', 'yearly', 'founding') and (h.pass_until is null or h.pass_until > now()))
        or (p_pass = 'trial' and h.pass_plan = 'trial' and h.pass_until > now())
        or (p_pass = 'none' and h.pass_until <= now()))
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

-- A page of them, most recently active first (never-used houses last), after
-- the last one shown (its sort_at and id).
create function public.owner_houses_page(
  p_q text default '',
  p_pass text default null,
  p_active text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns table (
  id uuid,
  name text,
  join_code text,
  people bigint,
  pass_plan text,
  pass_until timestamptz,
  last_active timestamptz,
  on_time bigint,
  settled bigint,
  created_at timestamptz,
  sort_at timestamptz
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return query
    select f.*
    from public.owner_houses_match(p_q, p_pass, p_active, p_after, p_before) f
    where p_cursor_at is null or (f.sort_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.sort_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;

-- How many match.
create function public.owner_houses_count(
  p_q text default '',
  p_pass text default null,
  p_active text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns bigint
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return (select count(*) from public.owner_houses_match(p_q, p_pass, p_active, p_after, p_before));
end;
$$;

-- One house, read only: its settings that matter for support, its Pass and
-- who pays, and each person with their role, on-time share over four weeks,
-- time away now or next, and a move-out date. Null when there's no such house.
create function public.owner_house(p_house uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'joinCode', h.join_code,
    'createdAt', h.created_at,
    'firstDealtAt', h.first_dealt_at,
    'timezone', h.timezone,
    'currency', h.currency,
    'dealMode', h.deal_mode,
    'passPlan', h.pass_plan,
    'passUntil', h.pass_until,
    'passBuyer', (select p.display_name from public.profiles p where p.id = h.pass_buyer),
    'billed', exists (select 1 from public.house_pass_billing b where b.house_id = h.id and b.stripe_subscription is not null),
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
          select max(w.ends_on) from public.away w
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

revoke execute on function
  public.owner_overview(integer),
  public.owner_houses_match(text, text, text, timestamptz, timestamptz),
  public.owner_houses_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_houses_count(text, text, text, timestamptz, timestamptz),
  public.owner_house(uuid)
from public, anon, authenticated;
grant execute on function
  public.owner_overview(integer),
  public.owner_houses_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_houses_count(text, text, text, timestamptz, timestamptz),
  public.owner_house(uuid)
to authenticated;
