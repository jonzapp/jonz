-- Your account's operations as database functions, so /v1 and MCP run every
-- operation the same way: one function call, as the person (docs/specs/api.md).
-- Each does exactly what the app's own table queries do today, and is
-- security invoker: Row Level Security still decides every row, as it did
-- for those queries.

-- --- You --------------------------------------------------------------------------------

create function public.my_house()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('house_id', m.house_id, 'name', h.name, 'kind', h.kind)
  from public.members m
  join public.houses h on h.id = m.house_id
  where m.user_id = (select auth.uid())
  limit 1;
$$;
comment on function public.my_house() is 'The house you''re in (id, name, kind), or null.';

create function public.set_my_name(p_name text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.profiles set display_name = p_name where id = (select auth.uid());
$$;
comment on function public.set_my_name(text) is 'Rename yourself.';

-- --- Notifications ------------------------------------------------------------------------

create function public.my_notifications()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('reminders', p.reminders, 'checks', p.checks, 'flags', p.flags, 'deal', p.deal,
                            'quiet_from', p.quiet_from, 'quiet_until', p.quiet_until, 'timezone', p.timezone)
  from public.notification_prefs p
  where p.user_id = (select auth.uid());
$$;
comment on function public.my_notifications() is 'What to push you and when to keep quiet, or null for the defaults (everything on).';

create function public.save_notifications(
  p_reminders boolean,
  p_checks boolean,
  p_flags boolean,
  p_deal boolean,
  p_quiet_from smallint,
  p_quiet_until smallint,
  p_timezone text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.notification_prefs (user_id, reminders, checks, flags, deal, quiet_from, quiet_until, timezone, updated_at)
  values ((select auth.uid()), p_reminders, p_checks, p_flags, p_deal, p_quiet_from, p_quiet_until, p_timezone, now())
  on conflict (user_id) do update
    set reminders = excluded.reminders, checks = excluded.checks, flags = excluded.flags, deal = excluded.deal,
        quiet_from = excluded.quiet_from, quiet_until = excluded.quiet_until, timezone = excluded.timezone,
        updated_at = excluded.updated_at;
$$;
comment on function public.save_notifications(boolean, boolean, boolean, boolean, smallint, smallint, text) is 'Save what to push you and when to keep quiet.';

-- A browser that subscribes again keeps its endpoint: its row is replaced.
create function public.add_push_device(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ((select auth.uid()), p_endpoint, p_p256dh, p_auth);
$$;
comment on function public.add_push_device(text, text, text) is 'Send your reminders to this device too.';

create function public.remove_push_device(p_endpoint text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
comment on function public.remove_push_device(text) is 'Stop sending reminders to this device.';

-- --- Your reports -------------------------------------------------------------------------

create function public.my_report(p_report uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'report', jsonb_build_object('id', r.id, 'user_id', r.user_id, 'kind', r.kind, 'state', r.state, 'words', r.words,
                                 'details', r.details, 'shots', r.shots, 'created_at', r.created_at, 'source', r.source, 'subject', r.subject),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'created_at', m.created_at)
                       order by m.created_at, m.id)
      from public.report_messages m where m.report_id = r.id), '[]'::jsonb))
  from public.reports r
  where r.id = p_report;
$$;
comment on function public.my_report(uuid) is 'One of your reports with its conversation, or null.';

-- --- Ask Jonz chats -----------------------------------------------------------------------

create function public.my_ask_chats(p_house uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'updated_at', c.updated_at) order by c.updated_at desc), '[]'::jsonb)
  from (select id, title, updated_at from public.ask_chats where house_id = p_house order by updated_at desc limit 200) c;
$$;
comment on function public.my_ask_chats(uuid) is 'Your Ask Jonz chats in a house, the latest first.';

create function public.my_ask_chat(p_chat uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'title', c.title, 'turns', c.turns) from public.ask_chats c where c.id = p_chat;
$$;
comment on function public.my_ask_chat(uuid) is 'One of your Ask Jonz chats, with its turns.';

