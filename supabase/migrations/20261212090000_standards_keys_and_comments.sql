-- Database standards, fix PR A (docs/standards/database.md, agreed 7 Nov 2026).
-- No renames and no app changes: keys, indexes, timestamps, comments and two
-- security rules. Every existing row already satisfies the new keys (checked
-- on production before this was written), so nothing is lost or changed.

-- Rule 16: one shared trigger keeps updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger ask_chats_set_updated_at before update on public.ask_chats
  for each row execute function public.set_updated_at();
create trigger notices_set_updated_at before update on public.notices
  for each row execute function public.set_updated_at();
create trigger house_pass_billing_set_updated_at before update on public.house_pass_billing
  for each row execute function public.set_updated_at();
create trigger notification_prefs_set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- Rule 11: a house copy is tied to its parent's house.
alter table public.weeks add constraint weeks_id_house_id_key unique (id, house_id);
alter table public.johns add constraint johns_id_house_id_key unique (id, house_id);
alter table public.assignments add constraint assignments_id_house_id_key unique (id, house_id);

alter table public.assignments
  drop constraint assignments_week_id_fkey,
  add constraint assignments_week_id_house_id_fkey foreign key (week_id, house_id)
    references public.weeks (id, house_id) on delete cascade,
  drop constraint assignments_john_id_fkey,
  add constraint assignments_john_id_house_id_fkey foreign key (john_id, house_id)
    references public.johns (id, house_id) on delete set null (john_id);
alter table public.crew
  drop constraint crew_assignment_id_fkey,
  add constraint crew_assignment_id_house_id_fkey foreign key (assignment_id, house_id)
    references public.assignments (id, house_id) on delete cascade;
alter table public.disputes
  drop constraint disputes_assignment_id_fkey,
  add constraint disputes_assignment_id_house_id_fkey foreign key (assignment_id, house_id)
    references public.assignments (id, house_id) on delete cascade;
alter table public.events
  drop constraint events_assignment_id_fkey,
  add constraint events_assignment_id_house_id_fkey foreign key (assignment_id, house_id)
    references public.assignments (id, house_id) on delete cascade;
alter table public.house_actions
  drop constraint house_actions_assignment_id_fkey,
  add constraint house_actions_assignment_id_house_id_fkey foreign key (assignment_id, house_id)
    references public.assignments (id, house_id) on delete set null (assignment_id);
alter table public.ledger
  drop constraint ledger_assignment_id_fkey,
  add constraint ledger_assignment_id_house_id_fkey foreign key (assignment_id, house_id)
    references public.assignments (id, house_id) on delete set null (assignment_id);
alter table public.on_call
  drop constraint on_call_week_id_fkey,
  add constraint on_call_week_id_house_id_fkey foreign key (week_id, house_id)
    references public.weeks (id, house_id) on delete cascade,
  drop constraint on_call_john_id_fkey,
  add constraint on_call_john_id_house_id_fkey foreign key (john_id, house_id)
    references public.johns (id, house_id) on delete cascade;
alter table public.pocket_earnings
  drop constraint pocket_earnings_assignment_id_fkey,
  add constraint pocket_earnings_assignment_id_house_id_fkey foreign key (assignment_id, house_id)
    references public.assignments (id, house_id) on delete cascade;
alter table public.swap_offers
  drop constraint swap_offers_mine_fkey,
  add constraint swap_offers_mine_house_id_fkey foreign key (mine, house_id)
    references public.assignments (id, house_id) on delete cascade,
  drop constraint swap_offers_theirs_fkey,
  add constraint swap_offers_theirs_house_id_fkey foreign key (theirs, house_id)
    references public.assignments (id, house_id) on delete cascade;
alter table public.week_shares
  drop constraint week_shares_week_id_fkey,
  add constraint week_shares_week_id_house_id_fkey foreign key (week_id, house_id)
    references public.weeks (id, house_id) on delete cascade;

