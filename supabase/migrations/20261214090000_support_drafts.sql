-- The support agent (docs/specs/report-a-problem.md, "The support agent").
--
-- When the owner opens a waiting report, Jonz suggests a reply and maybe
-- one step, reading as the owner's own session with their code. Each
-- suggestion is kept, one for each thing its sender said, so opening the
-- report again shows the same one and Claude is asked once. Only the
-- owner's session reads or writes them, through the functions below, never
-- the service role. Nothing here sends, folds or deletes: the owner does
-- that with the Inbox's own calls, then marks the suggestion used.

create table public.support_drafts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  -- The sender's newest message it answers; null for their first words.
  report_message_id bigint references public.report_messages (id) on delete cascade,
  drafted_by uuid references public.profiles (id) on delete set null,
  state text not null default 'drafting',
  reply text not null default '' check (char_length(reply) <= 2000),
  action text not null default 'none',
  same_as_report_id uuid references public.reports (id) on delete set null,
  why text not null default '' check (char_length(why) <= 600),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_drafts_state_check check (state in ('drafting', 'ready', 'used', 'dismissed', 'failed')),
  constraint support_drafts_action_check check (action in ('none', 'same_as', 'delete'))
);
create unique index support_drafts_report_id_report_message_id_key
  on public.support_drafts (report_id, report_message_id) nulls not distinct;
create index support_drafts_report_message_id_idx on public.support_drafts (report_message_id);
create index support_drafts_same_as_report_id_idx on public.support_drafts (same_as_report_id);
create index support_drafts_drafted_by_created_at_idx on public.support_drafts (drafted_by, created_at desc);

create trigger support_drafts_set_updated_at before update on public.support_drafts
  for each row execute function public.set_updated_at();

alter table public.support_drafts enable row level security;

create policy "the owner sees support drafts" on public.support_drafts
  for select to authenticated
  using ((select public.is_owner()));

grant select on public.support_drafts to authenticated;

comment on table public.support_drafts is 'The support agent''s suggested replies and steps on reports, for the owner.';

-- A draft as the Inbox reads it, with the report it would fold into.
create function public.support_draft_json(d public.support_drafts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'state', d.state,
    'reply', d.reply,
    'action', d.action,
    'why', d.why,
    'same_as', case when d.same_as_report_id is null then null else (
      select jsonb_build_object('id', s.id, 'words', s.words, 'state', s.state,
        'name', coalesce(p.display_name, s.from_name, s.from_email))
      from public.reports s left join public.profiles p on p.id = s.user_id
      where s.id = d.same_as_report_id
    ) end
  );
$$;

-- The draft for what a report's sender said last: the one kept from
-- before ("fresh": false), or a new one to write ("fresh": true) if the
-- day's limit allows. One still being written for over two minutes, or
-- one that failed, is written again.
create function public.claim_support_draft(p_report uuid, p_message bigint, p_limit integer)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  d public.support_drafts;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_message is not null and not exists (
    select 1 from public.report_messages m where m.id = p_message and m.report_id = p_report and not m.from_owner
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('support.draft:' || p_report::text, 0));
  select * into d from public.support_drafts
  where report_id = p_report and report_message_id is not distinct from p_message;
  if d.id is not null and not (d.state = 'failed' or (d.state = 'drafting' and d.updated_at < now() - interval '2 minutes')) then
    return jsonb_build_object('fresh', false, 'draft', public.support_draft_json(d));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('support.limit:' || me::text, 0));
  if (select count(*) from public.support_drafts where drafted_by = me and updated_at >= now() - interval '24 hours') >= p_limit then
    raise exception 'support_limit';
  end if;
  if d.id is null then
    insert into public.support_drafts (report_id, report_message_id, drafted_by)
    values (p_report, p_message, me)
    returning * into d;
  else
    update public.support_drafts
    set state = 'drafting', drafted_by = me, reply = '', action = 'none', same_as_report_id = null, why = ''
    where id = d.id
    returning * into d;
  end if;
  return jsonb_build_object('fresh', true, 'draft', public.support_draft_json(d));
end;
$$;

-- What Jonz suggests on a draft it's writing. A fold must name another
-- report; a deletion, a report whose sender has an account. Anything else
-- is kept as a reply alone. An empty reply means it couldn't: failed.
create function public.finish_support_draft(
  p_draft uuid,
  p_reply text,
  p_action text,
  p_same_as uuid,
  p_why text,
  p_input integer,
  p_output integer
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.support_drafts;
  r public.reports;
  act text := coalesce(p_action, 'none');
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into d from public.support_drafts where id = p_draft and state = 'drafting';
  if d.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = d.report_id;
  if act = 'same_as' and (p_same_as is null or p_same_as = r.id
      or not exists (select 1 from public.reports s where s.id = p_same_as)) then
    act := 'none';
  end if;
  if act = 'delete' and r.user_id is null then
    act := 'none';
  end if;
  if act not in ('none', 'same_as', 'delete') then
    act := 'none';
  end if;
  update public.support_drafts
  set state = case when btrim(coalesce(p_reply, '')) = '' then 'failed' else 'ready' end,
      reply = left(coalesce(p_reply, ''), 2000),
      action = act,
      same_as_report_id = case when act = 'same_as' then p_same_as end,
      why = left(coalesce(p_why, ''), 600),
      input_tokens = greatest(coalesce(p_input, 0), 0),
      output_tokens = greatest(coalesce(p_output, 0), 0)
  where id = d.id
  returning * into d;
  return public.support_draft_json(d);
end;
$$;

-- The owner used a suggestion (sent it, maybe with its step) or set it aside.
create function public.owner_set_support_draft(p_draft uuid, p_state text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_state not in ('used', 'dismissed') then
    raise exception 'bad_state' using errcode = 'P0001';
  end if;
  update public.support_drafts set state = p_state where id = p_draft and state = 'ready';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.support_draft_json(public.support_drafts) from public, anon, authenticated;
revoke execute on function
  public.claim_support_draft(uuid, bigint, integer),
  public.finish_support_draft(uuid, text, text, uuid, text, integer, integer),
  public.owner_set_support_draft(uuid, text)
from public, anon;
grant execute on function
  public.claim_support_draft(uuid, bigint, integer),
  public.finish_support_draft(uuid, text, text, uuid, text, integer, integer),
  public.owner_set_support_draft(uuid, text)
to authenticated;
