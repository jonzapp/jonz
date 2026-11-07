# Database standards

How every table, column, key and rule in `supabase/migrations` is named and
built. Read this before writing a migration. `npm run db:standards` checks
the parts a machine can check (`supabase/checks/standards.sql`), and CI runs
it after building the database from the migrations, so a new break fails
the PR.

These came from the review of 7 November 2026, which found the schema safe
(row level security on every table, every definer function pinned) but
drifting in its names and missing indexes. Old names that break a rule are
listed as exceptions in the check, each marked `until fix PR`; the fix PRs
remove them. Never add a new one of those.

## Tables

- Lowercase with underscores, and **plural**: `houses`, `johns`,
  `push_subscriptions`. A table that links two things is named after both:
  `group_members`, `role_permissions`.
- A singular name is allowed only for a thing that is one record by nature
  (a log, an outbox, a billing record): add it to the check's `allowed`
  list with the reason.
- Primary key: `id uuid primary key default gen_random_uuid()`. A link table
  uses its pair of ids as the key instead. An append-only log may use
  `bigint generated always as identity`.

## Pointers (foreign keys)

- A column that holds another row's id ends in **`_id`**: `house_id`,
  `assignment_id`. Two pointers to the same table get a role in front:
  `from_house_id`, `to_house_id`. A "who did it" column may be
  **`<verb>_by`** instead: `created_by`, `flagged_by`, `paid_by`.
- **Every uuid column has a foreign key.** One that can't (it points at
  different tables, or at nothing) is listed in the check with the reason.
- **On delete** is chosen, never left to the default:
  - `cascade` for rows the parent owns (a house's weeks, a person's
    devices);
  - `set null` for "who did it" columns, so history outlives the person;
  - a log that may never change (`admin_audit`) has no foreign key at all,
    because `set null` would be an edit.
- **People point at `profiles(id)`**, never at `auth.users`. Only
  `profiles.id` itself points at the sign-in table.
- **House copies.** A row under a house that also has another parent (an
  assignment's week, a dispute's assignment) keeps `house_id`, because the
  security rules read it. Tie the copy to the parent with a two-column key,
  so the two can never disagree:

  ```sql
  -- on the parent, once
  alter table public.weeks add constraint weeks_id_house_id_key unique (id, house_id);
  -- on the child
  foreign key (week_id, house_id) references public.weeks (id, house_id) on delete cascade
  ```

  `johns.group_id` and `group_members` already do this.
- History that should outlive a person leaving the house points at
  `profiles`, not at `members`. Rows that only make sense while they are in
  the house (time away, groups, Ask Jonz chats) point at
  `members (house_id, user_id)`.

## Indexes

- **Every foreign key has an index that starts with its columns**, so a
  delete of a person or a house doesn't read whole tables.
- Names: `<table>_<columns>_idx`; unique ones `<table>_<columns>_key`. A
  partial index may name its condition instead: `assignments_open_flags`.

## Columns and types

- **Moments** are `timestamptz` named **`<verb>_at`**: `done_at`,
  `closes_at`. Never `timestamp` without a zone, and never a bare `at`.
- **Calendar days** are `date` named **`<x>_on`**: `starts_on`,
  `moving_out_on`.
- Every table that isn't a pure link table has
  `created_at timestamptz not null default now()`. A table whose rows change
  also has `updated_at`, kept by the shared trigger, never set by hand.
- **Money** is whole pennies in an `integer` named **`<x>_minor`**:
  `stake_minor`, `amount_minor`. The currency lives on the house.
- **Months** are text `YYYY-MM` with `check (month ~ '^\d{4}-\d{2}$')`.
- **Fixed word lists** are `text` with a check, named
  `<table>_<column>_check`: `check (outcome in ('done', 'late', ...))`.
  No Postgres enums: a check is one line to change, an enum value can't be
  removed. The same words live in `packages/core/src/domain.ts`.
- **Yes/no** columns read as a fact: `needs_photo`, `awaits_ok`,
  `signs_in`. **Counts** end in `_count`.
- **Outside ids** say whose and what: `stripe_customer_id`,
  `stripe_subscription_id`.
- Prefer `smallint` for small settings (hours, points, weekdays) and give
  every number a range check.

## Security

- Row level security is on for every table, with its policies in the same
  migration that creates it (AGENTS.md, "Data: Supabase").
- Policies are named in plain English from the reader's side: "members see
  the wall", "you delete your own chats".
- A table with no policies is server-only; say so in a comment on the
  table.
- Policies call the user check as `(select auth.uid())`, so Postgres runs it
  once per query, not once per row.
- `security definer` functions set `search_path = ''` and name every table
  with its schema.

## Migrations

- One change per file, named by `supabase migration new <name>`. Never
  edited after merge. Applied only by merging (Supabase's GitHub
  integration), never by hand.
- PRs with migrations merge one at a time; the next updates from main and
  fixes its file's date so it sorts last.
- Tests never depend on the real clock: use a pretend clock.
- **Renaming** keeps every row, but Postgres doesn't rewrite function
  bodies: every function that uses the old name is recreated in the same
  migration, and the app code and `packages/core/src/db-types.ts` change in
  the same PR. The database changes on merge and the app a minute or two
  later, so a rename breaks the old app in that window. While only Glyn's
  house is on the app, merge renames at a quiet time. Once real houses are
  on it, rename in two steps instead: add the new name beside the old one,
  move the app, then drop the old name in a later PR.

## Checking

```bash
npm run db:start && npm run db:reset
npm run db:standards     # lists every break, exits non-zero if any
```

It checks: row level security on, plural table names, pointer names,
foreign keys on uuid columns, people pointing at `profiles`, an index on
every foreign key, `_at` / `_on` times, no enums, definer functions pinned.
It also fails if an exception in its list no longer matches anything, so
the list shrinks as the fix PRs land.
