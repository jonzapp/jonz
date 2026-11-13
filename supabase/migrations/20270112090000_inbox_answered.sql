-- The owner's Inbox opens on every report in two groups: what's waiting for a
-- reply, then everything else (docs/style/decisions.md, 2026-11-13). The
-- second group is the new state 'answered': exactly what 'waiting' leaves out
-- (replied, fixed, or read and folded into another report), so between them
-- the two groups hold every report once. Otherwise as before.

CREATE OR REPLACE FUNCTION public.owner_reports_find(p_q text DEFAULT ''::text, p_state text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_from text DEFAULT NULL::text, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, house_name text, kind text, state text, words text, created_at timestamp with time zone, last_activity_at timestamp with time zone, source text, subject text, same_as_report_id uuid, also integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      h.name, r.kind, r.state, r.words, r.created_at, r.last_activity_at,
      r.source, r.subject, r.same_as_report_id,
      (select count(*)::integer from public.reports d where d.same_as_report_id = r.id)
    from public.reports r
    left join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.houses h on h.id = r.house_id
    where (p_state is null
        or (p_state = 'waiting' and (r.state = 'new' or (r.state = 'open' and r.same_as_report_id is null)))
        or (p_state = 'answered' and not (r.state = 'new' or (r.state = 'open' and r.same_as_report_id is null)))
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
$function$;

