-- Report a problem, steps 2 and 3 (docs/specs/report-a-problem.md).
--
-- Step 2: an email to support@jonz.app becomes a report in the Inbox, and a
-- reply to one of Jonz's reply emails joins the report it answers. The owner
-- can narrow the Inbox to reports from the app or by email, and a reply to
-- an emailed report goes back by email.
--
-- Step 3: "Same as" folds a report into another one that says the same
-- thing, and marking that one fixed fixes them all and tells everyone who
-- reported it.
--
-- Additive: new columns, new functions, and the Inbox's reads take a From
-- filter (so they are dropped and made again with it).

-- --- Where a report came from, and what it's the same as -------------------------------

alter table public.reports
  add column source text not null default 'app' check (source in ('app', 'email')),
  -- An emailed report: who it came from, as their email said. A report from
  -- the app leaves these empty (its sender is user_id). Cleared when the
  -- sender's account is deleted.
  add column from_email text check (from_email is null or char_length(from_email) <= 320),
  add column from_name text check (from_name is null or char_length(from_name) <= 200),
  add column subject text check (subject is null or char_length(subject) <= 300),
  -- Resend's id for the email it came from: the same email twice is one report.
  add column email_id text unique check (email_id is null or char_length(email_id) <= 100),
  -- Folded into another report that says the same thing ("Same as").
  add column same_as uuid references public.reports (id) on delete set null,
  add constraint reports_not_same_as_itself check (same_as is null or same_as <> id);

create index reports_same_as on public.reports (same_as) where same_as is not null;
create index reports_from_email on public.reports (lower(from_email), created_at desc) where from_email is not null;

-- An emailed write-back's Resend id, for the same reason.
alter table public.report_messages
  add column email_id text unique check (email_id is null or char_length(email_id) <= 100);

-- --- An email arrives --------------------------------------------------------------------

-- The API's inbound webhook (app/api/email/inbound) calls this with an email
-- it has checked: not an automatic reply, not from Jonz itself, words already
-- taken out of the quoted history. It answers what became of it:
--   { "did": "report" | "message" | "skipped", "report": id, "user_id": account or null }
--
-- - The same email twice (Resend retries) is skipped.
-- - "(ref 1a2b3c4d)" in the subject, from the report's own sender, writes
--   back on that report. So does a reply with the same subject from the same
--   address to a report that isn't fixed, within 30 days.
-- - Otherwise it's a new report, a question until the owner says otherwise.
-- - When the email passed DMARC and its address is a Jonz account's, it is
--   that person's: it shows under their Your reports, and replies reach the app.
-- - Ten new reports and thirty write-backs a day from one address.
create function public.receive_email(
  p_email_id text,
  p_from text,
  p_name text,
  p_subject text,
  p_topic text,
  p_ref text,
  p_body text,
  p_trusted boolean
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  addr text := lower(btrim(coalesce(p_from, '')));
  body text := left(btrim(coalesce(p_body, '')), 2000);
  subject text := nullif(left(btrim(coalesce(p_subject, '')), 300), '');
  topic text := lower(btrim(coalesce(p_topic, '')));
  account uuid;
  home uuid;
  found_id uuid;
  made uuid;
begin
  if p_email_id is null or addr = '' or addr !~ '^[^@\s]+@[^@\s]+$' then
    return jsonb_build_object('did', 'skipped', 'why', 'address');
  end if;
  if exists (select 1 from public.reports where email_id = p_email_id)
    or exists (select 1 from public.report_messages where email_id = p_email_id) then
    return jsonb_build_object('did', 'skipped', 'why', 'again');
  end if;
  if body = '' then
    body := coalesce(subject, '');
  end if;
  if body = '' then
    return jsonb_build_object('did', 'skipped', 'why', 'empty');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jonz.reports.email:' || addr, 0));

  if coalesce(p_trusted, false) then
    select u.id into account
    from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email::text) = addr and p.deleted_at is null
    limit 1;
  end if;

  -- A reply to one of ours: the report it names, if it's this sender's.
  if p_ref ~ '^[0-9a-f]{8}$' then
    select r.id into found_id
    from public.reports r
    where r.id::text like p_ref || '%'
      and (lower(r.from_email) = addr or (account is not null and r.user_id = account))
    order by r.created_at desc
    limit 1;
  end if;
  -- Or the same conversation, by its subject.
  if found_id is null and topic <> '' then
    select r.id into found_id
    from public.reports r
    where lower(r.from_email) = addr
      and r.state <> 'fixed'
      and r.created_at > now() - interval '30 days'
      and lower(regexp_replace(coalesce(r.subject, ''), '^((re|fwd?|aw|sv)\s*:\s*)+', '', 'i')) = topic
    order by r.created_at desc
    limit 1;
  end if;

  if found_id is not null then
    if (select count(*) from public.report_messages m join public.reports r on r.id = m.report_id
        where not m.from_owner and m.email_id is not null and lower(r.from_email) = addr
          and m.at > now() - interval '1 day') >= 30 then
      return jsonb_build_object('did', 'skipped', 'why', 'limit');
    end if;
    insert into public.report_messages (report_id, from_owner, author, body, email_id)
    values (found_id, false, account, body, p_email_id);
    update public.reports set state = 'new', updated_at = now() where id = found_id;
    return jsonb_build_object('did', 'message', 'report', found_id,
      'user_id', (select r.user_id from public.reports r where r.id = found_id));
  end if;

  if (select count(*) from public.reports r
      where r.source = 'email' and lower(r.from_email) = addr and r.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('did', 'skipped', 'why', 'limit');
  end if;

  if account is not null then
    select m.house_id into home from public.members m where m.user_id = account;
  end if;
  insert into public.reports (user_id, house_id, kind, words, source, from_email, from_name, subject, email_id)
  values (account, home, 'question', body, 'email', addr, nullif(left(btrim(coalesce(p_name, '')), 200), ''), subject, p_email_id)
  returning id into made;
  return jsonb_build_object('did', 'report', 'report', made, 'user_id', account);
end;
$$;

-- --- The owner's Inbox, with From ---------------------------------------------------------

drop function public.owner_reports_count(text, text, text, timestamptz, timestamptz);
drop function public.owner_reports_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer);
drop function public.owner_reports_find(text, text, text, timestamptz, timestamptz);

