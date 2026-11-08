-- Database standards, fix PR B (docs/standards/database.md, agreed 7 Nov 2026):
-- the renames. Rows are kept as they are; only names change. Postgres moves
-- keys, indexes, rules and triggers along with a rename but not function
-- bodies, so every function that used an old name is recreated below
-- (rule 24). The app and packages/core/src/db-types.ts change in the same PR.

-- Rule 1: tables are plural.
alter table public.away rename to away_periods;
alter table public.crew rename to crew_members;
alter table public.ledger rename to ledger_entries;
alter table public.on_call rename to on_call_picks;
alter table public.moved_on rename to moves;

-- Rules 3 and 4: pointers end _id (or _by for who did it).
alter table public.assignments rename column handed_by_away to handed_by_away_period_id;
alter table public.assignments rename column handed_from to handed_from_user_id;
alter table public.house_actions rename column actor to done_by;
alter table public.house_actions rename column subject to subject_user_id;
alter table public.houses rename column pass_buyer to pass_bought_by;
alter table public.ledger_entries rename column counterparty to counterparty_user_id;
alter table public.moves rename column from_house to from_house_id;
alter table public.moves rename column to_house to to_house_id;
alter table public.swap_offers rename column mine to asker_assignment_id;
alter table public.swap_offers rename column theirs to asked_assignment_id;
alter table public.swap_offers rename column asked_to to asked_user_id;
alter table public.report_messages rename column author to written_by;
alter table public.reports rename column same_as to same_as_report_id;

-- Rule 6: moments are <verb>_at.
alter table public.account_deletions rename column delete_after to deletes_at;
alter table public.admin_audit rename column at to created_at;
alter table public.report_messages rename column at to created_at;
alter table public.assignments rename column due_moved_from to original_due_at;
alter table public.assignments rename column cover_held_until to cover_hold_ends_at;
alter table public.houses rename column pass_until to pass_ends_at;
alter table public.moves rename column pass_until to pass_ends_at;
-- promotion_uses got created_at (a copy of at) in fix PR A.
alter table public.promotion_uses drop column at;

