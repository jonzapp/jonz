-- Database standards check: docs/standards/database.md.
--
-- Runs against a database built from the migrations (CI runs it after
-- `supabase db reset`; locally `npm run db:standards`). It reads the
-- catalog, so it checks what the migrations actually made, not how they
-- were typed. It lists every break and fails if there is any.
--
-- `allowed` holds the only exceptions. Each says why. Rows marked
-- 'until fix PR' are old names and gaps the fix PRs remove; never add a
-- new one of those. A new exception needs a reason a reviewer would accept.

\set ON_ERROR_STOP on

create temp table allowed (rule text, item text, why text, primary key (rule, item));
insert into allowed values
  -- Names that are already right as singular words.
  ('plural table', 'admin_audit', 'a log'),
  ('plural table', 'house_pass_billing', 'one billing record per house'),
  ('plural table', 'moving_pass_billing', 'one billing record per move'),
  ('plural table', 'owner_message_outbox', 'an outbox'),
  -- Ids that point at nothing on purpose.
  ('uuid has a foreign key', 'admin_audit.actor', 'append-only log: a delete could not clear it'),
  ('uuid has a foreign key', 'assignments.job_id', 'names a shared John''s places; there is no jobs table'),
  ('uuid has a foreign key', 'house_actions.ref', 'points at different tables by kind'),
  -- Old names and gaps from before the agreed rules (7 Nov 2026). The fix
  -- PRs delete these lines as they fix each one. Never add to them.
  ('foreign key has an index', 'assignments.assignments_changed_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'assignments.assignments_flagged_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'assignments.assignments_okayed_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'away.away_house_id_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'crew.crew_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'dispute_votes.dispute_votes_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'disputes.disputes_house_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'disputes.disputes_raised_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'events.events_assignment_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'events.events_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'group_members.group_members_group_id_house_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'group_members.group_members_house_id_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'house_actions.house_actions_assignment_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'house_actions.house_actions_subject_fkey', 'until fix PR'),
  ('foreign key has an index', 'house_actions.house_actions_undone_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'houses.houses_created_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'houses.houses_pass_buyer_fkey', 'until fix PR'),
  ('foreign key has an index', 'johns.johns_group_in_house', 'until fix PR'),
  ('foreign key has an index', 'ledger.ledger_counterparty_fkey', 'until fix PR'),
  ('foreign key has an index', 'ledger.ledger_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'month_let_offs.month_let_offs_let_off_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'moved_on.moved_on_from_house_fkey', 'until fix PR'),
  ('foreign key has an index', 'moved_on.moved_on_to_house_fkey', 'until fix PR'),
  ('foreign key has an index', 'notices.notices_created_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'on_call.on_call_john_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'on_call.on_call_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'owner_message_outbox.owner_message_outbox_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'owner_messages.owner_messages_house_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'owner_messages.owner_messages_person_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'pocket_earnings.pocket_earnings_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'pocket_pays.pocket_pays_paid_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'pocket_pays.pocket_pays_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'push_subscriptions.push_subscriptions_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'reactions.reactions_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'reports.reports_house_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'role_permissions.role_permissions_permission_fkey', 'until fix PR'),
  ('foreign key has an index', 'swap_offers.swap_offers_asked_by_fkey', 'until fix PR'),
  ('foreign key has an index', 'swap_offers.swap_offers_asked_to_fkey', 'until fix PR'),
  ('foreign key has an index', 'swap_offers.swap_offers_theirs_fkey', 'until fix PR'),
  ('foreign key has an index', 'week_shares.week_shares_user_id_fkey', 'until fix PR'),
  ('foreign key has an index', 'weeks.weeks_skipped_by_fkey', 'until fix PR'),
  ('has created_at', 'account_deletions', 'until fix PR'),
  ('has created_at', 'admin_audit', 'until fix PR'),
  ('has created_at', 'app_owners', 'until fix PR'),
  ('has created_at', 'house_pass_billing', 'until fix PR'),
  ('has created_at', 'month_closes', 'until fix PR'),
  ('has created_at', 'moved_on', 'until fix PR'),
  ('has created_at', 'moving_pass_billing', 'until fix PR'),
  ('has created_at', 'notification_prefs', 'until fix PR'),
  ('has created_at', 'owner_ask_turns', 'until fix PR'),
  ('has created_at', 'owner_messages', 'until fix PR'),
  ('has created_at', 'permissions', 'until fix PR'),
  ('has created_at', 'report_messages', 'until fix PR'),
  ('has created_at', 'role_permissions', 'until fix PR'),
  ('house copy tied to parent', 'assignments.assignments_john_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'assignments.assignments_week_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'crew.crew_assignment_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'disputes.disputes_assignment_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'events.events_assignment_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'house_actions.house_actions_assignment_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'ledger.ledger_assignment_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'on_call.on_call_john_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'on_call.on_call_week_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'pocket_earnings.pocket_earnings_assignment_id_fkey', 'until fix PR'),
  ('house copy tied to parent', 'swap_offers.swap_offers_mine_fkey', 'until fix PR'),
  ('house copy tied to parent', 'swap_offers.swap_offers_theirs_fkey', 'until fix PR'),
  ('house copy tied to parent', 'week_shares.week_shares_week_id_fkey', 'until fix PR'),
  ('index names', 'account_deletions_due', 'until fix PR'),
  ('index names', 'account_deletions_one_pending', 'until fix PR'),
  ('index names', 'admin_audit_at', 'until fix PR'),
  ('index names', 'ask_chats_mine', 'until fix PR'),
  ('index names', 'assignments_awaits_ok', 'until fix PR'),
  ('index names', 'assignments_covered_by', 'until fix PR'),
  ('index names', 'assignments_house_open', 'until fix PR'),
  ('index names', 'assignments_job', 'until fix PR'),
  ('index names', 'assignments_john', 'until fix PR'),
  ('index names', 'assignments_one_place_each', 'until fix PR'),
  ('index names', 'assignments_open_flags', 'until fix PR'),
  ('index names', 'assignments_user', 'until fix PR'),
  ('index names', 'assignments_week', 'until fix PR'),
  ('index names', 'away_house', 'until fix PR'),
  ('index names', 'crew_assignment', 'until fix PR'),
  ('index names', 'crew_house', 'until fix PR'),
  ('index names', 'disputes_one_open', 'until fix PR'),
  ('index names', 'events_house', 'until fix PR'),
  ('index names', 'group_members_house', 'until fix PR'),
  ('index names', 'house_actions_house', 'until fix PR'),
  ('index names', 'house_actions_mine', 'until fix PR'),
  ('index names', 'house_drafts_house_day', 'until fix PR'),
  ('index names', 'house_drafts_user_day', 'until fix PR'),
  ('index names', 'johns_house', 'until fix PR'),
  ('index names', 'ledger_house', 'until fix PR'),
  ('index names', 'ledger_one_close', 'until fix PR'),
  ('index names', 'ledger_one_forfeit', 'until fix PR'),
  ('index names', 'members_one_house', 'until fix PR'),
  ('index names', 'moved_on_user', 'until fix PR'),
  ('index names', 'moved_on_waiting', 'until fix PR'),
  ('index names', 'moving_pass_billing_subscription', 'until fix PR'),
  ('index names', 'notices_live', 'until fix PR'),
  ('index names', 'on_call_house', 'until fix PR'),
  ('index names', 'owner_ask_turns_owner_at', 'until fix PR'),
  ('index names', 'owner_messages_sent', 'until fix PR'),
  ('index names', 'pocket_earnings_house', 'until fix PR'),
  ('index names', 'pocket_pays_house', 'until fix PR'),
  ('index names', 'report_messages_report', 'until fix PR'),
  ('index names', 'reports_created', 'until fix PR'),
  ('index names', 'reports_user', 'until fix PR'),
  ('index names', 'reports_waiting', 'until fix PR'),
  ('index names', 'swap_offers_house', 'until fix PR'),
  ('index names', 'swap_offers_one_open', 'until fix PR'),
  ('index names', 'week_shares_house', 'until fix PR'),
  ('one rule per role and action', 'notices: authenticated SELECT', 'until fix PR'),
  ('people point at profiles', 'app_owners.app_owners_user_id_fkey', 'until fix PR'),
  ('people point at profiles', 'houses.houses_created_by_fkey', 'until fix PR'),
  ('people point at profiles', 'notices.notices_created_by_fkey', 'until fix PR'),
  ('people point at profiles', 'owner_ask_turns.owner_ask_turns_owner_id_fkey', 'until fix PR'),
  ('people point at profiles', 'reports.reports_user_id_fkey', 'until fix PR'),
  ('plural table', 'away', 'until fix PR'),
  ('plural table', 'crew', 'until fix PR'),
  ('plural table', 'ledger', 'until fix PR'),
  ('plural table', 'moved_on', 'until fix PR'),
  ('plural table', 'on_call', 'until fix PR'),
  ('pointer ends _id or _by', 'house_actions.actor', 'until fix PR'),
  ('pointer ends _id or _by', 'house_actions.subject', 'until fix PR'),
  ('pointer ends _id or _by', 'houses.pass_buyer', 'until fix PR'),
  ('pointer ends _id or _by', 'ledger.counterparty', 'until fix PR'),
  ('pointer ends _id or _by', 'moved_on.from_house', 'until fix PR'),
  ('pointer ends _id or _by', 'moved_on.to_house', 'until fix PR'),
  ('pointer ends _id or _by', 'swap_offers.asked_to', 'until fix PR'),
  ('pointer ends _id or _by', 'swap_offers.mine', 'until fix PR'),
  ('pointer ends _id or _by', 'swap_offers.theirs', 'until fix PR'),
  ('rules wrap auth calls', 'moved_on: your own moves', 'until fix PR'),
  ('server only says so', 'account_deletions', 'until fix PR'),
  ('server only says so', 'app_owners', 'until fix PR'),
  ('server only says so', 'house_drafts', 'until fix PR'),
  ('server only says so', 'house_pass_billing', 'until fix PR'),
  ('server only says so', 'moving_pass_billing', 'until fix PR'),
  ('server only says so', 'owner_message_outbox', 'until fix PR'),
  ('server only says so', 'owner_messages', 'until fix PR'),
  ('table comment', 'account_deletions', 'until fix PR'),
  ('table comment', 'admin_audit', 'until fix PR'),
  ('table comment', 'app_owners', 'until fix PR'),
  ('table comment', 'ask_chats', 'until fix PR'),
  ('table comment', 'assignments', 'until fix PR'),
  ('table comment', 'away', 'until fix PR'),
  ('table comment', 'crew', 'until fix PR'),
  ('table comment', 'dispute_votes', 'until fix PR'),
  ('table comment', 'disputes', 'until fix PR'),
  ('table comment', 'events', 'until fix PR'),
  ('table comment', 'group_members', 'until fix PR'),
  ('table comment', 'groups', 'until fix PR'),
  ('table comment', 'house_actions', 'until fix PR'),
  ('table comment', 'house_drafts', 'until fix PR'),
  ('table comment', 'house_pass_billing', 'until fix PR'),
  ('table comment', 'houses', 'until fix PR'),
  ('table comment', 'johns', 'until fix PR'),
  ('table comment', 'ledger', 'until fix PR'),
  ('table comment', 'members', 'until fix PR'),
  ('table comment', 'month_closes', 'until fix PR'),
  ('table comment', 'month_let_offs', 'until fix PR'),
  ('table comment', 'moved_on', 'until fix PR'),
  ('table comment', 'moving_pass_billing', 'until fix PR'),
  ('table comment', 'notices', 'until fix PR'),
  ('table comment', 'notification_prefs', 'until fix PR'),
  ('table comment', 'on_call', 'until fix PR'),
  ('table comment', 'owner_ask_turns', 'until fix PR'),
  ('table comment', 'owner_message_outbox', 'until fix PR'),
  ('table comment', 'owner_messages', 'until fix PR'),
  ('table comment', 'permissions', 'until fix PR'),
  ('table comment', 'pocket_earnings', 'until fix PR'),
  ('table comment', 'pocket_pays', 'until fix PR'),
  ('table comment', 'profiles', 'until fix PR'),
  ('table comment', 'push_subscriptions', 'until fix PR'),
  ('table comment', 'reactions', 'until fix PR'),
  ('table comment', 'report_messages', 'until fix PR'),
  ('table comment', 'reports', 'until fix PR'),
  ('table comment', 'role_permissions', 'until fix PR'),
  ('table comment', 'swap_offers', 'until fix PR'),
  ('table comment', 'week_shares', 'until fix PR'),
  ('table comment', 'weeks', 'until fix PR'),
  ('times named _at / _on', 'account_deletions.delete_after', 'until fix PR'),
  ('times named _at / _on', 'admin_audit.at', 'until fix PR'),
  ('times named _at / _on', 'assignments.due_moved_from', 'until fix PR'),
  ('times named _at / _on', 'houses.pass_until', 'until fix PR'),
  ('times named _at / _on', 'moved_on.pass_until', 'until fix PR'),
  ('times named _at / _on', 'report_messages.at', 'until fix PR'),
  ('updated_at by trigger', 'ask_chats', 'until fix PR'),
  ('updated_at by trigger', 'house_pass_billing', 'until fix PR'),
  ('updated_at by trigger', 'notices', 'until fix PR'),
  ('updated_at by trigger', 'notification_prefs', 'until fix PR'),
  ('updated_at by trigger', 'reports', 'until fix PR'),
  ('uuid has a foreign key', 'owner_messages.sent_by', 'until fix PR'),
  ('uuid has a foreign key', 'report_messages.author', 'until fix PR'),
  ('foreign key has an index', 'promotion_uses.promotion_uses_house_id_fkey', 'until fix PR'),
  ('has created_at', 'promotion_people', 'until fix PR'),
  ('has created_at', 'promotion_uses', 'until fix PR'),
  ('has created_at', 'promotions', 'until fix PR'),
  ('index names', 'assignments_handed_by_away', 'until fix PR'),
  ('index names', 'assignments_house_done', 'until fix PR'),
  ('index names', 'assignments_house_due', 'until fix PR'),
  ('index names', 'events_untold', 'until fix PR'),
  ('index names', 'promotion_uses_of', 'until fix PR'),
  ('index names', 'promotions_made', 'until fix PR'),
  ('index names', 'reports_from_email', 'until fix PR'),
  ('index names', 'reports_same_as', 'until fix PR'),
  ('pointer ends _id or _by', 'reports.same_as', 'until fix PR'),
  ('server only says so', 'promotion_people', 'until fix PR'),
  ('server only says so', 'promotion_uses', 'until fix PR'),
  ('server only says so', 'promotions', 'until fix PR'),
  ('table comment', 'promotion_people', 'until fix PR'),
  ('table comment', 'promotion_uses', 'until fix PR'),
  ('table comment', 'promotions', 'until fix PR'),
  ('times named _at / _on', 'assignments.cover_held_until', 'until fix PR'),
  ('times named _at / _on', 'promotion_uses.at', 'until fix PR'),
  ('uuid has a foreign key', 'assignments.handed_by_away', 'until fix PR'),
  ('uuid has a foreign key', 'assignments.handed_from', 'until fix PR'),
  ('uuid has a foreign key', 'promotion_uses.user_id', 'until fix PR'),
  ('uuid has a foreign key', 'promotions.made_by', 'until fix PR');

-- Server functions signed-in people may call (rule 22). Each one checks,
-- inside, that the caller may do what it does. Adding one here is a
-- decision a reviewer should see.
create temp table callable (name text primary key);
insert into callable values
  ('account_deletion_preview'), ('account_deletion_status'),
  ('answer_dispute'), ('answer_swap'), ('answer_tick'), ('board_tick'),
  ('can'), ('can_upload_proof'), ('cancel_away'), ('cast_vote'),
  ('claim_owner_ask'), ('confirm_payment'), ('cover_john'),
  ('create_house'), ('delete_group'), ('end_notice'), ('finish_owner_ask'),
  ('hand_over'), ('hold_cover'), ('house_by_code'), ('house_history'),
  ('is_member'), ('is_owner'), ('join_house'), ('keep_account'),
  ('leave_pass'), ('mark_done'), ('moving_on'), ('my_permissions'),
  ('my_reports'), ('offer_swap'), ('owner_delete_now'), ('owner_deletions'),
  ('owner_deletions_count'), ('owner_deletions_page'), ('owner_fix_report'),
  ('owner_house'), ('owner_houses_count'), ('owner_houses_find'),
  ('owner_houses_page'), ('owner_make_promotion'), ('owner_message_reach'),
  ('owner_messages_count'), ('owner_messages_find'),
  ('owner_messages_page'), ('owner_open_report'), ('owner_overview'),
  ('owner_people_find'), ('owner_promotion'), ('owner_promotion_emails'),
  ('owner_promotions_count'), ('owner_promotions_find'),
  ('owner_promotions_page'), ('owner_reply_report'),
  ('owner_reports_count'), ('owner_reports_page'),
  ('owner_request_deletion'), ('owner_same_as'), ('owner_same_as_find'),
  ('owner_send_message'), ('owner_set_report_state'), ('owner_status'),
  ('owner_stop_deletion'), ('owner_stop_promotion'), ('pay_pocket_money'),
  ('plan_john'), ('raise_dispute'), ('raise_flag'), ('remove_flag'),
  ('remove_member'), ('request_account_deletion'), ('reset_join_code'),
  ('roll_call'), ('runs_for'), ('save_group'), ('save_notice'),
  ('save_prefs'), ('see_report'), ('send_report'), ('set_away'),
  ('set_house_kind'), ('set_member_role'), ('set_moving_out'),
  ('set_my_photo'), ('shares_house'), ('start_house_from'), ('undo_action'),
  ('undo_cover'), ('undo_done'), ('undo_latest'), ('use_immunity'),
  ('use_swap'), ('write_back');

create temp table breaks (rule text, item text);

-- 1. Every table has row level security on.
insert into breaks
select 'rls on', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- 2. Table names are plural.
insert into breaks
select 'plural table', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname !~ '(s|people)$';

-- 3. A column that points at another row ends in _id (or <verb>_by for who did it).
insert into breaks
select 'pointer ends _id or _by', k.conrelid::regclass::text || '.' || a.attname
from pg_constraint k
join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
where k.contype = 'f' and k.connamespace = 'public'::regnamespace
  and a.atttypid = 'uuid'::regtype
  and a.attname !~ '(_id|_by)$'
  and not (k.conrelid = 'public.profiles'::regclass and a.attname = 'id');

-- 4. Every uuid column other than the primary key has a foreign key.
insert into breaks
select 'uuid has a foreign key', c.relname || '.' || a.attname
from pg_attribute a
join pg_class c on c.oid = a.attrelid
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and a.attnum > 0 and not a.attisdropped and a.atttypid = 'uuid'::regtype
  and not exists (select 1 from pg_constraint k
                  where k.conrelid = c.oid and k.contype in ('f', 'p') and a.attnum = any (k.conkey));

-- 5. People are profiles: only profiles.id points at the sign-in table.
insert into breaks
select 'people point at profiles', k.conrelid::regclass::text || '.' || k.conname
from pg_constraint k
where k.contype = 'f' and k.connamespace = 'public'::regnamespace
  and k.confrelid = 'auth.users'::regclass and k.conrelid <> 'public.profiles'::regclass;

-- 6. Every foreign key has an index that starts with its columns.
insert into breaks
select 'foreign key has an index', k.conrelid::regclass::text || '.' || k.conname
from pg_constraint k
where k.contype = 'f' and k.connamespace = 'public'::regnamespace
  and not exists (
    select 1 from pg_index i
    where i.indrelid = k.conrelid
      and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:cardinality(k.conkey) - 1]) x)
        = (select array_agg(x order by x) from unnest(k.conkey) x));

