-- Permissions named Stripe's way: a resource and a level (step 1 of the
-- operation registry; packages/core/src/permissions.ts).
--
-- Each permission is now `resource:read`, `resource:write_own` (only your
-- own rows: your ticks, your time away, your flag) or `resource:write`
-- (anyone's), so the list reads like Stripe's restricted-key permissions
-- and the same strings can later be the scopes an outside app asks for.
-- Pairs that always went to the same roles are folded into one
-- (johns.add, johns.edit and johns.remove are johns:write). Nobody gains
-- or loses anything: each role holds exactly what it held before.
--
-- The functions and table rules that ask can(house, '<old name>') are
-- re-created with the new name: each is its definition as it stands, with
-- only the quoted name changed. Safe to run twice.

-- --- 1. The new names ------------------------------------------------------------------------

create temporary table permission_renames (old text primary key, new text not null);
insert into permission_renames (old, new) values
  ('house.read', 'house:read'),
  ('ticks.own', 'ticks:write_own'),
  ('away.book', 'away:write_own'),
  ('swaps.ask', 'swaps:write_own'),
  ('covers.take', 'swaps:write_own'),
  ('flags.raise', 'flags:write_own'),
  ('disputes.raise', 'disputes:write_own'),
  ('wall.react', 'wall:write_own'),
  ('perks.use', 'perks:write_own'),
  ('self.edit', 'profile:write_own'),
  ('house.leave', 'members:write_own'),
  ('house.settings', 'house:write'),
  ('invite.reset', 'house:write'),
  ('johns.add', 'johns:write'),
  ('johns.edit', 'johns:write'),
  ('johns.remove', 'johns:write'),
  ('groups.edit', 'groups:write'),
  ('week.deal', 'weeks:write'),
  ('history.reset', 'history:write'),
  ('history.undo_any', 'history:write'),
  ('flags.remove_any', 'flags:write'),
  ('ticks.ok', 'ticks:write'),
  ('pocket.pay', 'pocket_money:write'),
  ('people.remove', 'members:write'),
  ('people.roles', 'members:write'),
  ('people.kids', 'members:write');

-- --- 2. The list -----------------------------------------------------------------------------

alter table public.permissions drop constraint if exists permissions_name_check;

insert into public.permissions (name, about) values
  ('house:read', 'See the house: its Johns, the week, the Wall, history, balances, time away and people'),
  ('ticks:write_own', 'Tick off your own Johns, and take a tick back'),
  ('away:write_own', 'Book and cancel your own time away'),
  ('swaps:write_own', 'Ask someone to swap a John, answer a swap ask, and cover someone else''s overdue John'),
  ('flags:write_own', 'Flag an on-call John, and take back your own flag'),
  ('disputes:write_own', 'Question a tick, and vote on one'),
  ('wall:write_own', 'React on the Wall'),
  ('perks:write_own', 'Use an immunity or a swap token'),
  ('profile:write_own', 'Change your own name, photo, notification settings and preferences'),
  ('members:write_own', 'Leave the house'),
  ('house:write', 'Change the house''s name and rules, and make a new join code'),
  ('johns:write', 'Add Johns to the list, change them, and take them off'),
  ('groups:write', 'Make, change and delete groups'),
  ('weeks:write', 'Deal the week'),
  ('history:write', 'Put a result, a week or a month''s forfeits right, and undo anyone''s move from History'),
  ('flags:write', 'Remove anyone''s flag'),
  ('ticks:write', 'OK a kid''s tick, or send it back'),
  ('pocket_money:write', 'Mark pocket money paid'),
  ('members:write', 'Remove someone from the house, make someone an admin or hand admin over, and add a child without a sign-in and act for them')
on conflict (name) do update set about = excluded.about;

-- Each role keeps what it had, under the new names.
insert into public.role_permissions (role, permission)
select distinct rp.role, r.new
from public.role_permissions rp
join permission_renames r on r.old = rp.permission
on conflict do nothing;

-- The old names go, and their role rows with them (on delete cascade).
delete from public.permissions p using permission_renames r where p.name = r.old;

-- Only resource:level names from now on.
alter table public.permissions add constraint permissions_name_check
  check (name ~ '^[a-z_]+:(read|write_own|write)$');

-- --- 3. Every check, under the new name ------------------------------------------------------

do $$
declare
  f record;
  def text;
  rn record;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and exists (select 1 from permission_renames r where p.prosrc like '%''' || r.old || '''%')
  loop
    def := pg_get_functiondef(f.oid);
    for rn in select old, new from permission_renames loop
      def := replace(def, '''' || rn.old || '''', '''' || rn.new || '''');
    end loop;
    execute def;
  end loop;
end;
$$;

alter policy "admins change the house" on public.houses
  using (public.can(id, 'house:write'))
  with check (public.can(id, 'house:write'));

alter policy "admins add Johns" on public.johns
  with check (public.can(house_id, 'johns:write'));

alter policy "admins edit Johns" on public.johns
  using (public.can(house_id, 'johns:write'))
  with check (public.can(house_id, 'johns:write'));

drop table pg_temp.permission_renames;
