-- Each house's own kinds of John (docs/specs/john-kinds.md). A kind sorts
-- the John list and gives its Johns their lid colour; it changes nothing in
-- the deal (that's a group: who shares a John). Until now every house had
-- the same six, fixed in the code and only in English. Now each house keeps
-- its own list: it starts with those six, in its maker's language, and an
-- admin adds, renames, recolours, orders and deletes them.
--
-- A John can have no kind: deleting a kind leaves its Johns without one,
-- shown together at the foot of the list until an admin gives them one.
--
-- johns.category stays for now, kept in step from the kind (the preset it
-- came from, or 'other'), so an app or test still writing a category lands
-- in the matching kind. A later migration drops it.

-- --- The kinds ---------------------------------------------------------------------------------

create table public.john_kinds (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses (id) on delete cascade,
  name text not null constraint john_kinds_name_check check (name = btrim(name) and char_length(name) between 1 and 30),
  colour text not null constraint john_kinds_colour_check check (colour ~ '^#[0-9a-f]{6}$'),
  position integer not null default 0 constraint john_kinds_position_check check (position >= 0),
  -- Which of the six starting kinds it began as, for older apps that still
  -- read johns.category. Null for a kind the house made.
  preset text constraint john_kinds_preset_check check (preset in ('kitchen', 'bathroom', 'bins', 'floors', 'errands', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint john_kinds_id_house_id_key unique (id, house_id),
  constraint john_kinds_house_id_preset_key unique (house_id, preset)
);

-- Two kinds can't share a name, whatever its capitals.
create unique index john_kinds_house_id_name_key on public.john_kinds (house_id, lower(name));

comment on table public.john_kinds is 'Each house''s kinds of John: the list''s sections and the lid colour of the Johns in each.';

create trigger john_kinds_set_updated_at before update on public.john_kinds
  for each row execute function public.set_updated_at();

alter table public.john_kinds enable row level security;

create policy "members see kinds" on public.john_kinds
  for select to authenticated
  using (public.can(house_id, 'johns:read'));
create policy "admins add kinds" on public.john_kinds
  for insert to authenticated
  with check (public.can(house_id, 'johns:write'));
create policy "admins edit kinds" on public.john_kinds
  for update to authenticated
  using (public.can(house_id, 'johns:write'))
  with check (public.can(house_id, 'johns:write'));
create policy "admins delete kinds" on public.john_kinds
  for delete to authenticated
  using (public.can(house_id, 'johns:write'));

revoke all on public.john_kinds from public, anon, authenticated;
grant select, delete on public.john_kinds to authenticated;
grant insert (house_id, name, colour, position) on public.john_kinds to authenticated;
grant update (name, colour, position) on public.john_kinds to authenticated;
grant select, insert, update, delete on public.john_kinds to service_role;

-- The eleven ready colours the kind sheet offers, in its order: the six
-- starting kinds' first. The same list is KIND_COLOURS in @app/core.
create function public.kind_colours()
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select array['#7a4e2d', '#1f5fae', '#2a2d30', '#0f7c7a', '#6a3d9a', '#8a9096',
               '#c2417a', '#2b8fc7', '#4f9a2e', '#b08840', '#4a4fc4'];
$$;
comment on function public.kind_colours() is 'The ready colours for a kind, in the order the kind sheet shows them.';

-- The six a new house starts with, named in its maker's language.
create function public.default_john_kinds(p_language text)
returns table (name text, colour text, place integer, preset text)
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_language = 'fr' then d.fr else d.en end, (public.kind_colours())[d.position + 1], d.position, d.preset
  from (values
    (0, 'kitchen', 'Kitchen', 'Cuisine'),
    (1, 'bathroom', 'Bathroom', 'Salle de bain'),
    (2, 'bins', 'Bins & recycling', 'Poubelles et tri'),
    (3, 'floors', 'Floors & hoovering', 'Sols et aspirateur'),
    (4, 'errands', 'Errands & shopping', 'Courses et démarches'),
    (5, 'other', 'Everything else', 'Tout le reste')
  ) as d (position, preset, en, fr);
$$;
comment on function public.default_john_kinds(text) is 'The six kinds a new house starts with, named in a language (en or fr).';

-- Gives a house the six starting kinds it doesn't have yet.
create function public.seed_john_kinds(p_house uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.john_kinds (house_id, name, colour, position, preset)
  select h.id, d.name, d.colour, d.place, d.preset
  from public.houses h
  left join public.profiles p on p.id = h.created_by
  cross join lateral public.default_john_kinds(p.language) d
  where h.id = p_house
  on conflict do nothing;
$$;
comment on function public.seed_john_kinds(uuid) is 'Gives a house the six starting kinds, named in its maker''s language. Server only.';

create function public.house_kinds_seeded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_john_kinds(new.id);
  return null;
end;
$$;
comment on function public.house_kinds_seeded() is 'A new house starts with the six starting kinds.';

create trigger houses_seed_john_kinds after insert on public.houses
  for each row execute function public.house_kinds_seeded();

select public.seed_john_kinds(h.id) from public.houses h;

-- --- Each John's kind --------------------------------------------------------------------------

alter table public.johns add column john_kind_id uuid;

update public.johns j
set john_kind_id = k.id
from public.john_kinds k
where k.house_id = j.house_id and k.preset = j.category;

alter table public.johns
  add constraint johns_john_kind_id_house_id_fkey foreign key (john_kind_id, house_id)
    references public.john_kinds (id, house_id) on delete no action;
create index johns_john_kind_id_house_id_idx on public.johns (john_kind_id, house_id);

comment on column public.johns.john_kind_id is 'Its kind: the list''s section it sits in and its lid colour. Null for no kind (its kind was deleted).';
comment on column public.johns.category is 'The starting kind its kind began as, or other: kept from john_kind_id for older apps. To be dropped.';

grant insert (john_kind_id), update (john_kind_id) on public.johns to authenticated;

-- A John written with only a category (an older app, a test, a seed) goes
-- to the kind that began as it, or has no kind when the house has none that
-- did; an older app changing only the category moves it the same way, when
-- the house has such a kind. Either way its category follows its kind
-- ('other' for a kind the house made, or none).
create function public.john_kind_kept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.john_kind_id is null
     or tg_op = 'UPDATE' and new.john_kind_id is not distinct from old.john_kind_id and new.category is distinct from old.category then
    new.john_kind_id := coalesce(
      (select x.id from public.john_kinds x where x.house_id = new.house_id and x.preset = new.category),
      case when tg_op = 'UPDATE' then old.john_kind_id end
    );
  end if;
  new.category := coalesce((select x.preset from public.john_kinds x where x.id = new.john_kind_id), 'other');
  return new;
end;
$$;
comment on function public.john_kind_kept() is 'Keeps a John''s kind and its older category in step.';

create trigger johns_kind_kept before insert or update of john_kind_id, category on public.johns
  for each row execute function public.john_kind_kept();

revoke execute on function public.kind_colours(), public.default_john_kinds(text), public.seed_john_kinds(uuid),
  public.house_kinds_seeded(), public.john_kind_kept() from public, anon, authenticated;
grant execute on function public.kind_colours() to authenticated;

-- --- Changing the kinds ------------------------------------------------------------------------

-- The kind a John is written with: one of the house's by id, one by name
-- (made, in the next free colour, if the house has none by that name), or
-- the one a category began as. Null when given none of them.
create function public.john_kind_for(p_house uuid, p_kind uuid, p_kind_name text, p_category text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k uuid;
  taken text[];
begin
  if p_kind is not null then
    select x.id into k from public.john_kinds x where x.id = p_kind and x.house_id = p_house;
    if k is null then
      raise exception 'unknown_kind' using errcode = '22023';
    end if;
    return k;
  end if;
  if nullif(btrim(p_kind_name), '') is not null then
    select x.id into k from public.john_kinds x
    where x.house_id = p_house and lower(x.name) = lower(btrim(p_kind_name));
    if k is null then
      select coalesce(array_agg(x.colour), '{}') into taken from public.john_kinds x where x.house_id = p_house;
      k := public.add_kind(p_house, p_kind_name, coalesce(
        (select c from unnest(public.kind_colours()) with ordinality as u (c, n) where c <> all (taken) order by n limit 1),
        (public.kind_colours())[cardinality(taken) % cardinality(public.kind_colours()) + 1]
      ));
    end if;
    return k;
  end if;
  if p_category is not null then
    select x.id into k from public.john_kinds x where x.house_id = p_house and x.preset = p_category;
  end if;
  return k;
end;
$$;
comment on function public.john_kind_for(uuid, uuid, text, text) is 'The kind a John is written with, by id, by name (made if new) or by its older category.';

-- A new kind goes last, but before Everything else when that's last.
create function public.add_kind(p_house uuid, p_name text, p_colour text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pos integer;
  k uuid;
begin
  select coalesce(max(x.position) + 1, 0) into pos from public.john_kinds x where x.house_id = p_house;
  update public.john_kinds set position = pos
  where house_id = p_house and preset = 'other' and position = pos - 1;
  if found then
    pos := pos - 1;
  end if;
  insert into public.john_kinds (house_id, name, colour, position)
  values (p_house, btrim(p_name), lower(p_colour), pos)
  returning id into k;
  return k;
exception
  when unique_violation then
    raise exception 'kind_name_taken' using errcode = '23505';
  when check_violation then
    raise exception 'bad_kind_name' using errcode = '22023';
end;
$$;
comment on function public.add_kind(uuid, text, text) is 'Adds a kind to a house''s list, last but before Everything else.';

create function public.save_kind(p_house uuid, p_kind uuid, p_name text, p_colour text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k uuid;
begin
  perform public.check_can(p_house, 'johns:write');
  if p_colour is null or p_colour !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'bad_colour' using errcode = '22023';
  end if;
  if p_kind is null then
    return public.add_kind(p_house, p_name, p_colour);
  end if;
  update public.john_kinds set name = btrim(p_name), colour = lower(p_colour)
  where id = p_kind and house_id = p_house
  returning id into k;
  if k is null then
    raise exception 'unknown_kind' using errcode = '22023';
  end if;
  return k;
exception
  when unique_violation then
    raise exception 'kind_name_taken' using errcode = '23505';
  when check_violation then
    raise exception 'bad_kind_name' using errcode = '22023';
end;
$$;
comment on function public.save_kind(uuid, uuid, text, text) is 'Make or change a kind of John: its name and lid colour.';

-- Its Johns (old ones too) move to the kind given, or else have no kind
-- until an admin gives them one. Any kind can go, the last one too.
create function public.delete_kind(p_kind uuid, p_move_to uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  h uuid := (select x.house_id from public.john_kinds x where x.id = p_kind);
  dest uuid;
begin
  perform public.check_can(h, 'johns:write');
  if p_move_to is not null then
    select x.id into dest from public.john_kinds x where x.id = p_move_to and x.house_id = h and x.id <> p_kind;
    if dest is null then
      raise exception 'unknown_kind' using errcode = '22023';
    end if;
  end if;
  update public.johns set john_kind_id = dest where john_kind_id = p_kind and house_id = h;
  delete from public.john_kinds where id = p_kind and house_id = h;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;
comment on function public.delete_kind(uuid, uuid) is 'Delete a kind of John; its Johns move to the kind given, or have no kind.';

-- The kinds in the order given; any left out keep their order after them.
create function public.order_kinds(p_house uuid, p_kinds uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select public.check_can(p_house, 'johns:write');
  with ranked as (
    select x.id, (row_number() over (order by o.n nulls last, x.position, x.created_at) - 1)::integer as pos
    from public.john_kinds x
    left join unnest(p_kinds) with ordinality as o (id, n) on o.id = x.id
    where x.house_id = p_house
  )
  update public.john_kinds x set position = r.pos
  from ranked r
  where x.id = r.id and x.position <> r.pos;
$$;
comment on function public.order_kinds(uuid, uuid[]) is 'Put the house''s kinds of John in an order.';

-- --- Writing a John with its kind --------------------------------------------------------------

drop function public.add_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint);
drop function public.change_john(uuid, text, text, smallint, smallint, smallint, text, boolean, uuid, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint);

create or replace function public.add_johns(p_house uuid, p_johns jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j jsonb;
  c jsonb;
  new_id uuid;
begin
  perform public.check_can(p_house, 'johns:write');
  for j in select value from jsonb_array_elements(p_johns) with ordinality order by ordinality loop
    c := public.john_columns(p_house, j, now());
    if c is null then
      raise exception 'admins_only' using errcode = '42501';
    end if;
    insert into public.johns (house_id, anchor_week, name, john_kind_id, category, points, every_weeks, every_months,
                              week_of_month, anchor_month, due_dow, due_time, needs_photo, group_id, kind, respond_hours,
                              per_week, crew, keep_day, pay_minor, min_age)
    values (p_house, (c ->> 'anchor_week')::int, c ->> 'name',
            public.john_kind_for(p_house, (j ->> 'kindId')::uuid, j ->> 'kindName', j ->> 'category'),
            coalesce(c ->> 'category', 'other'), (c ->> 'points')::smallint,
            (c ->> 'every_weeks')::smallint, (c ->> 'every_months')::smallint, (c ->> 'week_of_month')::smallint,
            (c ->> 'anchor_month')::int, (c ->> 'due_dow')::smallint, (c ->> 'due_time')::time,
            (c ->> 'needs_photo')::boolean, (c ->> 'group_id')::uuid, c ->> 'kind', (c ->> 'respond_hours')::smallint,
            (c ->> 'per_week')::smallint, (c ->> 'crew')::smallint, (c ->> 'keep_day')::boolean,
            coalesce((c ->> 'pay_minor')::int, 0), (c ->> 'min_age')::smallint)
    returning id into new_id;
    return next new_id;
  end loop;
end;
$$;

create function public.add_john(
  p_house uuid,
  p_name text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_kind uuid default null,
  p_kind_name text default null,
  p_category text default null,
  p_every_months smallint default null,
  p_week_of_month smallint default null,
  p_anchor_month integer default null,
  p_anchor_week integer default null,
  p_when text default 'day',
  p_respond_hours smallint default 12,
  p_per_week smallint default 2,
  p_crew smallint default 1,
  p_keep_day boolean default false,
  p_pay_minor integer default null,
  p_min_age smallint default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.add_johns(p_house, jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'name', p_name, 'kindId', p_kind, 'kindName', p_kind_name, 'category', p_category, 'points', p_points,
    'everyWeeks', p_every_weeks, 'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month,
    'anchorMonth', p_anchor_month, 'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo,
    'groupId', p_group, 'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew,
    'keepDay', p_keep_day, 'payMinor', p_pay_minor, 'minAge', p_min_age
  ))));
$$;
comment on function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) is 'Add a John to the list, counting from this week; gives its id.';

-- Changes apply from the next deal. Its week (anchor_week) is kept; its
-- kind, pay and the youngest age stay as they are when not given.
create function public.change_john(
  p_john uuid,
  p_name text,
  p_points smallint,
  p_every_weeks smallint,
  p_due_dow smallint,
  p_due_time text,
  p_needs_photo boolean,
  p_group uuid,
  p_kind uuid default null,
  p_kind_name text default null,
  p_category text default null,
  p_every_months smallint default null,
  p_week_of_month smallint default null,
  p_anchor_month integer default null,
  p_anchor_week integer default null,
  p_when text default 'day',
  p_respond_hours smallint default 12,
  p_per_week smallint default 2,
  p_crew smallint default 1,
  p_keep_day boolean default false,
  p_pay_minor integer default null,
  p_min_age smallint default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  h uuid := (select j.house_id from public.johns j where j.id = p_john);
  c jsonb;
  k uuid;
begin
  perform public.check_can(h, 'johns:write');
  c := public.john_columns(h, jsonb_build_object(
    'name', p_name, 'points', p_points, 'everyWeeks', p_every_weeks,
    'everyMonths', p_every_months, 'weekOfMonth', p_week_of_month, 'anchorMonth', p_anchor_month,
    'dueDow', p_due_dow, 'dueTime', p_due_time, 'needsPhoto', p_needs_photo, 'groupId', p_group,
    'when', p_when, 'respondHours', p_respond_hours, 'perWeek', p_per_week, 'crew', p_crew, 'keepDay', p_keep_day
  ), now());
  k := public.john_kind_for(h, p_kind, p_kind_name, p_category);

  update public.johns
  set name = c ->> 'name',
      john_kind_id = coalesce(k, john_kind_id),
      points = (c ->> 'points')::smallint,
      every_weeks = (c ->> 'every_weeks')::smallint,
      every_months = (c ->> 'every_months')::smallint,
      week_of_month = (c ->> 'week_of_month')::smallint,
      anchor_month = (c ->> 'anchor_month')::int,
      due_dow = (c ->> 'due_dow')::smallint,
      due_time = (c ->> 'due_time')::time,
      needs_photo = (c ->> 'needs_photo')::boolean,
      group_id = (c ->> 'group_id')::uuid,
      kind = c ->> 'kind',
      respond_hours = (c ->> 'respond_hours')::smallint,
      per_week = (c ->> 'per_week')::smallint,
      crew = (c ->> 'crew')::smallint,
      keep_day = (c ->> 'keep_day')::boolean,
      pay_minor = coalesce(p_pay_minor, pay_minor),
      min_age = case when p_min_age is null then min_age else p_min_age end
  where id = p_john and archived_at is null;
  if not found then
    raise exception 'admins_only' using errcode = '42501';
  end if;
end;
$$;
comment on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) is 'Change a John on the list, from the next deal.';

-- --- Reading the kinds -------------------------------------------------------------------------

create or replace function public.john_list(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can(p_house, 'johns:read');
  select jsonb_build_object(
    'johns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'name', j.name, 'john_kind_id', j.john_kind_id, 'category', j.category, 'points', j.points,
        'every_weeks', j.every_weeks, 'every_months', j.every_months, 'week_of_month', j.week_of_month,
        'anchor_month', j.anchor_month, 'anchor_week', j.anchor_week, 'due_dow', j.due_dow, 'due_time', j.due_time,
        'needs_photo', j.needs_photo, 'group_id', j.group_id, 'kind', j.kind, 'respond_hours', j.respond_hours,
        'per_week', j.per_week, 'crew', j.crew, 'keep_day', j.keep_day, 'pay_minor', j.pay_minor, 'min_age', j.min_age
      ) order by j.created_at, j.id)
      from public.johns j
      where j.house_id = p_house and j.archived_at is null
    ), '[]'::jsonb),
    'kinds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'colour', k.colour, 'position', k.position, 'preset', k.preset
      ) order by k.position, k.created_at, k.id)
      from public.john_kinds k
      where k.house_id = p_house
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name,
        'members', coalesce((select jsonb_agg(gm.user_id order by gm.user_id) from public.group_members gm where gm.group_id = g.id), '[]'::jsonb)
      ) order by g.name, g.id)
      from public.groups g
      where g.house_id = p_house
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.houses where id = p_house);
$$;
comment on function public.john_list(uuid) is 'The house''s list of Johns, oldest first, its kinds in order, and its groups with who is in each.';

