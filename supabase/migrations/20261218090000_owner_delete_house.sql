-- Deleting a whole house, from the owner's admin pages or the owner's Ask
-- Jonz (docs/specs/owner-admin.md, "Houses").
--
-- A new app permission, houses:write, held by the owner role only. The
-- owner's own call, owner_delete_house, asks can_app('houses:write') (an
-- app role with it, with their code this session), then in one go:
--
-- 1. tells everyone who lives there, when it's given the words: one
--    message to the house, by push and email, left in the outbox the way
--    owner_send_message leaves one (the API sends it straight after);
-- 2. writes the audit entry, with what the house was;
-- 3. deletes the house. Its Johns, weeks, Wall, history and billing row go
--    with it (each references the house on delete cascade); reports,
--    messages and promotion uses it named keep their rows, with no house.
--    The people in it keep their accounts, in no house.
--
-- It answers the subscription the house was paying with, so the API can
-- stop it renewing in Stripe: the house is gone, so nothing would ever pay
-- for it again. Safe to run twice.

insert into public.permissions (name, about, scope) values
  ('houses:write', 'Delete a whole house: everyone in it is told, its Pass stops renewing, and it can''t be undone', 'app')
on conflict (name) do update set about = excluded.about, scope = excluded.scope;

insert into public.app_role_permissions (role, permission) values ('owner', 'houses:write')
on conflict do nothing;

create or replace function public.owner_delete_house(
  p_house uuid,
  p_reason text default null,
  p_subject text default null,
  p_body text default null
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  h public.houses;
  sub text;
  people integer;
  msg uuid;
begin
  if not public.can_app('houses:write') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into h from public.houses where id = p_house for update;
  if h.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (p_subject is null) <> (p_body is null)
    or p_subject is not null and (char_length(btrim(p_subject)) not between 1 and 80 or char_length(btrim(p_body)) not between 1 and 500) then
    raise exception 'message_who' using errcode = 'P0001';
  end if;

  select b.stripe_subscription_id into sub from public.house_pass_billing b where b.house_id = h.id;
  select count(*) into people from public.members m where m.house_id = h.id;

  -- Told before it goes, while the house still says who lives there.
  if p_subject is not null then
    select count(*) into people from public.owner_message_people('house', null, h.id);
    if people > 0 then
      insert into public.owner_messages (sent_by, audience, house_id, subject, body, by_push, by_wall, by_email, people, walls)
      values (auth.uid(), 'house', h.id, btrim(p_subject), btrim(p_body), true, false, true, people, 0)
      returning id into msg;
      insert into public.owner_message_outbox (message_id, user_id)
      select msg, w.user_id from public.owner_message_people('house', null, h.id) w;
    end if;
  end if;

  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (
    auth.uid(), 'house.delete', 'house', h.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object(
      'name', h.name, 'kind', h.kind, 'people', people, 'created_at', h.created_at,
      'pass_plan', h.pass_plan, 'pass_ends_at', h.pass_ends_at, 'subscription', sub
    ),
    jsonb_build_object('told', msg is not null, 'message', msg)
  );

  delete from public.houses where id = h.id;

  return jsonb_build_object('name', h.name, 'people', people, 'subscription', sub, 'message', msg);
end;
$$;

comment on function public.owner_delete_house(uuid, text, text, text) is
  'The owner deletes a whole house (houses:write): tells its people when given the words, writes the audit entry, and answers the subscription to stop.';

revoke execute on function public.owner_delete_house(uuid, text, text, text) from public, anon;
grant execute on function public.owner_delete_house(uuid, text, text, text) to authenticated, service_role;
