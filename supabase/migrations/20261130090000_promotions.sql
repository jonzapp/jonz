-- Promotions (docs/specs/promotions.md): money off a House Pass, some months
-- free, or a free Pass, given out by the owner with one link.
--
-- A promotion is for anyone with its link, or only for the people named on
-- it. Stripe can only tie a code to one of its own customers, never to an
-- email, so Jonz checks the email itself: a named promotion works only for
-- someone signed in to Jonz with an email on its list. Checkout never shows
-- Stripe's own code box (apps/api/lib/pass/stripe.ts), so a code reaches
-- Stripe only through Jonz's check.
--
-- Money off is a Stripe coupon with one promotion code, made by apps/api
-- once the owner has made the promotion here (state 'making', then
-- promotion_ready). Months free is a later first charge, and a free Pass
-- needs no Stripe at all, so both are live as soon as they're made.
--
-- The owner reads and writes only through the owner_ functions below, which
-- check it is them with their code and write admin_audit in the same
-- transaction. apps/api reads the tables with the service role, to show an
-- offer and to check it at checkout.

-- --- The promotions --------------------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  -- What goes in the link: jonz.app/offer/THANKS50.
  code text not null unique check (code ~ '^[A-Z0-9]{4,20}$'),
  -- The owner's own name for it.
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- A line the people it's for read first: "Thanks for helping test Jonz."
  note text check (note is null or char_length(btrim(note)) between 1 and 200),
  -- 'percent' or 'amount' off; 'trial', some months free before the first
  -- charge; 'gift', a free Pass with no card.
  kind text not null check (kind in ('percent', 'amount', 'trial', 'gift')),
  percent_off integer check (percent_off between 1 and 100),
  -- Minor units per house currency: {"USD": 1000, "CAD": 1300, ...}.
  amount_off jsonb check (amount_off is null or jsonb_typeof(amount_off) = 'object'),
  -- Money off is for the first payment, some months, or every payment.
  duration text check (duration in ('once', 'months', 'always')),
  -- How many months: of money off, of free months, or of a free Pass (null
  -- for a free Pass for good).
  months integer check (months between 1 and 24),
  -- The plans it works on. A free Pass is none of them.
  plans text[] not null default '{}' check (plans <@ array['yearly', 'monthly', 'founding']),
  audience text not null check (audience in ('anyone', 'named')),
  ends_at timestamptz,
  -- For anyone with the link: how many houses at most.
  max_uses integer check (max_uses > 0),
  state text not null default 'making' check (state in ('making', 'live', 'stopped')),
  stripe_coupon text,
  stripe_code text,
  -- Who made it. Not a foreign key, as admin_audit's actor isn't.
  made_by uuid,
  made_at timestamptz not null default now(),
  stopped_at timestamptz,
  check ((kind = 'percent') = (percent_off is not null)),
  check ((kind = 'amount') = (amount_off is not null)),
  check ((kind in ('percent', 'amount')) = (duration is not null)),
  check ((kind = 'trial' or duration = 'months') <= (months is not null)),
  check (months is null or kind in ('trial', 'gift') or duration = 'months'),
  check ((kind = 'gift') = (cardinality(plans) = 0)),
  check (kind <> 'trial' or plans <@ array['yearly', 'monthly']),
  check (state <> 'live' or kind in ('trial', 'gift') or stripe_code is not null),
  check ((state = 'stopped') = (stopped_at is not null))
);

create index promotions_made on public.promotions (made_at desc, id desc);

-- The people a named promotion is for, by the email they sign in with.
create table public.promotion_people (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- When they first opened the link signed in as this email.
  opened_at timestamptz,
  -- When Email them sent it to them.
  emailed_at timestamptz,
  used_at timestamptz,
  primary key (promotion_id, email)
);

-- Each house that used one: once per house, and once per named person.
create table public.promotion_uses (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  house_id uuid references public.houses (id) on delete set null,
  user_id uuid,
  email text not null,
  -- The Stripe Checkout Session it was bought in; null for a free Pass.
  session text unique,
  plan text,
  at timestamptz not null default now(),
  unique (promotion_id, house_id)
);