-- Rule 16: reports.updated_at was really "last activity" (seeing or opening a
-- report doesn't bump it), so it gets that name instead of the trigger.
alter table public.reports rename column updated_at to last_activity_at;
alter table public.app_owners add column created_at timestamptz not null default now();

-- Outside ids say whose and what.
alter table public.house_pass_billing rename column stripe_customer to stripe_customer_id;
alter table public.house_pass_billing rename column stripe_subscription to stripe_subscription_id;
alter table public.moving_pass_billing rename column stripe_customer to stripe_customer_id;
alter table public.moving_pass_billing rename column stripe_subscription to stripe_subscription_id;
alter table public.account_deletions rename column pass_subscription to stripe_subscription_id;
alter table public.promotions rename column stripe_code to stripe_promotion_code_id;
alter table public.promotions rename column stripe_coupon to stripe_coupon_id;

-- Rules 1, 7: keys and indexes follow their table's and columns' new names.
alter table public.assignments rename constraint assignments_handed_by_away_house_id_fkey to assignments_handed_by_away_period_id_house_id_fkey;
alter table public.assignments rename constraint assignments_handed_from_fkey to assignments_handed_from_user_id_fkey;
alter table public.away_periods rename constraint away_check to away_periods_check;
alter table public.away_periods rename constraint away_house_id_user_id_fkey to away_periods_house_id_user_id_fkey;
alter table public.away_periods rename constraint away_id_house_id_key to away_periods_id_house_id_key;
alter table public.away_periods rename constraint away_note_check to away_periods_note_check;
alter table public.away_periods rename constraint away_pkey to away_periods_pkey;
alter table public.crew_members rename constraint crew_assignment_id_house_id_fkey to crew_members_assignment_id_house_id_fkey;
alter table public.crew_members rename constraint crew_house_id_fkey to crew_members_house_id_fkey;
alter table public.crew_members rename constraint crew_pkey to crew_members_pkey;
alter table public.crew_members rename constraint crew_points_check to crew_members_points_check;
alter table public.crew_members rename constraint crew_user_id_fkey to crew_members_user_id_fkey;
alter table public.house_actions rename constraint house_actions_actor_fkey to house_actions_done_by_fkey;
alter table public.house_actions rename constraint house_actions_subject_fkey to house_actions_subject_user_id_fkey;
alter table public.houses rename constraint houses_pass_buyer_fkey to houses_pass_bought_by_fkey;
alter table public.ledger_entries rename constraint ledger_amount_minor_check to ledger_entries_amount_minor_check;
alter table public.ledger_entries rename constraint ledger_assignment_id_house_id_fkey to ledger_entries_assignment_id_house_id_fkey;
alter table public.ledger_entries rename constraint ledger_counterparty_fkey to ledger_entries_counterparty_user_id_fkey;
alter table public.ledger_entries rename constraint ledger_house_id_fkey to ledger_entries_house_id_fkey;
alter table public.ledger_entries rename constraint ledger_kind_check to ledger_entries_kind_check;
alter table public.ledger_entries rename constraint ledger_month_check to ledger_entries_month_check;
alter table public.ledger_entries rename constraint ledger_pkey to ledger_entries_pkey;
alter table public.ledger_entries rename constraint ledger_user_id_fkey to ledger_entries_user_id_fkey;
alter table public.moves rename constraint moved_on_check to moves_check;
alter table public.moves rename constraint moved_on_check1 to moves_check1;
alter table public.moves rename constraint moved_on_check2 to moves_check2;
alter table public.moves rename constraint moved_on_from_house_fkey to moves_from_house_id_fkey;
alter table public.moves rename constraint moved_on_how_check to moves_how_check;
alter table public.moves rename constraint moved_on_pass_plan_check to moves_pass_plan_check;
alter table public.moves rename constraint moved_on_pass_state_check to moves_pass_state_check;
alter table public.moves rename constraint moved_on_pkey to moves_pkey;
alter table public.moves rename constraint moved_on_to_house_fkey to moves_to_house_id_fkey;
alter table public.moves rename constraint moved_on_user_id_fkey to moves_user_id_fkey;
alter table public.on_call_picks rename constraint on_call_house_id_fkey to on_call_picks_house_id_fkey;
alter table public.on_call_picks rename constraint on_call_john_id_house_id_fkey to on_call_picks_john_id_house_id_fkey;
alter table public.on_call_picks rename constraint on_call_pkey to on_call_picks_pkey;
alter table public.on_call_picks rename constraint on_call_user_id_fkey to on_call_picks_user_id_fkey;
alter table public.on_call_picks rename constraint on_call_week_id_house_id_fkey to on_call_picks_week_id_house_id_fkey;
alter table public.report_messages rename constraint report_messages_author_fkey to report_messages_written_by_fkey;
alter table public.reports rename constraint reports_same_as_fkey to reports_same_as_report_id_fkey;
alter table public.swap_offers rename constraint swap_offers_asked_to_fkey to swap_offers_asked_user_id_fkey;
alter table public.swap_offers rename constraint swap_offers_mine_house_id_fkey to swap_offers_asker_assignment_id_house_id_fkey;
alter table public.swap_offers rename constraint swap_offers_theirs_house_id_fkey to swap_offers_asked_assignment_id_house_id_fkey;
alter index public.account_deletions_due rename to account_deletions_deletes_at_idx;
alter index public.account_deletions_one_pending rename to account_deletions_user_id_pending_key;
alter index public.admin_audit_at rename to admin_audit_created_at_idx;
alter index public.ask_chats_mine rename to ask_chats_user_id_house_id_updated_at_idx;
alter index public.assignments_awaits_ok rename to assignments_house_id_awaits_ok_idx;
alter index public.assignments_covered_by rename to assignments_covered_by_idx;
alter index public.assignments_handed_by_away rename to assignments_handed_by_away_period_id_idx;
alter index public.assignments_handed_by_away_house_id_idx rename to assignments_handed_by_away_period_id_house_id_idx;
alter index public.assignments_handed_from_idx rename to assignments_handed_from_user_id_idx;
alter index public.assignments_house_done rename to assignments_house_id_done_at_idx;
alter index public.assignments_house_due rename to assignments_house_id_due_at_idx;
alter index public.assignments_house_open rename to assignments_house_id_open_idx;
alter index public.assignments_job rename to assignments_job_id_idx;
alter index public.assignments_john rename to assignments_john_id_due_at_idx;
alter index public.assignments_one_place_each rename to assignments_job_id_user_id_key;
alter index public.assignments_open_flags rename to assignments_john_id_open_flags_idx;
alter index public.assignments_user rename to assignments_user_id_idx;
alter index public.away_house rename to away_periods_house_id_ends_on_idx;
alter index public.away_house_id_user_id_idx rename to away_periods_house_id_user_id_idx;
alter index public.crew_assignment_id_house_id_idx rename to crew_members_assignment_id_house_id_idx;
alter index public.crew_house rename to crew_members_house_id_idx;
alter index public.crew_user_id_idx rename to crew_members_user_id_idx;
alter index public.disputes_one_open rename to disputes_assignment_id_open_key;
alter index public.events_house rename to events_house_id_created_at_idx;
alter index public.events_untold rename to events_house_id_untold_idx;
alter index public.house_actions_house rename to house_actions_house_id_created_at_idx;
alter index public.house_actions_mine rename to house_actions_done_by_created_at_idx;
alter index public.house_actions_subject_idx rename to house_actions_subject_user_id_idx;
alter index public.house_drafts_house_day rename to house_drafts_house_id_created_at_idx;
alter index public.house_drafts_user_day rename to house_drafts_user_id_created_at_idx;
alter index public.houses_pass_buyer_idx rename to houses_pass_bought_by_idx;
alter index public.johns_house rename to johns_house_id_live_idx;
alter index public.ledger_assignment_id_house_id_idx rename to ledger_entries_assignment_id_house_id_idx;
alter index public.ledger_counterparty_idx rename to ledger_entries_counterparty_user_id_idx;
alter index public.ledger_house rename to ledger_entries_house_id_month_idx;
alter index public.ledger_one_close rename to ledger_entries_month_close_key;
alter index public.ledger_one_forfeit rename to ledger_entries_assignment_id_forfeit_key;
alter index public.ledger_user_id_idx rename to ledger_entries_user_id_idx;
alter index public.members_one_house rename to members_user_id_key;
alter index public.moved_on_from_house_idx rename to moves_from_house_id_idx;
alter index public.moved_on_to_house_idx rename to moves_to_house_id_idx;
alter index public.moved_on_user rename to moves_user_id_left_at_idx;
alter index public.moved_on_waiting rename to moves_left_at_waiting_idx;
alter index public.moving_pass_billing_subscription rename to moving_pass_billing_stripe_subscription_id_idx;
alter index public.notices_live rename to notices_starts_at_ends_at_idx;
alter index public.on_call_house rename to on_call_picks_house_id_idx;
alter index public.on_call_john_id_house_id_idx rename to on_call_picks_john_id_house_id_idx;
alter index public.on_call_user_id_idx rename to on_call_picks_user_id_idx;
alter index public.on_call_week_id_house_id_idx rename to on_call_picks_week_id_house_id_idx;
alter index public.owner_ask_turns_owner_at rename to owner_ask_turns_owner_id_asked_at_idx;
alter index public.owner_messages_sent rename to owner_messages_sent_at_id_idx;
alter index public.pocket_earnings_house rename to pocket_earnings_house_id_month_idx;
alter index public.pocket_pays_house rename to pocket_pays_house_id_month_idx;
alter index public.promotions_made rename to promotions_made_at_id_idx;
alter index public.report_messages_author_idx rename to report_messages_written_by_idx;
alter index public.report_messages_report rename to report_messages_report_id_created_at_idx;
alter index public.reports_created rename to reports_created_at_id_idx;
alter index public.reports_from_email rename to reports_from_email_created_at_idx;
alter index public.reports_same_as rename to reports_same_as_report_id_idx;
alter index public.reports_user rename to reports_user_id_created_at_idx;
alter index public.reports_waiting rename to reports_created_at_id_waiting_idx;
alter index public.swap_offers_asked_to_idx rename to swap_offers_asked_user_id_idx;
alter index public.swap_offers_house rename to swap_offers_house_id_created_at_idx;
alter index public.swap_offers_mine_house_id_idx rename to swap_offers_asker_assignment_id_house_id_idx;
alter index public.swap_offers_one_open rename to swap_offers_asker_assignment_id_open_key;
alter index public.swap_offers_theirs_house_id_idx rename to swap_offers_asked_assignment_id_house_id_idx;
alter index public.week_shares_house rename to week_shares_house_id_idx;
create index promotion_uses_promotion_id_created_at_idx on public.promotion_uses (promotion_id, created_at desc);

-- Saved undo snapshots (admin resets) hold whole rows as json, keyed by
-- column name. Rename those keys too, so undoing an old reset still works.
create function pg_temp.renamed(rows jsonb, pairs text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg((
    select jsonb_object_agg(case when array_position(pairs, k) % 2 = 1 then pairs[array_position(pairs, k) + 1] else k end, v)
    from jsonb_each(r) as e(k, v)
  )), '[]'::jsonb)
  from jsonb_array_elements(rows) r
$$;

update public.house_actions
set data = jsonb_set(jsonb_set(data,
  '{snapshot,assignments}', pg_temp.renamed(data #> '{snapshot,assignments}', array[
    'handed_by_away', 'handed_by_away_period_id', 'handed_from', 'handed_from_user_id',
    'due_moved_from', 'original_due_at', 'cover_held_until', 'cover_hold_ends_at'])),
  '{snapshot,ledger}', pg_temp.renamed(data #> '{snapshot,ledger}', array['counterparty', 'counterparty_user_id']))
where jsonb_typeof(data #> '{snapshot,assignments}') = 'array'
  and jsonb_typeof(data #> '{snapshot,ledger}') = 'array';

-- Rule 24: functions don't follow a rename, so every one that used an old
-- name is recreated. Those whose result columns were renamed are dropped first
-- and their grants put back after.
drop function public.house_history(p_house uuid, p_before timestamp with time zone, p_limit integer);
drop function public.moving_on();
drop function public.my_reports();
drop function public.owner_deletions();
drop function public.owner_deletions_find(p_q text, p_by text, p_goes text, p_after timestamp with time zone, p_before timestamp with time zone);
drop function public.owner_deletions_page(p_q text, p_by text, p_goes text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_user uuid, p_limit integer);
drop function public.owner_houses_match(p_q text, p_pass text, p_active text, p_after timestamp with time zone, p_before timestamp with time zone);
drop function public.owner_houses_page(p_q text, p_pass text, p_active text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer);
drop function public.owner_reports_find(p_q text, p_state text, p_kind text, p_from text, p_after timestamp with time zone, p_before timestamp with time zone);
drop function public.owner_reports_page(p_q text, p_state text, p_kind text, p_from text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer);

CREATE OR REPLACE FUNCTION public.account_deletion_preview()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'house', h.name,
    'pass_until', case
      when h.pass_bought_by = me.id and h.pass_plan in ('monthly', 'yearly') and h.pass_ends_at > now()
      then (h.pass_ends_at at time zone h.timezone)::date
    end,
    'delete_after', now() + interval '30 days'
  )
  from (select auth.uid() as id) me
  left join public.members m on m.user_id = me.id
  left join public.houses h on h.id = m.house_id
  where me.id is not null;
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('delete_after', d.deletes_at, 'requested_by', d.requested_by)
  from public.account_deletions d
  where d.user_id = auth.uid() and d.state = 'pending';
$function$;

CREATE OR REPLACE FUNCTION public.add_correction(p_house uuid, p_user uuid, p_amount integer, p_month text, p_assignment uuid)
 RETURNS bigint[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  others uuid[];
  ids bigint[] := '{}';
  n integer;
  base integer;
  extra integer;
  i integer := 0;
  o uuid;
  lid bigint;
begin
  if p_amount = 0 then
    return ids;
  end if;
  select array_agg(user_id order by joined_at, user_id) into others
  from public.members where house_id = p_house and user_id <> p_user;
  n := coalesce(cardinality(others), 0);
  if n = 0 then
    -- A house of one keeps everything anyway.
    return ids;
  end if;
  insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id)
  values (p_house, p_user, 'correction', p_amount, p_month, p_assignment)
  returning ledger_entries.id into lid;
  ids := ids || lid;
  base := abs(p_amount) / n;
  extra := abs(p_amount) - base * n;
  foreach o in array others loop
    i := i + 1;
    if base + (case when i <= extra then 1 else 0 end) = 0 then
      continue;
    end if;
    insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id, counterparty_user_id)
    values (p_house, o, 'correction', -sign(p_amount)::integer * (base + case when i <= extra then 1 else 0 end),
            p_month, p_assignment, p_user)
    returning ledger_entries.id into lid;
    ids := ids || lid;
  end loop;
  return ids;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset(p_actor uuid, p_house uuid, p_kind text, p_target jsonb, p_forfeits jsonb DEFAULT '{}'::jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h public.houses;
  w public.weeks;
  a public.assignments;
  f public.ledger_entries;
  target public.assignments;
  v_outcome text;
  lid bigint;
  month_now text;
  month_of text;
  closed boolean;
  people jsonb := '{}'::jsonb;
  told uuid[] := '{}';
  ids uuid[] := '{}';
  flag_ids uuid[] := '{}';
  added bigint[] := '{}';
  reopened integer := 0;
  past_due integer := 0;
  n_flags integer := 0;
  n_disputes integer := 0;
  correction boolean := false;
  nothing boolean;
  old_forfeit integer;
  new_forfeit integer;
  credit_before uuid;
  credit_after uuid;
  sharers uuid[];
  s uuid;
  snapshot jsonb;
  action uuid;
  event uuid;
  v_subject uuid;
  v_name text;
  v_month text;
  w_month text;
begin
  select * into h from public.houses where id = p_house;
  if h.id is null or not public.user_can(p_house, p_actor, 'history.reset') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  month_now := to_char(now() at time zone h.timezone, 'YYYY-MM');

  -- --- What it touches.
  if p_kind = 'result' then
    select * into target from public.assignments
    where id = (p_target ->> 'assignment')::uuid and house_id = p_house for update;
    if target.id is null then
      raise exception 'not_found';
    end if;
    v_outcome := p_target ->> 'outcome';
    if v_outcome is null or v_outcome not in ('done', 'late', 'missed', 'excused') then
      raise exception 'unknown_outcome' using errcode = '22023';
    end if;
    if exists (select 1 from public.disputes where assignment_id = target.id and resolution is null) then
      raise exception 'disputed';
    end if;
    select * into w from public.weeks where id = target.week_id;
    ids := array[target.id];
    v_subject := target.user_id;
    v_name := target.name;
  elsif p_kind in ('person_week', 'week', 'redeal', 'skip') then
    select * into w from public.weeks where id = (p_target ->> 'week')::uuid and house_id = p_house for update;
    if w.id is null then
      raise exception 'not_found';
    end if;
    if p_kind = 'skip' and w.skipped_at is not null then
      raise exception 'already_skipped';
    end if;
    if p_kind <> 'skip' and w.closed_at is not null then
      raise exception 'week_closed';
    end if;
    if p_kind = 'person_week' then
      v_subject := (p_target ->> 'user')::uuid;
      select array_agg(id) into ids from public.assignments
      where week_id = w.id and user_id = v_subject
        and (done_at is not null or outcome is not null or covered_by is not null);
    elsif p_kind = 'skip' then
      select array_agg(id) into ids from public.assignments where week_id = w.id;
    else
      -- Flags go; everything else ticked or settled goes back to open.
      select array_agg(id) into flag_ids from public.assignments where week_id = w.id and flagged_at is not null;
      select array_agg(id) into ids from public.assignments
      where week_id = w.id and flagged_at is null
        and (done_at is not null or outcome is not null or covered_by is not null);
    end if;
    ids := coalesce(ids, '{}');
    flag_ids := coalesce(flag_ids, '{}');
  elsif p_kind = 'letoff' then
    v_month := p_target ->> 'month';
    if v_month is null or v_month !~ '^\d{4}-\d{2}$' then
      raise exception 'unknown_month' using errcode = '22023';
    end if;
    if exists (select 1 from public.month_let_offs where house_id = p_house and month_let_offs.month = v_month) then
      raise exception 'already_let_off';
    end if;
    select coalesce(array_agg(distinct l.assignment_id) filter (where l.assignment_id is not null), '{}') into ids
    from public.ledger_entries l where l.house_id = p_house and l.month = v_month and l.kind = 'forfeit';
  else
    raise exception 'unknown_reset' using errcode = '22023';
  end if;
  if w.id is not null then
    w_month := to_char(w.starts_at at time zone h.timezone, 'YYYY-MM');
  end if;

  -- --- The tally.
  for a in select * from public.assignments where id = any (ids) loop
    month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
    closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    credit_before := public.credited_to(a);
    if p_kind = 'result' then
      new_forfeit := case v_outcome
        when 'late' then coalesce((p_forfeits ->> 'late')::integer, 0)
        when 'missed' then coalesce((p_forfeits ->> 'missed')::integer, 0)
        else 0 end;
      credit_after := case when v_outcome = 'missed' then null else a.user_id end;
    elsif p_kind = 'skip' then
      new_forfeit := 0;
      credit_after := null;
    elsif p_kind = 'letoff' then
      new_forfeit := 0;
      credit_after := credit_before;
    else
      new_forfeit := 0;
      credit_after := a.user_id;
      reopened := reopened + 1;
      if a.due_at < now() then
        past_due := past_due + 1;
      end if;
    end if;
    if p_kind in ('person_week', 'week', 'redeal') and a.done_at is not null then
      people := public.reset_bump(people, coalesce(a.covered_by, a.user_id), 'ticks', 1);
    end if;
    -- Balances only move for weeks the deal has counted (any week before this one).
    if p_kind <> 'skip' and credit_before is distinct from credit_after then
      people := public.reset_bump(people, credit_before, 'points', -a.points);
      people := public.reset_bump(people, credit_after, 'points', a.points);
    elsif p_kind = 'skip' then
      people := public.reset_bump(people, credit_before, 'points', -a.points);
    end if;
    if old_forfeit <> new_forfeit then
      people := public.reset_bump(people, a.user_id, 'forfeit', old_forfeit - new_forfeit);
      correction := correction or closed;
    end if;
    told := told || a.user_id || a.covered_by;
  end loop;

  for a in select * from public.assignments where id = any (flag_ids) loop
    n_flags := n_flags + 1;
    if a.done_at is not null then
      people := public.reset_bump(people, coalesce(a.covered_by, a.user_id), 'ticks', 1);
    end if;
    people := public.reset_bump(people, public.credited_to(a), 'points', -a.points);
    sharers := public.flag_sharers(a.john_id);
    foreach s in array sharers loop
      people := public.reset_bump(people, s, 'points', round(a.points::numeric / greatest(cardinality(sharers), 1), 2));
    end loop;
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    if old_forfeit <> 0 then
      people := public.reset_bump(people, a.user_id, 'forfeit', old_forfeit);
    end if;
    told := told || a.user_id || a.covered_by;
  end loop;

  if p_kind = 'skip' then
    -- What everyone owed for the week comes off too.
    declare
      sh record;
    begin
      for sh in select user_id, share from public.week_shares where week_id = w.id loop
        people := public.reset_bump(people, sh.user_id, 'points', sh.share);
        told := told || sh.user_id;
      end loop;
    end;
  end if;

  if p_kind = 'letoff' then
    -- The tally is the month's forfeits, per person.
    people := '{}'::jsonb;
    declare
      r record;
    begin
      for r in
        select user_id, -sum(amount_minor)::integer as amount from public.ledger_entries
        where house_id = p_house and ledger_entries.month = v_month and kind = 'forfeit' group by user_id
      loop
        people := public.reset_bump(people, r.user_id, 'forfeit', r.amount);
        told := told || r.user_id;
      end loop;
    end;
    correction := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = v_month);
  end if;

  select count(*) into n_disputes from public.disputes
  where resolution is null and (assignment_id = any (ids) or assignment_id = any (flag_ids));

  select coalesce(array_agg(distinct t), '{}') into told from unnest(told) t where t is not null and t <> p_actor;
  nothing := case p_kind
    when 'skip' then false
    when 'redeal' then false
    when 'letoff' then people = '{}'::jsonb
    else cardinality(ids) + cardinality(flag_ids) = 0 end;

  if not p_apply then
    return jsonb_build_object(
      'kind', p_kind,
      'week', case when w.id is null then null else jsonb_build_object(
        'id', w.id, 'starts_on', w.starts_on, 'starts_at', w.starts_at, 'ends_at', w.ends_at) end,
      'month', coalesce(v_month, w_month, to_char(target.due_at at time zone h.timezone, 'YYYY-MM')),
      'people', people,
      'told', to_jsonb(told),
      'reopened', reopened,
      'past_due', past_due,
      'flags', n_flags,
      'disputes', n_disputes,
      'correction', correction,
      'nothing', nothing
    );
  end if;

  if nothing then
    raise exception 'nothing_to_reset';
  end if;

  -- --- What undoing it needs: every row it changes, as it was.
  snapshot := jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(to_jsonb(x)) from public.assignments x
                             where x.id = any (ids) or x.id = any (flag_ids)
                                or (p_kind = 'redeal' and x.week_id = w.id)), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l)) from public.ledger_entries l
                        where l.kind = 'forfeit' and (l.assignment_id = any (ids) or l.assignment_id = any (flag_ids)
                          or (p_kind = 'letoff' and l.house_id = p_house and l.month = v_month))), '[]'::jsonb),
    'disputes', coalesce((select jsonb_agg(to_jsonb(d)) from public.disputes d
                          where d.assignment_id = any (ids) or d.assignment_id = any (flag_ids)), '[]'::jsonb),
    'votes', coalesce((select jsonb_agg(to_jsonb(v)) from public.dispute_votes v join public.disputes d on d.id = v.dispute_id
                       where d.assignment_id = any (ids) or d.assignment_id = any (flag_ids)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from public.events e
                        where (e.assignment_id = any (ids) or e.assignment_id = any (flag_ids))
                          and e.kind in ('done', 'late', 'covered', 'missed', 'flagged', 'disputed', 'immunity_used')), '[]'::jsonb),
    'shares', case when w.id is null then '[]'::jsonb else coalesce(
      (select jsonb_agg(to_jsonb(ws)) from public.week_shares ws where ws.week_id = w.id), '[]'::jsonb) end,
    'on_call', case when p_kind = 'redeal' then coalesce(
      (select jsonb_agg(to_jsonb(oc)) from public.on_call_picks oc where oc.week_id = w.id), '[]'::jsonb) else '[]'::jsonb end,
    'skipped_at', w.skipped_at
  );

  -- --- The change.
  if p_kind = 'result' then
    a := target;
    month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
    closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
    select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
    from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    new_forfeit := case v_outcome
      when 'late' then coalesce((p_forfeits ->> 'late')::integer, 0)
      when 'missed' then coalesce((p_forfeits ->> 'missed')::integer, 0)
      else 0 end;
    if closed then
      added := added || public.add_correction(p_house, a.user_id, old_forfeit - new_forfeit, month_now, a.id);
    else
      delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      if new_forfeit > 0 then
        insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id)
        values (p_house, a.user_id, 'forfeit', -new_forfeit, month_of, a.id)
        returning id into lid;
        added := added || lid;
      end if;
    end if;
    update public.assignments
    set outcome = v_outcome,
        settled_at = coalesce(settled_at, now()),
        excused = v_outcome = 'excused',
        covered_by = null,
        done_at = case when v_outcome in ('done', 'late') then coalesce(done_at, least(now(), due_at)) end,
        changed_by = p_actor,
        changed_at = now()
    where id = a.id;
    delete from public.events where assignment_id = a.id and kind in ('missed', 'covered')
      and v_outcome <> 'missed';
  elsif p_kind in ('person_week', 'week', 'redeal') then
    for a in select * from public.assignments where id = any (ids) or id = any (flag_ids) loop
      month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
      closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
      select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
      from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      if old_forfeit <> 0 and closed then
        added := added || public.add_correction(p_house, a.user_id, old_forfeit, month_now, a.id);
      else
        delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      end if;
    end loop;
    delete from public.disputes where assignment_id = any (ids) or assignment_id = any (flag_ids);
    delete from public.events
    where (assignment_id = any (ids)) and kind in ('done', 'late', 'covered', 'missed', 'immunity_used');
    -- A flag goes with its points (and, with it, its Wall post).
    for a in select * from public.assignments where id = any (flag_ids) loop
      sharers := public.flag_sharers(a.john_id);
      update public.week_shares
      set share = greatest(share - round(a.points::numeric / greatest(cardinality(sharers), 1), 2), 0)
      where week_id = a.week_id and user_id = any (sharers);
    end loop;
    delete from public.assignments where id = any (flag_ids);
    update public.assignments
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null,
        excused = false, changed_by = p_actor, changed_at = now()
    where id = any (ids);
  elsif p_kind = 'skip' then
    for a in select * from public.assignments where id = any (ids) loop
      month_of := to_char(a.due_at at time zone h.timezone, 'YYYY-MM');
      closed := exists (select 1 from public.month_closes where house_id = p_house and month_closes.month = month_of);
      select coalesce(-sum(amount_minor), 0)::integer into old_forfeit
      from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      if old_forfeit <> 0 and closed then
        added := added || public.add_correction(p_house, a.user_id, old_forfeit, month_now, a.id);
      else
        delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
      end if;
    end loop;
    delete from public.disputes where assignment_id = any (ids) and resolution is null;
    -- Whatever wasn't done is let off; whatever was keeps its mark.
    update public.assignments
    set excused = true, outcome = 'excused', settled_at = now()
    where id = any (ids) and outcome is null and done_at is null;
    update public.assignments
    set outcome = case when done_at <= due_at then 'done' else 'late' end, settled_at = now()
    where id = any (ids) and outcome is null;
    update public.weeks set skipped_at = now(), skipped_by = p_actor where id = w.id;
  elsif p_kind = 'letoff' then
    if correction then
      declare
        r record;
      begin
        -- The month's forfeits, cap refunds and shares, each person's net, handed back.
        for r in
          select user_id, sum(amount_minor)::integer as net from public.ledger_entries
          where house_id = p_house and ledger_entries.month = v_month and kind in ('forfeit', 'cap_refund', 'share')
          group by user_id having sum(amount_minor) <> 0
        loop
          insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month)
          values (p_house, r.user_id, 'correction', -r.net, month_now)
          returning id into lid;
          added := added || lid;
        end loop;
      end;
    else
      delete from public.ledger_entries where house_id = p_house and ledger_entries.month = v_month and kind = 'forfeit';
    end if;
    insert into public.month_let_offs (house_id, month, let_off_by) values (p_house, v_month, p_actor);
  end if;

  perform public.recount_streaks(p_house);

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (p_house, 'reset', p_actor, case when p_kind = 'result' then target.id end,
          jsonb_build_object('what', p_kind, 'name', v_name, 'subject', v_subject, 'outcome', v_outcome,
                             'starts_on', w.starts_on, 'month', v_month))
  returning id into event;

  insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
  values (p_house, p_actor, v_subject, 'reset', case when p_kind = 'result' then target.id end, w.id,
          jsonb_build_object('what', p_kind, 'name', v_name, 'outcome', v_outcome, 'starts_on', w.starts_on,
                             'month', coalesce(v_month, w_month), 'week_month', w_month, 'event', event,
                             'added', to_jsonb(added), 'told', to_jsonb(told), 'snapshot', snapshot))
  returning id into action;

  return jsonb_build_object('action', action, 'told', to_jsonb(told));
