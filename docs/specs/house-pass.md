# The House Pass

## What it does

One subscription per house. Any housemate can buy it, and everyone in the
house gets the extras: the Stake, the Table and its perks, photo receipts,
and history beyond four weeks. Running a fair house stays free for every
house: the deal, the housemate check, reminders, covering, on-call Johns and
time away. No ads.

Every new house gets the Pass free for its first 30 days. The houses made
before the Pass locked (11 Nov 2026) got it free for good (plan `founding`).
There is no lifetime Pass for sale: on 2026-11-11 Glyn dropped the Founding
Pass ("I don't want to promise a lifetime membership"). A free Pass for good
is only ever a gift, from a Promotions gift named for someone's email.

## Plans

| Plan | USD | GBP | EUR | CAD |
| --- | --- | --- | --- | --- |
| Yearly (the default) | 39.99 | 29.99 | 39.99 | 54.99 |
| Monthly | 4.99 | 3.99 | 4.99 | 6.99 |

`PASS_PRICES` in `@app/core` (`pass.ts`) holds these until the stores give
their own local prices.

On 2026-11-11 Glyn lowered Yearly from
$49.99 to $39.99 and Monthly from $5.99 to $4.99 (and the same step in each
currency), moving the Stripe lookup keys to new prices; a subscription on an
old price keeps it until it ends.

Fair by design: the free version runs a whole house on its own, and the
Pass page says where the money goes. Once its free month or plan has ended, a
house that can't pay can email for a free Pass (the "Ask for a free Pass"
link); give it with a Promotions gift named for their email.

## Inputs and outputs

- `houses.pass_plan` (`trial`, `monthly`, `yearly`, `founding`),
  `houses.pass_until` (null only for Founding) and `houses.pass_buyer`.
  Written only by the service role; housemates read them with the house.
- `@app/core` `pass.ts`: `passOf`, `hasPass`, `passLine` and
  `passOffers`. A house without the Pass has lost the extras since 11 Nov 2026
  (`20270106090000_pass_on.sql` made every house made before then a
  Founding house). The database's own `house_has_pass` answers the same
  question for its checks. Staging's Demo House starts with its free month
  ended, so the locked app can be tried there.
- House shows Free and House Pass (`PassSection`; the Family Pass in a
  family): six groups in plain words, `freeGroups` then `passWords().extras`
  from `@app/core` `family.ts`, with a Free and a Pass column of ticks. Its
  last row says where the house stands (and, during the free month, about
  what the Pass costs each person a month) and pushes `/house/pass`: the
  promise, the same groups, and the plans. On a phone it is under Setup and
  you; on a laptop, under the Table and the Wall.
- The Pass's groups: Put money on it (the Stake, the Table and its perks),
  Proof, not arguments (photos, every week on record, track record) and
  More help from Jonz (five times the Ask Jonz pool, changing the list with
  Jonz). A family's are Pocket money, Kid profiles, Proof and More help.
- Stripe's `house_pass` product carries the promise as its description
  (live and test), so Checkout shows it.

## Buying on the web

Built straight on Stripe, so it doesn't wait for the stores. The iOS and
Android apps never link out to the web price.

- On the web, with `EXPO_PUBLIC_PASS_CHECKOUT=on`, the plans on the Pass
  page are buttons. One sends the browser to Stripe Checkout
  (`POST /api/pass/checkout`), in the house's currency, carrying the house
  and the buyer. Any housemate can buy.
- Bought during the free month, Yearly and Monthly first charge when the
  free month ends (`passFirstCharge`; Stripe needs at least two days), so
  nobody pays for days the house already has.
- Stripe's webhook (`POST /api/stripe/webhook`) checks Stripe's signature,
  reads the subscription again from Stripe, and writes the house's Pass by
  `passAfterSubscription`: a live subscription (active, trialing, past due)
  runs the Pass to the end of its period; an ended one stops it then, and a
  house still in its free month keeps the rest of it. (A one-off Founding
  payment, from before it came off sale, still makes the house free for good.)
- `house_pass_billing` (service role only) holds the house's Stripe
  customer and its current subscription. Events for any other subscription
  leave the Pass alone, so an old plan ending can't undo a new one.