-- 7. Moments are timestamptz named _at; calendar days are date named _on.
insert into breaks
select 'times named _at / _on', c.relname || '.' || a.attname
from pg_attribute a
join pg_class c on c.oid = a.attrelid
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and a.attnum > 0 and not a.attisdropped
  and ((a.atttypid = 'timestamptz'::regtype and a.attname !~ '_at$')
    or (a.atttypid = 'date'::regtype and a.attname !~ '_on$')
    or (a.attname ~ '_at$' and a.atttypid <> 'timestamptz'::regtype)
    or a.atttypid = 'timestamp'::regtype);

-- 8. No Postgres enums: word lists are text with a check.
insert into breaks
select 'no enums', t.typname from pg_type t
where t.typnamespace = 'public'::regnamespace and t.typtype = 'e';

-- 9. Server functions that run as their owner pin an empty search path.
insert into breaks
select 'definer pins search_path', p.oid::regprocedure::text from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and not ('search_path=""' = any (coalesce(p.proconfig, '{}')));


-- 11. Indexes are named <table>_<columns>_idx, unique ones _key (rule 7).
insert into breaks
select 'index names', i.indexrelid::regclass::text from pg_index i
join pg_class c on c.oid = i.indrelid
where c.relnamespace = 'public'::regnamespace
  and not ((i.indexrelid::regclass::text like c.relname || '\_%')
           and i.indexrelid::regclass::text ~ '_(idx|key|pkey)$');