-- Reports that match the search: the words (a name, email, house or subject
-- that has them, what they said, or a report id that starts with them), the
-- state ('waiting' is new, or open and not folded into another: a folded
-- one whose sender writes back is waiting again), the kind,
-- where it came from ('app' or 'email'), and when it was sent.
create function public.owner_reports_find(
  p_q text default '',
  p_state text default null,
  p_kind text default null,
  p_from text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  email text,
  house_name text,
  kind text,
  state text,
  words text,
  created_at timestamptz,
  updated_at timestamptz,
  source text,
  subject text,
  same_as uuid,
  also integer
)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  -- What was typed, with LIKE's own wildcards taken as letters.
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select r.id, r.user_id,
      coalesce(p.display_name, r.from_name, r.from_email),
      coalesce(case when p.deleted_at is null then u.email::text end, r.from_email),
      h.name, r.kind, r.state, r.words, r.created_at, r.updated_at,
      r.source, r.subject, r.same_as,
      (select count(*)::integer from public.reports d where d.same_as = r.id)
    from public.reports r
    left join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.houses h on h.id = r.house_id
    where (p_state is null
        or (p_state = 'waiting' and (r.state = 'new' or (r.state = 'open' and r.same_as is null)))
        or r.state = p_state)
      and (p_kind is null or r.kind = p_kind)
      and (p_from is null or r.source = p_from)
      and (p_after is null or r.created_at > p_after)
      and (p_before is null or r.created_at <= p_before)
      and (q = ''
        or r.id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or (p.deleted_at is null and lower(u.email::text) like '%' || q || '%')
        or lower(r.from_email) like '%' || q || '%'
        or lower(r.from_name) like '%' || q || '%'
        or lower(r.subject) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%'
        or lower(r.words) like '%' || q || '%');
end;
$$;

