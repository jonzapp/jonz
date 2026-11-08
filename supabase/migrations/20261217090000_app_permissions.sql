-- The owner's permissions, at app scope (step 1b of the operation registry;
-- packages/core/src/owner-moves.ts).
--
-- Until now every admin function asked is_owner(): in app_owners, with the
-- authenticator code this session. That said who, but not what. Now the
-- owner side works like a house: app_owners says each person's app role
-- (owner, or support for a helper who only answers the Inbox),
-- app_role_permissions says what each role may do, and every admin
-- function and table rule asks can_app('<resource>:<level>'). The code is
-- still needed for every one of them.
--
-- Nobody's access changes: today's owners become role owner, which holds
-- every app permission, as before. Safe to run twice.

-- --- 1. Roles and the list ---------------------------------------------------------------------

alter table public.app_owners add column if not exists role text not null default 'owner';
alter table public.app_owners drop constraint if exists app_owners_role_check;
alter table public.app_owners add constraint app_owners_role_check check (role in ('owner', 'support'));
comment on column public.app_owners.role is 'What this person may do on the admin pages: owner (everything) or support (read, and answer the Inbox).';

alter table public.permissions add column if not exists scope text not null default 'house';
alter table public.permissions drop constraint if exists permissions_scope_check;
alter table public.permissions add constraint permissions_scope_check check (scope in ('house', 'app'));
comment on column public.permissions.scope is 'house: asked with can(house, …) and held by a house role; app: asked with can_app(…) and held by an app role.';

insert into public.permissions (name, about, scope) values
  ('admin:read', 'See every admin page: Overview, Inbox, Houses, Messages, Notices, Promotions, Deletions and the audit log', 'app'),
  ('reports:write', 'Reply to a report (its sender gets a push and an email), mark it fixed or open it again, and fold it into one that says the same thing', 'app'),
  ('notices:write', 'Put up a notice, change one, or end one', 'app'),
  ('messages:write', 'Send a message to a person, a house or everyone, by push, the Wall or email', 'app'),
  ('promotions:write', 'Make a promotion, stop one, email the people it names, or try its Stripe set-up again', 'app'),
  ('deletions:write', 'Delete an account now, stop a deletion, or start one for someone who asked by email', 'app')
on conflict (name) do update set about = excluded.about, scope = excluded.scope;

create table if not exists public.app_role_permissions (
  role text not null check (role in ('owner', 'support')),
  permission text not null references public.permissions (name) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);
comment on table public.app_role_permissions is 'What each app role (owner, support) may do on the admin pages; only migrations change it.';
create index if not exists app_role_permissions_permission_idx on public.app_role_permissions (permission);

alter table public.app_role_permissions enable row level security;
revoke all on public.app_role_permissions from public, anon, authenticated;
grant select on public.app_role_permissions to authenticated, service_role;
drop policy if exists "anyone signed in reads the app roles" on public.app_role_permissions;
create policy "anyone signed in reads the app roles" on public.app_role_permissions for select to authenticated using (true);

delete from public.app_role_permissions;
insert into public.app_role_permissions (role, permission) values
  ('owner', 'admin:read'),
  ('owner', 'reports:write'),
  ('owner', 'notices:write'),
  ('owner', 'messages:write'),
  ('owner', 'promotions:write'),
  ('owner', 'deletions:write'),
  ('support', 'admin:read'),
  ('support', 'reports:write');

-- --- 2. The checks -----------------------------------------------------------------------------

-- The caller's app role, only with their code this session (aal2).
create or replace function public.my_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.role from public.app_owners o
  where o.user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;
comment on function public.my_app_role() is 'The caller''s app role (owner or support), or null: not one, or no authenticator code this session.';

create or replace function public.can_app(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_role_permissions rp
    where rp.role = public.my_app_role() and rp.permission = perm
  );
$$;
comment on function public.can_app(text) is 'Whether the caller may do an app-scope permission (admin:read, reports:write…), with their code this session.';

create or replace function public.my_app_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(rp.permission order by rp.permission), '{}')
  from public.app_role_permissions rp
  where rp.role = public.my_app_role();
$$;
comment on function public.my_app_permissions() is 'Every app-scope permission the caller holds now (none without an app role and their code).';

-- is_owner() keeps its meaning for the app (show the admin pages): any app
-- role that may read them.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_app('admin:read');
$$;

revoke execute on function public.my_app_role(), public.can_app(text), public.my_app_permissions() from public, anon;
grant execute on function public.my_app_role(), public.can_app(text), public.my_app_permissions() to authenticated, service_role;

-- --- 3. Every admin function asks for what it does -------------------------------------------

