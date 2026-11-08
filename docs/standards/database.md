# Database standards

The 26 rules every table, column, key and security rule in
`supabase/migrations` follows. Glyn agreed them on 7 November 2026 (the
"Jonz database rules" doc). Read this before writing a migration.

`npm run db:standards` checks every rule a machine can check
(`supabase/checks/standards.sql`). CI runs it right after building the
database from the migrations, so a PR that breaks a rule fails. The few
things that break a rule on purpose are listed in that file with the
reason; a new one needs a reason a reviewer accepts. The check also fails
when an exception no longer matches anything.

Sources, named on each rule:

- **Supabase style**: Supabase's SQL style guide,
  https://supabase.com/docs/guides/getting-started/ai-prompts/code-format-sql
- **Supabase linter NNNN**: the checks Supabase runs on every project,
  https://supabase.com/docs/guides/database/database-linter (the
  dashboard's Advisors, or the `get_advisors` tool)
- **Don't Do This**: the PostgreSQL community's list of mistakes,
  https://wiki.postgresql.org/wiki/Don't_Do_This
- **SQL Style Guide**: Simon Holywell's guide, https://www.sqlstyle.guide/
- **Ours**: decided for Jonz.

## Names

1. **Tables are lowercase with underscores, and plural**: `houses`,
   `push_subscriptions`. A table linking two things is named after both:
   `group_members`. A thing that is one record by nature (a log, an outbox,
   a billing record) may stay singular, listed in the check with its reason.
   *Supabase style; SQL Style Guide.* Checked.
2. **Columns are lowercase, singular, with no made-up abbreviations.**
   *Supabase style; SQL Style Guide.*
3. **A column that points at another table is that table's singular name
   plus `_id`**: `house_id` points at `houses`. Two pointers to the same
   table get a role in front: `from_house_id`, `to_house_id`.
   *Supabase style.* Checked.
4. **Except: "who did it" columns may be `<verb>_by`**: `created_by`,
   `flagged_by`, `paid_by`. *Ours.* Checked with rule 3.
5. **People columns are `user_id` (or `_by`) and point at
   `profiles(id)`**, never at `auth.users`. Only `profiles.id` itself points
   at the sign-in table. *Ours, following Supabase's own examples.* Checked.
6. **Moments are `timestamptz` named `<verb>_at`; calendar days are `date`
   named `<x>_on`**: `done_at`, `starts_on`. Never `timestamp` without a
   zone, never a bare `at`, never `_until` / `_after` / `_from` for a
   moment. *Don't Do This; ours for `_on`.* Checked.
7. **Indexes are `<table>_<columns>_idx`; unique ones
   `<table>_<columns>_key`.** *Ours; `_key` is Postgres's own default.*
   Checked.

## Keys and links

