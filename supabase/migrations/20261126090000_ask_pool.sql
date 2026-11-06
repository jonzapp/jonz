-- Ask Jonz's weekly pool: one pool of Claude's tokens a house a week,
-- bigger with the House Pass, of which nobody uses more than half when the
-- house has two or more people. It replaces the 30 turns a house a day.
-- The API works out the house's week and the sizes (packages/core
-- house-draft.ts, ASK_POOL_TOKENS); this counts and writes a turn in one go,
-- under the same locks as before, so turns sent together can't all slip
-- under the pool. A person's 40 turns a day, whichever house, stays.

drop function public.claim_draft_turn(uuid, uuid, integer, integer);

-- Tokens a house, and one person in it, have used since the week started.
create function public.ask_usage(p_house uuid, p_user uuid, p_since timestamptz)
returns table (house_used bigint, mine_used bigint)
language sql
stable
security definer set search_path = ''
as $$
  select
    coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint,
    coalesce(sum(d.input_tokens + d.output_tokens) filter (where d.user_id = p_user), 0)::bigint
  from public.house_drafts d
  where d.house_id = p_house and d.created_at >= p_since;
$$;

-- Write down one turn, or refuse: ask_pool_used when the house has used its
-- week, ask_share_used when this person has used theirs (p_share), and
-- draft_limit when they've sent their day's worth from any house. A turn
-- holds p_reserve tokens until its answer says what it really used, so
-- turns sent together count against the pool while Claude is still answering.
create function public.claim_ask_turn(
  p_house uuid,
  p_user uuid,
  p_since timestamptz,
  p_pool bigint,
  p_share bigint,
  p_user_day integer,
  p_reserve integer
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  used record;
  turn uuid;
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
  insert into public.house_drafts (house_id, user_id, outcome, input_tokens) values (p_house, p_user, 'ai', greatest(p_reserve, 0))
  returning id into turn;
  return turn;
end;
$$;

revoke execute on function public.ask_usage(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_ask_turn(uuid, uuid, timestamptz, bigint, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.ask_usage(uuid, uuid, timestamptz) to service_role;
grant execute on function public.claim_ask_turn(uuid, uuid, timestamptz, bigint, bigint, integer, integer) to service_role;
