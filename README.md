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
A family can use it too: parents OK the kids' ticks, and kids earn pocket
money in place of the Stake.

<p align="center">
  <img alt="Johns, dealt fair: the Today screen. Just ask Jonz: Ask Jonz answering about the week. Families too: a parent's Today, with kids' ticks to OK." src="docs/brand/readme-screens.png" width="720">
</p>

## What it does

- **Fair shares, dealt for you.** Every John has points (1 to 20), a kind,
  a due day and a repeat. Each week the Johns are dealt so the work evens
  out, and the bathroom moves around. Smart mode weighs who's behind, who
  did it last and what each person would rather do; Classic takes turns in
  order. A points budget keeps anyone's week from getting too full.
- **Groups.** Three of you share the upstairs bathroom and two the
  downstairs one? Put each bathroom's Johns in a group, and only that group
  is dealt them, and only they count toward its share.
- **On call, covering and shared Johns.** An on-call John (the bins when
  they're full) goes to whoever is on call that week when anyone flags it.
  An overdue John can be covered by someone else, who earns it. A big John
  can be done together, with the points split among whoever helped.
- **Plan it and swap.** Pick the day you'll do a John, or offer it to a
  housemate in a swap.
- **Time away that stays fair.** Book your dates and you aren't dealt Johns
  due while you're gone, but your share keeps counting, so you catch up a
  little each week when you're back (the house can make that half, or none).
  A month calendar shows who's away.
- **Housemate check.** A tick stands after 24 hours unless someone disputes
  it; disputes go to a quick house vote. Photo receipts are optional, or
  required on the Johns you choose. Most things can be undone.
- **The Stake.** Everyone stakes the same each month. Late and missed Johns
  forfeit part of it, and at month end the forfeits are shared among
  everyone else. Jonz keeps the ledger and works out who pays whom, or the
  house settles up in Splitwise; Jonz never moves money.
- **Families.** A family house has parents and kids. A parent OKs each
  kid's tick, kids earn pocket money up to a monthly cap, and kids under 13
  can have a profile a parent runs, with no sign-in. Every sentence speaks
  to a family, never to housemates.
- **The Table, streaks and perks.** Points for every John done (half for
  late). Four clean weeks in a row earn an immunity token; topping the week
  earns a swap. The track record shows each person's weeks at a glance.
- **The Wall.** Ticks, photos, misses, disputes and perks as they happen,
  with reactions.
- **Ask Jonz.** Describe the house in a sentence and Jonz drafts the John
  list. Later, ask it anything about the house, or to make a change: it
  shows each change on a card for you to OK first. Chats are saved.
- **Reminders** by push notification, with quiet hours. Tick a John, or
  answer a housemate's dispute, from the notification itself.
- **Help built in.** Short tours, a guide, and Report a problem from inside
  the app, answered by email.
- **The House Pass**, for houses that want chores to actually get done:
  money on the line, photo proof and more help from Jonz, for the whole
  house at $49.99 a year (about $1 a person a month in a house of four), or
  $5.99 a month, with a free month first. Sharing chores fairly stays free.

It works on any phone and spreads out on a laptop, in the Bin Night house
style: council signage, hi-vis amber, a bin-lid colour per kind of John.
Invite links show the house's name when you paste them into the group chat.

## Stack

- **The app:** [Expo](https://expo.dev) (SDK 58) for iOS, Android and the web, at [jonz.app](https://jonz.app)
- **The API:** [Next.js](https://nextjs.org) 16 on [Vercel](https://vercel.com), at api.jonz.app, with `/v1` and MCP
- **The way in:** one list of operations (`@app/server`) for the app, Ask Jonz, the API and MCP
- **Data:** [Supabase](https://supabase.com): Postgres with RLS, Auth, Storage, Realtime, pg_cron
- **Ask Jonz:** [Claude](https://www.anthropic.com/claude)
- **Words:** [FormatJS](https://formatjs.github.io) words files, ready for other languages
- **Money and email:** [Stripe](https://stripe.com) and [Resend](https://resend.com)
- **Tests:** [Vitest](https://vitest.dev), [Jest](https://jestjs.io) and [Playwright](https://playwright.dev) on GitHub Actions
- **Staging:** staging.jonz.app, with its own database and a demo house

## Repo map

- [`apps/client`](apps/client): the app for iOS, Android and the web
- [`apps/api`](apps/api): the API, the clock and the end-to-end tests
- [`packages`](packages): the rules, the words and the one way in
- [`supabase`](supabase): the database
- [`scripts`](scripts): setting up, the brand images, releases
- [`docs`](docs): specs, the house style and the brand

Every folder, and how they fit together: [AGENTS.md](AGENTS.md).

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

CI runs these side by side on every pull request, and `main` merges only
when `verify` is green.

## Brand

Every icon, favicon, card and banner is drawn from one mark with
`npm run brand`. [`docs/brand/README.md`](docs/brand/README.md) has the
logo, colours, type, voice, where each image goes, and the steps for the
dashboards that take a logo by hand.

## Deploy

See `DEPLOYMENT.md`. Store releases stay off in `release-targets.json` until
the store accounts exist.

## Later

The iPhone and Android apps in the stores, other languages, bounties, pay
links to settle up, a calendar feed, more than one house per person, and
posts in the house group chat.

## Contributing, security and licence

Report a problem, send an idea or ask a question from inside Jonz (House,
then Help), or email support@jonz.app: [jonz.app/help](https://jonz.app/help)
says how. [CONTRIBUTING.md](CONTRIBUTING.md) says how to work on the code. Report
security problems privately, as [SECURITY.md](SECURITY.md) says. The code is
public to read, not to reuse: see [LICENSE](LICENSE).