-- Each John dealt (and each on call) says its kind as the list has it now.
create or replace function public.house_today(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can(p_house, 'house:read');
  with h as (
    select * from public.houses where id = p_house
  ),
  w as (
    select wk.id, wk.starts_on, wk.starts_at, wk.ends_at, wk.waiting, wk.ahead
    from public.weeks wk, h
    where wk.house_id = p_house and wk.starts_on = public.week_starts_on(now(), h.timezone, h.week_starts)
  ),
  -- This week's Johns by when they're due, then any still open from before
  -- (a flag, or one due late on its last day): it stays with whoever had it.
  dealt as (
    select a.*, 0 as part from public.assignments a join w on a.week_id = w.id
    union all
    select a.*, 1 as part from public.assignments a, w
    where a.house_id = p_house and a.week_id <> w.id and a.outcome is null
  )
  select jsonb_build_object(
    'house', to_jsonb(h),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'role', m.role, 'streak', m.streak, 'immunity_tokens', m.immunity_tokens,
        'swap_tokens', m.swap_tokens, 'suits_days', to_jsonb(m.suits_days), 'best_time', m.best_time, 'rather', m.rather,
        'moving_out_on', m.moving_out_on, 'signs_in', m.signs_in, 'born_year', m.born_year,
        'name', p.display_name, 'photo', p.avatar_url
      ) order by m.joined_at)
      from public.members m left join public.profiles p on p.id = m.user_id
      where m.house_id = p_house
    ), '[]'::jsonb),
    'week', (select to_jsonb(w) from w),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(d) - 'part' || jsonb_build_object(
        'every_weeks', j.every_weeks,
        'every_months', j.every_months,
        -- '' for a John with no kind; null when the John is gone.
        'kind_name', case when j.id is not null then coalesce(k.name, '') end,
        'kind_colour', k.colour,
        'crew', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'helper', c.helper, 'points', c.points))
          from public.crew_members c where c.assignment_id = d.id
        ), '[]'::jsonb)
      ) order by d.part, case when d.part = 0 then d.due_at end, d.id)
      from dealt d
      left join public.johns j on j.id = d.john_id
      left join public.john_kinds k on k.id = j.john_kind_id
    ), '[]'::jsonb),
    'disputes', case when exists (select 1 from w) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'assignment_id', x.assignment_id, 'raised_by', x.raised_by, 'reason', x.reason,
        'closes_at', x.closes_at, 'photo_path', x.photo_path,
        'votes', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', v.user_id, 'uphold', v.uphold))
          from public.dispute_votes v where v.dispute_id = x.id
        ), '[]'::jsonb)
      ) order by x.closes_at, x.id)
      from public.disputes x
      where x.house_id = p_house and x.resolution is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'on_call', coalesce((
      select jsonb_agg(jsonb_build_object(
        'john_id', o.john_id, 'user_id', o.user_id,
        'john', case when j.id is null then null else jsonb_build_object(
          'name', j.name, 'category', j.category, 'kind_name', coalesce(k.name, ''), 'kind_colour', k.colour,
          'needs_photo', j.needs_photo, 'archived_at', j.archived_at
        ) end
      ) order by o.john_id, o.user_id)
      from public.on_call_picks o join w on o.week_id = w.id
      left join public.johns j on j.id = o.john_id
      left join public.john_kinds k on k.id = j.john_kind_id
    ), '[]'::jsonb),
    'offers', case when exists (select 1 from w) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'mine', s.asker_assignment_id, 'theirs', s.asked_assignment_id,
        'asked_by', s.asked_by, 'asked_user_id', s.asked_user_id, 'expires_at', s.expires_at
      ) order by s.expires_at, s.id)
      from public.swap_offers s
      where s.house_id = p_house and s.answer is null and s.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end,
    'moves', jsonb_build_object(
      'last_moved_out', (select max(e.created_at) from public.events e where e.house_id = p_house and e.kind = 'moved_out'),
      'last_joined', (select max(e.created_at) from public.events e where e.house_id = p_house and e.kind = 'joined')
    )
  )
  from h;
