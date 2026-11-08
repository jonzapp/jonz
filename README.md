<p align="center">
  <a href="https://jonz.app">
    <img alt="Jonz. Fair shares of the housework, and a house that keeps score." src="docs/brand/readme-banner.png" width="720">
  </a>
</p>

<p align="center">
  <a href="https://jonz.app"><b>jonz.app</b></a> · iPhone and Android on the way · <a href="docs/brand/README.md">Brand</a>
</p>

In our house the week's chores were always called Johns, so that is what
Jonz calls them: one chore is a **John**. List the house's Johns once, and
every week Jonz shares them out so the work evens out over the month. The
house checks each tick, and the month's Stake settles who did their share.

<p align="center">
  <img alt="Johns, dealt fair: the Today screen. The bathroom moves around: the Week screen." src="docs/brand/readme-screens.png" width="540">
</p>

## What it does

- **Fair shares, dealt for you.** Every John has an effort score (1–10), a
  kind, a due day and a repeat. Each week the Johns are dealt so effort evens
  out over the month, and the bathroom moves around.
- **Groups.** Three of you share the upstairs bathroom and two the
  downstairs one? Put each bathroom's Johns in a group, and only that group
  is dealt them, and only they count toward its share.
- **Time away that stays fair.** Book your dates and you aren't dealt Johns
  due while you're gone, but your share keeps counting, so you catch up a
  little each week when you're back (the house can make that half, or none).
- **Housemate check.** A tick stands after 24 hours unless someone disputes
  it; disputes go to a quick house vote. Photo receipts are optional, or
  required on the Johns you choose.
- **The Stake.** Everyone stakes the same each month. Late and missed Johns
  forfeit part of it, and at month end the forfeits are shared among
  everyone else. Jonz keeps the ledger and works out who pays whom; it never
  moves money.
- **The Table, streaks and perks.** Points for every John done (half for
  late). Four clean weeks in a row earn an immunity token; topping the week
  earns a swap.
- **The Wall.** Ticks, photos, misses, disputes and perks as they happen,
  with reactions.
- **Ask Jonz.** Describe the house in a sentence and Jonz drafts the John
  list; ask it for changes later.
- **Reminders** by push notification. Tick a John, or answer a
  housemate's dispute, from the notification itself.
- **The House Pass.** One price for the whole house, $49.99 a year (or
  $5.99 a month), with a free month first.

It works on any phone and spreads out on a laptop, in the Bin Night house
style: council signage, hi-vis amber, a bin-lid colour per kind of John.
Invite links show the house's name when you paste them into the group chat.

## Stack

| | |
| --- | --- |
| The app | Expo (SDK 58, Expo Router) for iOS, Android and the web, at [jonz.app](https://jonz.app) |
| The API | Next.js 16 route handlers on Vercel, at api.jonz.app |
| Data | Supabase: Postgres with RLS, Auth (Google, Microsoft, and Apple on iOS), Storage, Realtime, pg_cron |
| Money | Stripe Checkout for the House Pass |
| Tests | Vitest, Jest and Playwright |

The same shape as Pub Golf, Graph Editor and glyn.dev, in an npm workspace
shaped like `glynfinck/app-template`. `AGENTS.md` says how it fits together
and why.

## Repo map

```
packages/core/                 @app/core, the pure rules: week, deal, outcome, points, streak, stake, dispute;
                               Bin Night's colours, the mark, the shared words and the link cards' words
apps/client/                   the Expo app for iOS, Android and the web, at jonz.app
  src/app/                     screens (Expo Router)
  src/components/ src/theme.ts Bin Night in React Native
  public/                      the web's page, icons, favicon and link card
apps/api/                      the API (Next.js route handlers only), at api.jonz.app
  app/api/                     the routes the app calls
  app/api/cron/tick/           the clock (called by pg_cron)
  app/api/share/ app/api/og/   the cards a pasted link shows in a chat
  lib/engine/                  the tick: applies the rules to the database
  tests/db/                    the database attacked (the rules' tests sit beside them in core)
  e2e/                         the web build on phones and a laptop, end to end
supabase/migrations/           schema, RLS, the housemate functions, the cron job
scripts/                       provision, the clock by hand, VAPID keys, the brand images, the store release gate
docs/brand/                    the brand guide and every brand image
```

## Develop

Node 22, Docker, the Supabase CLI.

```sh
npm ci
cp supabase/.env.example supabase/.env.local
supabase start                                  # ports 54340–54344
cp apps/api/.env.example apps/api/.env.local    # then fill in from `supabase status -o env`
npm run dev                                     # the API on http://localhost:3205
npm run dev:client                              # the app: Metro on 8205 (w for web)
```

The app reads `apps/client/.env.local` (copy `.env.example`). Its web build
signs in in the browser; on iOS and Android, sign-in needs a development
build (`npx expo run:ios` / `run:android` in `apps/client`; Expo Go can't)
and Google's app clients (`DEPLOYMENT.md`).

To use the app locally without a Google client, create a user in Studio
(http://127.0.0.1:54343) and sign in the way `apps/api/e2e/auth.ts` does, or
configure a Google OAuth client for localhost.

## Test

```sh
npm test            # the pure rules (@app/core), the app's Jest, the scripts' decisions; no stack
npm run test:db     # RLS, the housemate functions and the engine, on the local stack
npm run test:e2e    # Playwright on the web build: Pixel 7, iPhone 15, desktop Firefox, a 1440px laptop
```

## Brand

Every icon, favicon, card and banner is drawn from one mark with
`npm run brand`. [`docs/brand/README.md`](docs/brand/README.md) has the
logo, colours, type, voice, where each image goes, and the steps for the
dashboards that take a logo by hand.

## Deploy

See `DEPLOYMENT.md`. Store releases stay off in `release-targets.json` until
the store accounts exist.

## Later

Bounties, swapping Johns by agreement, pay links to settle up, a calendar
feed, more than one house per person, and posts in the house group chat.

## Contributing, security and licence

Report a problem, send an idea or ask a question from inside Jonz (House,
then Help), or email support@jonz.app: [jonz.app/help](https://jonz.app/help)
says how. [CONTRIBUTING.md](CONTRIBUTING.md) says how to work on the code. Report
security problems privately, as [SECURITY.md](SECURITY.md) says. The code is
public to read, not to reuse: see [LICENSE](LICENSE).
