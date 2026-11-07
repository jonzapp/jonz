-- Who can do what, written down once (Ask Jonz step 1; packages/core/src/permissions.ts).
--
-- Until now each place checked the role its own way: three table rules
-- called is_admin(), fifteen database moves compared members.role to
-- 'admin', and the API, the app and Ask Jonz each had their own copy. Now a
-- permissions table names every move a person can make in a house, a
-- role_permissions table says which roles may make it, and every check asks
-- one function: can(house, permission). It reads the list live, so handing
-- admin over takes effect at once (a role in the sign-in token would last
-- until the token renews). This is Supabase's role-based access pattern,
-- with the role read from the house membership rather than the token,
-- because a Jonz role belongs to a house, not to the person.
--
-- The roles stay as they are (admin, member; Parent and Kid in a family).
-- Rules that are about the house rather than permission keep reading the
-- role: a house always keeps an admin, parents don't earn pocket money, a
-- kid added by a parent is a member. Moves everyone may make (tick, book
-- time away, ask a swap) keep their membership check; they're in the list
-- so the app and Ask Jonz can ask what someone may do.
--
-- The same list lives in packages/core (ROLE_PERMISSIONS); a database test
-- fails if the two differ. Safe to run twice.

-- --- 1. The list ---------------------------------------------------------------------------

create table if not exists public.permissions (
  name text primary key check (name ~ '^[a-z_]+\.[a-z_]+$'),
  about text not null
);

create table if not exists public.role_permissions (
  role text not null check (role in ('admin', 'member')),
  permission text not null references public.permissions (name) on delete cascade,
  primary key (role, permission)
);

