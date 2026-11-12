-- Opening a report with a message in it failed /v1's contract, so the admin
-- Inbox errored on every report that had a reply (12 Nov 2026): a message's
-- id is a number (report_messages.id is an identity), and the contract read
-- it as a uuid. The id now goes out as text, as the contract says.

CREATE OR REPLACE FUNCTION public.owner_open_report(p_report uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'updated_at', r.last_activity_at,
    'source', r.source,
    'subject', r.subject,
    'same_as', case when r.same_as_report_id is null then null else (
      select jsonb_build_object('id', s.id, 'words', s.words, 'state', s.state,
        'name', coalesce(p.display_name, s.from_name, s.from_email))
      from public.reports s left join public.profiles p on p.id = s.user_id where s.id = r.same_as_report_id
    ) end,
    'also', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'words', d.words, 'state', d.state, 'created_at', d.created_at,
        'name', coalesce(p.display_name, d.from_name, d.from_email)) order by d.created_at, d.id)
      from public.reports d left join public.profiles p on p.id = d.user_id where d.same_as_report_id = r.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id::text, 'from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'at', m.created_at) order by m.created_at, m.id)
      from public.report_messages m where m.report_id = r.id
    ), '[]'::jsonb)
  );
end;
$function$;