create index promotion_uses_of on public.promotion_uses (promotion_id, at desc);

alter table public.promotions enable row level security;
alter table public.promotion_people enable row level security;
alter table public.promotion_uses enable row level security;
-- Nobody reads these through the API: the owner reads through the
-- functions below, apps/api through the service role.
revoke all on public.promotions, public.promotion_people, public.promotion_uses from public, anon, authenticated;
grant select on public.promotions, public.promotion_people, public.promotion_uses to service_role;

-- --- How one stands now ------------------------------------------------------------------

-- 'making' (not yet in Stripe), 'live', 'ended' (past its day, or every
-- house it allows has used it) or 'stopped' (by the owner).
create function public.promotion_state(p public.promotions)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select case
    when p.state = 'stopped' then 'stopped'
    when p.state = 'making' then 'making'
    when p.ends_at is not null and p.ends_at <= now() then 'ended'
    when p.max_uses is not null
      and (select count(*) from public.promotion_uses u where u.promotion_id = p.id) >= p.max_uses then 'ended'
    else 'live'
  end;
$$;

-- --- Making and stopping -------------------------------------------------------------------

create function public.owner_make_promotion(
  p_code text,
  p_name text,
  p_note text,
  p_kind text,
  p_percent integer,
  p_amount jsonb,
  p_duration text,
  p_months integer,
  p_plans text[],
  p_audience text,
  p_people text[],
  p_ends_at timestamptz,
  p_max_uses integer
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  promo public.promotions;
  people text[];
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(btrim(e))), '{}') into people
  from unnest(coalesce(p_people, '{}')) e
  where btrim(e) <> '';
  if p_audience = 'named' and cardinality(people) = 0 then
    raise exception 'promotion_needs_people' using errcode = 'P0001';
  end if;
  if p_audience = 'anyone' and cardinality(people) > 0 then
    raise exception 'promotion_bad' using errcode = 'P0001';
  end if;
  if cardinality(people) > 500 then
    raise exception 'promotion_too_many' using errcode = 'P0001';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'promotion_ends_past' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.promotions where code = upper(btrim(p_code))) then
    raise exception 'promotion_code_taken' using errcode = 'P0001';
  end if;

  begin
    insert into public.promotions (
      code, name, note, kind, percent_off, amount_off, duration, months, plans,
      audience, ends_at, max_uses, state, made_by
    )
    values (
      upper(btrim(p_code)), btrim(p_name), nullif(btrim(coalesce(p_note, '')), ''), p_kind, p_percent, p_amount,
      p_duration, p_months, coalesce(p_plans, '{}'), p_audience, p_ends_at,
      case when p_audience = 'anyone' then p_max_uses end,
      -- Months free and a free Pass need nothing from Stripe.
      case when p_kind in ('trial', 'gift') then 'live' else 'making' end,
      auth.uid()
    )
    returning * into promo;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'promotion_bad' using errcode = 'P0001';
  end;

  begin
    insert into public.promotion_people (promotion_id, email)
    select promo.id, e from unnest(people) e;
  exception
    when check_violation then
      raise exception 'promotion_bad_email' using errcode = 'P0001';
  end;

  -- Named by id and counts only: the emails stay on the promotion.
  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (
    auth.uid(), 'promotion.make', 'promotion', promo.id::text,
    jsonb_build_object(
      'code', promo.code, 'name', promo.name, 'kind', promo.kind,
      'percent_off', promo.percent_off, 'amount_off', promo.amount_off,
      'duration', promo.duration, 'months', promo.months, 'plans', promo.plans,
      'audience', promo.audience, 'people', cardinality(people),
      'ends_at', promo.ends_at, 'max_uses', promo.max_uses
    )
  );
  return promo.id;
end;
$$;

