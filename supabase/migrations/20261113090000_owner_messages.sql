-- Messages from the owner (docs/specs/owner-admin.md, "Messages").
--
-- The owner writes one message to a person, a house or everyone, sent any of
-- three ways: a push, a post on the house's Wall ("From Jonz"), or an email.
-- "Send me a test" sends it to the owner alone, without the Wall.
--
-- owner_send_message checks it is the owner, works out who it goes to, posts
-- on the Walls at once, and leaves one row per person in
-- owner_message_outbox for the pushes and emails. apps/api takes them from
-- there (take_message_outbox, service role only) straight after the send,
-- and the clock takes whatever is left, so a message to everyone never
-- has to fit in one request. Taking a row deletes it, under SKIP LOCKED, so
-- two takers never send the same person the same message twice.
--
-- Every send writes admin_audit in the same transaction, naming people and
-- houses by id only.

-- --- The messages ------------------------------------------------------------------------

create table public.owner_messages (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  -- Who sent it. Not a foreign key, as admin_audit's actor isn't.
  sent_by uuid,
  audience text not null check (audience in ('person', 'house', 'everyone', 'test')),
  person_id uuid references public.profiles (id) on delete set null,
  house_id uuid references public.houses (id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  by_push boolean not null,
  by_wall boolean not null,
  by_email boolean not null,
  -- How many people it was for, and how many Walls it went on.
  people integer not null check (people >= 0),
  walls integer not null default 0 check (walls >= 0),
  check (by_push or by_wall or by_email),
  check (not by_wall or audience in ('house', 'everyone'))
);

create index owner_messages_sent on public.owner_messages (sent_at desc, id desc);

-- One row per person still to be pushed or emailed. Deleted as it's sent.
create table public.owner_message_outbox (
  message_id uuid not null references public.owner_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (message_id, user_id)
);

alter table public.owner_messages enable row level security;
alter table public.owner_message_outbox enable row level security;
-- Nobody reads either through the API: the owner reads through the
-- functions below, the API through the service role.
revoke all on public.owner_messages, public.owner_message_outbox from public, anon, authenticated;
grant select on public.owner_messages to service_role;
grant select, delete on public.owner_message_outbox to service_role;

-- --- The Wall's "From Jonz" ---------------------------------------------------------------

-- A new kind of Wall post. The list of kinds is read from the live
-- constraint and added to, as 20261101090000 does.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_catalog.pg_constraint
  where conrelid = 'public.events'::regclass and conname = 'events_kind_check';
  if def is null or def like '%''jonz_message''%' then
    return;
  end if;
  execute 'alter table public.events drop constraint events_kind_check';
  execute 'alter table public.events add constraint events_kind_check '
    || replace(def, 'ARRAY[', 'ARRAY[''jonz_message''::text, ');
end;
$$;

-- --- Who it reaches ----------------------------------------------------------------------

-- The people a message is for: a person, everyone in a house, everyone with
-- an account, or the owner alone. Nobody whose account is being closed or
-- has gone.
create function public.owner_message_people(p_audience text, p_person uuid, p_house uuid)
returns table (user_id uuid)
language sql
stable
security definer set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.deleted_at is null
    and not exists (
      select 1 from public.account_deletions d where d.user_id = p.id and d.state = 'pending'
    )
    and case p_audience
      when 'test' then p.id = auth.uid()
      when 'person' then p.id = p_person
      when 'house' then exists (select 1 from public.members m where m.user_id = p.id and m.house_id = p_house)
      when 'everyone' then true
      else false
    end;
$$;

-- How many a message would reach, and how many of them by each way: the
-- form's "4 of 5 have them on" and the number on the send button.
create function public.owner_message_reach(p_audience text, p_person uuid default null, p_house uuid default null)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'people', count(*),
    'push', count(*) filter (where exists (select 1 from public.push_subscriptions s where s.user_id = w.user_id)),
    'email', count(*) filter (where exists (select 1 from auth.users u where u.id = w.user_id and u.email is not null)),
    'houses', case p_audience
      when 'house' then (select count(*) from public.houses h where h.id = p_house)
      when 'everyone' then (select count(distinct m.house_id) from public.members m)
      else 0
    end
  ) into result
  from public.owner_message_people(p_audience, p_person, p_house) w;
  return result;