8. **Every table's key is `id uuid primary key default
   gen_random_uuid()`.** A link table uses its pair of ids instead. An
   append-only log may use `bigint generated always as identity`. *Ours:
   Supabase style suggests a counting number, but uuids match sign-in ids,
   can't be guessed from a link, and every Jonz table already uses them.*
9. **Every pointer has a real foreign key, with on-delete chosen on
   purpose**: `on delete cascade` for rows the parent owns (a house's weeks,
   a person's devices); `on delete set null` for "who did it" columns, so
   history outlives the person. A pointer that can't have one (an
   append-only log, a pointer to several tables) is listed in the check with
   the reason. History that should outlive a person leaving a house points
   at `profiles`; rows that only make sense while they're in the house (time
   away, groups, Ask Jonz chats) point at `members (house_id, user_id)`.
   *Ours.* Checked.
10. **Every foreign key has an index that starts with its columns.**
    *Supabase linter 0001.* Checked.
11. **A row under a house that also has another parent ties its house copy
    to that parent**, so the two can never disagree:

    ```sql
    -- on the parent, once
    alter table public.weeks add constraint weeks_id_house_id_key unique (id, house_id);
    -- on the child
    foreign key (week_id, house_id) references public.weeks (id, house_id) on delete cascade
    -- a pointer that clears: set null only the pointer, never house_id
    foreign key (assignment_id, house_id) references public.assignments (id, house_id)
      on delete set null (assignment_id)
    ```

    Applies when the child's `house_id` is required. *Ours.* Checked.

## Types

12. **Text is `text`, never `char(n)` or `varchar(n)`.** Length limits are
    checks. *Don't Do This.* Checked.
13. **Money is whole pennies in an `integer` named `<x>_minor`**:
    `stake_minor`. The currency lives on the house. Never the `money` type.
    *Ours (as Stripe stores amounts); Don't Do This for `money`.*
14. **Counting numbers use `identity`, never `serial`.** *Don't Do This.*
    Checked.
15. **Fixed word lists are `text` with a check named
    `<table>_<column>_check`**: `check (outcome in ('done', 'late'))`. No
    Postgres enums: a word can be dropped from a check, never from an enum.
    The same words live in `packages/core/src/domain.ts`. *Ours.* Checked.
16. **Every table that isn't a pure link table has `created_at timestamptz
    not null default now()`. A table whose rows change also has
    `updated_at`, kept by the shared trigger `public.set_updated_at()`**,
    never set by hand. *Ours.* Checked.
17. **Every table has a one-line comment saying what it holds**
    (`comment on table public.x is '...'`). *Supabase style.* Checked.

Months are text `YYYY-MM` with `check (month ~ '^\d{4}-\d{2}$')`. Yes/no
columns read as a fact (`needs_photo`, `awaits_ok`); counts end in
`_count`. Outside ids say whose and what: `stripe_customer_id`.

## Security

18. **Row level security is on for every table, with its rules in the same
    migration. A table with no rules is server only, and its comment says
    "Server only."** *Supabase linter 0013 and 0008.* Checked.
19. **Rules call `(select auth.uid())`, not `auth.uid()`**, so Postgres
    runs it once per query, not once per row. *Supabase linter 0003.*
    Checked.
20. **One permissive rule per table, role and action.** Two rules that both
    allow reading become one with an `or`. *Supabase linter 0006.* Checked.
    Rules are named in plain English from the reader's side ("members see
    the wall").
21. **`security definer` functions set `search_path = ''`** and name every
    table with its schema. *Supabase linter 0011.* Checked.
22. **Signed-in people may call a `security definer` function only if it
    checks, inside, that they're allowed.** Each such function is on the
    `callable` list in the check; adding one is a decision a reviewer sees.
    Everything else revokes EXECUTE from `public, anon, authenticated`.
    Supabase linter 0029 warns on every callable one; that warning is
    expected for the listed ones. *Ours; Supabase linter 0029.* Checked.

## Migrations

23. **One change per file, never edited after merge, applied only by
    merging** (Supabase's GitHub integration). PRs with migrations merge one
    at a time; the next updates from main and renames its file's date so it
    sorts last. *Ours.*
24. **A rename recreates, in the same migration, every function that uses
    the old name** (Postgres doesn't rewrite function bodies), and changes
    the app code and `packages/core/src/db-types.ts` in the same PR. While
    only Glyn's house is on the app, rename in one step at a quiet time.
    Once real houses are on it, rename in two steps: add the new name beside
    the old, move the app, drop the old name in a later PR. *Ours.*
25. **Tests never use the real clock**: use a pretend clock. *Ours.*

## Permissions

26. **Permissions are named `resource:level`**, Stripe's way: `read`,
    `write_own` (only your own rows) or `write` (anyone's), for example
    `johns:write` or `ticks:write_own`. A role that may write a resource
    holds the lower levels too, written out in full. Every permission a
    function or table rule asks `can()` / `user_can()` about is on the
    `permissions` list. *Stripe restricted keys; OWASP authorization.*
    Checked.

## Checking

```bash
npm run db:start && npm run db:reset
npm run db:standards     # lists every break, exits non-zero if any
```