-- 12. A house copy is tied to its parent's house (rule 11): a table whose
-- house_id is required and that points at another table with house_id does it with a key
-- that includes house_id on both sides.
insert into breaks
select 'house copy tied to parent', k.conrelid::regclass::text || '.' || k.conname
from pg_constraint k
where k.contype = 'f' and k.connamespace = 'public'::regnamespace
  and k.confrelid not in ('public.houses'::regclass, k.conrelid)
  and exists (select 1 from pg_attribute where attrelid = k.conrelid and attname = 'house_id' and attnotnull and not attisdropped)
  and exists (select 1 from pg_attribute where attrelid = k.confrelid and attname = 'house_id' and not attisdropped)
  and not exists (select 1 from pg_attribute a where a.attrelid = k.conrelid and a.attnum = any (k.conkey) and a.attname = 'house_id');

-- 13. Text is text, never char(n) or varchar(n) (rule 12).
insert into breaks
select 'text not char/varchar', c.relname || '.' || a.attname
from pg_attribute a join pg_class c on c.oid = a.attrelid
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and a.attnum > 0 and not a.attisdropped and a.atttypid in ('varchar'::regtype, 'bpchar'::regtype);

-- 14. Counting numbers use identity, never serial (rule 14).
insert into breaks
select 'identity not serial', c.relname || '.' || a.attname
from pg_attribute a join pg_class c on c.oid = a.attrelid
join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and pg_get_expr(d.adbin, d.adrelid) like 'nextval(%';