end;
$$;

-- --- Picking who --------------------------------------------------------------------------

-- People by name, email or id's start, for "A person": the first eight.
create function public.owner_people_find(p_q text)
returns table (id uuid, name text, email text, house_id uuid, house_name text)
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
  if q = '' then
    return;
  end if;
  return query
    select p.id, p.display_name, u.email::text, h.id, h.name
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.members m on m.user_id = p.id
    left join public.houses h on h.id = m.house_id
    where p.deleted_at is null
      and (p.id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(u.email::text) like '%' || q || '%')
    order by lower(p.display_name), p.id
    limit 8;
end;
$$;

-- Houses by name, join code or id's start, for "A house": the first eight,
-- with how many live there.
create function public.owner_houses_find(p_q text)
returns table (id uuid, name text, people bigint)
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
  if q = '' then
    return;
  end if;
  return query
    select h.id, h.name, (select count(*) from public.members m where m.house_id = h.id)
    from public.houses h
    where h.id::text like q || '%'
      or lower(h.join_code) = q
      or lower(h.name) like '%' || q || '%'
    order by lower(h.name), h.id
    limit 8;
end;
$$;

-- --- Sending ------------------------------------------------------------------------------

create function public.owner_send_message(
  p_audience text,
  p_person uuid,
  p_house uuid,
  p_subject text,
  p_body text,
  p_push boolean,
  p_wall boolean,
  p_email boolean
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  msg public.owner_messages;
  wall boolean := coalesce(p_wall, false) and p_audience in ('house', 'everyone');
  n integer;
  houses integer := 0;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_audience not in ('person', 'house', 'everyone', 'test') then
    raise exception 'message_audience' using errcode = 'P0001';
  end if;
  if p_audience = 'person' and p_person is null or p_audience = 'house' and p_house is null then
    raise exception 'message_who' using errcode = 'P0001';
  end if;
  -- A Wall is the whole house's: a message to one person never goes on it.
  if coalesce(p_wall, false) and p_audience = 'person' then
    raise exception 'message_wall_person' using errcode = 'P0001';
  end if;
  if not (coalesce(p_push, false) or wall or coalesce(p_email, false)) then
    raise exception 'message_no_way' using errcode = 'P0001';
  end if;

  select count(*) into n from public.owner_message_people(p_audience, p_person, p_house);
  if wall then
    select count(distinct m.house_id) into houses
    from public.members m
    where p_audience = 'everyone' or m.house_id = p_house;
  end if;
  if n = 0 and houses = 0 then
    raise exception 'message_nobody' using errcode = 'P0001';
  end if;

  insert into public.owner_messages (
    sent_by, audience, person_id, house_id, subject, body, by_push, by_wall, by_email, people, walls
  )
  values (
    auth.uid(), p_audience,
    case when p_audience = 'person' then p_person end,
    case when p_audience = 'house' then p_house end,
    btrim(p_subject), btrim(p_body),
    coalesce(p_push, false), wall, coalesce(p_email, false), n, houses
  )
  returning * into msg;

  if msg.by_push or msg.by_email then
    insert into public.owner_message_outbox (message_id, user_id)
    select msg.id, w.user_id from public.owner_message_people(p_audience, p_person, p_house) w;
  end if;

  if wall then
    insert into public.events (house_id, kind, data)
    select distinct m.house_id, 'jonz_message',
      jsonb_build_object('subject', msg.subject, 'body', msg.body, 'message', msg.id)
    from public.members m
    where p_audience = 'everyone' or m.house_id = p_house;
  end if;

  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (
    auth.uid(),
    case when p_audience = 'test' then 'message.test' else 'message.send' end,
    'message', msg.id::text,
    jsonb_build_object(
      'audience', msg.audience, 'person', msg.person_id, 'house', msg.house_id,
      'subject', msg.subject, 'body', msg.body,
      'push', msg.by_push, 'wall', msg.by_wall, 'email', msg.by_email,
      'people', msg.people, 'walls', msg.walls
    )
  );

  return jsonb_build_object('id', msg.id, 'people', msg.people, 'walls', msg.walls);
end;
$$;

-- The API's half: up to p_limit pushes and emails still to send, taken off
-- the outbox as they're read, with what each one needs. A row a taker is
-- holding is skipped, so takers running at once never overlap.
create function public.take_message_outbox(p_limit integer default 200, p_message uuid default null)
returns table (
  message_id uuid,
  user_id uuid,
  subject text,
  body text,
  by_push boolean,
  by_wall boolean,
  by_email boolean,
  email text,
  name text,
  zone text
)
language sql
security definer set search_path = ''
as $$
  with taken as (
    delete from public.owner_message_outbox o
    where (o.message_id, o.user_id) in (
      select x.message_id, x.user_id
      from public.owner_message_outbox x
      where p_message is null or x.message_id = p_message
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
      for update skip locked
    )
    returning o.message_id, o.user_id
  )
  select t.message_id, t.user_id, m.subject, m.body, m.by_push, m.by_wall, m.by_email,
    u.email::text, p.display_name,
    coalesce(np.timezone, h.timezone, 'UTC')
  from taken t
  join public.owner_messages m on m.id = t.message_id
  join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = t.user_id
  left join public.notification_prefs np on np.user_id = t.user_id
  left join public.members mb on mb.user_id = t.user_id
  left join public.houses h on h.id = mb.house_id;
$$;

-- --- What was sent: a busy list ------------------------------------------------------------

create function public.owner_messages_find(
  p_q text default '',
  p_audience text default null,
  p_way text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns table (
  id uuid,
  sent_at timestamptz,
  audience text,
  to_name text,
  subject text,
  body text,
  by_push boolean,
  by_wall boolean,
  by_email boolean,
  people integer,
  walls integer,
  waiting bigint
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
    select m.id, m.sent_at, m.audience,
      case m.audience when 'person' then p.display_name when 'house' then h.name end,
      m.subject, m.body, m.by_push, m.by_wall, m.by_email, m.people, m.walls,
      (select count(*) from public.owner_message_outbox o where o.message_id = m.id)
    from public.owner_messages m
    left join public.profiles p on p.id = m.person_id
    left join public.houses h on h.id = m.house_id
    where (p_audience is null or m.audience = p_audience)
      and (p_way is null
        or (p_way = 'push' and m.by_push)
        or (p_way = 'wall' and m.by_wall)
        or (p_way = 'email' and m.by_email))
      and (p_after is null or m.sent_at > p_after)
      and (p_before is null or m.sent_at <= p_before)
      and (q = ''
        or m.id::text like q || '%'
        or lower(m.subject) like '%' || q || '%'
        or lower(m.body) like '%' || q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%');
end;
$$;

create function public.owner_messages_page(
  p_q text default '',
  p_audience text default null,
  p_way text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns table (
  id uuid,
  sent_at timestamptz,
  audience text,
  to_name text,
  subject text,
  body text,
  by_push boolean,
  by_wall boolean,
  by_email boolean,
  people integer,
  walls integer,
  waiting bigint
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return query
    select f.*
    from public.owner_messages_find(p_q, p_audience, p_way, p_after, p_before) f
    where p_cursor_at is null or (f.sent_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.sent_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;

create function public.owner_messages_count(
  p_q text default '',
  p_audience text default null,
  p_way text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns bigint
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return (select count(*) from public.owner_messages_find(p_q, p_audience, p_way, p_after, p_before));
end;
$$;

-- --- Who may call what ---------------------------------------------------------------------

revoke execute on function
  public.owner_message_people(text, uuid, uuid),
  public.owner_message_reach(text, uuid, uuid),
  public.owner_people_find(text),
  public.owner_houses_find(text),
  public.owner_send_message(text, uuid, uuid, text, text, boolean, boolean, boolean),
  public.take_message_outbox(integer, uuid),
  public.owner_messages_find(text, text, text, timestamptz, timestamptz),
  public.owner_messages_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_messages_count(text, text, text, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.owner_message_reach(text, uuid, uuid),
  public.owner_people_find(text),
  public.owner_houses_find(text),
  public.owner_send_message(text, uuid, uuid, text, text, boolean, boolean, boolean),
  public.owner_messages_find(text, text, text, timestamptz, timestamptz),
  public.owner_messages_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_messages_count(text, text, text, timestamptz, timestamptz)
to authenticated;
grant execute on function public.take_message_outbox(integer, uuid) to service_role;