-- Rule 5: people point at profiles, never at the sign-in table.
alter table public.houses
  drop constraint houses_created_by_fkey,
  add constraint houses_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.app_owners
  drop constraint app_owners_user_id_fkey,
  add constraint app_owners_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.notices
  drop constraint notices_created_by_fkey,
  add constraint notices_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.reports
  drop constraint reports_user_id_fkey,
  add constraint reports_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;
alter table public.owner_ask_turns
  drop constraint owner_ask_turns_owner_id_fkey,
  add constraint owner_ask_turns_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete cascade;

-- Rule 9: every pointer has a foreign key.
alter table public.owner_messages
  add constraint owner_messages_sent_by_fkey foreign key (sent_by) references public.profiles (id) on delete set null;
alter table public.report_messages
  add constraint report_messages_author_fkey foreign key (author) references public.profiles (id) on delete set null;

-- Rule 16: created_at, filled from the row's own first moment where it has one.
alter table public.account_deletions add column created_at timestamptz not null default now();
update public.account_deletions set created_at = requested_at;
alter table public.house_pass_billing add column created_at timestamptz not null default now();
update public.house_pass_billing set created_at = updated_at;
alter table public.month_closes add column created_at timestamptz not null default now();
update public.month_closes set created_at = closed_at;
alter table public.moved_on add column created_at timestamptz not null default now();
update public.moved_on set created_at = left_at;
alter table public.moving_pass_billing add column created_at timestamptz not null default now();
alter table public.notification_prefs add column created_at timestamptz not null default now();
update public.notification_prefs set created_at = updated_at;
alter table public.owner_ask_turns add column created_at timestamptz not null default now();
update public.owner_ask_turns set created_at = asked_at;
alter table public.owner_messages add column created_at timestamptz not null default now();
update public.owner_messages set created_at = sent_at;
alter table public.permissions add column created_at timestamptz not null default now();
alter table public.role_permissions add column created_at timestamptz not null default now();

-- Rule 19: call auth.uid() once per query.
drop policy "your own moves" on public.moved_on;
create policy "your own moves" on public.moved_on for select to authenticated
  using (user_id = (select auth.uid()));

-- Rule 20: one rule per role and action.
drop policy "everyone reads the notices that are on" on public.notices;
drop policy "the owner reads every notice" on public.notices;
create policy "anyone reads the notices that are on" on public.notices for select to anon
  using (starts_at <= now() and (ends_at is null or ends_at > now()));
create policy "people read the notices that are on, the owner reads every notice" on public.notices
  for select to authenticated
  using ((starts_at <= now() and (ends_at is null or ends_at > now())) or (select public.is_owner()));