-- 15. Every table that isn't a pure link table has created_at (rule 16).
-- A link table's key is two or more columns, every one of them a pointer.
insert into breaks
select 'has created_at', c.relname from pg_class c
join pg_constraint p on p.conrelid = c.oid and p.contype = 'p'
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and not exists (select 1 from pg_attribute where attrelid = c.oid and attname = 'created_at' and not attisdropped)
  and not (cardinality(p.conkey) > 1
           and (select bool_and(exists (select 1 from pg_constraint f where f.conrelid = c.oid and f.contype = 'f' and k = any (f.conkey)))
                from unnest(p.conkey) k));

-- 16. updated_at is kept by the shared trigger public.set_updated_at() (rule 16).
insert into breaks
select 'updated_at by trigger', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and exists (select 1 from pg_attribute where attrelid = c.oid and attname = 'updated_at' and not attisdropped)
  and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal
                  and t.tgfoid = to_regprocedure('public.set_updated_at()'));

-- 17. Every table has a comment saying what it holds (rule 17); a table
-- with no security rules says it is server only (rule 18).
insert into breaks
select 'table comment', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and obj_description(c.oid, 'pg_class') is null;
insert into breaks
select 'server only says so', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  and coalesce(obj_description(c.oid, 'pg_class'), '') !~* 'server only';

