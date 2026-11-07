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
  -- Old names and gaps from before the standards (review of 7 Nov 2026).
  -- The fix PRs delete these lines as they fix each one. Never add to them.
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
  ('times named _at / _on', 'account_deletions.delete_after', 'until fix PR'),
  ('times named _at / _on', 'admin_audit.at', 'until fix PR'),
  ('times named _at / _on', 'assignments.due_moved_from', 'until fix PR'),
  ('times named _at / _on', 'houses.pass_until', 'until fix PR'),
  ('times named _at / _on', 'moved_on.pass_until', 'until fix PR'),
  ('times named _at / _on', 'report_messages.at', 'until fix PR'),
  ('uuid has a foreign key', 'owner_messages.sent_by', 'until fix PR'),
  ('uuid has a foreign key', 'report_messages.author', 'until fix PR');

create temp table breaks (rule text, item text);

-- 1. Every table has row level security on.
insert into breaks
select 'rls on', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- 2. Table names are plural.
insert into breaks
select 'plural table', c.relname from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname !~ 's$';

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

-- 10. Every allowed exception still matches a real break (keeps the list honest).
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
