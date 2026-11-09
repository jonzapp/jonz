-- The owner's own reads and chats as database functions (docs/specs/api.md,
-- step C2): every notice and the audit log, narrowed and paged, and the
-- owner's Ask Jonz chats. Each is security invoker, so the tables' rules
-- (the owner, with their second factor, by can_app) still decide.

-- Each function asks its operation's permission first (admin:read, the
-- registry's guard), so the database refuses as the API does: owner_only.
create function public.check_can_app(p_perm text)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.can_app(p_perm) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
end;
$$;
comment on function public.check_can_app(text) is 'Refuses (42501, owner_only) unless you hold an app permission, with your second factor.';

-- What the search box typed, kept to letters, digits, spaces and @ . _ ' -
-- so nothing typed can change a filter itself (core admin-list.ts searchWords),
-- and made safe inside a LIKE pattern.
create function public.search_words(p_q text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(normalize(coalesce(p_q, ''), nfkc), '[^[:alpha:][:digit:] @._''-]', ' ', 'g'), '\s+', ' ', 'g')), 100), '');
$$;
comment on function public.search_words(text) is 'The search box''s words, kept to letters, digits, spaces and @ . _ '' -: core searchWords.';

create function public.like_escaped(p_words text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select replace(replace(replace(p_words, '\', '\\'), '%', '\%'), '_', '\_');
$$;
comment on function public.like_escaped(text) is 'Words to put inside a LIKE pattern, matched as they are.';

-- --- Every notice -----------------------------------------------------------------------------

-- The notices a filter matches: words in the title or body, a kind, whether
-- it's on now, starting later or over, and when it started.
create function public.owner_notices_matching(
  p_q text,
  p_kind text,
  p_state text,
  p_after timestamptz,
  p_before timestamptz
)
returns setof public.notices
language sql
stable
security invoker
set search_path = ''
as $$
  select n.*
  from public.notices n,
       lateral (select '%' || public.like_escaped(public.search_words(p_q)) || '%' as pattern) w
  where (p_kind is null or n.kind = p_kind)
    and (p_state is null
         or (p_state = 'scheduled' and n.starts_at > now())
         or (p_state = 'live' and n.starts_at <= now() and (n.ends_at is null or n.ends_at > now()))
         or (p_state = 'ended' and n.ends_at <= now()))
    and (p_after is null or n.starts_at > p_after)
    and (p_before is null or n.starts_at <= p_before)
    and (w.pattern is null or n.title ilike w.pattern or n.body ilike w.pattern);
$$;
comment on function public.owner_notices_matching(text, text, text, timestamptz, timestamptz) is 'The notices an Every notice filter matches.';

create function public.owner_notices_page(
  p_q text default null,
  p_kind text default null,
  p_state text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 50,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (id uuid, kind text, title text, body text, link_label text, link_url text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select n.id, n.kind, n.title, n.body, n.link_label, n.link_url, n.starts_at, n.ends_at
  from public.owner_notices_matching(p_q, p_kind, p_state, p_after, p_before) n
  where p_cursor_at is null or (n.starts_at, n.id) < (p_cursor_at, p_cursor_id)
  order by n.starts_at desc, n.id desc
  limit p_limit;
$$;
comment on function public.owner_notices_page(text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid) is 'Every notice, newest start first, a page at a time.';

create function public.owner_notices_count(
  p_q text default null,
  p_kind text default null,
  p_state text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select count(*)::int from public.owner_notices_matching(p_q, p_kind, p_state, p_after, p_before);
$$;
comment on function public.owner_notices_count(text, text, text, timestamptz, timestamptz) is 'How many notices a filter matches.';

-- --- The audit log ----------------------------------------------------------------------------

-- The entries a filter matches: Who (you, someone else, or Jonz itself),
-- What (the start of the action), When, and the search box: an entry
-- number finds that entry (or an account id starting with its digits);
-- words find an account id starting with them, or a reason or a notice's
-- title that has them (core auditSearchFilter).
create function public.owner_audit_matching(
  p_q text,
  p_who text,
  p_what text,
  p_after timestamptz,
  p_before timestamptz
)
returns setof public.admin_audit
language sql
stable
security invoker
set search_path = ''
as $$
  select a.*
  from public.admin_audit a,
       lateral (select public.search_words(p_q) as words) w,
       lateral (select public.like_escaped(replace(w.words, '#', '')) as safe) s
  where (p_who is null or p_who = 'anyone'
         or (p_who = 'you' and a.actor = (select auth.uid()))
         or (p_who = 'others' and a.actor is not null and a.actor <> (select auth.uid()))
         or (p_who = 'jonz' and a.actor is null))
    and (p_what is null or p_what = 'anything'
         or (p_what = 'notices' and a.action like 'notice.%')
         or (p_what = 'accounts' and a.action like 'account.%'))
    and (p_after is null or a.created_at > p_after)
    and (p_before is null or a.created_at <= p_before)
    and (w.words is null
         or (w.words ~ '^#?\d{1,15}$' and (a.id = replace(w.words, '#', '')::bigint or a.target_id ilike s.safe || '%'))
         or (w.words !~ '^#?\d{1,15}$' and (
               a.target_id ilike s.safe || '%'
               or a.reason ilike '%' || s.safe || '%'
               or a.after ->> 'title' ilike '%' || s.safe || '%'
               or a.before ->> 'title' ilike '%' || s.safe || '%')));
$$;
comment on function public.owner_audit_matching(text, text, text, timestamptz, timestamptz) is 'The audit entries an audit log filter matches.';

create function public.owner_audit_page(
  p_q text default null,
  p_who text default null,
  p_what text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 50,
  p_cursor_at timestamptz default null,
  p_cursor_id bigint default null
)
returns table (id bigint, created_at timestamptz, actor uuid, action text, target_kind text, target_id text, reason text, before jsonb, after jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select a.id, a.created_at, a.actor, a.action, a.target_kind, a.target_id, a.reason, a.before, a.after
  from public.owner_audit_matching(p_q, p_who, p_what, p_after, p_before) a
  where p_cursor_at is null or (a.created_at, a.id) < (p_cursor_at, p_cursor_id)
  order by a.created_at desc, a.id desc
  limit p_limit;
$$;
comment on function public.owner_audit_page(text, text, text, timestamptz, timestamptz, integer, timestamptz, bigint) is 'The audit log, newest first, a page at a time.';

create function public.owner_audit_count(
  p_q text default null,
  p_who text default null,
  p_what text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select count(*)::int from public.owner_audit_matching(p_q, p_who, p_what, p_after, p_before);
$$;
comment on function public.owner_audit_count(text, text, text, timestamptz, timestamptz) is 'How many audit entries a filter matches.';

create function public.owner_audit_entry(p_entry bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select jsonb_build_object('id', a.id, 'created_at', a.created_at, 'actor', a.actor, 'action', a.action, 'target_kind', a.target_kind,
                            'target_id', a.target_id, 'reason', a.reason, 'before', a.before, 'after', a.after)
  from public.admin_audit a
  where a.id = p_entry;
$$;
comment on function public.owner_audit_entry(bigint) is 'One entry of the audit log, or null.';

-- --- The owner's Ask Jonz chats ---------------------------------------------------------------

create function public.owner_ask_chats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'updated_at', c.updated_at) order by c.updated_at desc), '[]'::jsonb)
  from (select id, title, updated_at from public.owner_ask_chats order by updated_at desc limit 200) c;
$$;
comment on function public.owner_ask_chats() is 'Your saved owner Ask Jonz chats, the latest first.';

create function public.owner_ask_chat(p_chat uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  select jsonb_build_object('id', c.id, 'title', c.title, 'turns', c.turns) from public.owner_ask_chats c where c.id = p_chat;
$$;
comment on function public.owner_ask_chat(uuid) is 'One of your owner Ask Jonz chats, with its turns.';

create function public.keep_owner_ask_chat(p_turns jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  insert into public.owner_ask_chats (title, turns)
  values (public.chat_title_of(p_turns), public.chat_turns_kept(p_turns))
  returning id;
$$;
comment on function public.keep_owner_ask_chat(jsonb) is 'Keep a new owner Ask Jonz chat; its id.';

create function public.update_owner_ask_chat(p_chat uuid, p_turns jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  update public.owner_ask_chats
  set title = public.chat_title_of(p_turns), turns = public.chat_turns_kept(p_turns)
  where id = p_chat;
$$;
comment on function public.update_owner_ask_chat(uuid, jsonb) is 'Keep an owner Ask Jonz chat as it now stands.';

create function public.delete_owner_ask_chat(p_chat uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select public.check_can_app('admin:read');
  delete from public.owner_ask_chats where id = p_chat;
$$;
comment on function public.delete_owner_ask_chat(uuid) is 'Delete one of your owner Ask Jonz chats for good.';

-- --- Who can call them ------------------------------------------------------------------------

revoke execute on function
  public.check_can_app(text), public.search_words(text), public.like_escaped(text),
  public.owner_notices_matching(text, text, text, timestamptz, timestamptz),
  public.owner_notices_page(text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid),
  public.owner_notices_count(text, text, text, timestamptz, timestamptz),
  public.owner_audit_matching(text, text, text, timestamptz, timestamptz),
  public.owner_audit_page(text, text, text, timestamptz, timestamptz, integer, timestamptz, bigint),
  public.owner_audit_count(text, text, text, timestamptz, timestamptz),
  public.owner_audit_entry(bigint),
  public.owner_ask_chats(), public.owner_ask_chat(uuid), public.keep_owner_ask_chat(jsonb),
  public.update_owner_ask_chat(uuid, jsonb), public.delete_owner_ask_chat(uuid)
from public, anon;
grant execute on function
  public.check_can_app(text), public.search_words(text), public.like_escaped(text),
  public.owner_notices_matching(text, text, text, timestamptz, timestamptz),
  public.owner_notices_page(text, text, text, timestamptz, timestamptz, integer, timestamptz, uuid),
  public.owner_notices_count(text, text, text, timestamptz, timestamptz),
  public.owner_audit_matching(text, text, text, timestamptz, timestamptz),
  public.owner_audit_page(text, text, text, timestamptz, timestamptz, integer, timestamptz, bigint),
  public.owner_audit_count(text, text, text, timestamptz, timestamptz),
  public.owner_audit_entry(bigint),
  public.owner_ask_chats(), public.owner_ask_chat(uuid), public.keep_owner_ask_chat(jsonb),
  public.update_owner_ask_chat(uuid, jsonb), public.delete_owner_ask_chat(uuid)
to authenticated;
