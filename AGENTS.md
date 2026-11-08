# AGENTS.md

Project-wide rules for any AI coding agent working in this repo. Each app also
has its own AGENTS.md with its framework's rules: read the one in the folder
you're working in (`apps/api/AGENTS.md` for the Next.js app).

## About this app

- What it does: **Jonz** is shared housework with consequences. "Johns" is
  what the house calls its assigned chores for the week; one chore is a
  **John**, and the app's name is the same word, spelled Jonz. Fair shares
  are dealt for you, housemates check each other's ticks, and late or missed
  Johns cost a share of a monthly stake. Live at jonz.app (johns.glyn.dev
  until the rename; it forwards there). The rename is the brand only: the
  repo, the database, the code's names and the chores keep "Johns".
- Platforms: the web, served since 27 October 2026 by the Expo app's web
  build (`apps/client`; `apps/api` keeps the API). iOS, Android and web from
  one Expo app (`apps/client`) as `docs/specs/native-migration.md` lands,
  phase by phase: its scaffold, front door, sign-in, starting or joining a
  house, Today, Week, the Wall, the Table, the Stake and House are in, and
  so is the rest of what the web serves (privacy, not-found, tab titles,
  the home-screen manifest, the look, reminders): web parity. The app is
  checked on its web build; iOS- and Android-only work (native push,
  device checks, the stores) waits.
  From here every feature must work on all three unless its spec says
  otherwise.
- Solo project. My main language is Python: when code relies on a TypeScript
  or React pattern with no obvious Python equivalent, explain it in one line
  in your summary.

## Repo layout

```
apps/
  api/          Next.js, API only: /api routes, the clock, the engine, push
                (every other path 308s to jonz.app)  → Vercel "jonz-api"
  client/       Expo: iOS, Android and web from one codebase   → Vercel "jonz-web",
                from the cutover (DEPLOYMENT.md)
packages/
  core/         @app/core: the pure rules, the shared words, the database types
supabase/       migrations/, config.toml (local development only), seeds/staging.sql
docs/specs/     the migration plan; one short spec per feature (copy _template.md)
scripts/        provision (production's accounts), staging (staging's), tick (the
                clock by hand), vapid, release (the store gate, read from
                release-targets.json)
```

## Commands (from the repo root)

```bash
npm ci                           # install everything, exactly as the lockfile says
npm run dev                      # the web app on http://localhost:3205
npm run dev:client               # the Expo app: Metro on 8205
npm run typecheck && npm run lint && npm test
npm run db:start                 # local Supabase on 54340–54344 (needs Docker)
npm run test:db                  # RLS, the housemate functions and the engine
npm run build && npm run test:e2e
npm run db:reset                 # rebuild the local database from the migrations
npm run types                    # regenerate packages/core/src/db-types.ts
npm run tick                     # run the clock against the local app
```

`npm run provision` sets up and checks production. It writes to real
accounts: never run it without being asked (see "Hosting and deploys").

## Monorepo rules

