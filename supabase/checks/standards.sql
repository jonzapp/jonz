-- Database standards check: docs/standards/database.md.
--
-- Runs against a database built from the migrations (CI runs it after
-- `supabase db reset`; locally `npm run db:standards`). It reads the
-- catalog, so it checks what the migrations actually made, not how they
-- were typed. It lists every break and fails if there is any.
--
-- `allowed` holds the only exceptions. Each says why. A new exception
-- needs a reason a reviewer would accept.

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
  ('uuid has a foreign key', 'house_actions.ref', 'points at different tables by kind');

-- What signed-in people may call and reach directly: the operation
-- registry (packages/core/src/operations.ts), written out as SQL. Adding to
-- it is a decision a reviewer should see.
\ir registry.sql

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
                  and has_function_privilege('authenticated', p.oid, 'execute'));

-- 20b. Signed-in and signed-out people reach tables only as the registry
-- says (rule 22): every grant, on the whole table or some columns, is listed.
insert into breaks
select 'table grants listed', g.tbl || ': ' || g.grantee || ' ' || g.privilege
from (
  select c.relname as tbl, r.grantee, lower(p.privilege) as privilege
  from pg_class c,
       (values ('authenticated'), ('anon')) r(grantee),
       (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege)
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
    and (has_table_privilege(r.grantee, c.oid, p.privilege)
         or (p.privilege <> 'DELETE' and has_any_column_privilege(r.grantee, c.oid, p.privilege)))
) g
where not exists (select 1 from table_grants t where t.tbl = g.tbl and t.grantee = g.grantee and t.privilege = g.privilege);
insert into breaks
select 'table grants listed', 'stale: ' || t.tbl || ': ' || t.grantee || ' ' || t.privilege from table_grants t
where not exists (
  select 1 from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname = t.tbl
    and (has_table_privilege(t.grantee, c.oid, upper(t.privilege))
         or (t.privilege <> 'delete' and has_any_column_privilege(t.grantee, c.oid, upper(t.privilege)))));

-- 21. A permission a function or rule asks about (can / user_can / can_app) is on
-- the permissions list, and named resource:level (docs/standards/database.md).
insert into breaks
select distinct 'permission is listed', x.src || ': ' || x.perm
from (
  select p.proname as src, m[1] as perm
  from pg_proc p, regexp_matches(p.prosrc, 'can(?:_app)?\((?:[^()'']|\([^()]*\))*?''([^'']+)''', 'g') m
  where p.pronamespace = 'public'::regnamespace
  union all
  select pol.tablename || ': ' || pol.policyname, m[1]
  from pg_policies pol, regexp_matches(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''), 'can(?:_app)?\((?:[^()'']|\([^()]*\))*?''([^'']+)''', 'g') m
  where pol.schemaname = 'public'
) x
where not exists (select 1 from public.permissions pm where pm.name = x.perm);

-- 22. Every allowed exception still matches a real break (keeps the list honest).
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