create temporary table app_checks (fn text primary key, perm text not null);
insert into app_checks (fn, perm) values
  -- Reading the admin pages, and the owner's own Ask Jonz.
  ('owner_overview', 'admin:read'),
  ('owner_house', 'admin:read'),
  ('owner_houses_find', 'admin:read'),
  ('owner_houses_match', 'admin:read'),
  ('owner_people_find', 'admin:read'),
  ('owner_reports_find', 'admin:read'),
  ('owner_same_as_find', 'admin:read'),
  ('owner_messages_find', 'admin:read'),
  ('owner_message_reach', 'admin:read'),
  ('owner_promotion', 'admin:read'),
  ('owner_promotions_find', 'admin:read'),
  ('owner_deletions', 'admin:read'),
  ('owner_deletions_find', 'admin:read'),
  ('claim_owner_ask', 'admin:read'),
  ('finish_owner_ask', 'admin:read'),
  -- The Inbox, and the support agent's drafts for it.
  ('owner_reply_report', 'reports:write'),
  ('owner_fix_report', 'reports:write'),
  ('owner_open_report', 'reports:write'),
  ('owner_set_report_state', 'reports:write'),
  ('owner_same_as', 'reports:write'),
  ('owner_set_support_draft', 'reports:write'),
  ('claim_support_draft', 'reports:write'),
  ('finish_support_draft', 'reports:write'),
  ('save_notice', 'notices:write'),
  ('end_notice', 'notices:write'),
  ('owner_send_message', 'messages:write'),
  ('owner_make_promotion', 'promotions:write'),
  ('owner_stop_promotion', 'promotions:write'),
  ('owner_promotion_emails', 'promotions:write'),
  ('owner_delete_now', 'deletions:write'),
  ('owner_request_deletion', 'deletions:write'),
  ('owner_stop_deletion', 'deletions:write');

-- Each is its definition as it stands, with public.is_owner() now
-- public.can_app('<its permission>'). A function that asks is_owner() and
-- isn't on the list above stops the migration.
do $$
declare
  f record;
  def text;
  missing text;
begin
  select string_agg(p.proname, ', ') into missing
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosrc like '%public.is_owner()%'
    and p.proname not in (select fn from app_checks);
  if missing is not null then
    raise exception 'is_owner() still asked by: %', missing;
  end if;

  for f in
    select p.oid, c.perm
    from pg_proc p
    join app_checks c on c.fn = p.proname
    where p.pronamespace = 'public'::regnamespace
      and p.prosrc like '%public.is_owner()%'
  loop
    def := replace(pg_get_functiondef(f.oid), 'public.is_owner()', format('public.can_app(%L)', f.perm));
    execute def;
  end loop;
end;
$$;

drop table app_checks;

-- --- 4. Table rules --------------------------------------------------------------------------

alter policy "the owner reads the audit log" on public.admin_audit
  using ((select public.can_app('admin:read')));

alter policy "the owner sees support drafts" on public.support_drafts
  using ((select public.can_app('reports:write')));

alter policy "people read the notices that are on, the owner reads every noti" on public.notices
  using (((starts_at <= now()) and ((ends_at is null) or (ends_at > now()))) or (select public.can_app('admin:read')));

alter policy "see your screenshots, or any as the owner" on storage.objects
  using ((bucket_id = 'report-shots') and (((storage.foldername(name))[1] = ((select auth.uid()))::text) or (select public.can_app('admin:read'))));

alter policy "the owner reads their own chats" on public.owner_ask_chats
  using ((user_id = (select auth.uid())) and (select public.can_app('admin:read')));
alter policy "the owner starts a chat" on public.owner_ask_chats
  with check ((user_id = (select auth.uid())) and (select public.can_app('admin:read')));
alter policy "the owner carries on their own chats" on public.owner_ask_chats
  using ((user_id = (select auth.uid())) and (select public.can_app('admin:read')))
  with check ((user_id = (select auth.uid())) and (select public.can_app('admin:read')));
alter policy "the owner deletes their own chats" on public.owner_ask_chats
  using ((user_id = (select auth.uid())) and (select public.can_app('admin:read')));

alter policy owner_ask_turns_owner_reads on public.owner_ask_turns
  using ((select public.can_app('admin:read')) and (owner_id = (select auth.uid())));

-- --- 5. What the admin pages show -----------------------------------------------------------

-- The admin pages ask this first: whether to show them at all (owner),
-- whether the code is still needed (mfa), and, with the code, which app
-- role and permissions this person has, so a page offers only what they
-- may do. The database checks each move again.
create or replace function public.owner_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'owner', exists (select 1 from public.app_owners o where o.user_id = (select auth.uid())),
    'mfa', coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2',
    'role', public.my_app_role(),
    'permissions', to_jsonb(public.my_app_permissions())
  );
$$;