$$;

-- --- Starting over and starting again ---------------------------------------------------------

-- A house started from an old one takes its kinds too.
create or replace function public.start_house_from(p_from uuid, p_name text, p_timezone text, p_currency text, p_week_starts smallint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_user();
  house uuid;
  kindless uuid[];
begin
  if not exists (
    select 1 from public.moves
    where user_id = me and from_house_id = p_from and how is null and left_at > now() - interval '90 days'
  ) then
    raise exception 'not_your_move' using errcode = '42501';
  end if;
  house := public.create_house(
    p_name, p_timezone, p_currency, p_week_starts,
    (select h.kind from public.houses h where h.id = p_from)
  );
  update public.houses n set pocket_cap_minor = o.pocket_cap_minor
  from public.houses o
  where n.id = house and o.id = p_from and o.kind = 'family';
  delete from public.john_kinds where house_id = house;
  insert into public.john_kinds (house_id, name, colour, position, preset)
  select house, k.name, k.colour, k.position, k.preset
  from public.john_kinds k
  where k.house_id = p_from;
  insert into public.johns (
    house_id, name, john_kind_id, category, points, every_weeks, anchor_week, every_months, anchor_month,
    week_of_month, due_dow, due_time, needs_photo, kind, respond_hours, per_week, crew, keep_day, pay_minor
  )
  select house, j.name, nk.id, j.category, j.points, j.every_weeks, j.anchor_week, j.every_months, j.anchor_month,
    j.week_of_month, j.due_dow, j.due_time, j.needs_photo, j.kind, j.respond_hours, j.per_week, j.crew, j.keep_day, j.pay_minor
  from public.johns j
  join public.john_kinds ok on ok.id = j.john_kind_id
  join public.john_kinds nk on nk.house_id = house and nk.name = ok.name
  where j.house_id = p_from and j.archived_at is null
  order by j.created_at;
  -- Johns with no kind come with none. Written without one, a John is given
  -- its category's kind (johns_kind_kept), so they're cleared after.
  with added as (
    insert into public.johns (
      house_id, name, category, points, every_weeks, anchor_week, every_months, anchor_month,
      week_of_month, due_dow, due_time, needs_photo, kind, respond_hours, per_week, crew, keep_day, pay_minor
    )
    select house, j.name, j.category, j.points, j.every_weeks, j.anchor_week, j.every_months, j.anchor_month,
      j.week_of_month, j.due_dow, j.due_time, j.needs_photo, j.kind, j.respond_hours, j.per_week, j.crew, j.keep_day, j.pay_minor
    from public.johns j
    where j.house_id = p_from and j.archived_at is null and j.john_kind_id is null
    order by j.created_at
    returning id
  )
  select array_agg(id) into kindless from added;
  update public.johns set john_kind_id = null where id = any(kindless);
  update public.moves set how = 'copied'
  where user_id = me and to_house_id = house;
  return house;
end;
$$;

-- Reset everything puts the six starting kinds back with the empty list.
create or replace function public.wipe_house_data(p_house uuid, p_by uuid, p_everything boolean)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  h public.houses;
  family boolean;
  weeks integer;
  people integer;
begin
  select * into h from public.houses where id = p_house for update;
  if h.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  family := h.kind = 'family';

  select count(*) into weeks from public.weeks where house_id = p_house;

  -- A week takes its Johns with it, and they take their checks, votes,
  -- crews, swap asks, pocket money earned and the Wall's posts about them.
  delete from public.weeks where house_id = p_house;
  delete from public.ledger_entries where house_id = p_house;
  delete from public.month_closes where house_id = p_house;
  delete from public.month_let_offs where house_id = p_house;
  delete from public.pocket_pays where house_id = p_house;

  if p_everything then
    delete from public.johns where house_id = p_house;
    delete from public.john_kinds where house_id = p_house;
    perform public.seed_john_kinds(p_house);
    delete from public.groups where house_id = p_house;
    delete from public.away_periods where house_id = p_house;
    -- What create_house gives a new house of this kind.
    update public.houses set
      stake_minor = case when family then 0 else 2000 end,
      late_forfeit_minor = case when family then 0 else 100 end,
      missed_forfeit_minor = case when family then 0 else 300 end,
      dispute_hours = case when family then 0 else 24 end,
      pocket_cap_minor = case when family then 1000 else 0 end,
      away_makeup = default,
      cover_grace_hours = default,
      late_hours = default,
      deal_mode = default,
      deal_budget = default,
      settle_in = default
    where id = p_house;
  end if;

  -- After the rules, so the post a change of rules leaves goes too.
  delete from public.events
  where house_id = p_house
    and kind not in ('joined', 'moving_out', 'moved_out', 'kind_changed', 'jonz_message', 'started_over')
    and (kind not in ('away', 'rules') or p_everything);
  delete from public.house_actions where house_id = p_house;

  update public.members
  set streak = 0, immunity_tokens = 0, swap_tokens = 0
  where house_id = p_house;
  select count(*) into people from public.members where house_id = p_house;

  update public.houses set first_dealt_at = null where id = p_house;

  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'started_over', p_by, jsonb_build_object('everything', p_everything));

  return jsonb_build_object('weeks', weeks, 'people', people);