-- Keeping a chat stores its last 200 turns (CHAT_SAVED_TURNS), titled by the
-- first thing you asked on one line, cut at a word to 44 characters with an
-- ellipsis (chatTitle in packages/core/src/ask-chats.ts; the two are tested
-- to agree in apps/v1/tests/db). Owners' chats keep the same way.
create function public.chat_title_of(p_turns jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  line text;
  cut text;
  space_at int;
begin
  select regexp_replace(t ->> 'text', '\s+', ' ', 'g') into line
  from jsonb_array_elements(coalesce(p_turns, '[]'::jsonb)) with ordinality as e(t, n)
  where t ->> 'role' = 'user' order by n limit 1;
  line := btrim(coalesce(line, ''));
  if line = '' then
    return 'A chat with Jonz';
  elsif char_length(line) <= 44 then
    return line;
  end if;
  cut := left(line, 43);
  space_at := char_length(cut) - strpos(reverse(cut), ' ') + 1;
  if strpos(cut, ' ') > 0 and space_at - 1 > 22 then cut := left(cut, space_at - 1); end if;
  return regexp_replace(cut, '[\s,.;:–-]+$', '') || '…';
end;
$$;
comment on function public.chat_title_of(jsonb) is 'A saved chat''s title from its turns: core chatTitle.';

create function public.chat_turns_kept(p_turns jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(t order by n), '[]'::jsonb)
  from (select t, n from jsonb_array_elements(coalesce(p_turns, '[]'::jsonb)) with ordinality as e(t, n) order by n desc limit 200) last_turns;
$$;
comment on function public.chat_turns_kept(jsonb) is 'The last 200 turns of a chat (core CHAT_SAVED_TURNS), the ones a saved chat keeps.';

create function public.keep_ask_chat(p_house uuid, p_turns jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.ask_chats (house_id, title, turns)
  values (p_house, public.chat_title_of(p_turns), public.chat_turns_kept(p_turns))
  returning id;
$$;
comment on function public.keep_ask_chat(uuid, jsonb) is 'Keep a new Ask Jonz chat in a house; its id.';

create function public.update_ask_chat(p_chat uuid, p_turns jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ask_chats
  set title = public.chat_title_of(p_turns), turns = public.chat_turns_kept(p_turns)
  where id = p_chat;
$$;
comment on function public.update_ask_chat(uuid, jsonb) is 'Keep an Ask Jonz chat as it now stands.';

create function public.delete_ask_chat(p_chat uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.ask_chats where id = p_chat;
$$;
comment on function public.delete_ask_chat(uuid) is 'Delete one of your Ask Jonz chats for good.';

-- --- Notices ------------------------------------------------------------------------------

create function public.live_notices()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link_label', n.link_label,
                                               'link_url', n.link_url, 'starts_at', n.starts_at, 'ends_at', n.ends_at) order by n.starts_at desc), '[]'::jsonb)
  from (select * from public.notices where starts_at <= now() and (ends_at is null or ends_at > now()) order by starts_at desc limit 50) n;
$$;
comment on function public.live_notices() is 'The notices on now, the latest first.';

-- --- Who may call them --------------------------------------------------------------------

revoke execute on function
  public.my_house(), public.set_my_name(text), public.my_notifications(),
  public.save_notifications(boolean, boolean, boolean, boolean, smallint, smallint, text),
  public.add_push_device(text, text, text), public.remove_push_device(text), public.my_report(uuid),
  public.chat_title_of(jsonb), public.chat_turns_kept(jsonb),
  public.my_ask_chats(uuid), public.my_ask_chat(uuid), public.keep_ask_chat(uuid, jsonb),
  public.update_ask_chat(uuid, jsonb), public.delete_ask_chat(uuid), public.live_notices()
from public, anon;
grant execute on function
  public.my_house(), public.set_my_name(text), public.my_notifications(),
  public.save_notifications(boolean, boolean, boolean, boolean, smallint, smallint, text),
  public.add_push_device(text, text, text), public.remove_push_device(text), public.my_report(uuid),
  public.chat_title_of(jsonb), public.chat_turns_kept(jsonb),
  public.my_ask_chats(uuid), public.my_ask_chat(uuid), public.keep_ask_chat(uuid, jsonb),
  public.update_ask_chat(uuid, jsonb), public.delete_ask_chat(uuid), public.live_notices()
to authenticated;
