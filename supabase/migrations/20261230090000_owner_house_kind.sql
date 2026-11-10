-- The owner's house panel says whether a house is housemates or a family, so
-- it can call a family's admins its parents and everyone else its kids.
-- As 20261213090000_standards_renames.sql, with 'kind'.

CREATE OR REPLACE FUNCTION public.owner_house(p_house uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