end;
$$;
comment on function public.wipe_house_data(uuid, uuid, boolean) is
  'Puts a house back to before its first deal (and, with p_everything, clears its list, kinds, groups, time away and rules): the wipe reset_house_data and owner_reset_house_data share, after their own checks.';

-- --- Who may call them -------------------------------------------------------------------------

revoke all on function public.john_kind_for(uuid, uuid, text, text) from public, anon;
revoke all on function public.add_kind(uuid, text, text) from public, anon;
revoke all on function public.save_kind(uuid, uuid, text, text) from public, anon;
revoke all on function public.delete_kind(uuid, uuid) from public, anon;
revoke all on function public.order_kinds(uuid, uuid[]) from public, anon;
revoke all on function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) from public, anon;
revoke all on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) from public, anon;

grant execute on function public.john_kind_for(uuid, uuid, text, text) to authenticated;
grant execute on function public.add_kind(uuid, text, text) to authenticated;
grant execute on function public.save_kind(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_kind(uuid, uuid) to authenticated;
grant execute on function public.order_kinds(uuid, uuid[]) to authenticated;
grant execute on function public.add_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) to authenticated;
grant execute on function public.change_john(uuid, text, smallint, smallint, smallint, text, boolean, uuid, uuid, text, text, smallint, smallint, integer, integer, text, smallint, smallint, smallint, boolean, integer, smallint) to authenticated;
