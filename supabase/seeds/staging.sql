-- ---------------------------------------------------------------------------
-- Staging's demo house: four housemates who sign in with one password, a
-- John list with a group and an on-call John, and someone away next week,
-- and no House Pass.
-- Nothing is dealt: sign in as Alex (the admin) and hand out the first week,
-- as a real house would.
--
-- Staging only. `node scripts/staging.mjs seed` runs it through the
-- Management API with {{DEMO_PASSWORD}} replaced by the staging password
-- (a repository secret), never by hand and never against production. The
-- names and addresses are DEMO_HOUSEMATES in packages/core/src/staging.ts.
-- Running it again changes nothing once Alex exists.
-- ---------------------------------------------------------------------------

do $seed$
declare
  password constant text := '{{DEMO_PASSWORD}}';
  people constant text[][] := array[
    ['Alex', 'alex@demo.jonz.app'],
    ['Sam', 'sam@demo.jonz.app'],
    ['Priya', 'priya@demo.jonz.app'],
    ['Jo', 'jo@demo.jonz.app']
  ];
  ids uuid[] := '{}';
  person uuid;
  house uuid;
  upstairs uuid;
  -- lib/week.ts weekIndex of this week in London: weeks since Monday 5 January 1970.
  this_week integer := floor(((now() at time zone 'Europe/London')::date - date '1970-01-05') / 7.0);
  next_monday date := (now() at time zone 'Europe/London')::date
    + (8 - extract(isodow from (now() at time zone 'Europe/London'))::integer);
begin
  if password = '{' || '{DEMO_PASSWORD}}' or length(password) < 8 then
    raise exception 'staging seed: give it the staging password (8 characters or more)';
  end if;
  if exists (select 1 from auth.users where email = people[1][2]) then
    raise notice 'staging seed: the demo house is already here';
    return;
  end if;

  for i in 1 .. array_length(people, 1) loop
    person := gen_random_uuid();
    ids := ids || person;
    -- GoTrue reads its token columns as strings, so none may be null.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', person, 'authenticated', 'authenticated', people[i][2],
      extensions.crypt(password, extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('display_name', people[i][1]), now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), person, person::text, 'email',
      jsonb_build_object('sub', person::text, 'email', people[i][2], 'email_verified', true),
      now(), now(), now()
    );
  end loop;

  insert into public.houses (name, timezone, currency, week_starts, created_by)
  values ('Demo House', 'Europe/London', 'GBP', 1, ids[1])
  returning id into house;

  -- Its free month is already over and nobody has bought the Pass, so it
  -- shows the locked app.
  -- Buy one in Stripe's sandbox (card 4242 4242 4242 4242) to see the rest.
  update public.houses set pass_plan = 'trial', pass_ends_at = now() - interval '1 day' where id = house;

  for i in 1 .. array_length(ids, 1) loop
    insert into public.members (house_id, user_id, role)
    values (house, ids[i], case when i = 1 then 'admin' else 'member' end);
    insert into public.events (house_id, kind, user_id) values (house, 'joined', ids[i]);
  end loop;

  -- Sam and Priya share the upstairs bathroom.
  insert into public.groups (house_id, name) values (house, 'Upstairs') returning id into upstairs;
  insert into public.group_members (group_id, house_id, user_id)
  values (upstairs, house, ids[2]), (upstairs, house, ids[3]);

  -- Each in the house's starting kind of that name.
  insert into public.johns (house_id, name, john_kind_id, points, every_weeks, anchor_week, due_dow, due_time, needs_photo, group_id)
  select house, v.name, k.id, v.points, v.every_weeks, this_week, v.due_dow, v.due_time::time, v.needs_photo, v.group_id
  from (values
    (1, 'Kitchen surfaces', 'kitchen', 2, 1, 3, '21:00', false, null::uuid),
    (2, 'Kitchen deep clean', 'kitchen', 4, 1, 7, '18:00', true, null),
    (3, 'Downstairs bathroom', 'bathroom', 3, 1, 6, '20:00', false, null),
    (4, 'Upstairs bathroom', 'bathroom', 3, 1, 6, '20:00', false, upstairs),
    (5, 'Hoover the stairs', 'floors', 2, 2, 5, '21:00', false, null),
    (6, 'Mop the kitchen floor', 'floors', 2, 1, 4, '21:00', false, null),
    (7, 'Loo roll and washing-up liquid', 'errands', 1, 2, 6, '17:00', false, null)
  ) as v (n, name, preset, points, every_weeks, due_dow, due_time, needs_photo, group_id)
  left join public.john_kinds k on k.house_id = house and k.preset = v.preset
  order by v.n;

  -- The bins: on call, flagged when they're full.
  insert into public.johns (house_id, name, john_kind_id, points, every_weeks, anchor_week, kind, respond_hours, per_week)
  select house, 'Take the bins out', k.id, 1, 1, this_week, 'on_call', 12, 2
  from public.john_kinds k
  where k.house_id = house and k.preset = 'bins';

  -- Jo is away Wednesday to Friday next week.
  insert into public.away_periods (house_id, user_id, starts_on, ends_on, note)
  values (house, ids[4], next_monday + 2, next_monday + 4, 'Visiting family');
end;
$seed$;