end;
$function$;

CREATE OR REPLACE FUNCTION public.answer_swap(p_offer uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  o public.swap_offers;
  given public.assignments;
  taken public.assignments;
begin
  select * into o from public.swap_offers where id = p_offer for update;
  if o.id is null or o.asked_user_id <> me then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if o.answer is not null or o.expires_at <= now() then
    raise exception 'swap_gone';
  end if;
  if not coalesce(p_accept, false) then
    update public.swap_offers set answer = 'declined', answered_at = now() where id = o.id;
    return;
  end if;
  select * into given from public.assignments where id = o.asker_assignment_id for update;
  select * into taken from public.assignments where id = o.asked_assignment_id for update;
  if given.id is null or taken.id is null or given.user_id <> o.asked_by or taken.user_id <> o.asked_user_id
     or given.done_at is not null or given.outcome is not null or given.absent_at is not null
     or taken.done_at is not null or taken.outcome is not null or taken.absent_at is not null then
    raise exception 'not_swappable';
  end if;
  update public.assignments set user_id = o.asked_user_id, reminded = 0 where id = given.id;
  update public.assignments set user_id = o.asked_by, reminded = 0 where id = taken.id;
  update public.swap_offers set answer = 'accepted', answered_at = now() where id = o.id;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (o.house_id, 'swap_used', o.asked_by, taken.id,
          jsonb_build_object('gave', given.name, 'took', taken.name, 'with', o.asked_user_id, 'asked', true));
end;
$function$;

CREATE OR REPLACE FUNCTION public.answer_tick(p_assignment uuid, p_ok boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  a public.assignments;
  ticker uuid;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_your_house' using errcode = '42501';
  end if;
  if not public.can(a.house_id, 'ticks.ok') then
    raise exception 'parents_only' using errcode = '42501';
  end if;
  if a.outcome is not null or a.done_at is null or not a.awaits_ok then
    raise exception 'nothing_to_ok';
  end if;
  ticker := coalesce(a.covered_by, a.user_id);
  if p_ok then
    update public.assignments p set awaits_ok = false, okayed_by = me, okayed_at = now()
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and p.done_at = a.done_at;
  else
    update public.assignments p set done_at = null, photo_path = null, covered_by = null, absent_at = null
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and (p.done_at = a.done_at or p.absent_at = a.done_at);
    delete from public.crew_members where job_id = coalesce(a.job_id, a.id) and created_at = a.done_at;
  end if;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, case when p_ok then 'okayed' else 'not_yet' end, me, a.id,
          jsonb_build_object('name', a.name, 'against', ticker));
  return ticker;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_away(p_away uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  a public.away_periods;
  tz text;
begin
  select * into a from public.away_periods where id = p_away;
  if a.id is null or a.user_id <> me then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  select timezone into tz from public.houses where id = a.house_id;
  if a.ends_on < (now() at time zone tz)::date then
    raise exception 'away_over';
  end if;
  perform public.end_away(a.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.checked_place(a assignments)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select c.assignment_id from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) limit 1),
    (select p.id from public.assignments p
     where a.job_id is not null and p.job_id = a.job_id and p.done_at = a.done_at
     order by p.id limit 1),
    a.id
  )
$function$;

