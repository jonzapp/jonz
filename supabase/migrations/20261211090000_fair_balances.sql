-- Fair balances (docs/specs/fair-balances.md, beta review S6):
-- a John skipped with immunity, or excused, counts as neither owed nor
-- done. It comes out of its week: nobody is credited with it, and every
-- share of that week shrinks by its part. Mirrors @app/core deal.ts
-- (creditedTo, keptOfWeek, carryOver).
-- Safe to run twice.

create or replace function public.house_balances(p_house uuid, p_before date)
returns table (user_id uuid, owed numeric, credited numeric)
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
        select 1 from public.crew c where c.job_id = coalesce(a.job_id, a.id) and c.user_id = a.user_id
      )
    union all
    select c.user_id, c.points
    from public.crew c
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
revoke execute on function public.house_balances(uuid, date) from public, anon;
grant execute on function public.house_balances(uuid, date) to authenticated, service_role;