- npm workspaces with one lockfile at the root. Run `npm install` from the
  root only, and add a dependency to one workspace with
  `npm install <pkg> -w apps/api` (in `apps/client`, `npx expo install
  <pkg>`, which picks the Expo SDK's version). `.npmrc` sets
  `legacy-peer-deps` so that install and CI resolve the same way; keep it.
- One React for the whole repo: the root `overrides` pin `react` and
  `react-dom` to the Expo SDK's version, and CI fails if npm installs a
  second copy (`npm dedupe` fixes it).
- Imports flow one way: apps import packages. Apps never import from each
  other, and packages never import from apps.
- `packages/core` is plain TypeScript: no React, React Native or Next.js
  imports, so it runs in the web app, the native app, the API and tests
  alike. Internal packages use the `@app/` scope (never rename it), are
  `private`, are depended on as `"*"`, and export TypeScript source directly
  (no build step: Turbopack compiles workspace packages itself).
- Every workspace has `lint`, `typecheck` and `test` scripts. From the root,
  `npm run typecheck`, `npm run lint` and `npm test` run them all.
- Propose any new app or package to me before creating it.
- Project instructions live only in AGENTS.md files. Never create a CLAUDE.md
  or CLAUDE.local.md anywhere in this repo: Claude Code skips AGENTS.md when
  one exists.
- Check current docs before using an Expo, Next.js, Supabase or Vercel API or
  CLI flag; all of them change faster than your training data. For Next.js,
  that means `node_modules/next/dist/docs/`.

## Words

A chore is a **John**; the plural is **Johns**, and **Jonz** is only the
app. The money is **the Stake**, the standings **the Table**, the feed **the
Wall**. Giving out a week's Johns is **the deal**. A pass on one John is **a
skip**, paired with **a swap**; the vote's answers are **Done** and **Not
done**; housemates get in with **an invite** and its **code**; forfeits are
**split**, and "share" means only the fair share. One word for each thing:
the glossary in `docs/style/words.md`, guarded by
`packages/core/src/words.test.ts`. Copy never says "chore app", and never
"rota" (the house doesn't use the word).

## House style: Bin Night

Council signage, on every platform: pavement and tarmac grounds, ink,
**hi-vis amber** (`--hivis`) for the one thing to do, **hazard** for late and
missed, and a bin-lid colour per kind of John (`--bin-kitchen`,
`--bin-bathroom`, `--bin-bins`, `--bin-floors`, `--bin-errands`,
`--bin-other`, mirroring `CATEGORIES` in `packages/core/src/domain.ts`).
Never hardcode colours. Headings are uppercase Overpass (Highway Gothic's
descendant); the mark is the J in its road-sign frame on an amber tile
(`packages/core/src/mark.ts`), and the lockup is that sign beside JONZ in
Overpass Black. Every brand image is drawn from the mark by `npm run brand`;
`docs/brand/README.md` is the brand guide (voice included) and says where each
file goes. Late and missed
wear hazard tape. No emoji anywhere in the UI: lucide icons only, reactions
included. Light and dark both ship; the theme follows the system by default.
Tap targets are at least 48px. Where the tokens and components live is in
each app's AGENTS.md.

**The style guide is `docs/style/`**: every rule for how Jonz looks and
behaves on a phone and a laptop (the feel, words, layout, lists, controls,
states), each with the decision it came from, and `decisions.md`, the log
of design picks. It wins over older specs and PR descriptions. Before
changing any screen, component, sheet, email or draft, load the
`house-style` skill (`.claude/skills/house-style/SKILL.md`). When Glyn picks
a design option, the PR that builds it updates the rule and adds a line to
`docs/style/decisions.md`. For design options for Glyn,
see "Design options for Glyn" in the `house-style` skill.

## Rules live in the lowest layer that can hold them

- **Pure, unit-tested, no clock** (`packages/core/src`, imported as
  `@app/core`): `week.ts` (week and month edges in the house's zone, DST-safe,
  cadence, `graceDue`, `localDate`), `deal.ts` (shares, fair shares,
  balances from the recent weeks' rows, catch-up), `away.ts` (away days as local dates), `outcome.ts`
  (when a tick stands, live status), `points.ts` (the Table), `streak.ts`
  (streaks, immunity and swap tokens), `stake.ts` (forfeits, month
  settlement, settle-up, and the Stake as both apps show it), `dispute.ts` (verdicts), `board.ts` (the week's
  board, Today's view of it and the month's Table, built from the rows each
  app reads),
  `wall.ts` (the Wall's events in words, and their reactions),
  `proof.ts` (a photo receipt's size and bucket path), `money.ts`,
  `format.ts`, `domain.ts` (the shared words), `copy.ts` (both apps'
  sentences), `schemas.ts` (what crosses the API), `errors.ts`,
  `auth-paths.ts`. Every function takes `now`.
- **The engine** (`apps/api/lib/engine/tick.ts`): decides with those rules
  and applies each decision through one service-role SQL function that is
  atomic and refuses to apply twice (`deal_week`, `settle_assignments`,
  `resolve_dispute`, `close_week`, `close_month`). It takes the client and
  `now` as arguments and imports nothing server-only, so `apps/api/tests/db`
  drives it directly. Safe to run concurrently: two ticks racing never double
  a forfeit or a token (tested).
- **RLS and SECURITY DEFINER functions** (`supabase/migrations`): the only
  real enforcement. Housemates READ through RLS (`is_member`) and WRITE only
  through named functions (`mark_done`, `undo_done`, `cover_john`,
  `undo_cover`, `raise_dispute`,
  `cast_vote`, `use_immunity`, `use_swap`, `confirm_payment`,
  `create_house`, `join_house`, `start_house_from`, `set_member_role`,
  `remove_member`, `set_moving_out`,
  `save_group`, `delete_group`, `set_away`, `cancel_away`, `raise_flag`,
  `hand_over`, and `undo_action` / `undo_latest` for Undo
  (`docs/specs/undo-history.md`); an admin's resets go through
  `POST /api/resets` to the service-role-only `admin_reset`
  (`docs/specs/admin-resets.md`);
  a notification's buttons reach `mark_done` and `cast_vote` through the
  service-role-only `push_action`; the owner's admin pages write through
  `save_notice` / `end_notice`, which check `is_owner()` (a row in the
  migration-only `app_owners` plus an `aal2` session) and append to the
  append-only `admin_audit`, see `docs/specs/owner-admin.md`) or a few column
  grants (house settings and the John list, its group included, for admins;
  your own name, reactions, push subscriptions). Refusals raise `42501` (not
  yours) or `P0001` with a short code that `errors.ts` turns into a sentence.
  Whatever calls them (the Expo app, or a route in `apps/api`) only
  translates and refreshes: it never decides.
- **Who can do what** is one list: `PERMISSIONS` and `ROLE_PERMISSIONS` in
  `packages/core/src/permissions.ts`, and the same rows in the
  `permissions` / `role_permissions` tables
  (`supabase/migrations/20261118090000_permissions.sql`). Every table rule
  and move asks `public.can(house, 'johns.remove')` (the server asks about
  someone else with `user_can`); the API asks `permitted()`
  (`apps/api/lib/moves/permitted.ts`); the app asks `memberCan(me, …)`.
  Never compare `role` to `'admin'` to decide whether someone may do
  something: add a permission to both lists (a db test checks they match;
  `apps/api/tests/unit/permission-checks.test.ts` fails on a hand-written
  role check). Reading the role is fine for a rule of the house (a house
  keeps an admin, parents don't earn pocket money).

## The clock

pg_cron calls `public.request_tick()` every ten minutes, which POSTs to
`/api/cron/tick` with a shared secret read from Vault (see DEPLOYMENT.md).
That tick deals new weeks, settles outcomes and forfeits, decides disputes,
closes weeks (streaks, perks) and months (the Stake), and sends reminders.
A page load also catches its own house up (`apps/api/lib/engine/fresh.ts`,
at most once a minute, no pushes), so a screen never shows last week and
local dev needs no cron. Nothing is dealt until an admin presses "Hand out
this week's Johns" (`houses.first_dealt_at`); a week can be re-dealt while
nothing in it has been ticked. Dealing part-way through a week gives anything
already due a day's grace (`graceDue`).

## The game

- **Fair shares** (`deal.ts`): each deal stores everyone's share of the week
  (`week_shares`). A John is split equally among whoever shares it: the whole
  house, or its **group** (three on the upstairs bathroom owe a third each,
  two on the downstairs one a half). A **balance** is the work you did
  minus your share over every week since you joined (`house_balances` adds
  it up; never a window, which would forget debts mid-repayment); each John
  goes to whoever, of those home on its due day, would be furthest behind.
  Doing the same John twice running costs a small penalty.
- **Steady weeks** (`steady.ts`, `docs/specs/steady-weeks.md`): the deal
  that chooses who gets each John, in Smart (balances, who did it last,
  preferences) or Classic (each John's order of turns), within the house's
  points budget each (`houses.deal_mode`, `deal_budget`; 0 is no limit).
  Everyone home is owed one John of their own; one a day; a John that keeps
  its day (`johns.keep_day`) always goes out on it; a John that doesn't fit
  waits its turn and is never skipped. Each week keeps what the next deal
  needs (`weeks.turns`, `waiting`) and the next two weeks as it would hand
  them out (`weeks.ahead`). Fair shares still split what is dealt.
- **On call** (`johns.kind = 'on_call'`, `on_call`): a John that needs
  doing whenever it needs doing (the bins when they're full). Each deal puts
  one sharer on call for the week by fair shares, weighing it as points ×
  `per_week`. Anyone flags it (`raise_flag`) and the flag is an ordinary
  assignment for whoever is on call (or, if they're away today, the fairest
  sharer at home), due `respond_hours` later (default 12), adding its points
  to everyone's share as it's raised. A flag never swaps and never hands over:
  missed at twice its window (or at week end if it's overdue by then), it is
  its holder's miss and opens again for whoever is on call now
  (`open_flag`). Whoever is on call can tick it unasked.
- **Groups**: named sets of housemates (`groups`, `group_members`); a John
  belongs to everyone or to one group, and only that group is handed it. If
  everyone in a group has left, its Johns go to everyone; if everyone in it
  is away on the due day, that week it is skipped.
- **Time away** (`away`, booked by `set_away`): the fair mechanism for the
  housemate who keeps leaving. You are never handed a John due on a day
  you're away, but away is not a holiday from your share: it keeps counting
  at the house's make-up rate (`houses.away_makeup`: 100 in full, the
  default, 50 half, 0 none), so you come back behind. Catching up is
  gradual: no deal hands anyone more than half as much again as their share
  while someone else could take the John (`CATCH_UP_PACE`). Time away must
  start today or later, and Johns you already have that fall due while
  you're gone are pulled forward to 23:59 the night before you leave
  (`due_moved_from` keeps the old time, so cancelling puts them back). Book
  before the week is dealt and you're simply not given those days; book
  after and you do them first.
- **Housemate check**: a tick stands after `dispute_hours` (default 24)
  unless disputed. Raising a dispute counts as a vote to strike; everyone
  but the ticker votes; a majority decides at once, otherwise the vote closes
  on time and a tie goes to the tick. Upheld strikes the tick: the John is
  open again, and missed if the week has ended.
- **Covering**: once a John is past its due time by the house's grace
  (`houses.cover_grace_hours`, default 3) and still unticked, anyone else
  can do it instead (`cover_john`, setting `assignments.covered_by`). The
  first tick wins, so the assignee can still tick it late until someone
  covers it. A cover is checked like any tick (the coverer is the ticker,
  so the assignee can dispute it), and when it stands it settles as
  `covered`: the coverer earns its points, the assignee is treated as having
  missed it (no points, the missed forfeit, a broken streak), and that
  forfeit is paid to the coverer at month close instead of being shared.
- **Shared Jonz** (`johns.crew`, `docs/specs/shared-jonz.md`): a John's
  points are shared evenly by everyone who did it. A John done by 2 to 6
  (or everyone home) is dealt as one place each on one job
  (`assignments.job_id`) and ticked by a roll call (`roll_call`) that says
  who did it, helpers included; it settles every place at once, and a
  holder it leaves off (`absent_at`) has a miss whose part and forfeit go
  to whoever did it (`ledger.doers`). Any John can be done with help.
- **The Table**: on time earns full points, late half, missed nothing.
- **Streaks and perks**: a clean week is every John on time or excused.
  Every 4 clean weeks in a row earns an immunity token (cap 2), spent to
  excuse a John with no forfeit. Topping a week earns a swap token (cap 1),
  spent to trade one of your open Johns for any housemate's open John that
  week.
- **The Stake**: everyone stakes the same each month. Late and missed Johns
  forfeit fixed amounts, capped at the stake; at month end the forfeits are
  shared equally among everyone else (a covered John's goes to whoever
  covered it). Money is integer minor units in an
  append-only ledger, from each person's side; balances are sums, a month
  always sums to zero, and only the payee can confirm a payment. The app
  never moves money. A house can settle up in Splitwise instead
  (`houses.settle_in`, `docs/specs/splitwise-settle-up.md`): the payee
  copies the amount across and marks it added, which is a payment with
  `via: 'splitwise'`; Jonz never calls Splitwise's API (paid apps need a
  licence).
- **The Wall**: `events` rows written by the functions and the engine, with
  reactions and photo receipts.

## Data: Supabase

`profiles` (from auth via `handle_new_user`) → `houses` (rules: timezone,
currency GBP/CAD/USD/EUR defaulted from Vercel's geo headers, week start,
stake and forfeits, dispute hours; `join_code` from the CSPRNG; the House
Pass's `pass_plan`, `pass_until` and `pass_buyer`, service role only, with
its Stripe ids in `house_pass_billing`, which housemates can't read:
`docs/specs/house-pass.md`) → `members`
(role admin/member, streak, tokens; one house per person via
`members_one_house`, dropped when "more than one house" ships) → `groups` +
`group_members` → `johns` (the list: category, points 1–20, every N weeks
from `anchor_week` or every N months from `anchor_month` on a weekday of the
month, due day and time, needs photo, optional `group_id`:
`docs/specs/any-length-repeats.md`) →
`weeks` (unique per house and local start date) + `week_shares` (each
housemate's share of it) → `assignments` (a snapshot of the John as dealt,
`group_name`, `due_at`, `due_moved_from`, `done_at`, `photo_path`, `outcome`
stamped once final); `away` (local first and last dates, inclusive) →
`disputes` + `dispute_votes`; `ledger` + `month_closes`; `events` +
`reactions`; `push_subscriptions` + `notification_prefs` (each person's
kinds of push on or off, and quiet hours; no row is everything on). On-call Johns add `johns.kind`, `respond_hours` and
`per_week`, `on_call` (who holds each one each week), and
`assignments.flagged_at` and `flagged_by`. Shared Jonz add `johns.crew`,
`assignments.job_id` and `absent_at`, `crew` (who did a John and each share)
and `ledger.doers`. Steady weeks add `houses.deal_mode` and `deal_budget`,
`johns.keep_day`, each member's `suits_days`, `best_time` and `rather`
(`save_prefs`), `assignments.planned_at` (`plan_john`), `weeks.turns`,
`waiting` and `ahead`, and `swap_offers` (`offer_swap`, `answer_swap`).
Moving on adds `members.moving_out_on` and `moved_on` (each move out, and
where to next: `docs/specs/moving-on.md`).
Photos live in the private `proofs` bucket
at `<house>/<assignment>/<file>`.

- **Before writing a migration, read `docs/standards/database.md`**: how
  tables, pointers, indexes, times, money and security rules are named and
  built. `npm run db:standards` checks it, and CI fails a PR that breaks it.
- Schema changes only through migration files (`supabase migration new
  <name>`), never by editing the live database. Test with `npm run db:reset`,
  `npm run db:standards` and `npm run test:db`, then regenerate the types
  with `npm run types`.
- Migrations must stay additive once anything is deployed, because Vercel
  and Supabase deploy independently (a rename follows the steps in
  `docs/standards/database.md`). Applied migrations are never edited.
- Every table gets Row Level Security policies in the same migration that
  creates it, and its grants stated for every role, `service_role` included.
  A new function must revoke EXECUTE from `public, anon, authenticated` and
  grant back only what is meant: the platform's default privileges hand it
  to all three.
- Sign-in is Supabase Auth with Google everywhere, plus Sign in with Apple in
  the iOS app (App Store guideline 4.8: social sign-in on iOS must offer
  Apple too). The web signs in through Google's redirect; the native app
  hands Supabase an ID token from Google's or Apple's own sheet
  (`apps/client/src/api/auth.ts`). Microsoft works the same way, and an email
  and password too, where a new account and a reset each take a 6-digit
  emailed code, never a link (`apps/client/src/api/email-auth.ts`).
- `supabase/config.toml` is for local development only. Never `supabase
  config push`, which writes local settings over production's.

## Testing

- Vitest in `packages/core` and `apps/api` (and at the root for `scripts/`).
  Tests sit beside what they test (`<name>.test.ts`) in core. `apps/client`
  uses Jest with `jest-expo`, the one runner that can test React Native, and
  React Native Testing Library (see `apps/client/AGENTS.md`).
- `npm test`: every workspace's tests plus the scripts' decisions. Pure
  logic only: no stack, no network, no clock. Every function in
  `packages/core` gets tests, including edge cases: empty input, zero,
  negatives, rounding, dates and time zones.
- `npm run test:db` and `npm run test:e2e`: see `apps/api/AGENTS.md`. The
  e2e covers both the web app and the Expo app's web build.
- Never use floating-point maths for money: integer minor units (pence,
  cents).
- When a bug is fixed, add a test that would have caught it.
- The deal's rules are checked by deliberate breaks too: `npm run breaks -w
  @app/core` breaks one rule at a time and the tests must fail on each. Run
  it after changing `steady.ts`, `steady-run.ts` or `repeat.ts`, and add a
  break for any new rule.

## Hosting and deploys

- Vercel's git integration builds `apps/api` (the `jonz-api` project, Root
  Directory `apps/api`) and Supabase's GitHub integration applies migrations.
  `main` is production; CI only proves, and must be green to merge. There is
  no preview database yet, so preview deployments get no keys.
- From the Phase 13 cutover, a second project, `jonz-web` (Root Directory
  `apps/client`, configured by `apps/client/vercel.json`), serves
  jonz.app with the Expo web build and passes `/api/*` on to `jonz-api`,
  which answers on `api.jonz.app`. The clock's URL and the secrets
  don't move. DEPLOYMENT.md has the steps and the rollback.
- Production's accounts are described in `scripts/provision/config.mjs` and
  set up by `npm run provision`, which writes, then reads everything back
  (DEPLOYMENT.md).
- Always ask first. Never run or change any of these unless I've said to in
  that message: `npm run provision` (even `--check`), `supabase db push`,
  `supabase functions deploy`, `node scripts/staging.mjs` (except
  `--check`), a Vercel production deploy, either Vercel
  project's settings or domains, the Vault secrets, the VAPID keys, `npm run
  release:ios` / `release:android`, `eas build` with a production profile,
  `eas submit` and `eas update`. Store releases stay switched off in
  `release-targets.json` (both `false`) until the Apple and Google Play
  accounts exist; the release scripts refuse while they are.

## Secrets

- Public by design: the Supabase URL and anon key (`NEXT_PUBLIC_*`, and
  `EXPO_PUBLIC_*` in the native app). Row Level Security protects the data.
- Server only, in `apps/api`'s Vercel environment and nowhere else: the
  service role key, `CRON_SECRET`, `VAPID_PRIVATE_KEY`. Never in a client,
  `app.json` or the repo.
- Each app has a `.env.example` listing its variables; local values go in
  that app's `.env.local` (git-ignored). `supabase start` reads the values
  `config.toml` asks for (the Google client) from `supabase/.env.local`, with
  `supabase/.env.example` beside it.

## Local ports

Supabase on 54340–54344 (API 54341, DB 54342, Studio 54343): `home` holds the
54320s and `pub-golf`/`graph-editor` share the 54330s. The web app runs on
3205 and Metro on 8205 (never Expo's default 8081, which every app made from
the template would fight over).
