-- Reading a house, one resource at a time (step 3b of the operation
-- registry; packages/core/src/operations.ts).
--
-- house:read used to cover everything in a house. Now it covers the house
-- itself (its name and rules), and each part has its own read: johns:read,
-- weeks:read, away:read, disputes:read, wall:read, groups:read,
-- history:read, payments:read, pocket_money:read and members:read. Each
-- table rule that said "a member of the house" (is_member) now asks
-- can(house, '<its read>'), and house_history asks history:read. The same
-- names will be the scopes an outside app asks for, so it can be given
-- the Wall without the money.
--
-- Nobody's access changes: both roles hold every read. Safe to run twice.

-- --- 1. The reads ----------------------------------------------------------------------------

update public.permissions set about = 'See the house itself: its name, rules and settings' where name = 'house:read';

insert into public.permissions (name, about) values
  ('johns:read', 'See the John list'),
  ('weeks:read', 'See the weeks: who has which John, shares, who is on call and who helped'),
  ('away:read', 'See who is away'),
  ('disputes:read', 'See questioned ticks and their votes'),
  ('wall:read', 'See the Wall and its reactions'),
  ('groups:read', 'See the groups and who is in them'),
  ('history:read', 'See the house''s history'),
  ('payments:read', 'See money owed and paid, and closed months'),
  ('pocket_money:read', 'See pocket money earned and paid'),
  ('members:read', 'See who lives in the house, and their roles')
on conflict (name) do update set about = excluded.about;

insert into public.role_permissions (role, permission)
select r.role, p.name
from (values ('member'), ('admin')) r(role),
     public.permissions p
where p.name in ('johns:read', 'weeks:read', 'away:read', 'disputes:read', 'wall:read', 'groups:read',
                 'history:read', 'payments:read', 'pocket_money:read', 'members:read')
on conflict do nothing;

-- --- 2. Each table rule asks its read --------------------------------------------------------

create temporary table read_rules (tbl text, policy text, perm text, primary key (tbl, policy));
insert into read_rules values
  ('houses', 'members see the house', 'house:read'),
  ('johns', 'members see the list', 'johns:read'),
  ('assignments', 'members see assignments', 'weeks:read'),
  ('weeks', 'members see weeks', 'weeks:read'),
  ('week_shares', 'members see shares', 'weeks:read'),
  ('on_call_picks', 'members see who is on call', 'weeks:read'),
  ('crew_members', 'members see who did a John', 'weeks:read'),
  ('away_periods', 'members see time away', 'away:read'),
  ('disputes', 'members see disputes', 'disputes:read'),
  ('dispute_votes', 'members see votes', 'disputes:read'),
  ('events', 'members see the wall', 'wall:read'),
  ('reactions', 'members see reactions', 'wall:read'),
  ('groups', 'members see groups', 'groups:read'),
  ('group_members', 'members see who is in a group', 'groups:read'),
  ('house_actions', 'members see the house''s history', 'history:read'),
  ('ledger_entries', 'members see the ledger', 'payments:read'),
  ('month_closes', 'members see month closes', 'payments:read'),
  ('month_let_offs', 'members see let-off months', 'payments:read'),
  ('pocket_earnings', 'members see pocket money', 'pocket_money:read'),
  ('pocket_pays', 'members see pay day', 'pocket_money:read'),
  ('members', 'members see each other', 'members:read');

-- Each rule is its expression as it stands with is_member(x) now
-- can(x, '<read>'). A rule that's missing, or no longer asks is_member and
-- doesn't ask its read either, stops the migration.
do $$
declare
  r record;
  qual text;
  changed text;
begin
  for r in select * from read_rules loop
    select p.qual into qual from pg_policies p
    where p.schemaname = 'public' and p.tablename = r.tbl and p.policyname = r.policy;
    if qual is null then
      raise exception 'no rule "%" on %', r.policy, r.tbl;
    end if;
    changed := regexp_replace(qual, 'is_member\(([^()]*)\)', format('public.can(\1, %L)', r.perm), 'g');
    if changed = qual then
      if position(format('%L', r.perm) in qual) = 0 then
        raise exception 'rule "%" on % doesn''t read as expected', r.policy, r.tbl;
      end if;
      continue;
    end if;
    execute format('alter policy %I on public.%I using (%s)', r.policy, r.tbl, changed);
  end loop;
end;
$$;

drop table read_rules;

-- --- 3. History, by its read -----------------------------------------------------------------

-- It asked only "is this person in the house?" (is_member); now it asks
-- history:read.
do $$
declare
  def text;
  changed text;
begin
  select pg_get_functiondef('public.house_history(uuid, timestamptz, integer)'::regprocedure) into def;
  changed := regexp_replace(def, 'public\.is_member\(([^()]*)\)', 'public.can(\1, ''history:read'')', 'g');
  if changed <> def then
    execute changed;
  elsif position('''history:read''' in def) = 0 then
    raise exception 'house_history doesn''t read as expected';
  end if;
end;
$$;

-- --- 4. The security advisor's last two warnings ---------------------------------------------

-- Two small helpers had no fixed search_path (Supabase linter 0011). Neither
-- names a table, so fixing it changes nothing they do.
alter function public.closes_at(public.assignments, timestamptz) set search_path = '';
alter function public.redo_hours() set search_path = '';
