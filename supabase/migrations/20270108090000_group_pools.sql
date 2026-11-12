-- Group-only Johns are balanced within their group, and the whole house's
-- Johns across everyone (docs/specs/steady-weeks.md, "Pools"; @app/core
-- steady.ts). The deal needs each person's balance split by pool: the part
-- of each week's share that was a group's Johns is kept here, beside
-- week_shares (which keeps the whole share), and house_group_balances sums
-- it with the work done on that group's Johns.
--
-- Weeks dealt before this have no rows, so their group Johns count toward
-- the whole house's pool, as they always did. A flag (on call) counts there
-- too: open_flag adds to week_shares only.

create table public.week_group_shares (
  week_id uuid not null,
  house_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  share numeric(7, 2) not null check (share >= 0),
  created_at timestamptz not null default now(),
  primary key (week_id, group_id, user_id),
  constraint week_group_shares_week_id_house_id_fkey foreign key (week_id, house_id)
    references public.weeks (id, house_id) on delete cascade,
  constraint week_group_shares_group_id_house_id_fkey foreign key (group_id, house_id)
    references public.groups (id, house_id) on delete cascade
);

create index week_group_shares_week_id_house_id_idx on public.week_group_shares (week_id, house_id);
create index week_group_shares_group_id_house_id_idx on public.week_group_shares (group_id, house_id);
create index week_group_shares_user_id_idx on public.week_group_shares (user_id);

comment on table public.week_group_shares is 'Server only. The part of each housemate''s share of a week that was one group''s Johns, so the deal balances each group''s Johns within the group.';

alter table public.week_group_shares enable row level security;
revoke all on public.week_group_shares from public, anon, authenticated;
grant select, insert, delete on public.week_group_shares to service_role;

-- Each housemate's balance in each group's pool going into a week: their
-- share of that group's Johns (less anything excused, as house_balances
-- does) and the work they did on them, over every week before it that kept
-- group shares. Someone who covered a group's John they aren't in is
-- credited here too; the deal counts that toward their whole-house pool,
-- as it does for anyone no longer in the group.
create function public.house_group_balances(p_house uuid, p_before date)
returns table (user_id uuid, group_id uuid, owed numeric, credited numeric)
language sql
stable
security invoker set search_path = ''
as $$
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

comment on function public.house_group_balances(uuid, date) is 'Server only. Each housemate''s share of, and work on, each group''s Johns before a week: their balance in that group''s pool.';
revoke execute on function public.house_group_balances(uuid, date) from public, anon, authenticated;
grant execute on function public.house_group_balances(uuid, date) to service_role;