- The buyer, and only the buyer, gets Manage plan: Stripe's billing page,
  to switch plan, change card or cancel (`POST /api/pass/manage`).
- Only Yearly and Monthly are sold; checkout refuses `founding`, which /v1
  still accepts so the contract only grows. A house on a paid plan is
  offered nothing (the buyer has Manage plan); a house free for good nothing.
- Back from Checkout (`/house/pass?bought=1`) the page says thanks and reads
  the house again every few seconds until the Pass shows.

## Moving out: the Pass moves with the buyer

The Pass belongs to whoever paid for it, and covers the house they live in
(`supabase/migrations/20261108090000_pass_moves.sql`).

- The buyer leaving themselves takes it (the default). It waits on their
  `moved_on` row, its Stripe ids in `moving_pass_billing`, and the house they
  left keeps the extras for 30 days as a free month (`trial`), so it can buy
  its own. The Wall says "Ben moved out, and their House Pass went with
  them. The house keeps the extras until Sun 29 Nov."
- The next house they start or join gets it (`record_moved_on`), unless it
  has a paid Pass or a free Pass for good of its own; then it keeps waiting. Re-joining
  the old house brings it back there.
- The Moving on screen says the Pass comes with them, and offers "Leave it
  for Flat 3 instead" (`leave_pass`): it goes back on the old house to the
  end of what was paid, then stops renewing.
- A Pass moves at most once every 30 days; within that, leaving leaves it
  with the house. A free Pass for good a house was given (no buyer) stays.
- An admin removing the buyer leaves the Pass with the house.
- Stripe never hears of a move. The webhook finds a subscription's house by
  `house_pass_billing.stripe_subscription`, then a move carrying it (whose
  renewals it writes on the move), and only then `metadata.house_id`.
- The clock (`lib/pass/moves.ts`, from `/api/cron/tick`) stops a Pass
  renewing once it's left with the old house, or has waited 30 days for a
  house ('lapsed'; it can still go on a house while what was paid lasts).

## What happens without the Pass

- The Stake: settled Johns forfeit nothing (the engine's `settleDue`).
  Months already counted still close.
- Perks: streaks still count, but closing a week earns no immunity or swap
  tokens (the engine's `closeWeeks`).
- House shows a row to the Pass page in place of the month card and the
  Table.
- Nothing is ever deleted. Buying the Pass again brings everything back.

- Photo receipts: no John asks for a photo, and none can be added. A photo
  John ticks like any other (`mark_done`, `roll_call`, `cover_john` and
  `board_tick` ask for a photo only while `house_has_pass`); the app hides
  the photo buttons (`WeekBoard.photos`), and the executor refuses
  `proof_upload` and a tick with a photo (`pass_required`). Answering a
  question on your tick with a photo goes too; the house just votes.
- History: the last four weeks (`house_history` reads older moves only with
  the Pass), and the end of the list goes to the Pass page.

## Still to build

1. Store purchases: RevenueCat (`react-native-purchases`, a development
   build), one RevenueCat customer per house (`house_<id>`), Restore
   purchases.
2. A RevenueCat webhook to `apps/api` that writes the three columns for
   store purchases, and a refresh on open so a missed webhook heals itself.
   RevenueCat can import the web's Stripe subscriptions then.

## Edge cases

- The buyer leaves: the Pass goes with them (see Moving out).
- An unknown plan, or a paid plan with no end, reads as ended.
- Days left count a part day as a day; the renewal day is in the house's
  time zone.

## Platforms

The same on iOS, Android and web. Buying differs per platform (the stores on
phones, Stripe on the web) and waits for the store release.

## Done when

- [x] A new house starts a 30-day free month; houses from before the lock have it free for good.
- [x] Nobody but the service role can write the Pass.
- [x] House shows the Pass row and page on every platform.
- [x] With the switch on, a house without the Pass forfeits nothing and earns no perks.
- [x] Buying works on the web (Stripe), behind `EXPO_PUBLIC_PASS_CHECKOUT`.
- [ ] Buying works on iOS and Android.