CREATE OR REPLACE FUNCTION public.close_month(p_house uuid, p_month text, p_entries jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inserted text;
begin
  insert into public.month_closes (house_id, month) values (p_house, p_month)
  on conflict do nothing
  returning month into inserted;
  if inserted is null then
    return false;
  end if;
  insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month)
  select p_house, (x ->> 'user_id')::uuid, x ->> 'kind', (x ->> 'amount')::integer, p_month
  from jsonb_array_elements(p_entries) x
  where (x ->> 'amount')::integer <> 0;
  insert into public.events (house_id, kind, data)
  values (p_house, 'month_closed', jsonb_build_object('month', p_month));
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_payment(p_house uuid, p_from uuid, p_amount integer, p_via text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  h public.houses;
  mine bigint;
  theirs bigint;
  month text;
begin
  if not public.is_member(p_house) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if p_from = me or p_amount <= 0 or (p_via is not null and p_via <> 'splitwise')
     or not exists (select 1 from public.members where house_id = p_house and user_id = p_from) then
    raise exception 'bad_payment' using errcode = '22023';
  end if;
  -- One payment at a time per house, so two confirmations cannot both fit
  -- under the same balance.
  perform pg_advisory_xact_lock(hashtextextended('johns.payment:' || p_house::text, 0));
  select coalesce(sum(l.amount_minor), 0) into mine
  from public.ledger_entries l
  where l.house_id = p_house and l.user_id = me
    and (l.kind = 'payment'
         or exists (select 1 from public.month_closes c where c.house_id = p_house and c.month = l.month));
  select coalesce(sum(l.amount_minor), 0) into theirs
  from public.ledger_entries l
  where l.house_id = p_house and l.user_id = p_from
    and (l.kind = 'payment'
         or exists (select 1 from public.month_closes c where c.house_id = p_house and c.month = l.month));
  if p_amount > mine or p_amount > -theirs then
    raise exception 'more_than_owed';
  end if;
  select * into h from public.houses where id = p_house;
  month := to_char(now() at time zone h.timezone, 'YYYY-MM');
  insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, counterparty_user_id)
  values (p_house, p_from, 'payment', p_amount, month, me),
         (p_house, me, 'payment', -p_amount, month, p_from);
  insert into public.events (house_id, kind, user_id, data)
  values (p_house, 'paid', p_from,
          jsonb_build_object('to', me, 'amount', p_amount)
            || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cover_john(p_assignment uuid, p_photo_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
  grace smallint;
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  holders uuid[];
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.user_id = me
     or (a.job_id is not null and exists (select 1 from public.assignments where job_id = a.job_id and user_id = me)) then
    raise exception 'tick_it_yourself';
  end if;
  if a.outcome is not null then
    raise exception 'already_settled';
  end if;
  if a.done_at is not null or a.excused or a.absent_at is not null then
    raise exception 'already_done';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  select cover_grace_hours into grace from public.houses where id = a.house_id;
  if now() < public.cover_opens_at(a, ends, grace) then
    raise exception 'too_soon_to_cover';
  end if;
  if a.cover_hold_ends_at is not null and now() < a.cover_hold_ends_at then
    raise exception 'cover_held';
  end if;
  if now() >= public.closes_at(a, ends) then
    raise exception 'week_closed';
  end if;
  if a.needs_photo and photo is null then
    raise exception 'photo_required';
  end if;
  if photo is not null and photo not like a.house_id::text || '/' || a.id::text || '/%' then
    raise exception 'photo_path' using errcode = '22023';
  end if;
  with covered as (
    update public.assignments p
    set done_at = now(), photo_path = case when p.id = a.id then photo end, covered_by = me
    where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and p.done_at is null and p.absent_at is null and not p.excused
    returning p.user_id
  )
  select array_agg(user_id) into holders from covered;
  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (a.house_id, 'covered', me, a.id,
          jsonb_build_object('name', a.name, 'points', a.points, 'photo', photo is not null, 'for', a.user_id)
          || case when a.job_id is not null then jsonb_build_object('for_all', to_jsonb(holders)) else '{}' end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.deal_week(p_house uuid, p_starts_on date, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_assignments jsonb, p_shares jsonb, p_replace boolean DEFAULT false, p_on_call jsonb DEFAULT '[]'::jsonb, p_state jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  week uuid;
begin
  insert into public.weeks (house_id, starts_on, starts_at, ends_at)
  values (p_house, p_starts_on, p_starts_at, p_ends_at)
  on conflict (house_id, starts_on) do nothing
  returning id into week;

  if week is null then
    if not p_replace then
      return null;
    end if;
    select id into week from public.weeks where house_id = p_house and starts_on = p_starts_on for update;
    if exists (
      select 1 from public.assignments
      where week_id = week
        and (done_at is not null or absent_at is not null or outcome is not null or flagged_at is not null)
    ) then
      raise exception 'week_started';
    end if;
    delete from public.assignments where week_id = week;
    delete from public.week_shares where week_id = week;
    delete from public.on_call_picks where week_id = week;
  end if;

  insert into public.assignments
    (week_id, house_id, john_id, user_id, name, category, points, needs_photo, due_at, group_name, dealt, job_id)
  select week, p_house, (x ->> 'john_id')::uuid, (x ->> 'user_id')::uuid, x ->> 'name',
         x ->> 'category', (x ->> 'points')::smallint, coalesce((x ->> 'needs_photo')::boolean, false),
         (x ->> 'due_at')::timestamptz, x ->> 'group_name', x -> 'dealt', (x ->> 'job_id')::uuid
  from jsonb_array_elements(p_assignments) x;

  insert into public.week_shares (week_id, house_id, user_id, share)
  select week, p_house, (x ->> 'user_id')::uuid, (x ->> 'share')::numeric
  from jsonb_array_elements(p_shares) x;

  insert into public.on_call_picks (week_id, house_id, john_id, user_id)
  select week, p_house, (x ->> 'john_id')::uuid, (x ->> 'user_id')::uuid
  from jsonb_array_elements(p_on_call) x;

  update public.weeks
  set turns = case when jsonb_typeof(p_state -> 'turns') = 'object' then p_state -> 'turns' end,
      waiting = case when jsonb_typeof(p_state -> 'waiting') = 'object' then p_state -> 'waiting' else '{}'::jsonb end,
      ahead = case when jsonb_typeof(p_state -> 'ahead') = 'array' then p_state -> 'ahead' else '[]'::jsonb end
  where id = week;

  update public.houses set first_dealt_at = coalesce(first_dealt_at, now()) where id = p_house;
  insert into public.events (house_id, kind, data)
  values (p_house, 'week_dealt', jsonb_build_object(
    'starts_on', p_starts_on,
    'count', jsonb_array_length(p_assignments) + jsonb_array_length(p_on_call)
  ));
  return week;
end;
$function$;

CREATE OR REPLACE FUNCTION public.deletion_away(p_user uuid, p_until timestamp with time zone)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h public.houses;
  last_day date;
  free_from date;
  w public.away_periods;
  made uuid[] := '{}';
begin
  select houses.* into h
  from public.houses join public.members m on m.house_id = houses.id
  where m.user_id = p_user;
  if h.id is null then
    return made;
  end if;
  free_from := (now() at time zone h.timezone)::date;
  last_day := (p_until at time zone h.timezone)::date;
  for w in
    select * from public.away_periods
    where house_id = h.id and user_id = p_user and ends_on >= free_from and starts_on <= last_day
    order by starts_on
  loop
    if w.starts_on > free_from then
      perform public.start_away(p_user, free_from, w.starts_on - 1, null);
      made := made || (select a.id from public.away_periods a where a.house_id = h.id and a.user_id = p_user and a.starts_on = free_from);
    end if;
    free_from := greatest(free_from, w.ends_on + 1);
  end loop;
  if free_from <= last_day then
    perform public.start_away(p_user, free_from, last_day, null);
    made := made || (select a.id from public.away_periods a where a.house_id = h.id and a.user_id = p_user and a.starts_on = free_from);
  end if;
  return made;
end;
$function$;

CREATE OR REPLACE FUNCTION public.end_account_deletion(p_user uuid, p_action text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.account_deletions;
  away uuid;
begin
  select * into d from public.account_deletions where user_id = p_user and state = 'pending' for update;
  if d.id is null then
    raise exception 'no_deletion';
  end if;
  update public.account_deletions set state = 'kept', ended_at = now() where id = d.id;
  foreach away in array d.away_ids loop
    perform public.end_deletion_away(away);
  end loop;
  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (auth.uid(), p_action, 'account', p_user::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('state', 'pending', 'delete_after', d.deletes_at),
    jsonb_build_object('state', 'kept'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.end_away(p_away uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.away_periods;
  tz text;
  today date;
begin
  select * into a from public.away_periods where id = p_away for update;
  if a.id is null then
    return;
  end if;
  select timezone into tz from public.houses where id = a.house_id;
  today := (now() at time zone tz)::date;
  if a.ends_on < today then
    return;
  end if;

  update public.assignments
  set due_at = original_due_at, original_due_at = null, reminded = 0
  where house_id = a.house_id and user_id = a.user_id
    and done_at is null and outcome is null
    and original_due_at is not null and original_due_at > now()
    and (original_due_at at time zone tz)::date between greatest(a.starts_on, today) and a.ends_on;

  update public.assignments x
  set user_id = x.handed_from_user_id, excused = false, reminded = 0, handed_from_user_id = null, handed_by_away_period_id = null
  where x.handed_by_away_period_id = a.id
    and x.done_at is null and x.outcome is null and x.covered_by is null and x.absent_at is null
    and (x.due_at at time zone tz)::date >= today
    and ((x.user_id = x.handed_from_user_id and x.excused) or (x.user_id <> x.handed_from_user_id and not x.excused))
    and exists (select 1 from public.members m where m.house_id = x.house_id and m.user_id = x.handed_from_user_id);

  if a.starts_on >= today then
    delete from public.away_periods where id = a.id;
    update public.events set data = data || jsonb_build_object('cancelled', true)
    where house_id = a.house_id and kind = 'away' and data ->> 'away' = a.id::text;
  else
    update public.away_periods set ends_on = today - 1 where id = a.id;
    update public.events set data = data || jsonb_build_object('back_on', today)
    where house_id = a.house_id and kind = 'away' and data ->> 'away' = a.id::text;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_account_deletion(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  update public.houses set pass_bought_by = null where pass_bought_by = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.swap_offers where (asked_by = p_user or asked_user_id = p_user) and answer is null;
  -- The Wall said their name when they moved out; it can't look it up now.
  update public.events set data = data || jsonb_build_object('who', 'Someone who left')
  where user_id = p_user and data ? 'who';
  update public.profiles
  set display_name = 'Someone who left', avatar_url = null, deleted_at = coalesce(deleted_at, now())
  where id = p_user;
  update public.reports set shots = '{}', from_email = null, from_name = null
  where user_id = p_user and (shots <> '{}' or from_email is not null or from_name is not null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.hold_cover(p_assignment uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  a public.assignments;
  ends timestamptz;
  until timestamptz;
begin
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or not public.is_member(a.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.user_id <> me then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if a.done_at is not null or a.outcome is not null or a.covered_by is not null or a.excused then
    raise exception 'already_done';
  end if;
  if a.cover_hold_ends_at is not null then
    raise exception 'cover_held_once';
  end if;
  select w.ends_at into ends from public.weeks w where w.id = a.week_id;
  until := least(now() + interval '2 hours', public.closes_at(a, ends));
  update public.assignments set cover_hold_ends_at = until where id = a.id;
  return until;
end;
$function$;

CREATE OR REPLACE FUNCTION public.house_balances(p_house uuid, p_before date)
 RETURNS TABLE(user_id uuid, owed numeric, credited numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with past as (
    select w.id from public.weeks w
    where w.house_id = p_house and w.starts_on < p_before and w.skipped_at is null
  ),
  totals as (
    select s.week_id, sum(s.share) as total
    from public.week_shares s
    where s.week_id in (select id from past)
    group by s.week_id
  ),
  excused as (
    select a.week_id, sum(a.points)::numeric as points
    from public.assignments a
    where a.week_id in (select id from past)
      and a.covered_by is null
      and (a.excused or a.outcome is not distinct from 'excused')
    group by a.week_id
  ),
  owed as (
    select s.user_id,
           sum(s.share * case when t.total > 0 then greatest(0, 1 - coalesce(e.points, 0) / t.total) else 1 end) as owed
    from public.week_shares s
    join totals t on t.week_id = s.week_id
    left join excused e on e.week_id = s.week_id
    where s.week_id in (select id from past)
    group by s.user_id
  ),
  work as (
    select coalesce(a.covered_by, a.user_id) as user_id, a.points::numeric as points
    from public.assignments a
    where a.week_id in (select id from past)
      and (a.covered_by is not null or a.outcome is distinct from 'missed')
      and (a.covered_by is not null or not (a.excused or a.outcome is not distinct from 'excused'))
      and a.absent_at is null
      and not exists (
        select 1 from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) and c.user_id = a.user_id
      )
    union all
    select c.user_id, c.points
    from public.crew_members c
    join public.assignments a on a.id = c.assignment_id
    where a.week_id in (select id from past)
  ),
  credited as (
    select w.user_id, sum(w.points) as credited from work w group by w.user_id
  )
  select coalesce(o.user_id, c.user_id), coalesce(o.owed, 0), coalesce(c.credited, 0)
  from owed o
  full join credited c on c.user_id = o.user_id;
$function$;

CREATE OR REPLACE FUNCTION public.house_has_paid_pass(p_house uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.houses
    where id = p_house
      and (pass_plan = 'founding' or (pass_plan in ('monthly', 'yearly') and pass_ends_at > now()))
  );
$function$;

CREATE OR REPLACE FUNCTION public.house_history(p_house uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 60)
 RETURNS TABLE(id uuid, kind text, done_by uuid, subject_user_id uuid, assignment_id uuid, ref uuid, data jsonb, created_at timestamp with time zone, undone_at timestamp with time zone, undone_by uuid, reach text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select x.id, x.kind, x.done_by, x.subject_user_id, x.assignment_id, x.ref, x.data - 'snapshot', x.created_at, x.undone_at, x.undone_by,
         public.undo_reach(x)
  from public.house_actions x
  where x.house_id = p_house and public.is_member(p_house)
    and (p_before is null or x.created_at < p_before)
  order by x.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$function$;

CREATE OR REPLACE FUNCTION public.job_follows()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tick timestamptz := old.done_at;
  n integer;
begin
  if old.covered_by is not null then
    -- A cover of a job taken back: the rest of what it covered opens again.
    if old.job_id is null then
      return null;
    end if;
    delete from public.ledger_entries l
    using public.assignments p
    where l.assignment_id = p.id and l.kind = 'forfeit'
      and p.job_id = old.job_id and p.id <> old.id
      and p.covered_by = old.covered_by and p.done_at = tick
      and public.month_open(p.house_id, p.due_at);
    update public.assignments p
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null
    where p.job_id = old.job_id and p.id <> old.id
      and p.covered_by = old.covered_by and p.done_at = tick;
    return null;
  end if;

  if exists (select 1 from public.crew_members where assignment_id = old.id and created_at = tick) then
    -- The place it was ticked from: the whole roll call goes.
    delete from public.crew_members where assignment_id = old.id and created_at = tick;
    if old.job_id is not null then
      delete from public.ledger_entries l
      using public.assignments p
      where l.assignment_id = p.id and l.kind = 'forfeit'
        and p.job_id = old.job_id and p.id <> old.id and p.covered_by is null
        and (p.done_at = tick or p.absent_at = tick)
        and public.month_open(p.house_id, p.due_at);
      update public.assignments p
      set done_at = null, photo_path = null, absent_at = null, outcome = null, settled_at = null
      where p.job_id = old.job_id and p.id <> old.id and p.covered_by is null
        and (p.done_at = tick or p.absent_at = tick);
    end if;
    return null;
  end if;

  -- Someone on a roll call whose own place opened again: off the crew, and
  -- their place's points out of the share.
  select count(*) into n from public.crew_members where job_id = coalesce(old.job_id, old.id) and created_at = tick;
  if n > 0 and exists (
    select 1 from public.crew_members where job_id = coalesce(old.job_id, old.id) and created_at = tick and user_id = old.user_id
  ) then
    delete from public.crew_members where job_id = coalesce(old.job_id, old.id) and created_at = tick and user_id = old.user_id;
    if n > 1 then
      update public.crew_members
      set points = greatest(points * n - old.points, 0) / (n - 1)
      where job_id = coalesce(old.job_id, old.id) and created_at = tick;
    end if;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.leave_pass()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  o public.moves;
begin
  select * into o from public.moves
  where user_id = me and pass_state = 'waiting'
  order by left_at desc
  limit 1
  for update;
  if o.id is null then
    raise exception 'no_pass_to_leave';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || o.from_house_id::text, 0));
  if public.house_has_paid_pass(o.from_house_id) then
    update public.moves set pass_state = 'left' where id = o.id;
  else
    perform public.place_pass(o.id, o.from_house_id, 'left');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.left_off_settled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n integer;
begin
  new.absent_at := null;
  select count(*) into n from public.crew_members where job_id = old.job_id and created_at = old.absent_at;
  if n > 0 then
    update public.crew_members
    set points = greatest(points - old.points::numeric / n, 0)
    where job_id = old.job_id and created_at = old.absent_at;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.moving_on()
 RETURNS TABLE(from_house_id uuid, house_name text, johns bigint, left_at timestamp with time zone, pass_plan text, pass_state text, house_pass_until date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.from_house_id, h.name,
    (select count(*) from public.johns j where j.house_id = o.from_house_id and j.archived_at is null),
    o.left_at, o.pass_plan, o.pass_state,
    case when h.pass_plan = 'trial' then (h.pass_ends_at at time zone h.timezone)::date end
  from public.moves o join public.houses h on h.id = o.from_house_id
  where o.user_id = auth.uid() and o.how is null and o.left_at > now() - interval '90 days'
  order by o.left_at desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.my_reports()
 RETURNS TABLE(id uuid, kind text, state text, words text, created_at timestamp with time zone, last_activity_at timestamp with time zone, replies integer, unread boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.id, r.kind, r.state, r.words, r.created_at, r.last_activity_at,
    (select count(*)::integer from public.report_messages m where m.report_id = r.id and m.from_owner),
    exists (select 1 from public.report_messages m where m.report_id = r.id and m.from_owner and m.created_at > r.seen_at)
  from public.reports r
  where r.user_id = (select auth.uid())
  order by r.created_at desc, r.id desc
  limit 200;
$function$;

CREATE OR REPLACE FUNCTION public.offer_swap(p_mine uuid, p_theirs uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  given public.assignments := public.my_open_assignment(p_mine);
  taken public.assignments;
  zone text;
  offer uuid;
begin
  select * into taken from public.assignments where id = p_theirs;
  if taken.id is null or taken.house_id <> given.house_id or taken.week_id <> given.week_id
     or taken.user_id = given.user_id
     or given.done_at is not null or given.flagged_at is not null or given.job_id is not null
     or taken.done_at is not null or taken.outcome is not null or taken.absent_at is not null
     or taken.flagged_at is not null or taken.job_id is not null then
    raise exception 'not_swappable';
  end if;
  if not exists (
    select 1 from public.members m
    where m.house_id = given.house_id and m.user_id = taken.user_id and m.rather -> (given.john_id::text) = '1'::jsonb
  ) then
    raise exception 'not_swappable';
  end if;
  -- An ask that ran out unanswered is let go, so the John can be asked about again.
  delete from public.swap_offers where swap_offers.asker_assignment_id = p_mine and answer is null and expires_at <= now();
  select h.timezone into zone from public.houses h where h.id = given.house_id;
  insert into public.swap_offers (house_id, asker_assignment_id, asked_assignment_id, asked_by, asked_user_id, expires_at)
  values (given.house_id, given.id, taken.id, given.user_id, taken.user_id,
          (date_trunc('day', now() at time zone zone) + interval '1 day') at time zone zone)
  on conflict (asker_assignment_id) where answer is null do nothing
  returning id into offer;
  if offer is null then
    raise exception 'already_asked';
  end if;
  return offer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_flag(p_john uuid, p_at timestamp with time zone, p_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  j public.johns;
  h public.houses;
  w public.weeks;
  today date;
  holder uuid;
  sharers uuid[];
  existing uuid;
  flag uuid;
  group_label text;
begin
  select * into j from public.johns where id = p_john for update;
  if j.id is null or j.archived_at is not null or j.kind <> 'on_call' then
    raise exception 'not_on_call';
  end if;
  select * into h from public.houses where id = j.house_id;
  select * into w from public.weeks
  where house_id = j.house_id and starts_at <= p_at and ends_at > p_at;
  if w.id is null then
    raise exception 'not_dealt';
  end if;

  select id into existing from public.assignments
  where john_id = j.id and flagged_at is not null and done_at is null and outcome is null
  order by flagged_at desc limit 1;
  if existing is not null then
    return existing;
  end if;

  today := (p_at at time zone h.timezone)::date;
  select coalesce(array_agg(gm.user_id), '{}') into sharers
  from public.group_members gm
  where gm.group_id = j.group_id and gm.house_id = j.house_id;
  if j.group_id is null or cardinality(sharers) = 0 then
    select array_agg(m.user_id) into sharers from public.members m where m.house_id = j.house_id;
  else
    select g.name into group_label from public.groups g where g.id = j.group_id;
  end if;

  select oc.user_id into holder from public.on_call_picks oc
  where oc.week_id = w.id and oc.john_id = j.id
    and oc.user_id = any (sharers)
    and not exists (
      select 1 from public.away_periods a
      where a.house_id = j.house_id and a.user_id = oc.user_id and today between a.starts_on and a.ends_on
    );
  if holder is null then
    select s.id into holder
    from unnest(sharers) as s (id)
    where not exists (
      select 1 from public.away_periods a
      where a.house_id = j.house_id and a.user_id = s.id and today between a.starts_on and a.ends_on
    )
    order by (
      select coalesce(sum(x.points), 0) from public.assignments x where x.week_id = w.id and x.user_id = s.id
    ), s.id
    limit 1;
  end if;
  if holder is null then
    raise exception 'nobody_home';
  end if;

  -- reminded = 1: the flag's own push says it needs doing, so the clock only
  -- sends the "due soon" one.
  insert into public.assignments
    (week_id, house_id, john_id, user_id, name, category, points, needs_photo, due_at,
     group_name, flagged_by, flagged_at, reminded)
  values
    (w.id, j.house_id, j.id, holder, j.name, j.category, j.points, j.needs_photo,
     p_at + make_interval(hours => j.respond_hours), group_label, p_by, p_at, 1)
  returning id into flag;

  insert into public.week_shares (week_id, house_id, user_id, share)
  select w.id, j.house_id, s.id, round(j.points::numeric / cardinality(sharers), 2)
  from unnest(sharers) as s (id)
  on conflict (week_id, user_id) do update set share = public.week_shares.share + excluded.share;

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (j.house_id, 'flagged', holder, flag,
          jsonb_build_object('name', j.name, 'by', p_by, 'due_at', p_at + make_interval(hours => j.respond_hours)));
  return flag;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_delete_now(p_user uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.account_deletions;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into d from public.account_deletions where user_id = p_user and state = 'pending' for update;
  if d.id is null then
    raise exception 'no_deletion';
  end if;
  update public.account_deletions set deletes_at = least(deletes_at, now()) where id = d.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, reason, before, after)
  values (auth.uid(), 'account.delete_now', 'account', p_user::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('delete_after', d.deletes_at),
    jsonb_build_object('delete_after', least(d.deletes_at, now())));
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_deletions()
 RETURNS TABLE(user_id uuid, name text, email text, house_name text, requested_at timestamp with time zone, deletes_at timestamp with time zone, requested_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select d.user_id, p.display_name, u.email::text, h.name, d.requested_at, d.deletes_at, d.requested_by
    from public.account_deletions d
    join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    left join public.members m on m.user_id = d.user_id
    left join public.houses h on h.id = m.house_id
    where d.state = 'pending'
    order by d.deletes_at, d.user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_deletions_find(p_q text DEFAULT ''::text, p_by text DEFAULT NULL::text, p_goes text DEFAULT NULL::text, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, name text, email text, house_name text, requested_at timestamp with time zone, deletes_at timestamp with time zone, requested_by text)
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
    select d.user_id, p.display_name, u.email::text, h.name, d.requested_at, d.deletes_at, d.requested_by
    from public.account_deletions d
    join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    left join public.members m on m.user_id = d.user_id
    left join public.houses h on h.id = m.house_id
    where d.state = 'pending'
      and (p_by is null or d.requested_by = p_by)
      and (p_goes is null
        or d.deletes_at <= now() + case p_goes when 'day' then interval '1 day' else interval '7 days' end)
      and (p_after is null or d.requested_at > p_after)
      and (p_before is null or d.requested_at <= p_before)
      and (q = ''
        or d.user_id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(u.email::text) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%');
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_deletions_page(p_q text DEFAULT ''::text, p_by text DEFAULT NULL::text, p_goes text DEFAULT NULL::text, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_user uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 51)
 RETURNS TABLE(user_id uuid, name text, email text, house_name text, requested_at timestamp with time zone, deletes_at timestamp with time zone, requested_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    select f.*
    from public.owner_deletions_find(p_q, p_by, p_goes, p_after, p_before) f
    where p_cursor_at is null or (f.deletes_at, f.user_id) > (p_cursor_at, p_cursor_user)
    order by f.deletes_at, f.user_id
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_fix_report(p_report uuid, p_note text DEFAULT NULL::text, p_tell boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where (x.id = p_report or x.same_as_report_id = p_report) and x.state <> 'fixed'
    order by x.created_at, x.id
    for update
  loop
    update public.reports set state = 'fixed', last_activity_at = now() where id = r.id;
    n := n + 1;
    if coalesce(p_tell, false) then
      insert into public.report_messages (report_id, from_owner, written_by, author_name, body)
      values (r.id, true, me, nullif(signed, ''), body);
      told := told || jsonb_build_array(public.report_recipient(r));
    end if;
  end loop;

  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.fixed', 'report', p_report::text, jsonb_build_object('state', 'waiting'),
    jsonb_build_object('state', 'fixed', 'reports', n, 'told', jsonb_array_length(told), 'note', note));
  return jsonb_build_object('fixed', n, 'signed', nullif(signed, ''), 'body', body, 'told', told);
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_house(p_house uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'joinCode', h.join_code,
    'createdAt', h.created_at,
    'firstDealtAt', h.first_dealt_at,
    'timezone', h.timezone,
    'currency', h.currency,
    'dealMode', h.deal_mode,
    'passPlan', h.pass_plan,
    'passUntil', h.pass_ends_at,
    'passBuyer', (select p.display_name from public.profiles p where p.id = h.pass_bought_by),
    'billed', exists (select 1 from public.house_pass_billing b where b.house_id = h.id and b.stripe_subscription_id is not null),
    'lastActive', (select max(a.done_at) from public.assignments a where a.house_id = h.id and a.done_at is not null),
    'johns', (select count(*) from public.johns j where j.house_id = h.id),
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.user_id,
        'name', p.display_name,
        'role', m.role,
        'joinedAt', m.joined_at,
        'movingOutOn', m.moving_out_on,
        'onTime', t.on_time,
        'settled', t.settled,
        'awayUntil', (
          select max(w.ends_on) from public.away_periods w
          where w.house_id = h.id and w.user_id = m.user_id
            and w.starts_on <= (now() at time zone h.timezone)::date
            and w.ends_on >= (now() at time zone h.timezone)::date
        )
      ) order by (m.role = 'admin') desc, m.joined_at, m.user_id), '[]'::jsonb)
      from public.members m
      join public.profiles p on p.id = m.user_id
      cross join lateral (
        select count(*) filter (where a.outcome in ('done', 'covered')) as on_time, count(*) as settled
        from public.assignments a
        where a.house_id = h.id and a.user_id = m.user_id
          and a.due_at > now() - interval '28 days' and a.due_at <= now()
          and a.outcome in ('done', 'covered', 'late', 'missed')
      ) t
      where m.house_id = h.id
    )
  )
  into result
  from public.houses h
  where h.id = p_house;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_houses_match(p_q text DEFAULT ''::text, p_pass text DEFAULT NULL::text, p_active text DEFAULT NULL::text, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, name text, join_code text, people bigint, pass_plan text, pass_ends_at timestamp with time zone, last_active timestamp with time zone, on_time bigint, settled bigint, created_at timestamp with time zone, sort_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select h.id, h.name, h.join_code,
      (select count(*) from public.members m where m.house_id = h.id),
      h.pass_plan, h.pass_ends_at, l.last_active, t.on_time, t.settled, h.created_at,
      coalesce(l.last_active, '-infinity'::timestamptz)
    from public.houses h
    cross join lateral (
      select max(a.done_at) as last_active from public.assignments a where a.house_id = h.id and a.done_at is not null
    ) l
    cross join lateral (
      select count(*) filter (where a.outcome in ('done', 'covered')) as on_time, count(*) as settled
      from public.assignments a
      where a.house_id = h.id and a.due_at > now() - interval '28 days' and a.due_at <= now()
        and a.outcome in ('done', 'covered', 'late', 'missed')
    ) t
    where (p_pass is null
        or (p_pass = 'paid' and h.pass_plan in ('monthly', 'yearly', 'founding') and (h.pass_ends_at is null or h.pass_ends_at > now()))
        or (p_pass = 'trial' and h.pass_plan = 'trial' and h.pass_ends_at > now())
        or (p_pass = 'none' and h.pass_ends_at <= now()))
      and (p_active is null
        or (p_active = 'week' and l.last_active > now() - interval '7 days')
        or (p_active = 'month' and l.last_active > now() - interval '30 days')
        or (p_active = 'quiet' and (l.last_active is null or l.last_active <= now() - interval '30 days')))
      and (p_after is null or h.created_at > p_after)
      and (p_before is null or h.created_at <= p_before)
      and (q = ''
        or h.id::text like q || '%'
        or lower(h.join_code) like q || '%'
        or lower(h.name) like '%' || q || '%'
        or exists (
          select 1 from public.members m
          join public.profiles p on p.id = m.user_id
          left join auth.users u on u.id = m.user_id
          where m.house_id = h.id
            and (lower(p.display_name) like '%' || q || '%' or lower(u.email::text) like '%' || q || '%')
        ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_houses_page(p_q text DEFAULT ''::text, p_pass text DEFAULT NULL::text, p_active text DEFAULT NULL::text, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 51)
 RETURNS TABLE(id uuid, name text, join_code text, people bigint, pass_plan text, pass_ends_at timestamp with time zone, last_active timestamp with time zone, on_time bigint, settled bigint, created_at timestamp with time zone, sort_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    select f.*
    from public.owner_houses_match(p_q, p_pass, p_active, p_after, p_before) f
    where p_cursor_at is null or (f.sort_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.sort_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$function$;

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
      select jsonb_agg(jsonb_build_object('id', m.id, 'from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'at', m.created_at) order by m.created_at, m.id)
      from public.report_messages m where m.report_id = r.id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_overview(p_span text DEFAULT 'week'::text, p_zone text DEFAULT 'Europe/London'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  span text := case when p_span = 'month' then 'month' else 'week' end;
  zone text := case when exists (select 1 from pg_catalog.pg_timezone_names where name = p_zone) then p_zone else 'Europe/London' end;
  step interval := case when p_span = 'month' then interval '1 month' else interval '1 week' end;
  since timestamptz := date_trunc(span, now() at time zone zone) at time zone zone;
  before timestamptz := (date_trunc(span, now() at time zone zone) - step) at time zone zone;
  before_now timestamptz := now() - step;
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'span', span,
    'from', since,
    'houses', (select count(*) from public.houses),
    'housesNew', (select count(*) from public.houses where created_at >= since),
    'housesNewBefore', (select count(*) from public.houses where created_at >= before and created_at <= before_now),
    'people', (select count(*) from public.profiles where deleted_at is null),
    'inHouses', (select count(distinct m.user_id) from public.members m),
    'active', (select count(distinct a.house_id) from public.assignments a where a.done_at >= since),
    'passes', (
      select jsonb_build_object(
        'monthly', count(*) filter (where pass_plan = 'monthly'),
        'yearly', count(*) filter (where pass_plan = 'yearly'),
        'founding', count(*) filter (where pass_plan = 'founding'),
        'trial', count(*) filter (where pass_plan = 'trial')
      )
      from public.houses
      where pass_ends_at is null or pass_ends_at > now()
    ),
    'onTime', (
      select jsonb_build_object(
        'onTime', count(*) filter (where outcome in ('done', 'covered')),
        'late', count(*) filter (where outcome = 'late'),
        'missed', count(*) filter (where outcome = 'missed')
      )
      from public.assignments
      where due_at >= since and due_at <= now() and outcome in ('done', 'covered', 'late', 'missed')
    ),
    'ask', (
      select jsonb_build_object(
        'turns', count(*),
        'failed', count(*) filter (where outcome = 'failed')
      )
      from public.house_drafts
      where created_at >= since
    ),
    -- Ten weeks of active houses, oldest first, the last ending now.
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object('ends', w.ends, 'active', w.active) order by w.ends), '[]'::jsonb)
      from (
        select k.ends,
          (select count(distinct a.house_id) from public.assignments a
            where a.done_at > k.ends - interval '7 days' and a.done_at <= k.ends) as active
        from (select now() - make_interval(weeks => g) as ends from generate_series(0, 9) g) k
      ) w
    ),
    'clock', (select max(ticked_at) from public.houses),
    'reports', (select count(*) from public.reports where state = 'new'),
    'needs', (
      select coalesce(jsonb_agg(n order by n->>'at'), '[]'::jsonb)
      from (
        (
          select jsonb_build_object(
            'kind', 'report', 'id', r.id, 'name', p.display_name, 'words', left(r.words, 120),
            'house', h.name, 'at', r.created_at
          ) as n
          from public.reports r
          left join public.profiles p on p.id = r.user_id
          left join public.houses h on h.id = r.house_id
          where r.state = 'new'
          order by r.created_at
          limit 3
        )
        union all
        (
          select jsonb_build_object(
            'kind', 'deletion', 'id', d.user_id, 'name', p.display_name, 'words', null,
            'house', h.name, 'at', d.deletes_at
          )
          from public.account_deletions d
          join public.profiles p on p.id = d.user_id
          left join public.members m on m.user_id = d.user_id
          left join public.houses h on h.id = m.house_id
          where d.state = 'pending' and d.deletes_at <= now() + interval '1 day'
          order by d.deletes_at
          limit 3
        )
      ) x
    )
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_promotion(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  promo public.promotions;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id;
  if promo.id is null then
    return null;
  end if;
  return to_jsonb(promo) - 'stripe_coupon_id' - 'stripe_promotion_code_id' || jsonb_build_object(
    'state', public.promotion_state(promo),
    'uses', (select count(*) from public.promotion_uses u where u.promotion_id = p_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', pp.email, 'opened_at', pp.opened_at, 'emailed_at', pp.emailed_at, 'used_at', pp.used_at,
        'name', (
          select p.display_name
          from auth.users u join public.profiles p on p.id = u.id
          where lower(u.email) = pp.email and p.deleted_at is null
          limit 1
        )
      ) order by pp.used_at desc nulls last, pp.opened_at desc nulls last, pp.email)
      from public.promotion_people pp where pp.promotion_id = p_id
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('house', r.house_name, 'house_id', r.house_id, 'plan', r.plan, 'at', r.created_at) order by r.created_at desc)
      from (
        select h.name as house_name, u.house_id, u.plan, u.created_at
        from public.promotion_uses u
        left join public.houses h on h.id = u.house_id
        where u.promotion_id = p_id
        order by u.created_at desc
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_reply_report(p_report uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  insert into public.report_messages (report_id, from_owner, written_by, author_name, body)
  values (r.id, true, me, nullif(signed, ''), body);
  update public.reports set state = 'replied', last_activity_at = now() where id = r.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.reply', 'report', r.id::text, jsonb_build_object('state', r.state), jsonb_build_object('state', 'replied', 'reply', body));
  return public.report_recipient(r) || jsonb_build_object('signed', nullif(signed, ''));
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.owner_reports_page(p_q text DEFAULT ''::text, p_state text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_from text DEFAULT NULL::text, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 51)
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, house_name text, kind text, state text, words text, created_at timestamp with time zone, last_activity_at timestamp with time zone, source text, subject text, same_as_report_id uuid, also integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    select f.*
    from public.owner_reports_find(p_q, p_state, p_kind, p_from, p_after, p_before) f
    where p_cursor_at is null or (f.created_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.created_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_request_deletion(p_email text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  who uuid;
  d public.account_deletions;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select u.id into who from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.deleted_at is null
    and exists (select 1 from public.profiles p where p.id = u.id and p.deleted_at is null);
  if who is null then
    raise exception 'no_account';
  end if;
  if exists (select 1 from public.account_deletions where user_id = who and state = 'pending') then
    raise exception 'already_deleting';
  end if;
  insert into public.account_deletions (user_id, deletes_at, requested_by)
  values (who, now() + interval '30 days', 'owner')
  returning * into d;
  perform public.quietly(true);
  update public.account_deletions set away_ids = public.deletion_away(who, d.deletes_at) where id = d.id;
  perform public.quietly(false);
  insert into public.admin_audit (actor, action, target_kind, target_id, reason, after)
  values (auth.uid(), 'account.delete_request', 'account', who::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('requested_by', 'owner', 'delete_after', d.deletes_at));
  return who;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_same_as(p_report uuid, p_main uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
  was uuid;
  main uuid := p_main;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select r.same_as_report_id into was from public.reports r where r.id = p_report for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if main is not null then
    -- Onto the top of its own pile.
    select coalesce(m.same_as_report_id, m.id) into main from public.reports m where m.id = main;
    if main is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if main = p_report then
      raise exception 'report_same' using errcode = 'P0001';
    end if;
    update public.reports set same_as_report_id = main where same_as_report_id = p_report;
  end if;
  -- Folding it is reading it: a new one becomes open, so it leaves Waiting.
  update public.reports
  set same_as_report_id = main, state = case when main is not null and state = 'new' then 'open' else state end
  where id = p_report;
  if was is distinct from main then
    insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
    values (me, 'report.same_as', 'report', p_report::text, jsonb_build_object('same_as', was), jsonb_build_object('same_as', main));
  end if;
  return main;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_same_as_find(p_report uuid, p_q text DEFAULT ''::text)
 RETURNS TABLE(id uuid, name text, words text, state text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and r.same_as_report_id is null
      and (q = '' or r.id::text like q || '%' or lower(r.words) like '%' || q || '%' or lower(r.subject) like '%' || q || '%')
    order by r.created_at desc, r.id desc
    limit 20;
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_set_report_state(p_report uuid, p_state text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
  was text;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_state is null or p_state not in ('fixed', 'open') then
    raise exception 'report_state' using errcode = 'P0001';
  end if;
  select state into was from public.reports where id = p_report for update;
  if was is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if was = p_state then
    return;
  end if;
  update public.reports set state = p_state, last_activity_at = now() where id = p_report;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (
    me, case p_state when 'fixed' then 'report.fixed' else 'report.reopen' end, 'report', p_report::text,
    jsonb_build_object('state', was), jsonb_build_object('state', p_state)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_stop_promotion(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  promo public.promotions;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select * into promo from public.promotions where id = p_id for update;
  if promo.id is null then
    raise exception 'promotion_unknown' using errcode = 'P0001';
  end if;
  if promo.state <> 'stopped' then
    update public.promotions set state = 'stopped', stopped_at = now() where id = p_id;
    insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
    values (
      auth.uid(), 'promotion.stop', 'promotion', p_id::text,
      jsonb_build_object('state', public.promotion_state(promo)), jsonb_build_object('state', 'stopped')
    );
  end if;
  return promo.stripe_promotion_code_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_pass(p_move uuid, p_house uuid, p_state text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.moves;
  bill public.moving_pass_billing;
begin
  select * into o from public.moves where id = p_move;
  update public.houses
  set pass_plan = o.pass_plan, pass_ends_at = o.pass_ends_at, pass_bought_by = o.user_id
  where id = p_house;
  select * into bill from public.moving_pass_billing where move_id = p_move;
  if bill.move_id is not null then
    insert into public.house_pass_billing (house_id, stripe_customer_id, stripe_subscription_id)
    values (p_house, bill.stripe_customer_id, bill.stripe_subscription_id)
    on conflict (house_id) do update
      set stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        updated_at = now();
  end if;
  update public.moves set pass_state = p_state, pass_placed_at = now() where id = p_move;
end;
$function$;

CREATE OR REPLACE FUNCTION public.promotion_ready(p_id uuid, p_coupon text, p_code text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.promotions
  set stripe_coupon_id = p_coupon, stripe_promotion_code_id = p_code, state = 'live'
  where id = p_id and state = 'making';
$function$;

CREATE OR REPLACE FUNCTION public.raise_flag(p_john uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  j public.johns;
  on_call_now boolean;
begin
  select * into j from public.johns where id = p_john;
  if j.id is null or not public.is_member(j.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.assignments x
    where x.john_id = p_john and x.flagged_by = me and x.user_id = me
      and x.done_at > now() - interval '10 minutes'
  ) then
    raise exception 'just_done';
  end if;
  -- Whoever is on call this week can always say it needs doing (and do it);
  -- anyone else, once per window from the last flag.
  select exists (
    select 1 from public.on_call_picks oc join public.weeks w on w.id = oc.week_id
    where oc.john_id = p_john and oc.user_id = me and w.starts_at <= now() and w.ends_at > now()
  ) into on_call_now;
  if not on_call_now and exists (
    select 1 from public.assignments x
    where x.john_id = p_john and x.flagged_at > now() - make_interval(hours => j.respond_hours)
      and x.done_at is not null
  ) then
    raise exception 'flagged_recently';
  end if;
  return public.open_flag(p_john, now(), me);
end;
$function$;

CREATE OR REPLACE FUNCTION public.receive_email(p_email_id text, p_from text, p_name text, p_subject text, p_topic text, p_ref text, p_body text, p_trusted boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          and m.created_at > now() - interval '1 day') >= 30 then
      return jsonb_build_object('did', 'skipped', 'why', 'limit');
    end if;
    insert into public.report_messages (report_id, from_owner, written_by, body, email_id)
    values (found_id, false, account, body, p_email_id);
    update public.reports set state = 'new', last_activity_at = now() where id = found_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.record_event_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
  a public.assignments;
  j public.johns;
  sharers uuid[];
  other uuid;
begin
  if not public.recording() then
    return null;
  end if;
  if new.kind in ('done', 'late') then
    select * into a from public.assignments where id = new.assignment_id;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, new.user_id, 'tick', new.assignment_id,
            jsonb_build_object('name', a.name, 'done_at', a.done_at, 'late', new.kind = 'late', 'event', new.id));
  elsif new.kind = 'covered' then
    select * into a from public.assignments where id = new.assignment_id;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, a.user_id, 'cover', new.assignment_id,
            jsonb_build_object('name', a.name, 'done_at', a.done_at, 'event', new.id));
  elsif new.kind = 'flagged' then
    -- Who shared the flag's points when it was raised, as open_flag counted
    -- them, so undoing it can take them back off.
    select * into a from public.assignments where id = new.assignment_id;
    select * into j from public.johns where id = a.john_id;
    select coalesce(array_agg(gm.user_id), '{}') into sharers
    from public.group_members gm where gm.group_id = j.group_id and gm.house_id = j.house_id;
    if j.group_id is null or cardinality(sharers) = 0 then
      select array_agg(m.user_id) into sharers from public.members m where m.house_id = new.house_id;
    end if;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, new.user_id, 'flag', new.assignment_id,
            jsonb_build_object('name', a.name, 'points', a.points, 'sharers', to_jsonb(sharers)));
  elsif new.kind = 'swap_used' then
    -- new.assignment_id is the John taken; the one given away now belongs
    -- to whoever it was taken from.
    select x.id into other from public.assignments x
    join public.assignments t on t.id = new.assignment_id
    where x.week_id = t.week_id and x.user_id = (new.data ->> 'with')::uuid
      and x.name = new.data ->> 'gave' and x.done_at is null and x.outcome is null
    order by x.due_at limit 1;
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
    values (new.house_id, me, (new.data ->> 'with')::uuid, 'swap', new.assignment_id, other,
            jsonb_build_object('name', new.data ->> 'took', 'gave', new.data ->> 'gave', 'event', new.id));
  elsif new.kind = 'immunity_used' then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, data)
    values (new.house_id, me, new.user_id, 'immunity', new.assignment_id,
            jsonb_build_object('name', new.data ->> 'name', 'event', new.id));
  elsif new.kind = 'disputed' then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
    select new.house_id, me, (new.data ->> 'against')::uuid, 'dispute', new.assignment_id, d.id,
           jsonb_build_object('name', new.data ->> 'name', 'event', new.id)
    from public.disputes d
    where d.assignment_id = new.assignment_id and d.resolution is null;
  elsif new.kind = 'paid' then
    -- Both halves of the payment were written in this same call.
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, data)
    select new.house_id, me, new.user_id, 'payment',
           jsonb_build_object('amount', (new.data ->> 'amount')::integer, 'event', new.id,
                              'ledger', coalesce(jsonb_agg(l.id), '[]'::jsonb))
    from public.ledger_entries l
    where l.house_id = new.house_id and l.kind = 'payment' and l.created_at = new.created_at
      and ((l.user_id = new.user_id and l.counterparty_user_id = me) or (l.user_id = me and l.counterparty_user_id = new.user_id));
  elsif new.kind = 'away' then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, ref, data)
    values (new.house_id, me, new.user_id, 'away', (new.data ->> 'away')::uuid,
            jsonb_build_object('starts_on', new.data ->> 'starts_on', 'ends_on', new.data ->> 'ends_on'));
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_member_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
begin
  if not public.recording() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.house_actions (house_id, done_by, subject_user_id, kind, data)
      values (new.house_id, me, new.user_id, 'role', jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  elsif old.user_id <> me and exists (select 1 from public.houses where id = old.house_id) then
    insert into public.house_actions (house_id, done_by, subject_user_id, kind, data)
    values (old.house_id, me, old.user_id, 'remove', jsonb_build_object(
      'role', old.role, 'joined_at', old.joined_at, 'streak', old.streak,
      'immunity_tokens', old.immunity_tokens, 'swap_tokens', old.swap_tokens));
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_moved_on(p_user uuid, p_to uuid, p_how text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  carried public.moves;
begin
  update public.moves set to_house_id = p_to, how = p_how, moved_at = now()
  where id = (
    select id from public.moves
    where user_id = p_user and how is null and from_house_id <> p_to
    order by left_at desc
    limit 1
  );
  select * into carried from public.moves
  where user_id = p_user and pass_state in ('waiting', 'lapsed')
    and (pass_plan = 'founding' or pass_ends_at > now())
  order by left_at desc
  limit 1;
  if carried.id is not null and not public.house_has_paid_pass(p_to) then
    perform public.place_pass(carried.id, p_to, 'moved');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_vote_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.disputes;
  a public.assignments;
begin
  if not public.recording() then
    return null;
  end if;
  select * into d from public.disputes where id = new.dispute_id;
  if d.raised_by = new.user_id then
    return null;
  end if;
  select * into a from public.assignments where id = d.assignment_id;
  insert into public.house_actions (house_id, done_by, subject_user_id, kind, assignment_id, ref, data)
  values (d.house_id, new.user_id, coalesce(a.covered_by, a.user_id), 'vote', a.id, d.id,
          jsonb_build_object('name', a.name, 'uphold', new.uphold));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_member(p_house uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  leaving public.members;
  h public.houses;
  move uuid;
  grace timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || p_house::text, 0));
  if p_user <> me and not public.can(p_house, 'people.remove') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.members where house_id = p_house and user_id = p_user and role = 'admin'
  ) and not exists (
    select 1 from public.members where house_id = p_house and role = 'admin' and user_id <> p_user
  ) and exists (
    select 1 from public.members where house_id = p_house and user_id <> p_user
  ) then
    raise exception 'last_admin';
  end if;
  delete from public.members where house_id = p_house and user_id = p_user
  returning * into leaving;
  if leaving.user_id is null then
    return;
  end if;
  if p_user <> me then
    update public.houses set join_code = public.new_join_code() where id = p_house;
  end if;
  if p_user = me or leaving.moving_out_on is not null then
    insert into public.moves (user_id, from_house_id) values (p_user, p_house) returning id into move;

    -- The buyer leaving themselves takes the Pass, unless it moved in the last 30 days.
    select * into h from public.houses where id = p_house for update;
    if p_user = me and h.pass_bought_by = me and public.house_has_paid_pass(p_house)
      and not exists (
        select 1 from public.moves
        where user_id = me and pass_state = 'moved' and pass_placed_at > now() - interval '30 days'
      )
    then
      update public.moves
      set pass_plan = h.pass_plan, pass_ends_at = h.pass_ends_at, pass_state = 'waiting'
      where id = move;
      insert into public.moving_pass_billing (move_id, stripe_customer_id, stripe_subscription_id)
      select move, b.stripe_customer_id, b.stripe_subscription_id
      from public.house_pass_billing b where b.house_id = p_house;
      delete from public.house_pass_billing where house_id = p_house;
      -- The house keeps the extras for 30 days (no longer than was paid for), as a free month it can buy from.
      grace := least(coalesce(h.pass_ends_at, 'infinity'), now() + interval '30 days');
      update public.houses set pass_plan = 'trial', pass_ends_at = grace, pass_bought_by = null where id = p_house;
    end if;

    -- Their name goes with the post: once they've gone, the Wall can't look it up.
    -- With the Pass gone too, the day the house's extras last until.
    if exists (select 1 from public.members where house_id = p_house) then
      insert into public.events (house_id, kind, user_id, data)
      select p_house, 'moved_out', p_user,
        jsonb_build_object('who', p.display_name)
          || case when grace is null then '{}'::jsonb else jsonb_build_object('pass_until', (grace at time zone h.timezone)::date) end
      from public.profiles p where p.id = p_user;
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  d public.account_deletions;
begin
  select * into d from public.account_deletions where user_id = me and state = 'pending';
  if d.id is not null then
    return d.deletes_at;
  end if;
  insert into public.account_deletions (user_id, deletes_at, requested_by)
  values (me, now() + interval '30 days', 'self')
  returning * into d;
  update public.account_deletions set away_ids = public.deletion_away(me, d.deletes_at) where id = d.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, after)
  values (me, 'account.delete_request', 'account', me::text,
    jsonb_build_object('requested_by', 'self', 'delete_after', d.deletes_at));
  return d.deletes_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_dispute(p_dispute uuid, p_resolution text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.disputes;
  a public.assignments;
begin
  update public.disputes set resolution = p_resolution, resolved_at = now()
  where id = p_dispute and resolution is null
  returning * into d;
  if d.id is null then
    return false;
  end if;
  select * into a from public.assignments where id = d.assignment_id;
  if p_resolution = 'upheld' then
    -- Struck: open again, with time to do it however late the strike came.
    update public.assignments p
    set done_at = null, photo_path = null, covered_by = null, absent_at = null,
        closes_at = greatest(
          public.closes_at(p, (select w.ends_at from public.weeks w where w.id = p.week_id)),
          now() + make_interval(hours => public.redo_hours())
        )
    where (p.id = d.assignment_id or (a.job_id is not null and p.job_id = a.job_id))
      and p.outcome is null and (p.done_at = d.tick_at or p.absent_at = d.tick_at);
    delete from public.crew_members where assignment_id = d.assignment_id and created_at = d.tick_at;
  end if;
  insert into public.events (house_id, kind, assignment_id, data)
  values (d.house_id, p_resolution, d.assignment_id,
          jsonb_build_object('name', a.name, 'against', coalesce(a.covered_by, a.user_id)));
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.roll_call(p_assignment uuid, p_crew uuid[], p_photo_path text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.assignments := public.my_open_assignment(p_assignment);
  photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  job uuid := coalesce(a.job_id, a.id);
  people uuid[];
  total integer;
  absent uuid[];
  tick timestamptz := now();
begin
  if a.done_at is not null then
    raise exception 'already_done';
  end if;
  select coalesce(array_agg(distinct x), '{}') into people from unnest(p_crew) as x where x is not null;
  if not (a.user_id = any (people)) then
    raise exception 'not_in_crew';
  end if;
  if exists (
    select 1 from unnest(people) as x
    where not exists (select 1 from public.members m where m.house_id = a.house_id and m.user_id = x)
  ) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  if a.needs_photo and photo is null then
    raise exception 'photo_required';
  end if;
  if photo is not null and photo not like a.house_id::text || '/' || a.id::text || '/%' then
    raise exception 'photo_path' using errcode = '22023';
  end if;

  -- The job's places, locked: two roll calls racing settle it once.
  perform 1 from public.assignments where a.job_id is not null and job_id = a.job_id for update;
  if exists (
    select 1 from public.assignments
    where a.job_id is not null and job_id = a.job_id and (done_at is not null or absent_at is not null)
  ) then
    raise exception 'already_done';
  end if;

  select coalesce(sum(p.points), 0) into total
  from public.assignments p
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.done_at is null and p.covered_by is null
    and ((p.outcome is null and not p.excused) or (p.excused and p.user_id = any (people)));

  update public.assignments p
  set done_at = tick, photo_path = case when p.id = a.id then photo end
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.outcome is null and p.done_at is null and not p.excused
    and p.user_id = any (people);

  with left_off as (
    update public.assignments p
    set absent_at = tick
    where a.job_id is not null and p.job_id = a.job_id
      and p.outcome is null and p.done_at is null and p.absent_at is null and not p.excused
      and not (p.user_id = any (people))
    returning p.user_id
  )
  select coalesce(array_agg(user_id), '{}') into absent from left_off;

  insert into public.crew_members (job_id, user_id, assignment_id, house_id, helper, points, created_at)
  select job, x, a.id, a.house_id,
         not exists (
           select 1 from public.assignments p
           where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
             and p.user_id = x and (p.done_at = tick or p.excused)
         ),
         total::numeric / cardinality(people), tick
  from unnest(people) as x;

  insert into public.events (house_id, kind, user_id, assignment_id, data)
  values (
    a.house_id,
    case when tick > a.due_at then 'late' else 'done' end,
    a.user_id,
    a.id,
    jsonb_build_object(
      'name', a.name, 'points', a.points, 'photo', photo is not null,
      'with', to_jsonb(array_remove(people, a.user_id)), 'absent', to_jsonb(absent), 'total', total
    )
  );
  return cardinality(people);
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_assignments(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  x jsonb;
  a public.assignments;
  n integer := 0;
begin
  for x in select * from jsonb_array_elements(p_items) loop
    update public.assignments
    set outcome = x ->> 'outcome', settled_at = now()
    where id = (x ->> 'id')::uuid and outcome is null
    returning * into a;
    if a.id is null then
      continue;
    end if;
    n := n + 1;
    if coalesce((x ->> 'forfeit')::integer, 0) > 0 then
      insert into public.ledger_entries (house_id, user_id, kind, amount_minor, month, assignment_id, counterparty_user_id, doers)
      values (a.house_id, a.user_id, 'forfeit', -(x ->> 'forfeit')::integer, x ->> 'month', a.id,
              case when a.outcome = 'covered' then a.covered_by end,
              case when a.absent_at is not null then (
                select array_agg(c.user_id order by c.user_id) from public.crew_members c where c.job_id = a.job_id
              ) end)
      on conflict do nothing;
    end if;
    if a.outcome = 'missed' then
      insert into public.events (house_id, kind, user_id, assignment_id, data)
      values (a.house_id, 'missed', a.user_id, a.id, jsonb_build_object('name', a.name));
    end if;
    a := null;
  end loop;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_away(p_user uuid, p_starts date, p_ends date, p_note text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := p_user;
  h public.houses;
  today date;
  away_id uuid;
  departure timestamptz;
  moved integer := 0;
  handed integer := 0;
  excused integer := 0;
  a public.assignments;
  sharers uuid[];
  holder uuid;
  soon boolean;
begin
  select houses.* into h
  from public.houses join public.members m on m.house_id = houses.id
  where m.user_id = me;
  if h.id is null then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  today := (now() at time zone h.timezone)::date;
  if p_starts is null or p_ends is null or p_starts < today then
    raise exception 'away_in_past';
  end if;
  if p_ends < p_starts then
    raise exception 'away_backwards';
  end if;
  if p_ends - p_starts > 91 then
    raise exception 'away_too_long';
  end if;
  if exists (
    select 1 from public.away_periods
    where house_id = h.id and user_id = me and starts_on <= p_ends and ends_on >= p_starts
  ) then
    raise exception 'away_overlaps';
  end if;

  insert into public.away_periods (house_id, user_id, starts_on, ends_on, note)
  values (h.id, me, p_starts, p_ends, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into away_id;

  departure := (p_starts::timestamp at time zone h.timezone) - interval '1 minute';
  soon := departure < now() + interval '12 hours';

  if not soon then
    update public.assignments x
    set original_due_at = coalesce(x.original_due_at, x.due_at), due_at = departure, reminded = 0
    where x.house_id = h.id and x.user_id = me
      and x.done_at is null and x.outcome is null and x.job_id is null
      and (x.due_at at time zone h.timezone)::date between p_starts and p_ends
      and x.due_at > departure;
    get diagnostics moved = row_count;
  end if;

  for a in
    select * from public.assignments x
    where x.house_id = h.id and x.user_id = me
      and x.done_at is null and x.absent_at is null and x.outcome is null and not x.excused
      and (x.due_at at time zone h.timezone)::date between p_starts and p_ends
      and x.due_at > now()
      and (soon or x.job_id is not null)
    order by x.due_at
    for update
  loop
    select coalesce(array_agg(gm.user_id), '{}') into sharers
    from public.johns j join public.group_members gm on gm.group_id = j.group_id and gm.house_id = j.house_id
    where j.id = a.john_id;
    if cardinality(sharers) = 0 then
      select array_agg(m.user_id) into sharers from public.members m where m.house_id = h.id;
    end if;

    select s.id into holder
    from unnest(sharers) as s (id)
    where s.id <> me
      and not exists (
        select 1 from public.away_periods w
        where w.house_id = h.id and w.user_id = s.id
          and (a.due_at at time zone h.timezone)::date between w.starts_on and w.ends_on
      )
      and not (a.job_id is not null and exists (
        select 1 from public.assignments y where y.job_id = a.job_id and y.user_id = s.id
      ))
    order by (
      select coalesce(sum(x.points), 0) from public.assignments x where x.week_id = a.week_id and x.user_id = s.id
    ), s.id
    limit 1;

    if holder is null then
      update public.assignments set excused = true, handed_from_user_id = me, handed_by_away_period_id = away_id where id = a.id;
      excused := excused + 1;
    else
      update public.assignments set user_id = holder, reminded = 0, handed_from_user_id = me, handed_by_away_period_id = away_id where id = a.id;
      handed := handed + 1;
    end if;
  end loop;
  moved := moved + handed + excused;

  insert into public.events (house_id, kind, user_id, data)
  values (h.id, 'away', me, jsonb_build_object(
    'away', away_id, 'starts_on', p_starts, 'ends_on', p_ends, 'moved', moved,
    'handed', handed, 'excused', excused));
  return moved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_house_from(p_from uuid, p_name text, p_timezone text, p_currency text, p_week_starts smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  house uuid;
begin
  if not exists (
    select 1 from public.moves
    where user_id = me and from_house_id = p_from and how is null and left_at > now() - interval '90 days'
  ) then
    raise exception 'not_your_move' using errcode = '42501';
  end if;
  house := public.create_house(
    p_name, p_timezone, p_currency, p_week_starts,
    (select h.kind from public.houses h where h.id = p_from)
  );
  update public.houses n set pocket_cap_minor = o.pocket_cap_minor
  from public.houses o
  where n.id = house and o.id = p_from and o.kind = 'family';
  insert into public.johns (
    house_id, name, category, points, every_weeks, anchor_week, every_months, anchor_month,
    week_of_month, due_dow, due_time, needs_photo, kind, respond_hours, per_week, crew, keep_day, pay_minor
  )
  select house, j.name, j.category, j.points, j.every_weeks, j.anchor_week, j.every_months, j.anchor_month,
    j.week_of_month, j.due_dow, j.due_time, j.needs_photo, j.kind, j.respond_hours, j.per_week, j.crew, j.keep_day, j.pay_minor
  from public.johns j
  where j.house_id = p_from and j.archived_at is null
  order by j.created_at;
  update public.moves set how = 'copied'
  where user_id = me and to_house_id = house;
  return house;
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_action(p_action uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  x public.house_actions;
  reach text;
  a public.assignments;
  b public.assignments;
  aw public.away_periods;
  tz text;
  today date;
  s jsonb;
  n integer;
begin
  select * into x from public.house_actions where id = p_action for update;
  if x.id is null or not public.is_member(x.house_id) then
    raise exception 'not_in_house' using errcode = '42501';
  end if;
  -- Changes to the same people one at a time, as set_member_role does.
  perform pg_advisory_xact_lock(hashtextextended('johns.members:' || x.house_id::text, 0));
  if x.assignment_id is not null then
    select * into a from public.assignments where id = x.assignment_id for update;
  end if;
  reach := public.undo_reach(x);
  if x.undone_at is not null then
    raise exception 'already_undone';
  end if;
  if reach is null then
    raise exception 'cannot_undo';
  end if;
  perform set_config('johns.undoing', 'on', true);
  select timezone into tz from public.houses where id = x.house_id;

  case x.kind
  when 'reset' then
    perform public.undo_reset(x);
  when 'tick', 'cover' then
    -- Back to open. A forfeit it was settled with goes too; the engine
    -- settles it again from here (missed, if its John has closed).
    delete from public.ledger_entries where assignment_id = a.id and kind = 'forfeit';
    update public.assignments
    set done_at = null, photo_path = null, covered_by = null, outcome = null, settled_at = null
    where id = a.id;
    delete from public.events
    where assignment_id = a.id and kind in ('done', 'late', 'covered') and created_at >= a.done_at;
  when 'flag' then
    n := greatest(jsonb_array_length(x.data -> 'sharers'), 1);
    for s in select * from jsonb_array_elements(x.data -> 'sharers') loop
      update public.week_shares
      set share = greatest(share - round((x.data ->> 'points')::numeric / n, 2), 0)
      where week_id = a.week_id and user_id = (s #>> '{}')::uuid;
    end loop;
    -- Its 'flagged' post goes with it.
    delete from public.assignments where id = a.id;
  when 'swap' then
    select * into b from public.assignments where id = x.ref for update;
    update public.assignments set user_id = x.done_by, reminded = 0 where id = b.id;
    update public.assignments set user_id = x.subject_user_id, reminded = 0 where id = a.id;
    update public.members set swap_tokens = swap_tokens + 1
    where house_id = x.house_id and user_id = x.done_by and swap_tokens < 1;
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'immunity' then
    update public.assignments set excused = false, outcome = null, settled_at = null where id = a.id;
    update public.members set immunity_tokens = immunity_tokens + 1
    where house_id = x.house_id and user_id = a.user_id and immunity_tokens < 2;
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'dispute' then
    delete from public.disputes where id = x.ref;
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'vote' then
    delete from public.dispute_votes where dispute_id = x.ref and user_id = x.done_by;
  when 'payment' then
    delete from public.ledger_entries
    where house_id = x.house_id and kind = 'payment'
      and id in (select (jsonb_array_elements_text(x.data -> 'ledger'))::bigint);
    delete from public.events where id = (x.data ->> 'event')::uuid;
  when 'away' then
    -- As cancel_away, for whoever it was.
    perform public.end_away(x.ref);
  when 'role' then
    if x.data ->> 'from' = 'member' and not exists (
      select 1 from public.members where house_id = x.house_id and role = 'admin' and user_id <> x.subject_user_id
    ) then
      raise exception 'last_admin';
    end if;
    update public.members set role = x.data ->> 'from' where house_id = x.house_id and user_id = x.subject_user_id;
  when 'remove' then
    insert into public.members (house_id, user_id, role, joined_at, streak, immunity_tokens, swap_tokens)
    values (x.house_id, x.subject_user_id, x.data ->> 'role', (x.data ->> 'joined_at')::timestamptz,
            (x.data ->> 'streak')::smallint, (x.data ->> 'immunity_tokens')::smallint,
            (x.data ->> 'swap_tokens')::smallint);
  end case;

  update public.house_actions set undone_at = now(), undone_by = me where id = x.id;

  -- A Done it is a flag its holder raised and ticked at once. Taking the tick
  -- back takes the flag with it: nobody asked, so nothing is left to do.
  if x.kind = 'tick' then
    perform public.drop_own_flag(x.assignment_id);
  end if;

  -- An admin taking back someone else's move says so on the Wall, to them.
  if x.done_by is not null and x.done_by <> me then
    insert into public.events (house_id, kind, user_id, assignment_id, data)
    values (x.house_id, 'undone', x.done_by,
            case when x.kind = 'flag' then null else x.assignment_id end,
            jsonb_build_object('by', me, 'what', x.kind, 'name', x.data ->> 'name', 'action', x.id));
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_done(p_assignment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.assignments := public.my_open_assignment(p_assignment);
  ticked_from uuid;
begin
  if a.done_at is null then
    return;
  end if;
  if a.covered_by is not null then
    raise exception 'john_covered';
  end if;
  select c.assignment_id into ticked_from from public.crew_members c where c.job_id = coalesce(a.job_id, a.id) limit 1;
  if ticked_from is not null and ticked_from <> a.id then
    raise exception 'not_your_tick';
  end if;
  if exists (select 1 from public.disputes where assignment_id = a.id and resolution is null) then
    raise exception 'under_dispute';
  end if;
  update public.assignments p set done_at = null, photo_path = null, absent_at = null
  where (p.id = a.id or (a.job_id is not null and p.job_id = a.job_id))
    and p.outcome is null and p.covered_by is null and (p.done_at = a.done_at or p.absent_at = a.done_at);
  delete from public.crew_members where assignment_id = a.id;
  delete from public.events
  where assignment_id = a.id and kind in ('done', 'late') and created_at >= a.done_at;
  perform public.drop_own_flag(a.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_latest(p_kind text, p_about uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := public.require_user();
  found_id uuid;
begin
  select id into found_id from public.house_actions
  where done_by = me and kind = p_kind and undone_at is null
    and (p_about is null or assignment_id = p_about or ref = p_about or subject_user_id = p_about)
  order by created_at desc limit 1;
  if found_id is null then
    raise exception 'cannot_undo';
  end if;
  perform public.undo_action(found_id);
  return found_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_reach(x house_actions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
  mine boolean;
  admin boolean;
  a public.assignments;
  b public.assignments;
  w public.weeks;
  d public.disputes;
  aw public.away_periods;
  tz text;
  open_dispute boolean;
  month_ok boolean;
begin
  if me is null or x.undone_at is not null or not public.is_member(x.house_id) then
    return null;
  end if;
  if x.kind = 'reset' then
    return public.reset_reach(x);
  end if;
  mine := x.done_by = me;
  admin := public.can(x.house_id, 'history.undo_any');
  select timezone into tz from public.houses where id = x.house_id;

  if x.kind in ('tick', 'cover', 'flag', 'swap', 'immunity') then
    select * into a from public.assignments where id = x.assignment_id;
    if a.id is null then
      return null;
    end if;
    select * into w from public.weeks where id = a.week_id;
    open_dispute := exists (select 1 from public.disputes where assignment_id = a.id and resolution is null);
    month_ok := public.month_open(x.house_id, a.due_at)
      and not exists (
        select 1 from public.ledger_entries l join public.month_closes c on c.house_id = l.house_id and c.month = l.month
        where l.assignment_id = a.id and l.kind = 'forfeit'
      );
  end if;

  case x.kind
  when 'tick' then
    -- Still this tick (not struck and ticked again), not under dispute, not covered.
    if a.done_at is distinct from (x.data ->> 'done_at')::timestamptz or a.covered_by is not null or open_dispute then
      return null;
    end if;
    if mine and a.user_id = me and a.outcome is null and now() < public.closes_at(a, w.ends_at) then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'cover' then
    if a.done_at is distinct from (x.data ->> 'done_at')::timestamptz or a.covered_by is distinct from x.done_by
       or open_dispute then
      return null;
    end if;
    if mine and a.outcome is null then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'flag' then
    if a.done_at is not null or a.outcome is not null then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'swap' then
    select * into b from public.assignments where id = x.ref;
    if b.id is null or a.user_id is distinct from x.done_by or b.user_id is distinct from x.subject_user_id
       or a.done_at is not null or b.done_at is not null or a.outcome is not null or b.outcome is not null
       or now() >= w.ends_at then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'immunity' then
    if a.outcome is distinct from 'excused' then
      return null;
    end if;
    if mine and w.closed_at is null then
      return 'own';
    end if;
    return case when admin and month_ok then 'admin' end;
  when 'dispute' then
    select * into d from public.disputes where id = x.ref;
    if d.id is null or d.resolution is not null then
      return null;
    end if;
    if mine and not exists (select 1 from public.dispute_votes v where v.dispute_id = d.id and v.user_id <> me) then
      return 'own';
    end if;
    return case when admin then 'admin' end;
  when 'vote' then
    select * into d from public.disputes where id = x.ref;
    if d.id is null or d.resolution is not null or now() >= d.closes_at
       or not exists (select 1 from public.dispute_votes v where v.dispute_id = d.id and v.user_id = x.done_by) then
      return null;
    end if;
    return case when mine then 'own' end;
  when 'payment' then
    if not exists (
      select 1 from public.ledger_entries l where l.id in (select (jsonb_array_elements_text(x.data -> 'ledger'))::bigint)
    ) then
      return null;
    end if;
    if mine and now() < x.created_at + interval '7 days' then
      return 'own';
    end if;
    return case when admin and public.month_open(x.house_id, x.created_at) then 'admin' end;
  when 'away' then
    select * into aw from public.away_periods where id = x.ref;
    if aw.id is null or aw.ends_on < (now() at time zone tz)::date then
      return null;
    end if;
    return case when mine then 'own' when admin then 'admin' end;
  when 'role' then
    if not exists (
      select 1 from public.members where house_id = x.house_id and user_id = x.subject_user_id and role = x.data ->> 'to'
    ) then
      return null;
    end if;
    return case when admin and public.month_open(x.house_id, x.created_at) then 'admin' end;
  when 'remove' then
    if now() >= x.created_at + interval '7 days'
       or exists (select 1 from public.members where user_id = x.subject_user_id) then
      return null;
    end if;
    return case when admin then 'admin' end;
  else
    return null;
  end case;
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_reset(x house_actions)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  snap jsonb := x.data -> 'snapshot';
  ids uuid[];
begin
  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into ids from jsonb_array_elements(snap -> 'assignments') s;

  if x.data ->> 'what' = 'redeal' then
    -- The new deal goes; the old one comes back below.
    delete from public.assignments where week_id = x.ref and not (id = any (ids));
    delete from public.on_call_picks where week_id = x.ref;
    insert into public.on_call_picks select * from jsonb_populate_recordset(null::public.on_call_picks, snap -> 'on_call');
  end if;

  -- Money: whatever the reset (or the clock, since) charged on these Johns,
  -- and its corrections, go; the forfeits it took away come back.
  delete from public.ledger_entries where kind = 'forfeit' and assignment_id = any (ids);
  delete from public.ledger_entries where id in (select (jsonb_array_elements_text(x.data -> 'added'))::bigint);
  if x.data ->> 'what' = 'letoff' then
    delete from public.ledger_entries where house_id = x.house_id and month = x.data ->> 'month' and kind = 'forfeit';
    delete from public.month_let_offs where house_id = x.house_id and month = x.data ->> 'month';
  end if;

  update public.assignments t
  set user_id = r.user_id, done_at = r.done_at, photo_path = r.photo_path, covered_by = r.covered_by,
      outcome = r.outcome, settled_at = r.settled_at, excused = r.excused, due_at = r.due_at,
      changed_by = r.changed_by, changed_at = r.changed_at
  from jsonb_populate_recordset(null::public.assignments, snap -> 'assignments') r
  where t.id = r.id;
  insert into public.assignments
  select r.* from jsonb_populate_recordset(null::public.assignments, snap -> 'assignments') r
  where not exists (select 1 from public.assignments t where t.id = r.id);

  insert into public.ledger_entries overriding system value
  select r.* from jsonb_populate_recordset(null::public.ledger_entries, snap -> 'ledger') r
  where not exists (select 1 from public.ledger_entries l where l.id = r.id);

  insert into public.disputes
  select r.* from jsonb_populate_recordset(null::public.disputes, snap -> 'disputes') r
  where not exists (select 1 from public.disputes d where d.id = r.id);
  insert into public.dispute_votes
  select r.* from jsonb_populate_recordset(null::public.dispute_votes, snap -> 'votes') r
  on conflict do nothing;
  insert into public.events
  select r.* from jsonb_populate_recordset(null::public.events, snap -> 'events') r
  where not exists (select 1 from public.events e where e.id = r.id);

  if x.ref is not null and x.data ->> 'what' <> 'result' then
    delete from public.week_shares where week_id = x.ref;
    insert into public.week_shares select * from jsonb_populate_recordset(null::public.week_shares, snap -> 'shares');
    update public.weeks set skipped_at = (snap ->> 'skipped_at')::timestamptz,
      skipped_by = case when snap ->> 'skipped_at' is null then null else skipped_by end
    where id = x.ref;
  end if;

  delete from public.events where id = (x.data ->> 'event')::uuid;
  perform public.recount_streaks(x.house_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.write_back(p_report uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := (select auth.uid());
  body text := btrim(coalesce(p_body, ''));
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  perform 1 from public.reports where id = p_report and user_id = me for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Twenty a day, so a stuck button cannot fill the Inbox this way either.
  if (select count(*) from public.report_messages m join public.reports r on r.id = m.report_id
      where r.user_id = me and not m.from_owner and m.created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;
  insert into public.report_messages (report_id, from_owner, written_by, body) values (p_report, false, me, body);
  update public.reports set state = 'new', last_activity_at = now(), seen_at = now() where id = p_report;
  return p_report;
end;
$function$;

revoke execute on function public.house_history(p_house uuid, p_before timestamp with time zone, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.house_history(p_house uuid, p_before timestamp with time zone, p_limit integer) to authenticated, service_role;
revoke execute on function public.moving_on() from public, anon, authenticated, service_role;
grant execute on function public.moving_on() to authenticated, service_role;
revoke execute on function public.my_reports() from public, anon, authenticated, service_role;
grant execute on function public.my_reports() to authenticated;
revoke execute on function public.owner_deletions() from public, anon, authenticated, service_role;
grant execute on function public.owner_deletions() to authenticated;
revoke execute on function public.owner_deletions_find(p_q text, p_by text, p_goes text, p_after timestamp with time zone, p_before timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function public.owner_deletions_page(p_q text, p_by text, p_goes text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_user uuid, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.owner_deletions_page(p_q text, p_by text, p_goes text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_user uuid, p_limit integer) to authenticated;
revoke execute on function public.owner_houses_match(p_q text, p_pass text, p_active text, p_after timestamp with time zone, p_before timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function public.owner_houses_page(p_q text, p_pass text, p_active text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.owner_houses_page(p_q text, p_pass text, p_active text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer) to authenticated;
revoke execute on function public.owner_reports_find(p_q text, p_state text, p_kind text, p_from text, p_after timestamp with time zone, p_before timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function public.owner_reports_page(p_q text, p_state text, p_kind text, p_from text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.owner_reports_page(p_q text, p_state text, p_kind text, p_from text, p_after timestamp with time zone, p_before timestamp with time zone, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer) to authenticated;
