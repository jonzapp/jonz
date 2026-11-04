-- Kids without a sign-in, step 4 of the family version (docs/specs/family-houses.md).
--
-- A parent adds a child by name and the year they were born. The child gets
-- a profile but no way to sign in (apps/api makes the account, banned, at an
-- address nobody reads), and their parents run it: on Today a parent
-- switches to the kid and ticks for them. A parent's tick needs no OK, so
-- it stands at once, and what the John earns goes to the kid. Each John can
-- also say how old you have to be to get it, and the deal leaves younger
-- kids out. Housemate houses don't change.
--
-- Safe to run twice.

-- --- 1. Who signs in, and how old they are ---------------------------------------------------

alter table public.members
  add column if not exists signs_in boolean not null default true,
  add column if not exists born_year smallint;
alter table public.members drop constraint if exists members_born_year;
alter table public.members
  add constraint members_born_year check (born_year is null or born_year between 1900 and 2100);

alter table public.johns
  add column if not exists min_age smallint;
alter table public.johns drop constraint if exists johns_min_age;
alter table public.johns
  add constraint johns_min_age check (min_age is null or min_age between 2 and 18);
grant insert (min_age), update (min_age) on public.johns to authenticated;

-- Whether you run `p_kid`'s profile in `p_house`: you're a parent in that
-- family and they're a kid there with no sign-in of their own.
create or replace function public.runs_for(p_house uuid, p_kid uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.is_admin(p_house)
    and exists (select 1 from public.houses h where h.id = p_house and h.kind = 'family')
    and exists (
      select 1 from public.members m
      where m.house_id = p_house and m.user_id = p_kid and m.role = 'member' and not m.signs_in
    );
$$;

-- --- 2. A parent ticks for them ---------------------------------------------------------------

-- As 20261102090000, but a parent may act on the place of a kid whose
-- profile they run. Every tick, Not done, swap and roll call goes through
-- here, so a parent on the kitchen tablet can do all of it for the kid.
create or replace function public.my_open_assignment(p_assignment uuid)
returns public.assignments
language plpgsql
security definer set search_path = ''
as $$
declare
  a public.assignments;
  ends timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or (a.user_id <> (select auth.uid()) and not public.runs_for(a.house_id, a.user_id)) then
    raise exception 'not_your_john' using errcode = '42501';
  end if;
  if a.outcome is not null then
    raise exception 'already_settled';
  end if;
  if a.absent_at is not null then
    raise exception 'left_off';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  if now() >= public.closes_at(a, ends) then
    raise exception 'week_closed';
  end if;
  return a;
end;
$$;

-- As 20261029090000, and a parent may add the photo for a kid they run.
create or replace function public.can_upload_proof(object_name text)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  house uuid;
  assignment uuid;
begin
  if coalesce(array_length(parts, 1), 0) < 2 then
    return false;
  end if;
  begin
    house := parts[1]::uuid;
    assignment := parts[2]::uuid;
  exception
    when others then
      return false;
  end;
  return exists (
    select 1 from public.assignments a
    where a.id = assignment and a.house_id = house and a.outcome is null
      and (
        a.user_id = (select auth.uid())
        or public.runs_for(house, a.user_id)
        or (
          public.is_member(house) and a.done_at is null and not a.excused
          and now() >= public.cover_opens_at(
            a,
            (select w.ends_at from public.weeks w where w.id = a.week_id),
            (select h.cover_grace_hours from public.houses h where h.id = house)
          )
        )
      )
  );
end;
$$;

-- --- 3. Adding a child -----------------------------------------------------------------------

-- apps/api makes the child's account (lib/moves/kids.ts) and then calls this
-- as the service, saying which parent asked. Answers the house.
create or replace function public.add_kid(p_parent uuid, p_kid uuid, p_born smallint)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  house uuid;
  this_year integer := extract(year from now())::integer;
begin
  select m.house_id into house
  from public.members m join public.houses h on h.id = m.house_id
  where m.user_id = p_parent and m.role = 'admin' and h.kind = 'family';
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
$$;

-- --- Grants ------------------------------------------------------------------------------------

revoke execute on function public.runs_for(uuid, uuid), public.add_kid(uuid, uuid, smallint)
from public, anon, authenticated;
grant execute on function public.runs_for(uuid, uuid) to authenticated, service_role;
grant execute on function public.add_kid(uuid, uuid, smallint) to service_role;
