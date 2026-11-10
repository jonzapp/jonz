-- The audit log's search box finds the words each row shows ("You changed a
-- news notice", "Jonz deleted an account", "Account 1a2b3c4d"), not only a
-- reason, a notice's title or an account id. Every word typed has to be in
-- the entry somewhere, in any order, so "deleted account" finds "deleted an
-- account". An entry number still finds that entry.

-- How a row of the audit log reads: who, what, where and the notice's title,
-- as core owner-admin.ts auditParts says it to the person looking.
create function public.audit_row_words(p_entry public.admin_audit, p_viewer uuid)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  person text := case when p_entry.actor is not null and p_entry.actor = p_viewer then 'You' else 'The owner' end;
  kind text := case p_entry.after ->> 'kind'
                 when 'status' then 'a status notice'
                 when 'offer' then 'an offer'
                 when 'news' then 'a news notice'
                 else 'a notice'
               end;
  title text := p_entry.after ->> 'title';
  account text := 'Account ' || left(p_entry.target_id, 8);
  by_owner boolean := coalesce(p_entry.after ->> 'requested_by' = 'owner', false);
  who text;
  what text;
  place text;
  detail text;
begin
  case p_entry.action
    when 'notice.save' then
      who := person; what := case when p_entry.before is null then 'wrote ' else 'changed ' end || kind; place := 'Notices'; detail := title;
    when 'notice.end' then
      who := person; what := 'ended ' || kind; place := 'Notices'; detail := title;
    when 'account.delete_request' then
      who := case when by_owner then person else 'Someone' end;
      what := case when by_owner then 'started deleting an account' else 'asked to delete their account' end;
      place := account;
    when 'account.delete_keep' then
      who := 'Someone'; what := 'kept their account'; place := account;
    when 'account.delete_stop' then
      who := person; what := 'stopped a deletion'; place := account;
    when 'account.delete_now' then
      who := person; what := 'deleted an account sooner'; place := account;
    when 'account.delete_done' then
      -- The clock does it, on the day.
      who := 'Jonz'; what := 'deleted an account'; place := account;
    else
      who := case when p_entry.actor is null then 'Jonz' else person end; what := p_entry.action; place := p_entry.target_id;
  end case;
  return concat_ws(' ', nullif(who, ''), nullif(what, ''), nullif(place, ''), nullif(detail, ''));
end;
$$;
comment on function public.audit_row_words(public.admin_audit, uuid) is 'How an audit log row reads to someone: core auditRowWords.';

-- As 20261224090000_v1_owner_functions.sql, with the row's own words: every
-- word typed is somewhere in what the row shows, its reason, a notice's
-- title (before or after) or the account id.
create or replace function public.owner_audit_matching(
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
       lateral (select public.search_words(p_q) as words) w
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
         or (w.words ~ '^#?\d{1,15}$'
             and (a.id = replace(w.words, '#', '')::bigint
                  or a.target_id ilike public.like_escaped(replace(w.words, '#', '')) || '%'))
         or (w.words !~ '^#?\d{1,15}$'
             and not exists (
               select 1
               from (select lower(concat_ws(' ', public.audit_row_words(a, (select auth.uid())), a.reason,
                                            a.after ->> 'title', a.before ->> 'title', a.target_id)) as words) shown,
                    unnest(string_to_array(lower(w.words), ' ')) typed (word)
               where strpos(shown.words, typed.word) = 0)));
$$;
comment on function public.owner_audit_matching(text, text, text, timestamptz, timestamptz) is 'The audit entries an audit log filter matches.';
