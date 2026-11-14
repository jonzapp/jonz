-- Owners can reset Ask Jonz use (docs/specs/ask-usage-reset.md): for one
-- house, some people, or everyone. A reset never deletes a turn (each turn
-- is still its cost): it stamps reset_at on the turns, and every Ask Jonz
-- limit counts only turns that haven't been reset.

alter table public.house_drafts add column reset_at timestamptz;

comment on column public.house_drafts.reset_at is 'When an owner reset Ask Jonz use over this turn: it no longer counts toward any limit. Null counts.';

-- The limits, counting only turns that haven't been reset.

create or replace function public.ask_account_used(p_user uuid, p_since timestamptz)
returns table (used bigint, oldest timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint, min(d.created_at)
  from public.house_drafts d
  where d.user_id = p_user and d.created_at >= p_since and d.reset_at is null;
$$;

create or replace function public.ask_usage(p_house uuid, p_user uuid, p_since timestamptz)
returns table (house_used bigint, mine_used bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint,
    coalesce(sum(d.input_tokens + d.output_tokens) filter (where d.user_id = p_user), 0)::bigint
  from public.house_drafts d
  where d.house_id = p_house and d.created_at >= p_since and d.reset_at is null;
$$;

create or replace function public.ask_usage_people(p_house uuid, p_since timestamptz)
returns table (user_id uuid, used bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id, sum(d.input_tokens + d.output_tokens)::bigint
  from public.house_drafts d
  where d.house_id = p_house and d.created_at >= p_since and d.reset_at is null
  group by d.user_id;
$$;

create or replace function public.claim_ask_turn(
  p_house uuid, p_user uuid, p_since timestamptz, p_pool bigint, p_share bigint,
  p_user_day integer, p_reserve integer, p_account bigint, p_account_since timestamptz
)
returns table (turn uuid, room bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  used record;
  account_used bigint;
  claimed uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('johns.drafts:' || p_house::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('johns.drafts.user:' || p_user::text, 0));
  if (
    select count(*) from public.house_drafts
    where user_id = p_user and created_at >= now() - interval '24 hours' and reset_at is null
  ) >= p_user_day then
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

-- Who may: owners only (not support).

insert into public.permissions (name, about, scope)
values ('ask_usage:write', 'Reset Ask Jonz use for a house, some people or everyone, so their limits start again', 'app');
insert into public.app_role_permissions (role, permission) values ('owner', 'ask_usage:write');

-- The reset itself.

create or replace function public.owner_reset_ask_usage(
  p_audience text, p_house uuid default null, p_people uuid[] default null, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  people uuid[] := array(select distinct u from unnest(coalesce(p_people, '{}'::uuid[])) u where u is not null);
  h public.houses;
  turns integer;
  who integer;
begin
  if not public.can_app('ask_usage:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_audience not in ('house', 'people', 'everyone') then
    raise exception 'ask_reset_audience' using errcode = 'P0001';
  end if;
  if p_audience = 'house' then
    select * into h from public.houses where id = p_house;
    if h.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  if p_audience = 'people' and cardinality(people) = 0 then
    raise exception 'ask_reset_who' using errcode = 'P0001';
  end if;
  if cardinality(people) > 500 then
    raise exception 'ask_reset_too_many' using errcode = 'P0001';
  end if;

  with reset as (
    update public.house_drafts d
    set reset_at = now()
    where d.reset_at is null
      and (
        p_audience = 'everyone'
        or (p_audience = 'house' and d.house_id = h.id)
        or (p_audience = 'people' and d.user_id = any(people))
      )
    returning d.user_id
  )
  select count(*), count(distinct user_id) into turns, who from reset;

  insert into public.admin_audit (actor, action, target_kind, target_id, reason, after)
  values (
    auth.uid(), 'ask.reset_usage',
    case p_audience when 'house' then 'house' when 'people' then 'account' else 'app' end,
    case p_audience when 'house' then h.id::text when 'people' then case when cardinality(people) = 1 then people[1]::text end end,
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object(
      'audience', p_audience, 'house', h.id, 'house_name', h.name,
      'people', case when p_audience = 'people' then to_jsonb(people) end,
      'turns', turns, 'who', who
    )
  );

  return jsonb_build_object('turns', turns, 'people', who);
end;
$$;

comment on function public.owner_reset_ask_usage(text, uuid, uuid[], text) is
  'The owner (ask_usage:write) resets Ask Jonz use for a house, some people or everyone: their turns so far stop counting toward any limit. Writes the audit entry.';

revoke all on function public.owner_reset_ask_usage(text, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.owner_reset_ask_usage(text, uuid, uuid[], text) to authenticated, service_role;