-- 18. Rules call (select auth.uid()), so it runs once per query (rule 19).
insert into breaks
select 'rules wrap auth calls', p.tablename || ': ' || p.policyname from pg_policies p
where p.schemaname = 'public'
  and regexp_replace(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
                     'SELECT (auth\.\w+\(\)|current_setting\()', '', 'g') ~ '(auth\.\w+\(\)|current_setting\()';

-- 19. One permissive rule per table, role and action (rule 20).
insert into breaks
select 'one rule per role and action', x.tablename || ': ' || x.role || ' ' || x.cmd
from (select p.tablename, r.role, c.cmd, count(*) n
      from pg_policies p, unnest(p.roles) r(role),
           unnest(case when p.cmd = 'ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd] end) c(cmd)
      where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
      group by 1, 2, 3) x
where x.n > 1;

-- 20. A definer function that signed-in people (or anyone) can call is on
-- the callable list below, because it must check permission inside (rule 22).
insert into breaks
select 'callable functions listed', p.proname from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  and p.proname not in (select name from callable);
insert into breaks
select 'callable functions listed', 'stale: ' || name from callable
where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = name
                  and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute'));

-- 21. Every allowed exception still matches a real break (keeps the list honest).
insert into breaks
select 'stale exception', a.rule || ': ' || a.item from allowed a
where not exists (select 1 from breaks b where b.rule = a.rule and b.item = a.item);

do $$
declare
  found text;
begin
  select string_agg(format('  %s: %s', b.rule, b.item), e'\n' order by b.rule, b.item) into found
  from breaks b
  where not exists (select 1 from allowed a where a.rule = b.rule and a.item = b.item);
  if found is not null then
    raise exception e'Database standards (docs/standards/database.md) broken:\n%', found;
  end if;
  raise notice 'Database standards: all checks pass.';
end $$;