-- A page of them, newest first, after the last one shown (its created_at and id).
create function public.owner_reports_page(
  p_q text default '',
  p_state text default null,
  p_kind text default null,
  p_from text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  email text,
  house_name text,
  kind text,
  state text,
  words text,
  created_at timestamptz,
  updated_at timestamptz,
  source text,
  subject text,
  same_as uuid,
  also integer
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return query
    select f.*
    from public.owner_reports_find(p_q, p_state, p_kind, p_from, p_after, p_before) f
    where p_cursor_at is null or (f.created_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.created_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;

-- How many match.
create function public.owner_reports_count(
  p_q text default '',
  p_state text default null,
  p_kind text default null,
  p_from text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns bigint
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return (select count(*) from public.owner_reports_find(p_q, p_state, p_kind, p_from, p_after, p_before));
end;
$$;

-- One report, whole, as before, and now where it came from, what it's the
-- same as, and the reports folded into it.
create or replace function public.owner_open_report(p_report uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.reports;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  update public.reports set state = 'open' where id = p_report and state = 'new' returning * into r;
  if r.id is null then
    select * into r from public.reports where id = p_report;
  end if;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', r.id,
    'user_id', r.user_id,
    'name', coalesce((select p.display_name from public.profiles p where p.id = r.user_id), r.from_name, r.from_email),
    'email', coalesce((select u.email::text from auth.users u join public.profiles p on p.id = u.id
      where u.id = r.user_id and p.deleted_at is null), r.from_email),
    'house_id', r.house_id,
    'house_name', (select h.name from public.houses h where h.id = r.house_id),
    'role', (select m.role from public.members m where m.user_id = r.user_id and m.house_id = r.house_id),
    'kind', r.kind,
    'state', r.state,
    'words', r.words,
    'details', r.details,
    'shots', to_jsonb(r.shots),
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'source', r.source,
    'subject', r.subject,
    'same_as', case when r.same_as is null then null else (
      select jsonb_build_object('id', s.id, 'words', s.words, 'state', s.state,
        'name', coalesce(p.display_name, s.from_name, s.from_email))
      from public.reports s left join public.profiles p on p.id = s.user_id where s.id = r.same_as
    ) end,
    'also', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'words', d.words, 'state', d.state, 'created_at', d.created_at,
        'name', coalesce(p.display_name, d.from_name, d.from_email)) order by d.created_at, d.id)
      from public.reports d left join public.profiles p on p.id = d.user_id where d.same_as = r.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'at', m.at) order by m.at, m.id)
      from public.report_messages m where m.report_id = r.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Who a message from Jonz on a report goes to: the account that sent it
-- (push and email), or the address an emailed one came from (email only).
-- Nobody once they've deleted their account.
create function public.report_recipient(r public.reports)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'report', r.id,
    'user_id', (select p.id from public.profiles p where p.id = r.user_id and p.deleted_at is null),
    'email', case when r.user_id is null then r.from_email end,
    'name', coalesce((select p.display_name from public.profiles p where p.id = r.user_id and p.deleted_at is null), r.from_name),
    'kind', r.kind,
    'words', r.words,
    'subject', r.subject,
    'source', r.source,
    'zone', (select h.timezone from public.houses h where h.id = r.house_id)
  );
$$;