-- Stops it working from now. The houses that used it keep what they got.
-- Answers its Stripe promotion code, for apps/api to turn off too; stopping
-- one already stopped answers the same and logs nothing new.
create function public.owner_stop_promotion(p_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  promo public.promotions;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    raise exception 'promotion_unknown' using errcode = 'P0001';
  end if;
  if promo.state <> 'stopped' then
    update public.promotions set state = 'stopped', stopped_at = now() where id = p_id;
    insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
    values (
      auth.uid(), 'promotion.stop', 'promotion', p_id::text,
      jsonb_build_object('state', public.promotion_state(promo)), jsonb_build_object('state', 'stopped')
    );
  end if;
  return promo.stripe_code;
end;
$$;

-- Email them: the people on a live named promotion who haven't been sent it
-- or used it, marked as sent as they're taken, so a second press never
-- emails anyone twice. With the name they go by when they have an account.
create function public.owner_promotion_emails(p_id uuid)
returns table (email text, name text)
language plpgsql
security definer set search_path = ''
as $$
declare
  promo public.promotions;
  taken integer;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    raise exception 'promotion_unknown' using errcode = 'P0001';
  end if;
  if public.promotion_state(promo) <> 'live' then
    raise exception 'offer_ended' using errcode = 'P0001';
  end if;
  return query
    with sent as (
      update public.promotion_people pp
      set emailed_at = now()
      where pp.promotion_id = p_id and pp.emailed_at is null and pp.used_at is null
      returning pp.email
    )
    select s.email, (
      select p.display_name
      from auth.users u join public.profiles p on p.id = u.id
      where lower(u.email) = s.email and p.deleted_at is null
      limit 1
    )
    from sent s
    order by s.email;
  get diagnostics taken = row_count;
  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (auth.uid(), 'promotion.email', 'promotion', p_id::text, jsonb_build_object('people', taken));
end;
$$;

-- --- One promotion, for its page -------------------------------------------------------------

create function public.owner_promotion(p_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  promo public.promotions;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id;
  if promo.id is null then
    return null;
  end if;
  return to_jsonb(promo) - 'stripe_coupon' - 'stripe_code' || jsonb_build_object(
    'state', public.promotion_state(promo),
    'uses', (select count(*) from public.promotion_uses u where u.promotion_id = p_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', pp.email, 'opened_at', pp.opened_at, 'emailed_at', pp.emailed_at, 'used_at', pp.used_at,
        'name', (
          select p.display_name
          from auth.users u join public.profiles p on p.id = u.id
          where lower(u.email) = pp.email and p.deleted_at is null
          limit 1
        )
      ) order by pp.used_at desc nulls last, pp.opened_at desc nulls last, pp.email)
      from public.promotion_people pp where pp.promotion_id = p_id
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('house', r.house_name, 'house_id', r.house_id, 'plan', r.plan, 'at', r.at) order by r.at desc)
      from (
        select h.name as house_name, u.house_id, u.plan, u.at
        from public.promotion_uses u
        left join public.houses h on h.id = u.house_id
        where u.promotion_id = p_id
        order by u.at desc
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

-- --- Every promotion: a busy list -------------------------------------------------------------

create function public.owner_promotions_find(
  p_q text default '',
  p_who text default null,
  p_state text default null
)
returns table (
  id uuid,
  made_at timestamptz,
  code text,
  name text,
  kind text,
  percent_off integer,
  amount_off jsonb,
  duration text,
  months integer,
  plans text[],
  audience text,
  people integer,
  uses bigint,
  max_uses integer,
  ends_at timestamptz,
  state text
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
    select f.* from (
      select p.id, p.made_at, p.code, p.name, p.kind, p.percent_off, p.amount_off, p.duration, p.months,
        p.plans, p.audience,
        (select count(*)::integer from public.promotion_people pp where pp.promotion_id = p.id),
        (select count(*) from public.promotion_uses u where u.promotion_id = p.id),
        p.max_uses, p.ends_at, public.promotion_state(p) as state
      from public.promotions p
      where (p_who is null or p.audience = p_who)
        and (q = ''
          or p.id::text like q || '%'
          or lower(p.code) like '%' || q || '%'
          or lower(p.name) like '%' || q || '%'
          or exists (select 1 from public.promotion_people pp where pp.promotion_id = p.id and pp.email like '%' || q || '%'))
    ) f
    where p_state is null or f.state = p_state;
end;
$$;

create function public.owner_promotions_page(
  p_q text default '',
  p_who text default null,
  p_state text default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns table (
  id uuid,
  made_at timestamptz,
  code text,
  name text,
  kind text,
  percent_off integer,
  amount_off jsonb,
  duration text,
  months integer,
  plans text[],
  audience text,
  people integer,
  uses bigint,
  max_uses integer,
  ends_at timestamptz,
  state text
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return query
    select f.*
    from public.owner_promotions_find(p_q, p_who, p_state) f
    where p_cursor_at is null or (f.made_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.made_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;

create function public.owner_promotions_count(
  p_q text default '',
  p_who text default null,
  p_state text default null
)
returns bigint
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return (select count(*) from public.owner_promotions_find(p_q, p_who, p_state));
end;
$$;

-- --- apps/api's side (service role) -----------------------------------------------------------

-- The coupon and code are in Stripe: it's live.
create function public.promotion_ready(p_id uuid, p_coupon text, p_code text)
returns void
language sql
security definer set search_path = ''
as $$
  update public.promotions
  set stripe_coupon = p_coupon, stripe_code = p_code, state = 'live'
  where id = p_id and state = 'making';
$$;

-- Someone named on it opened its link signed in as their email.
create function public.promotion_opened(p_id uuid, p_email text)
returns void
language sql
security definer set search_path = ''
as $$
  update public.promotion_people
  set opened_at = coalesce(opened_at, now())
  where promotion_id = p_id and email = lower(btrim(p_email));
$$;

-- A house used it. `p_strict` (a free Pass, given here, not by Stripe)
-- checks under a lock that it still can: live, the house and the person
-- haven't used it, and not every house it allows has. A purchase Stripe
-- has taken is recorded however it stands (Stripe's own limit on the code
-- held at checkout), once per Checkout Session. True when this is the use.
create function public.promotion_use(
  p_id uuid,
  p_house uuid,
  p_user uuid,
  p_email text,
  p_session text,
  p_plan text,
  p_strict boolean
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  promo public.promotions;
  v_email text := lower(btrim(p_email));
  added integer;
begin
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    return false;
  end if;
  if p_strict then
    if public.promotion_state(promo) <> 'live' then
      return false;
    end if;
    if promo.audience = 'named' and not exists (
      select 1 from public.promotion_people pp
      where pp.promotion_id = p_id and pp.email = v_email and pp.used_at is null
    ) then
      return false;
    end if;
  end if;
  insert into public.promotion_uses (promotion_id, house_id, user_id, email, session, plan)
  values (p_id, p_house, p_user, v_email, p_session, p_plan)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.promotion_people
    set used_at = coalesce(used_at, now())
    where promotion_id = p_id and promotion_people.email = v_email;
  end if;
  return added > 0;
end;
$$;

-- --- Who may call what ---------------------------------------------------------------------

revoke execute on function
  public.promotion_state(public.promotions),
  public.owner_make_promotion(text, text, text, text, integer, jsonb, text, integer, text[], text, text[], timestamptz, integer),
  public.owner_stop_promotion(uuid),
  public.owner_promotion_emails(uuid),
  public.owner_promotion(uuid),
  public.owner_promotions_find(text, text, text),
  public.owner_promotions_page(text, text, text, timestamptz, uuid, integer),
  public.owner_promotions_count(text, text, text),
  public.promotion_ready(uuid, text, text),
  public.promotion_opened(uuid, text),
  public.promotion_use(uuid, uuid, uuid, text, text, text, boolean)
from public, anon, authenticated;
grant execute on function
  public.owner_make_promotion(text, text, text, text, integer, jsonb, text, integer, text[], text, text[], timestamptz, integer),
  public.owner_stop_promotion(uuid),
  public.owner_promotion_emails(uuid),
  public.owner_promotion(uuid),
  public.owner_promotions_find(text, text, text),
  public.owner_promotions_page(text, text, text, timestamptz, uuid, integer),
  public.owner_promotions_count(text, text, text)
to authenticated;
grant execute on function
  public.promotion_state(public.promotions),
  public.promotion_ready(uuid, text, text),
  public.promotion_opened(uuid, text),
  public.promotion_use(uuid, uuid, uuid, text, text, text, boolean)
to service_role;