-- Anyone signed in may read the list (it's the same for every house); only migrations change it.
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
revoke all on public.permissions, public.role_permissions from public, anon, authenticated;
grant select on public.permissions, public.role_permissions to authenticated, service_role;
drop policy if exists "anyone signed in reads the permissions" on public.permissions;
create policy "anyone signed in reads the permissions" on public.permissions for select to authenticated using (true);
drop policy if exists "anyone signed in reads who has them" on public.role_permissions;
create policy "anyone signed in reads who has them" on public.role_permissions for select to authenticated using (true);

insert into public.permissions (name, about) values
  ('house.read', 'See the house: its Johns, the week, the Wall, history, balances, time away and people'),
  ('ticks.own', 'Tick off your own Johns, and take a tick back'),
  ('away.book', 'Book and cancel your own time away'),
  ('swaps.ask', 'Ask someone to swap a John, and answer a swap ask'),
  ('covers.take', 'Cover someone else''s overdue John'),
  ('flags.raise', 'Flag an on-call John, and take back your own flag'),
  ('disputes.raise', 'Question a tick, and vote on one'),
  ('wall.react', 'React on the Wall'),
  ('perks.use', 'Use an immunity or a swap token'),
  ('self.edit', 'Change your own name, photo, notification settings and preferences'),
  ('house.leave', 'Leave the house'),
  ('house.settings', 'Change the house''s name and rules'),
  ('johns.add', 'Add Johns to the list'),
  ('johns.edit', 'Change a John on the list'),
  ('johns.remove', 'Take a John off the list'),
  ('groups.edit', 'Make, change and delete groups'),
  ('week.deal', 'Deal the week'),
  ('history.reset', 'Put a result, a week or a month''s forfeits right'),
  ('history.undo_any', 'Undo anyone''s move from History'),
  ('flags.remove_any', 'Remove anyone''s flag'),
  ('ticks.ok', 'OK a kid''s tick, or send it back'),
  ('pocket.pay', 'Mark pocket money paid'),
  ('people.remove', 'Remove someone from the house'),
  ('people.roles', 'Make someone an admin, or hand admin over'),
  ('people.kids', 'Add a child without a sign-in, and act for them'),
  ('invite.reset', 'Make a new join code')
on conflict (name) do update set about = excluded.about;

delete from public.role_permissions;
insert into public.role_permissions (role, permission) values
  ('member', 'house.read'),
  ('member', 'ticks.own'),
  ('member', 'away.book'),
  ('member', 'swaps.ask'),
  ('member', 'covers.take'),
  ('member', 'flags.raise'),
  ('member', 'disputes.raise'),
  ('member', 'wall.react'),
  ('member', 'perks.use'),
  ('member', 'self.edit'),
  ('member', 'house.leave'),
  ('admin', 'house.read'),
  ('admin', 'ticks.own'),
  ('admin', 'away.book'),
  ('admin', 'swaps.ask'),
  ('admin', 'covers.take'),
  ('admin', 'flags.raise'),
  ('admin', 'disputes.raise'),
  ('admin', 'wall.react'),
  ('admin', 'perks.use'),
  ('admin', 'self.edit'),
  ('admin', 'house.leave'),
  ('admin', 'house.settings'),
  ('admin', 'johns.add'),
  ('admin', 'johns.edit'),
  ('admin', 'johns.remove'),
  ('admin', 'groups.edit'),
  ('admin', 'week.deal'),
  ('admin', 'history.reset'),
  ('admin', 'history.undo_any'),
  ('admin', 'flags.remove_any'),
  ('admin', 'ticks.ok'),
  ('admin', 'pocket.pay'),
  ('admin', 'people.remove'),
  ('admin', 'people.roles'),
  ('admin', 'people.kids'),
  ('admin', 'invite.reset');


-- --- 2. The check ---------------------------------------------------------------------------

-- Whether `who` may do `perm` in house `h`: they're in it, with a role that has it.
create or replace function public.user_can(h uuid, who uuid, perm text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    join public.role_permissions rp on rp.role = m.role
    where m.house_id = h and m.user_id = who and rp.permission = perm
  );
$$;

-- Whether the person asking may do `perm` in house `h`. Every table rule and move uses this.
create or replace function public.can(h uuid, perm text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.user_can(h, (select auth.uid()), perm);
$$;

-- Everything the person asking may do in house `h` (none outside it): what the app and Ask Jonz offer.
create or replace function public.my_permissions(h uuid)
returns setof text
language sql
stable
security definer set search_path = ''
as $$
  select rp.permission
  from public.members m
  join public.role_permissions rp on rp.role = m.role
  where m.house_id = h and m.user_id = (select auth.uid())
  order by rp.permission;
$$;

revoke execute on function public.user_can(uuid, uuid, text), public.can(uuid, text), public.my_permissions(uuid)
  from public, anon, authenticated;
-- user_can answers for anyone, so only the server may ask it; can and my_permissions answer for you.
grant execute on function public.user_can(uuid, uuid, text) to service_role;
grant execute on function public.can(uuid, text), public.my_permissions(uuid) to authenticated, service_role;

-- --- 3. Table rules -------------------------------------------------------------------------

drop policy if exists "admins change the house" on public.houses;
create policy "admins change the house" on public.houses for update to authenticated
  using (public.can(id, 'house.settings')) with check (public.can(id, 'house.settings'));

drop policy if exists "admins add Johns" on public.johns;
create policy "admins add Johns" on public.johns for insert to authenticated
  with check (public.can(house_id, 'johns.add'));

-- Taking a John off the list is setting archived_at, so it needs johns.remove as well.
drop policy if exists "admins edit Johns" on public.johns;
create policy "admins edit Johns" on public.johns for update to authenticated
  using (public.can(house_id, 'johns.edit'))
  with check (public.can(house_id, 'johns.edit') and (archived_at is null or public.can(house_id, 'johns.remove')));

-- --- 4. Moves -------------------------------------------------------------------------------
-- Each is the function as it stood, with its role check now a permission.

CREATE OR REPLACE FUNCTION public.answer_tick(p_assignment uuid, p_ok boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  a public.assignments;
  ticker uuid;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(a.house_id, 'ticks.ok') then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  if a.outcome is not null or a.done_at is null or not a.awaits_ok then
    raise exception 'nothing_to_ok';
  end if;
  ticker := coalesce(a.covered_by, a.user_id);
  if p_ok then
    update public.assignments p set awaits_ok = false, okayed_by = me, okayed_at = now()
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and p.done_at = a.done_at;
  else
    update public.assignments p set done_at = null, photo_path = null, covered_by = null, absent_at = null
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and (p.done_at = a.done_at or p.absent_at = a.done_at);
    delete from public.crew where job_id = coalesce(a.job_id, a.id) and created_at = a.done_at;
  end if;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, case when p_ok then 'okayed' else 'not_yet' end, me, a.id,
          jsonb_build_object('name', a.name, 'against', ticker));
  return ticker;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_group(p_group uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  house uuid;
begin
  perform public.require_user();
  select house_id into house from public.groups where id = p_group;
  if house is null or not public.can(house, 'groups.edit') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  delete from public.groups where id = p_group;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_group(p_house uuid, p_group uuid, p_name text, p_members uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  g uuid := p_group;
begin
  perform public.require_user();
  if not public.can(p_house, 'groups.edit') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_members), 0) = 0 then
    raise exception 'group_empty';
  end if;
  if exists (
    select 1 from unnest(p_members) as u (id)
    where not exists (select 1 from public.members m where m.house_id = p_house and m.user_id = u.id)
  ) then
    raise exception 'not_housemates' using errcode = '22023';
  end if;
  if g is null then
    insert into public.groups (house_id, name) values (p_house, btrim(p_name)) returning id into g;
  else
    update public.groups set name = btrim(p_name) where id = g and house_id = p_house;
    if not found then
      raise exception 'unknown_group' using errcode = '22023';
    end if;
    delete from public.group_members where group_id = g;
  end if;
  insert into public.group_members (group_id, house_id, user_id)
  select distinct g, p_house, u.id from unnest(p_members) as u (id);
  return g;
exception
  when unique_violation then
    raise exception 'group_name_taken';
end;
$function$;

CREATE OR REPLACE FUNCTION public.hand_over(p_house uuid, p_to uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
begin
  if not public.can(p_house, 'people.roles') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_to = me or not exists (select 1 from public.members where house_id = p_house and user_id = p_to) then
    raise exception 'not_in_house' using errcode = '22023';
  end if;
  perform public.set_member_role(p_house, p_to, 'admin');
  perform public.remove_member(p_house, me);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_house uuid, p_user uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.require_user();
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  if not public.can(p_house, 'people.roles') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if p_role = 'member' and not exists (
    select 1 from public.members
    where house_id = p_house and role = 'admin' and user_id <> p_user
  ) then
    raise exception 'last_admin';
  end if;
  update public.members set role = p_role where house_id = p_house and user_id = p_user;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pay_pocket_money(p_house uuid, p_kid uuid, p_month text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  h public.houses;
  owed bigint;
begin
  if not public.is_member(p_house) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(p_house, 'pocket.pay') then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  select * into h from public.houses where id = p_house;
  if h.kind <> 'family' or p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'nothing_to_pay';
  end if;
  if p_month >= to_char(now() at time zone h.timezone, 'YYYY-MM') then
    raise exception 'not_pay_day_yet';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('jonz.pocket:' || p_house::text || p_kid::text, 0));
  select coalesce((select sum(amount_minor) from public.pocket_earnings
                   where house_id = p_house and user_id = p_kid and month = p_month), 0)
       - coalesce((select sum(amount_minor) from public.pocket_pays
                   where house_id = p_house and user_id = p_kid and month = p_month), 0)
    into owed;
  if owed <= 0 then
    raise exception 'nothing_to_pay';
  end if;
  insert into public.pocket_pays (house_id, user_id, month, amount_minor, paid_by)
  values (p_house, p_kid, p_month, owed, me);
  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'pocket_paid', me, jsonb_build_object('to', p_kid, 'amount', owed, 'month', p_month));
  return owed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_flag(p_assignment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  a public.assignments;
  x public.house_actions;
  sharers uuid[];
  n integer;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.flagged_at is null then
    raise exception 'not_a_flag';
  end if;
  if a.done_at is not null or a.outcome is not null then
    raise exception 'flag_settled';
  end if;
  select * into x from public.house_actions
  where assignment_id = a.id and kind = 'flag' and undone_at is null
  order by created_at desc limit 1;
  if x.id is not null and public.undo_reach(x) is not null then
    perform public.undo_action(x.id);
    return;
  end if;
  if x.id is null and a.flagged_by is null and public.can(a.house_id, 'flags.remove_any') then
    -- Opened again by the clock: as the flag's undo does, with today's sharers.
    sharers := public.flag_sharers(a.john_id);
    n := greatest(cardinality(sharers), 1);
    update public.week_shares
    set share = greatest(share - round(a.points::numeric / n, 2), 0)
    where week_id = a.week_id and user_id = any (sharers);
    delete from public.assignments where id = a.id;
    return;
  end if;
  raise exception 'not_your_flag' using errcode = '42501';
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_member(p_house uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  leaving public.members;
  h public.houses;
  move uuid;
  grace timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  if p_user <> me and not public.can(p_house, 'people.remove') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.members where house_id = p_house and user_id = p_user and role = 'admin'
  ) and not exists (
    select 1 from public.members where house_id = p_house and role = 'admin' and user_id <> p_user
  ) and exists (
    select 1 from public.members where house_id = p_house and user_id <> p_user
  ) then
    raise exception 'last_admin';
  end if;
  delete from public.members where house_id = p_house and user_id = p_user
  returning * into leaving;
  if leaving.user_id is null then
    return;
  end if;
  if p_user <> me then
    update public.houses set join_code = public.new_join_code() where id = p_house;
  end if;
  if p_user = me or leaving.moving_out_on is not null then
    insert into public.moved_on (user_id, from_house) values (p_user, p_house) returning id into move;

    -- The buyer leaving themselves takes the Pass, unless it moved in the last 30 days.
    select * into h from public.houses where id = p_house for update;
    if p_user = me and h.pass_buyer = me and public.house_has_paid_pass(p_house)
      and not exists (
        select 1 from public.moved_on
        where user_id = me and pass_state = 'moved' and pass_placed_at > now() - interval '30 days'
      )
    then
      update public.moved_on
      set pass_plan = h.pass_plan, pass_until = h.pass_until, pass_state = 'waiting'
      where id = move;
      insert into public.moving_pass_billing (move_id, stripe_customer, stripe_subscription)
      select move, b.stripe_customer, b.stripe_subscription
      from public.house_pass_billing b where b.house_id = p_house;
      delete from public.house_pass_billing where house_id = p_house;
      -- The house keeps the extras for 30 days (no longer than was paid for), as a free month it can buy from.
      grace := least(coalesce(h.pass_until, 'infinity'), now() + interval '30 days');
      update public.houses set pass_plan = 'trial', pass_until = grace, pass_buyer = null where id = p_house;
    end if;

    -- Their name goes with the post: once they've gone, the Wall can't look it up.
    -- With the Pass gone too, the day the house's extras last until.
    if exists (select 1 from public.members where house_id = p_house) then
      insert into public.events (house_id, kind, user_id, data)
      select p_house, 'moved_out', p_user,
        jsonb_build_object('who', p.display_name)
          || case when grace is null then '{}'::jsonb else jsonb_build_object('pass_until', (grace at time zone h.timezone)::date) end
      from public.profiles p where p.id = p_user;
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reset_join_code(p_house uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  code text;
begin
  perform public.require_user();
  if not public.can(p_house, 'invite.reset') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.houses set join_code = public.new_join_code() where id = p_house
  returning join_code into code;
  return code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reset_reach(x house_actions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ids uuid[];
  h public.houses;
begin
  if not public.can(x.house_id, 'history.reset') then
    return null;
  end if;
  select * into h from public.houses where id = x.house_id;
  if exists (
    select 1 from public.month_closes c
    where c.house_id = x.house_id
      and c.month in (x.data ->> 'month', x.data ->> 'week_month', to_char(x.created_at at time zone h.timezone, 'YYYY-MM'))
  ) and x.data ->> 'what' <> 'letoff' then
    return null;
  end if;
  if x.data ->> 'what' = 'letoff' and exists (
    select 1 from public.month_closes c
    where c.house_id = x.house_id and c.month = to_char(x.created_at at time zone h.timezone, 'YYYY-MM')
  ) then
    return null;
  end if;
  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into ids
  from jsonb_array_elements(x.data -> 'snapshot' -> 'assignments') s;
  if exists (
    select 1 from public.assignments a
    where (a.id = any (ids) or (x.data ->> 'what' in ('week', 'redeal') and a.week_id = x.ref))
      and (a.done_at > x.created_at or a.flagged_at > x.created_at)
  ) then
    return null;
  end if;
  return 'admin';
end;
$function$;

CREATE OR REPLACE FUNCTION public.runs_for(p_house uuid, p_kid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.can(p_house, 'people.kids')
    and exists (select 1 from public.houses h where h.id = p_house and h.kind = 'family')
    and exists (
      select 1 from public.members m
      where m.house_id = p_house and m.user_id = p_kid and m.role = 'member' and not m.signs_in
    );
$function$;

CREATE OR REPLACE FUNCTION public.tick_awaits_ok()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
begin
  if new.done_at is null then
    new.awaits_ok := false;
    new.okayed_by := null;
    new.okayed_at := null;
    new.ok_asked_at := null;
  elsif old.done_at is null then
    new.awaits_ok := me is not null
      and exists (select 1 from public.houses h where h.id = new.house_id and h.kind = 'family')
      and not public.can(new.house_id, 'ticks.ok');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_reach(x house_actions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
  mine boolean;
  admin boolean;
  a public.assignments;
  b public.assignments;
  w public.weeks;
  d public.disputes;
  aw public.away;
  tz text;
  open_dispute boolean;
  month_ok boolean;
begin
  if me is null or x.undone_at is not null or not public.is_member(x.house_id) then
    return null;
  end if;
  if x.kind = 'reset' then
    return public.reset_reach(x);
  end if;
  mine := x.actor = me;
  admin := public.can(x.house_id, 'history.undo_any');
  select timezone into tz from public.houses where id = x.house_id;

  if x.kind in ('tick', 'cover', 'flag', 'swap', 'immunity') then
    select * into a from public.assignments where id = x.assignment_id;
    if a.id is null then
      return null;
    end if;
    select * into w from public.weeks where id = a.week_id;
    open_dispute := exists (select 1 from public.disputes where assignment_id = a.id and resolution is null);
    month_ok := public.month_open(x.house_id, a.due_at)
      and not exists (
        select 1 from public.ledger l join public.month_closes c on c.house_id = l.house_id and c.month = l.month
        where l.assignment_id = a.id and l.kind = 'forfeit'
      );
  end if;

  case x.kind
  when 'tick' then
    -- Still this tick (not struck and ticked again), not under dispute, not covered.
    if a.done_at is distinct from (x.data ->> 'done_at')::timestamptz or a.covered_by is not null or open_dispute then
      return null;
    end if;
    if mine and a.user_id = me and a.outcome is null and now() < public.closes_at(a, w.ends_at) then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'cover' then
    if a.done_at is distinct from (x.data ->> 'done_at')::timestamptz or a.covered_by is distinct from x.actor
       or open_dispute then
      return null;
    end if;
    if mine and a.outcome is null then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'flag' then
    if a.done_at is not null or a.outcome is not null then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'swap' then
    select * into b from public.assignments where id = x.ref;
    if b.id is null or a.user_id is distinct from x.actor or b.user_id is distinct from x.subject
       or a.done_at is not null or b.done_at is not null or a.outcome is not null or b.outcome is not null
       or now() >= w.ends_at then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'immunity' then
    if a.outcome is distinct from 'excused' then
      return null;
    end if;
    if mine and w.closed_at is null then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'dispute' then
    select * into d from public.disputes where id = x.ref;
    if d.id is null or d.resolution is not null then
      return null;
    end if;
    if mine and not exists (select 1 from public.dispute_votes v where v.dispute_id = d.id and v.user_id <> me) then
      return 'own';
    end if;
    return case when admin then 'admin' end;
  when 'vote' then
    select * into d from public.disputes where id = x.ref;
    if d.id is null or d.resolution is not null or now() >= d.closes_at
       or not exists (select 1 from public.dispute_votes v where v.dispute_id = d.id and v.user_id = x.actor) then
      return null;
    end if;
    return case when mine then 'own' end;
  when 'payment' then
    if not exists (
      select 1 from public.ledger l where l.id in (select (jsonb_array_elements_text(x.data -> 'ledger'))::bigint)
    ) then
      return null;
    end if;
    if mine and now() < x.created_at + interval '7 days' then
      return 'own';
    end if;
    return case when admin and public.month_open(x.house_id, x.created_at) then 'admin' end;
  when 'away' then
    select * into aw from public.away where id = x.ref;
    if aw.id is null or aw.ends_on < (now() at time zone tz)::date then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'role' then
    if not exists (
      select 1 from public.members where house_id = x.house_id and user_id = x.subject and role = x.data ->> 'to'
    ) then
      return null;
    end if;
    return case when admin and public.month_open(x.house_id, x.created_at) then 'admin' end;
  when 'remove' then
    if now() >= x.created_at + interval '7 days'
       or exists (select 1 from public.members where user_id = x.subject) then
      return null;
    end if;
    return case when admin then 'admin' end;
  else
    return null;
  end case;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_kid(p_parent uuid, p_kid uuid, p_born smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  house uuid;
  this_year integer := extract(year from now())::integer;
begin
  select m.house_id into house
  from public.members m join public.houses h on h.id = m.house_id
  where m.user_id = p_parent and h.kind = 'family'
    and public.user_can(m.house_id, p_parent, 'people.kids');
  if house is null then
    raise exception 'parents_add_kids' using errcode = '42501';
  end if;
  if p_born is null or p_born < this_year - 18 or p_born > this_year then
    raise exception 'bad_born_year' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || house::text, 0));
  if exists (select 1 from public.members where user_id = p_kid) then
    raise exception 'already_in_house';
  end if;
  insert into public.members (house_id, user_id, role, signs_in, born_year)
  values (house, p_kid, 'member', false, p_born);
  insert into public.events (house_id, kind, user_id, data)
  values (house, 'joined', p_kid, jsonb_build_object('added_by', p_parent));
  return house;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset(p_actor uuid, p_house uuid, p_kind text, p_target jsonb, p_forfeits jsonb DEFAULT '{}'::jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h public.houses;
  w public.weeks;
  a public.assignments;
  f public.ledger;
  target public.assignments;
  v_outcome text;
  lid bigint;
  month_now text;
  month_of text;
  closed boolean;
  people jsonb := '{}'::jsonb;
  told uuid[] := '{}';
  ids uuid[] := '{}';
  flag_ids uuid[] := '{}';
  added bigint[] := '{}';
  reopened integer := 0;
  past_due integer := 0;
  n_flags integer := 0;
  n_disputes integer := 0;
  correction boolean := false;
  nothing boolean;
  old_forfeit integer;
  new_forfeit integer;
  credit_before uuid;
  credit_after uuid;
  sharers uuid[];
  s uuid;
  snapshot jsonb;
  action uuid;
  event uuid;
  v_subject uuid;
  v_name text;
  v_month text;
  w_month text;
begin
  select * into h from public.houses where id = p_house;
  if h.id is null or not public.user_can(p_house, p_actor, 'history.reset') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  month_now := to_char(now() at time zone h.timezone, 'YYYY-MM');

  -- --- What it touches.
  if p_kind = 'result' then
    select * into target from public.assignments
    where id = (p_target ->> 'assignment')::uuid and house_id = p_house for update;
    if target.id is null then
      raise exception 'not_found';
    end if;
    v_outcome := p_target ->> 'outcome';
    if v_outcome is null or v_outcome not in ('done', 'late', 'missed', 'excused') then
      raise exception 'unknown_outcome' using errcode = '22023';
    end if;
    if exists (select 1 from public.disputes where assignment_id = target.id and resolution is null) then
      raise exception 'disputed';
    end if;
    select * into w from public.weeks where id = target.week_id;
    ids := array[target.id];
    v_subject := target.user_id;
    v_name := target.name;
  elsif p_kind in ('person_week', 'week', 'redeal', 'skip') then
    select * into w from public.weeks where id = (p_target ->> 'week')::uuid and house_id = p_house for update;
    if w.id is null then
      raise exception 'not_found';
    end if;
    if p_kind = 'skip' and w.skipped_at is not null then
      raise exception 'already_skipped';
    end if;
    if p_kind <> 'skip' and w.closed_at is not null then
      raise exception 'week_closed';
    end if;
    if p_kind = 'person_week' then
      v_subject := (p_target ->> 'user')::uuid;
      select array_agg(id) into ids from public.assignments
      where week_id = w.id and user_id = v_subject
        and (done_at is not null or outcome is not null or covered_by is not null);
    elsif p_kind = 'skip' then
      select array_agg(id) into ids from public.assignments where week_id = w.id;
    else
      -- Flags go; everything else ticked or settled goes back to open.
      select array_agg(id) into flag_ids from public.assignments where week_id = w.id and flagged_at is not null;
      select array_agg(id) into ids from public.assignments
      where week_id = w.id and flagged_at is null
        and (done_at is not null or outcome is not null or covered_by is not null);
    end if;
    ids := coalesce(ids, '{}');
    flag_ids := coalesce(flag_ids, '{}');
  elsif p_kind = 'letoff' then
    v_month := p_target ->> 'month';
    if v_month is null or v_month !~ '^\d{4}-\d{2}$' then
      raise exception 'unknown_month' using errcode = '22023';
    end if;
    if exists (select 1 from public.month_let_offs where house_id = p_house and month_let_offs.month = v_month) then
      raise exception 'already_let_off';
    end if;
    select coalesce(array_agg(distinct l.assignment_id) filter (where l.assignment_id is not null), '{}') into ids
    from public.ledger l where l.house_id = p_house and l.month = v_month and l.kind = 'forfeit';
  else
    raise exception 'unknown_reset' using errcode = '22023';
  end if;
  if w.id is not null then
    w_month := to_char(w.starts_at at time zone h.timezone, 'YYYY-MM');
  end if;

  -- --- The tally.
  for a in select * from public.assignments where id = any (ids) loop
    month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
    closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger where assignment_id = a.id and kind = 'forfeit';
    credit_before := public.credited_to(a);
    if p_kind = 'result' then
      new_forfeit := case v_outcome
        when 'late' then coalesce((p_forfeits ->> 'late')::integer, 0)
        when 'missed' then coalesce((p_forfeits ->> 'missed')::integer, 0)
        else 0 end;
      credit_after := case when v_outcome = 'missed' then null else a.user_id end;
    elsif p_kind = 'skip' then
      new_forfeit := 0;
      credit_after := null;
    elsif p_kind = 'letoff' then
      new_forfeit := 0;
      credit_after := credit_before;
    else
      new_forfeit := 0;
      credit_after := a.user_id;
      reopened := reopened + 1;
      if a.due_at < now() then
        past_due := past_due + 1;
      end if;
    end if;
    if p_kind in ('person_week', 'week', 'redeal') and a.done_at is not null then
      people := public.reset_bump(people, coalesce(a.covered_by, a.user_id), 'ticks', 1);
    end if;
    -- Balances only move for weeks the deal has counted (any week before this one).
    if p_kind <> 'skip' and credit_before is distinct from credit_after then
      people := public.reset_bump(people, credit_before, 'points', -a.points);
      people := public.reset_bump(people, credit_after, 'points', a.points);
    elsif p_kind = 'skip' then
      people := public.reset_bump(people, credit_before, 'points', -a.points);
    end if;
    if old_forfeit <> new_forfeit then
      people := public.reset_bump(people, a.user_id, 'forfeit', old_forfeit - new_forfeit);
      correction := correction or closed;
    end if;
    told := told || a.user_id || a.covered_by;
  end loop;

  for a in select * from public.assignments where id = any (flag_ids) loop
    n_flags := n_flags + 1;
    if a.done_at is not null then
      people := public.reset_bump(people, coalesce(a.covered_by, a.user_id), 'ticks', 1);
    end if;
    people := public.reset_bump(people, public.credited_to(a), 'points', -a.points);
    sharers := public.flag_sharers(a.john_id);
    foreach s in array sharers loop
      people := public.reset_bump(people, s, 'points', round(a.points::numeric / greatest(cardinality(sharers), 1), 2));
    end loop;
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger where assignment_id = a.id and kind = 'forfeit';
    if old_forfeit <> 0 then
      people := public.reset_bump(people, a.user_id, 'forfeit', old_forfeit);
    end if;
    told := told || a.user_id || a.covered_by;
  end loop;

  if p_kind = 'skip' then
    -- What everyone owed for the week comes off too.
    declare
      sh record;
    begin
      for sh in select user_id, share from public.week_shares where week_id = w.id loop
        people := public.reset_bump(people, sh.user_id, 'points', sh.share);
        told := told || sh.user_id;
      end loop;
    end;
  end if;

  if p_kind = 'letoff' then
    -- The tally is the month's forfeits, per person.
    people := '{}'::jsonb;
    declare
      r record;
    begin
      for r in
        select user_id, -sum(amount_minor)::integer as amount from public.ledger
        where house_id = p_house and ledger.month = v_month and kind = 'forfeit' group by user_id
      loop
        people := public.reset_bump(people, r.user_id, 'forfeit', r.amount);
        told := told || r.user_id;
      end loop;
    end;
    correction := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = v_month);
  end if;

  select count(*) into n_disputes from public.disputes
  where resolution is null and (assignment_id = any (ids) or assignment_id = any (flag_ids));

  select coalesce(array_agg(distinct t), '{}') into told from unnest(told) t where t is not null and t <> p_actor;
  nothing := case p_kind
    when 'skip' then false
    when 'redeal' then false
    when 'letoff' then people = '{}'::jsonb
    else cardinality(ids) + cardinality(flag_ids) = 0 end;

  if not p_apply then
    return jsonb_build_object(
      'kind', p_kind,
      'week', case when w.id is null then null else jsonb_build_object(
        'id', w.id, 'starts_on', w.starts_on, 'starts_at', w.starts_at, 'ends_at', w.ends_at) end,
      'month', coalesce(v_month, w_month, to_char(target.due_at at time zone h.timezone, 'YYYY-MM')),
      'people', people,
      'told', to_jsonb(told),
      'reopened', reopened,
      'past_due', past_due,
      'flags', n_flags,
      'disputes', n_disputes,
      'correction', correction,
      'nothing', nothing
    );
  end if;

  if nothing then
    raise exception 'nothing_to_reset';
  end if;

  -- --- What undoing it needs: every row it changes, as it was.
  snapshot := jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(to_jsonb(x)) from public.assignments x
                             where x.id = any (ids) or x.id = any (flag_ids)
                                or (p_kind = 'redeal' and x.week_id = w.id)), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l)) from public.ledger l
                        where l.kind = 'forfeit' and (l.assignment_id = any (ids) or l.assignment_id = any (flag_ids)
                          or (p_kind = 'letoff' and l.house_id = p_house and l.month = v_month))), '[]'::jsonb),
    'disputes', coalesce((select jsonb_agg(to_jsonb(d)) from public.disputes d
                          where d.assignment_id = any (ids) or d.assignment_id = any (flag_ids)), '[]'::jsonb),
    'votes', coalesce((select jsonb_agg(to_jsonb(v)) from public.dispute_votes v join public.disputes d on d.id = v.dispute_id
                       where d.assignment_id = any (ids) or d.assignment_id = any (flag_ids)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from public.events e
                        where (e.assignment_id = any (ids) or e.assignment_id = any (flag_ids))
                          and e.kind in ('done', 'late', 'covered', 'missed', 'flagged', 'disputed', 'immunity_used')), '[]'::jsonb),
    'shares', case when w.id is null then '[]'::jsonb else coalesce(
      (select jsonb_agg(to_jsonb(ws)) from public.week_shares ws where ws.week_id = w.id), '[]'::jsonb) end,
    'on_call', case when p_kind = 'redeal' then coalesce(
      (select jsonb_agg(to_jsonb(oc)) from public.on_call oc where oc.week_id = w.id), '[]'::jsonb) else '[]'::jsonb end,
    'skipped_at', w.skipped_at
  );

  -- --- The change.
  if p_kind = 'result' then
    a := target;
    month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
    closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger where assignment_id = a.id and kind = 'forfeit';
    new_forfeit := case v_outcome
      when 'late' then coalesce((p_forfeits ->> 'late')::integer, 0)
      when 'missed' then coalesce((p_forfeits ->> 'missed')::integer, 0)
      else 0 end;
    if closed then
      added := added || public.add_correction(p_house, a.user_id, old_forfeit - new_forfeit, month_now, a.id);
    else
      delete from public.ledger where assignment_id = a.id and kind = 'forfeit';
      if new_forfeit > 0 then
        insert into public.ledger (house_id, user_id, kind, amount_minor, month, assignment_id)
        values (p_house, a.user_id, 'forfeit', -new_forfeit, month_of, a.id)
        returning id into lid;
        added := added || lid;
      end if;
    end if;
    update public.assignments
    set outcome = v_outcome,
        settled_at = coalesce(settled_at, now()),
        excused = v_outcome = 'excused',
        covered_by = null,
        done_at = case when v_outcome in ('done', 'late') then coalesce(done_at, least(now(), due_at)) end,
        changed_by = p_actor,
        changed_at = now()
    where id = a.id;
    delete from public.events where assignment_id = a.id and kind in ('missed', 'covered')
      and v_outcome <> 'missed';
  elsif p_kind in ('person_week', 'week', 'redeal') then
    for a in select * from public.assignments where id = any (ids) or id = any (flag_ids) loop
      month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
      closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
      select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
      from public.ledger where assignment_id = a.id and kind = 'forfeit';
      if old_forfeit <> 0 and closed then
        added := added || public.add_correction(p_house, a.user_id, old_forfeit, month_now, a.id);
      else
        delete from public.ledger where assignment_id = a.id and kind = 'forfeit';
      end if;
    end loop;
    delete from public.disputes where assignment_id = any (ids) or assignment_id = any (flag_ids);
    delete from public.events
    where (assignment_id = any (ids)) and kind in ('done', 'late', 'covered', 'missed', 'immunity_used');
    -- A flag goes with its points (and, with it, its Wall post).
    for a in select * from public.assignments where id = any (flag_ids) loop
      sharers := public.flag_sharers(a.john_id);
      update public.week_shares
      set share = greatest(share - round(a.points::numeric / greatest(cardinality(sharers), 1), 2), 0)
      where week_id = a.week_id and user_id = any (sharers);
    end loop;
    delete from public.assignments where id = any (flag_ids);
    update public.assignments
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null,
        excused = false, changed_by = p_actor, changed_at = now()
    where id = any (ids);
  elsif p_kind = 'skip' then
    for a in select * from public.assignments where id = any (ids) loop
      month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
      closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
      select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
      from public.ledger where assignment_id = a.id and kind = 'forfeit';
      if old_forfeit <> 0 and closed then
        added := added || public.add_correction(p_house, a.user_id, old_forfeit, month_now, a.id);
      else
        delete from public.ledger where assignment_id = a.id and kind = 'forfeit';
      end if;
    end loop;
    delete from public.disputes where assignment_id = any (ids) and resolution is null;
    -- Whatever wasn't done is let off; whatever was keeps its mark.
    update public.assignments
    set excused = true, outcome = 'excused', settled_at = now()
    where id = any (ids) and outcome is null and done_at is null;
    update public.assignments
    set outcome = case when done_at <= due_at then 'done' else 'late' end, settled_at = now()
    where id = any (ids) and outcome is null;
    update public.weeks set skipped_at = now(), skipped_by = p_actor where id = w.id;
  elsif p_kind = 'letoff' then
    if correction then
      declare
        r record;
      begin
        -- The month's forfeits, cap refunds and shares, each person's net, handed back.
        for r in
          select user_id, sum(amount_minor)::integer as net from public.ledger
          where house_id = p_house and ledger.month = v_month and kind in ('forfeit', 'cap_refund', 'share')
          group by user_id having sum(amount_minor) <> 0
        loop
          insert into public.ledger (house_id, user_id, kind, amount_minor, month)
          values (p_house, r.user_id, 'correction', -r.net, month_now)
          returning id into lid;
          added := added || lid;
        end loop;
      end;
    else
      delete from public.ledger where house_id = p_house and ledger.month = v_month and kind = 'forfeit';
    end if;
    insert into public.month_let_offs (house_id, month, let_off_by) values (p_house, v_month, p_actor);
  end if;

  perform public.recount_streaks(p_house);

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (p_house, 'reset', p_actor, case when p_kind = 'result' then target.id end,
          jsonb_build_object('what', p_kind, 'name', v_name, 'subject', v_subject, 'outcome', v_outcome,
                             'starts_on', w.starts_on, 'month', v_month))
  returning id into event;

  insert into public.house_actions (house_id, actor, subject, kind, assignment_id, ref, data)
  values (p_house, p_actor, v_subject, 'reset', case when p_kind = 'result' then target.id end, w.id,
          jsonb_build_object('what', p_kind, 'name', v_name, 'outcome', v_outcome, 'starts_on', w.starts_on,
                             'month', coalesce(v_month, w_month), 'week_month', w_month, 'event', event,
                             'added', to_jsonb(added), 'told', to_jsonb(told), 'snapshot', snapshot))
  returning id into action;

  return jsonb_build_object('action', action, 'told', to_jsonb(told));
end;
$function$;


-- --- 5. is_admin is gone --------------------------------------------------------------------
-- Nothing calls it now; a database test keeps it that way.
drop function if exists public.is_admin(uuid);
