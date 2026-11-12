-- Ask Jonz per account: a person's tokens over the last 7 days, whichever
-- house they were in, can't pass their current house's weekly pool (400k
-- free, 2M with the House Pass). Before this, leaving a house and starting
-- another gave a fresh pool. The house's pool, the half each, and the 40
-- turns a day stay as they were.
--
-- A deleted house no longer takes its Ask Jonz turns with it: they stay,
-- with no house, so a person's own count (the 40 a day and the 7 days)
-- survives starting and deleting houses. Nothing else reads them.

alter table public.house_drafts alter column house_id drop not null;
alter table public.house_drafts drop constraint house_drafts_house_id_fkey;
alter table public.house_drafts
  add constraint house_drafts_house_id_fkey foreign key (house_id) references public.houses (id) on delete set null;

-- Tokens a person has used since a time, in any house, and when the oldest
-- of those turns was (it drops off first, so that's when some comes back).
create function public.ask_account_used(p_user uuid, p_since timestamptz)
returns table (used bigint, oldest timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(sum(d.input_tokens + d.output_tokens), 0)::bigint, min(d.created_at)
  from public.house_drafts d
  where d.user_id = p_user and d.created_at >= p_since;
$$;
comment on function public.ask_account_used(uuid, timestamptz) is 'Server only. Ask Jonz tokens one person has used since a time, in any house, and when the oldest was.';

-- One turn, as before, plus the account's cap; returns the turn and the
-- room left before it (the least of the house's pool, the person's share
-- and the account's), so the API can have Claude wrap up before passing it.
drop function public.claim_ask_turn(uuid, uuid, timestamptz, bigint, bigint, integer, integer);

create function public.claim_ask_turn(
  p_house uuid,
  p_user uuid,
  p_since timestamptz,
  p_pool bigint,
  p_share bigint,
  p_user_day integer,
  p_reserve integer,
  p_account bigint,
  p_account_since timestamptz
)
returns table (turn uuid, room bigint)
language plpgsql
security definer set search_path = ''
as $$
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
comment on function public.claim_ask_turn(uuid, uuid, timestamptz, bigint, bigint, integer, integer, bigint, timestamptz) is 'Server only. Counts and writes one Ask Jonz turn under the house, person and account limits; returns the room left.';

revoke execute on function public.ask_account_used(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_ask_turn(uuid, uuid, timestamptz, bigint, bigint, integer, integer, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.ask_account_used(uuid, timestamptz) to service_role;
grant execute on function public.claim_ask_turn(uuid, uuid, timestamptz, bigint, bigint, integer, integer, bigint, timestamptz) to service_role;