-- Reply, as the owner, as before; it now also answers the address an
-- emailed report came from, and its subject, so the reply goes back by email.
create or replace function public.owner_reply_report(p_report uuid, p_body text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  body text := btrim(coalesce(p_body, ''));
  r public.reports;
  signed text;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select split_part(btrim(p.display_name), ' ', 1) into signed from public.profiles p where p.id = me;
  insert into public.report_messages (report_id, from_owner, author, author_name, body)
  values (r.id, true, me, nullif(signed, ''), body);
  update public.reports set state = 'replied', updated_at = now() where id = r.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.reply', 'report', r.id::text, jsonb_build_object('state', r.state), jsonb_build_object('state', 'replied', 'reply', body));
  return public.report_recipient(r) || jsonb_build_object('signed', nullif(signed, ''));
end;
$$;

-- --- Same as -------------------------------------------------------------------------------

-- Fold a report into another that says the same thing, or (p_main null)
-- take it back out. Folding always lands on a report that isn't folded
-- itself, and brings along anything already folded into this one. A folded
-- report leaves Waiting (until its sender writes back); it is fixed, and its sender told, with the one it's
-- folded into. Goes in the audit log.
create function public.owner_same_as(p_report uuid, p_main uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  was uuid;
  main uuid := p_main;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select r.same_as into was from public.reports r where r.id = p_report for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if main is not null then
    -- Onto the top of its own pile.
    select coalesce(m.same_as, m.id) into main from public.reports m where m.id = main;
    if main is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if main = p_report then
      raise exception 'report_same' using errcode = 'P0001';
    end if;
    update public.reports set same_as = main where same_as = p_report;
  end if;
  -- Folding it is reading it: a new one becomes open, so it leaves Waiting.
  update public.reports
  set same_as = main, state = case when main is not null and state = 'new' then 'open' else state end
  where id = p_report;
  if was is distinct from main then
    insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
    values (me, 'report.same_as', 'report', p_report::text, jsonb_build_object('same_as', was), jsonb_build_object('same_as', main));
  end if;
  return main;
end;
$$;

-- Reports the owner might mean by "Same as": the newest that match the
-- words (or an id's start), leaving out this one and what's folded into it.
create function public.owner_same_as_find(p_report uuid, p_q text default '')
returns table (id uuid, name text, words text, state text, created_at timestamptz)
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
    select r.id, coalesce(p.display_name, r.from_name, r.from_email), r.words, r.state, r.created_at
    from public.reports r
    left join public.profiles p on p.id = r.user_id
    where r.id <> p_report
      and r.same_as is null
      and (q = '' or r.id::text like q || '%' or lower(r.words) like '%' || q || '%' or lower(r.subject) like '%' || q || '%')
    order by r.created_at desc, r.id desc
    limit 20;
end;
$$;

-- --- Fixed, and telling everyone ---------------------------------------------------------

-- Mark a report fixed, with everything folded into it. With p_tell, each of
-- them gets a message from Jonz in its conversation (the note, or a plain
-- "it's fixed"), and the answer lists who to tell, for the API to push and
-- email. Goes in the audit log.
create function public.owner_fix_report(p_report uuid, p_note text default null, p_tell boolean default true)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  note text := nullif(btrim(coalesce(p_note, '')), '');
  body text;
  signed text;
  r public.reports;
  told jsonb := '[]'::jsonb;
  n integer := 0;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if note is not null and char_length(note) > 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  perform 1 from public.reports where id = p_report for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select split_part(btrim(p.display_name), ' ', 1) into signed from public.profiles p where p.id = me;
  body := coalesce(note, 'This is fixed now. Thank you for telling us.');

  for r in
    select * from public.reports x
    where (x.id = p_report or x.same_as = p_report) and x.state <> 'fixed'
    order by x.created_at, x.id
    for update
  loop
    update public.reports set state = 'fixed', updated_at = now() where id = r.id;
    n := n + 1;
    if coalesce(p_tell, false) then
      insert into public.report_messages (report_id, from_owner, author, author_name, body)
      values (r.id, true, me, nullif(signed, ''), body);
      told := told || jsonb_build_array(public.report_recipient(r));
    end if;
  end loop;

  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.fixed', 'report', p_report::text, jsonb_build_object('state', 'waiting'),
    jsonb_build_object('state', 'fixed', 'reports', n, 'told', jsonb_array_length(told), 'note', note));
  return jsonb_build_object('fixed', n, 'signed', nullif(signed, ''), 'body', body, 'told', told);
end;
$$;

-- --- Deleting an account ---------------------------------------------------------------

-- As before (20261112090000_reports.sql), and their emailed reports forget
-- the address and the name they came with.
create or replace function public.finish_account_deletion(p_user uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  m public.members;
  heir uuid;
begin
  select * into m from public.members where user_id = p_user;
  if m.house_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('johns.members:' || m.house_id::text, 0));
    if m.role = 'admin' and not exists (
      select 1 from public.members where house_id = m.house_id and role = 'admin' and user_id <> p_user
    ) then
      select x.user_id into heir from public.members x
      where x.house_id = m.house_id and x.user_id <> p_user
      order by x.joined_at, x.user_id
      limit 1;
      if heir is not null then
        update public.members set role = 'admin' where house_id = m.house_id and user_id = heir;
      end if;
    end if;
    delete from public.members where house_id = m.house_id and user_id = p_user;
  end if;

  update public.houses set pass_buyer = null where pass_buyer = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.swap_offers where (asked_by = p_user or asked_to = p_user) and answer is null;
  -- The Wall said their name when they moved out; it can't look it up now.
  update public.events set data = data || jsonb_build_object('who', 'Someone who left')
  where user_id = p_user and data ? 'who';
  update public.profiles
  set display_name = 'Someone who left', avatar_url = null, deleted_at = coalesce(deleted_at, now())
  where id = p_user;
  update public.reports set shots = '{}', from_email = null, from_name = null
  where user_id = p_user and (shots <> '{}' or from_email is not null or from_name is not null);
end;
$$;

-- --- Grants ----------------------------------------------------------------------------

revoke execute on function
  public.receive_email(text, text, text, text, text, text, text, boolean),
  public.owner_reports_find(text, text, text, text, timestamptz, timestamptz),
  public.owner_reports_page(text, text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_reports_count(text, text, text, text, timestamptz, timestamptz),
  public.report_recipient(public.reports),
  public.owner_same_as(uuid, uuid),
  public.owner_same_as_find(uuid, text),
  public.owner_fix_report(uuid, text, boolean),
  public.finish_account_deletion(uuid)
from public, anon, authenticated;
grant execute on function
  public.owner_reports_page(text, text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_reports_count(text, text, text, text, timestamptz, timestamptz),
  public.owner_same_as(uuid, uuid),
  public.owner_same_as_find(uuid, text),
  public.owner_fix_report(uuid, text, boolean)
to authenticated;
grant execute on function
  public.receive_email(text, text, text, text, text, text, text, boolean),
  public.finish_account_deletion(uuid)
to service_role;