-- Rule 10: every foreign key has an index.
create index assignments_changed_by_idx on public.assignments (changed_by);
create index assignments_flagged_by_idx on public.assignments (flagged_by);
create index assignments_john_id_house_id_idx on public.assignments (john_id, house_id);
create index assignments_okayed_by_idx on public.assignments (okayed_by);
create index assignments_week_id_house_id_idx on public.assignments (week_id, house_id);
create index away_house_id_user_id_idx on public.away (house_id, user_id);
create index crew_assignment_id_house_id_idx on public.crew (assignment_id, house_id);
create index crew_user_id_idx on public.crew (user_id);
create index dispute_votes_user_id_idx on public.dispute_votes (user_id);
create index disputes_assignment_id_house_id_idx on public.disputes (assignment_id, house_id);
create index disputes_house_id_idx on public.disputes (house_id);
create index disputes_raised_by_idx on public.disputes (raised_by);
create index events_assignment_id_house_id_idx on public.events (assignment_id, house_id);
create index events_user_id_idx on public.events (user_id);
create index group_members_group_id_house_id_idx on public.group_members (group_id, house_id);
create index group_members_house_id_user_id_idx on public.group_members (house_id, user_id);
create index house_actions_assignment_id_house_id_idx on public.house_actions (assignment_id, house_id);
create index house_actions_subject_idx on public.house_actions (subject);
create index house_actions_undone_by_idx on public.house_actions (undone_by);
create index houses_created_by_idx on public.houses (created_by);
create index houses_pass_buyer_idx on public.houses (pass_buyer);
create index johns_group_id_house_id_idx on public.johns (group_id, house_id);
create index ledger_assignment_id_house_id_idx on public.ledger (assignment_id, house_id);
create index ledger_counterparty_idx on public.ledger (counterparty);
create index ledger_user_id_idx on public.ledger (user_id);
create index month_let_offs_let_off_by_idx on public.month_let_offs (let_off_by);
create index moved_on_from_house_idx on public.moved_on (from_house);
create index moved_on_to_house_idx on public.moved_on (to_house);
create index notices_created_by_idx on public.notices (created_by);
create index on_call_john_id_house_id_idx on public.on_call (john_id, house_id);
create index on_call_user_id_idx on public.on_call (user_id);
create index on_call_week_id_house_id_idx on public.on_call (week_id, house_id);
create index owner_message_outbox_user_id_idx on public.owner_message_outbox (user_id);
create index owner_messages_house_id_idx on public.owner_messages (house_id);
create index owner_messages_person_id_idx on public.owner_messages (person_id);
create index owner_messages_sent_by_idx on public.owner_messages (sent_by);
create index pocket_earnings_assignment_id_house_id_idx on public.pocket_earnings (assignment_id, house_id);
create index pocket_earnings_user_id_idx on public.pocket_earnings (user_id);
create index pocket_pays_paid_by_idx on public.pocket_pays (paid_by);
create index pocket_pays_user_id_idx on public.pocket_pays (user_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index reactions_user_id_idx on public.reactions (user_id);
create index report_messages_author_idx on public.report_messages (author);
create index reports_house_id_idx on public.reports (house_id);
create index role_permissions_permission_idx on public.role_permissions (permission);
create index swap_offers_asked_by_idx on public.swap_offers (asked_by);
create index swap_offers_asked_to_idx on public.swap_offers (asked_to);
create index swap_offers_mine_house_id_idx on public.swap_offers (mine, house_id);
create index swap_offers_theirs_house_id_idx on public.swap_offers (theirs, house_id);
create index week_shares_user_id_idx on public.week_shares (user_id);
create index week_shares_week_id_house_id_idx on public.week_shares (week_id, house_id);
create index weeks_skipped_by_idx on public.weeks (skipped_by);

-- Indexes the new ones cover.
drop index public.assignments_week; -- assignments_week_id_house_id_idx covers it
drop index public.crew_assignment; -- crew_assignment_id_house_id_idx covers it
drop index public.group_members_house; -- group_members_house_id_user_id_idx covers it

-- Rule 17: every table says what it holds; rule 18: server-only tables say so.
comment on table public.profiles is 'A person: name and photo. Made by handle_new_user when someone first signs in; its id is their sign-in id.';
comment on table public.notification_prefs is 'Which kinds of push a person wants, and their quiet hours. No row means everything on.';
comment on table public.push_subscriptions is 'Each phone or browser that gets a person''s pushes.';
comment on table public.account_deletions is 'Server only. A request to delete an account, its wait, and how it ended.';
comment on table public.houses is 'A house and its rules: timezone, currency, stake and forfeits, deal mode, House Pass.';
comment on table public.members is 'Who is in which house: their role, streak, tokens and preferences.';
comment on table public.groups is 'Named groups of housemates inside a house.';
comment on table public.group_members is 'Who is in each group.';
comment on table public.away is 'A housemate''s time away: first and last local day, inclusive.';
comment on table public.moved_on is 'Each move out of a house, and where the person went next.';
comment on table public.house_pass_billing is 'Server only. The Stripe customer and subscription behind a house''s Pass.';
comment on table public.moving_pass_billing is 'Server only. The Stripe ids of a Pass that is moving to a new house.';
comment on table public.permissions is 'Every action a role can be allowed to do. Mirrors PERMISSIONS in packages/core.';
comment on table public.role_permissions is 'Which role may do which action. Mirrors ROLE_PERMISSIONS in packages/core.';
comment on table public.johns is 'The house''s list of Johns: how often, points, due day and time.';
comment on table public.weeks is 'One week of a house, from the deal to its close.';
comment on table public.week_shares is 'Each housemate''s fair share of a week.';
comment on table public.assignments is 'One John given to one person in one week, and what happened to it.';
comment on table public.on_call is 'Who holds each on-call John in each week.';
comment on table public.crew is 'Who did a shared John, and each person''s share of its points.';
comment on table public.swap_offers is 'An ask to swap two Johns between housemates, and its answer.';
comment on table public.disputes is 'A Not done check raised on a tick, and its verdict.';
comment on table public.dispute_votes is 'Each housemate''s Done or Not done vote on a check.';
comment on table public.ledger is 'Every money line of a house: shares, forfeits, payments, corrections.';
comment on table public.month_closes is 'Months whose Stake has been settled.';
comment on table public.month_let_offs is 'Months an admin let everyone off.';
comment on table public.pocket_earnings is 'Family houses: pocket money a kid earned for a John.';
comment on table public.pocket_pays is 'Family houses: pocket money paid out for a month.';
comment on table public.events is 'Posts on the Wall.';
comment on table public.reactions is 'Reactions to Wall posts.';
comment on table public.house_actions is 'The house''s history of changes, used by Undo.';
comment on table public.ask_chats is 'A person''s saved Ask Jonz chats.';
comment on table public.house_drafts is 'Server only. Each Describe your house try, for the daily limit and its cost.';
comment on table public.owner_ask_turns is 'The owner''s Ask Jonz questions and replies.';
comment on table public.app_owners is 'Server only. Who owns the app. Changed only by migration.';
comment on table public.admin_audit is 'Every owner action. Append only: never edited or deleted.';
comment on table public.notices is 'Banners the owner shows in the app.';
comment on table public.owner_messages is 'Server only. Messages the owner sent, and how many people each reached.';
comment on table public.owner_message_outbox is 'Server only. Who still has to get each owner message.';
comment on table public.reports is 'Problems, ideas and questions people sent from the app.';
comment on table public.report_messages is 'The conversation on a report, between its sender and the owner.';

-- Tables and columns added since the rules were agreed (promotions, fair away).
alter table public.away add constraint away_id_house_id_key unique (id, house_id);
alter table public.assignments
  add constraint assignments_handed_from_fkey foreign key (handed_from) references public.profiles (id) on delete set null,
  add constraint assignments_handed_by_away_house_id_fkey foreign key (handed_by_away, house_id)
    references public.away (id, house_id) on delete set null (handed_by_away);
create index assignments_handed_by_away_house_id_idx on public.assignments (handed_by_away, house_id);
create index assignments_handed_from_idx on public.assignments (handed_from);
alter table public.promotions
  add constraint promotions_made_by_fkey foreign key (made_by) references public.profiles (id) on delete set null;
create index promotions_made_by_idx on public.promotions (made_by);
alter table public.promotion_uses
  add constraint promotion_uses_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;
create index promotion_uses_user_id_idx on public.promotion_uses (user_id);
create index promotion_uses_house_id_idx on public.promotion_uses (house_id);

alter table public.promotions add column created_at timestamptz not null default now();
update public.promotions set created_at = made_at;
alter table public.promotion_people add column created_at timestamptz not null default now();
update public.promotion_people set created_at = coalesce(opened_at, emailed_at, used_at, created_at);
alter table public.promotion_uses add column created_at timestamptz not null default now();
update public.promotion_uses set created_at = at;

comment on table public.promotions is 'Server only. Owner promotions: the offer, who it is for, and its Stripe coupon.';
comment on table public.promotion_people is 'Server only. The people a promotion was made for, and when each opened, got and used it.';
comment on table public.promotion_uses is 'Server only. Each time a promotion code was used at checkout.';
