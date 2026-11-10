# Family houses

The family version of Jonz, from the review "Should Jonz have a family
version?" and its mockups (Glyn approved building it on 4 November 2026).
It lands in five steps, one PR each, merged one at a time:

1. **Family houses** (this spec's first part): the kind of house, its words
   and no Stake.
2. **A parent's OK**: a kid's tick waits for a parent's "It's fine" or
   "Not yet", in place of the housemate check's vote.
3. **Pocket money and Pay day**: each OK'd John earns, up to a monthly cap
   per kid; a parent pays outside Jonz and taps Paid; the Table lists kids.
4. **Kids without a sign-in**: profiles a parent runs for under-13s, a kid
   switcher on Today, and a youngest age on a John.
5. **Family Pass**: the Pass page's words for a family. `FAMILY_OPEN`
   turns on here, and the front door and Start a house offer Family to
   everyone.

Housemate houses don't change at all.

## What it does

A house is housemates (equals sharing a place, as Jonz has always been) or
a family. A family is the same house underneath, with its own words: an
admin is a **parent**, everyone else a **kid**. A family has no Stake:
nobody puts money in or forfeits it.

## Inputs and outputs

- `houses.kind`: `housemates` (the default) or `family`. Set once, by
  `create_house(..., p_kind)`; there is no grant to change it.
  `start_house_from` gives the new house the old one's kind.
- `houses_family_no_stake`: a family's `stake_minor`, `late_forfeit_minor`
  and `missed_forfeit_minor` are always 0. A family starts that way, and the
  database refuses any change that would give it a stake.
- `house_by_code` returns the kind, so a join link to a family says so.
- The front door: once `FAMILY_OPEN`, a Housemates / Family switch above the
  headline swaps the headline, the three sentences and Start ("Start a
  family" leads to `/house/new?kind=family` through sign-in). The device
  remembers the choice (`door-kind.ts`).
- Start a house: "Who lives here?" above the name, with Family picked when
  the link says `?kind=family` (or the device remembers it). Family's sign
  is "Start your family", and its defaults line has no stake. A move
  (`?from=`) doesn't ask: the kind follows the old house.
- Words (`roleCopy(kind)`, `PARENTS_COPY`): Rules' Admins section is
  Parents ("Add a parent"), a person's page says Parent or Kid, the You page
  says "The Parks, parent", and leaving as the only parent hands the family
  over.
- What a family hides (`familyHides`): House's money figures and settling
  up, the Pass lock for them, a person's money section, and the Rules'
  stake, forfeits and where to settle up. Today's late and missed costs are
  already hidden when the stake is 0.

## Step 2: a parent's OK

In a family nobody votes on a tick (the mockups' "Saying OK"). A kid's tick
waits for a parent to say **OK it** (it stands) or **Not yet** (the John goes
back to the kid, open again), with no closing time. A parent's own tick, or
one a parent makes for a kid, needs no OK and stands at once.

- `houses_family_no_window`: a family's `dispute_hours` is always 0, so
  there is no window to dispute in (`raise_dispute` refuses with
  `not_disputable`) and a parent's tick settles on the next tick of the
  clock. House rules hide the window and say "A parent OKs each kid's tick".
- `assignments.awaits_ok`: set by the trigger `tick_awaits_ok` whenever a
  John is ticked in a family by someone who isn't a parent (Mark done, a
  cover, a roll call, Done it). Taking the tick back clears it, and so do
  `okayed_by` and `okayed_at`.
- `answer_tick(p_assignment, p_ok)`: a parent only (`parents_only`), on a
  tick that waits (`nothing_to_ok`). OK records who and when; Not yet strikes
  the tick as an upheld dispute does. A Together John's places share the
  answer. Each answer is on the Wall (`okayed`, `not_yet`).
- The engine (`settleOutcome`'s `awaitsOk`) never settles a waiting tick.
  Each tick of the clock tells the parents once about a new one ("Leo did
  Feed the fish", `ok_asked_at`). `POST /api/oks/:id` answers, tells the kid
  on Not yet, and ticks the house so an OK'd John settles at once.
- Today: a parent's **Needs your OK** lists the kids' waiting ticks, oldest
  first, and the Today tab's badge counts them. The John sheet shows a
  parent who can answer and OK it / Not yet; a kid sees that it waits, with
  Undo on their own.

## Step 3: pocket money and Pay day

In a family the Stake becomes pocket money (the mockups' "House and Pay
day"). Each John says what it earns. A kid earns it once their tick stands,
up to the family's cap a month each. After the month a parent pays each kid
outside Jonz (cash, a bank app, a kids' card) and taps **Paid**. Jonz never
moves the money. Parents' own Johns earn nothing.

- `johns.pay_minor`: what a John earns, set by a parent in the John editor
  (**Earns**). Each dealt place keeps its own copy (`assignments.pay_minor`,
  trigger `assignment_pay`), so changing a John changes only the week's open
  places (`john_pay_changed`), never a month already earned.
- `houses.pocket_cap_minor`: the most each kid can earn in a month. A family
  starts at 10 (£10, $10) and a parent changes it in House rules (**Pocket
  money a month**). `start_house_from` brings the cap and each John's pay.
- `pocket_earnings`: one row per John a kid earned from, in the month it was
  due, written by the trigger `pocket_earn` when a place settles done. The
  amount is cut so the month stays within the cap. Whoever covered a John
  earns it; a parent's place earns nothing. If a place stops being done (an
  admin's reset) its earning goes.
- `pay_pocket_money(p_house, p_kid, p_month)`: a parent only
  (`parents_only`), for a month that's over (`not_pay_day_yet`), paying what
  is still owed for it (`nothing_to_pay` when nothing is). It writes
  `pocket_pays` and the Wall's `pocket_paid` ("Sam paid Maya £6.50 for
  September."). Nobody can write either table directly.
- House: a family's month card replaces the Stake: "October so far", what
  the kids have earned, "Pay day is 1 Nov", then "Pay Maya £6.50 for
  September" with **Paid Maya £6.50** for each month still to pay (the first
  amber), and Pocket money history (`/house/pocket`). A kid sees only their
  own, on its way, with no button. The line under the name says "2 parents,
  2 kids, up to £10 a month each".
- The Table lists only the kids, with what each has earned this month
  trailing, and its sheet is How pocket money works.
- Today: a kid's Johns say what they earn ("due Sun 18:00, earns 50p", and
  "50p" trailing a row), and the page's line is "£4.50 earned so far in
  October". A parent's OK on a John that earns says "OK, pay 20p".
- Start a house: a family's defaults line starts "Pocket money up to GBP 10
  a month each".

## Step 4: kids without a sign-in, and ages

Under-13s don't need their own account. A parent adds a child and runs
their profile, and each John can say how old you have to be for it.

- **Add a child** on House's Table, for a parent: a name and the year they
  were born (18 or under). `POST /api/kids` (lib/moves/kids.ts) checks the
  caller is a parent in a family, makes the child's account banned and at
  an address that can't exist (`kid-…@kids.jonz.invalid`, so no email is
  sent: lib/email.ts), then `add_kid(p_parent, p_kid, p_born)`, which only
  the service can call, puts them in the family with `members.signs_in`
  false and `members.born_year`, and posts "joined" on the Wall.
- `runs_for(p_house, p_kid)`: you're a parent in that family and the kid
  doesn't sign in. `my_open_assignment` (every tick, Not done, swap and roll
  call) and `can_upload_proof` let such a parent act on the kid's place. A
  parent's tick needs no OK, so it stands at once, and the John earns for
  the kid.
- Today: a parent with a kid like that has a switcher in the title bar
  ("You ▾", then each such kid by first name). Picking a kid shows the kid's
  Today, as the kid would see it (no Needs your OK, no Ask Jonz), and ticks
  as the kid.
- `johns.min_age` (2 to 18, or none), set in the John editor (**Youngest
  age**) and shown in the John's line ("10 and up"). The deal leaves out a
  kid who turns less than that in the week's year (`oldEnough`). Anyone with
  no year born (parents, kids who sign in) can always be dealt it. If nobody
  is old enough, the John waits, as when nobody is home.

## Step 5: the Family Pass, and open to everyone

- The Pass is the same Pass at the same price. In a family it is called the
  **Family Pass** (`house.familyPass.*` in the words files, `passWords`): the House row, the Pass
  page's title and lead ("Only a parent can buy it, and every kid gets the
  extras"), and its extras: Pocket money and Pay day, Kid profiles, Photos
  to check, All your history.
- Only a parent can buy it: `startCheckout` answers 403 for a kid in a family.
- The Wall says "Maya joined the family" ("New in the family") where
  housemates say "moved in".
- `FAMILY_OPEN` is true: the front door's Housemates / Family switch and
  Start a house's "Who lives here?" show to everyone.

## The board

A family's shared screen, picked by Glyn on 7 November 2026 (option A). A
parent opens **The board** from House (under the month card) on the kitchen
tablet, signed in as themselves, and leaves it open.

- A column for each kid, by first name, with what they've earned this month
  at its head. In it: their Johns still to do that are due by the end of
  today (overdue first), then those waiting for a parent's OK, then those
  done today (`boardColumns`, packages/core/src/family-board.ts).
- A kid taps the box to tick their own: `board_tick(p_assignment)` checks
  the caller can OK ticks (a parent) in a family and the John is a kid's,
  sets it done and makes it wait for an OK, as a tick from the kid's own
  phone would, and posts "done" (or "late") for the kid on the Wall.
- A John that needs a photo can't be ticked there ("tick it from their
  Today"); one in a roll call neither.
- Tapping a John opens its sheet, where a parent says OK or Not yet.
- Anyone else, or a house that isn't a family, sees that the board is for a
  parent on a shared screen.

## Edge cases

- Until `FAMILY_OPEN`, nobody sees the choice unless a link asks for a
  family. A family started that way works.
- A kind the app doesn't know reads as housemates (`houseKind`).
- Storage that can't be read (a private window) means the front door opens
  on housemates.

## Platforms

The same on iOS, Android and web. The remembered choice uses the same
storage as the session (localStorage on the web, SQLite-backed on phones).

## Done when

- [x] A family starts with no stake and can't be given one (tests/db/family-houses.test.ts).
- [x] Start a house asks who lives here when a family is asked for, and sends the kind.
- [x] Parents and kids are named as such on Rules, a person's page and You.
- [x] A family's House, person pages and Rules show no money.
- [x] A kid's tick waits for a parent's OK with no closing time; Not yet sends it back (tests/db/parent-ok.test.ts).
- [x] Nobody can dispute in a family, and a family can't be given a window.
- [x] A parent's Today lists Needs your OK, and the sheet answers it.
- [x] A kid's OK'd John earns what it says, up to the monthly cap; a parent's earns nothing (tests/db/pocket-money.test.ts).
- [x] A parent taps Paid for a month that's over, once; nobody else can.
- [x] House shows the month so far, Pay day and what's still to pay; the Table lists only the kids.
- [x] A parent adds a child who can't sign in, and ticks for them; it stands without an OK and earns (tests/db/kid-profiles.test.ts).
- [x] A kid younger than a John's youngest age isn't dealt it.
- [x] Today's switcher shows a kid's Today to a parent, and ticks as the kid.
- [x] A family's Pass is the Family Pass, and only a parent can buy it (tests/db/house-pass-billing.test.ts).
- [x] Anyone can pick Family on the front door and at Start a house.

## Switching a house

Picked by Glyn on 7 November 2026 (the picker "What's left for families"):
a house you already have can become a family, or go back, without starting
again and losing the list, the people and the history.

- Rules has **Who lives here** for everyone to read. An admin sees
  Housemates and Family as radio rows (`KindSwitch`); picking the other one
  opens a sheet that says what changes, and **Make it a family** /
  **Make it housemates** does it.
- `set_house_kind(p_house, p_kind)`: an admin only (`house.settings`).
  - To a family with no money in it (stake and forfeits all 0): at once.
  - To a family with money in it: `houses.next_kind` / `next_kind_on`, the
    1st of next month in the house's time zone. The month is settled up as
    usual; the Rules row says "Becomes a family on Tue 1 Dec, once November
    is settled up". Picking Housemates while it waits keeps it as it is.
  - Back to housemates: at once, refused (`kids_without_sign_in`) while a
    kid doesn't sign in. Ticks waiting for an OK stand, the housemate check
    comes back (24 hours), and the stake stays 0 until an admin sets one.
- `apply_house_kind` makes the change: a family's stake and forfeits go to
  0, `dispute_hours` to 0, and pocket money starts at 10 a month each.
- The clock (`tickHouse`, `apply_next_kind(p_house, p_now)`, service only)
  makes a waiting change once its day has come and the month before it is
  closed, or a week after the day if that month never closes.
- Pocket money earned in a family can still be marked Paid after it goes
  back to housemates (`pay_pocket_money` no longer checks the kind).
- The Wall says each step (`kind_changed`): "Sam made the house a family
  from Tue 1 Dec, once this month is settled up.", "The house is a family
  now.", "Sam kept the house as housemates.", "Sam made the house
  housemates again."

- [x] An admin switches a house to a family, at once or on the 1st, and back (tests/db/switch-house-kind.test.ts).
- [x] The board shows each kid's Johns today, and a kid's tick there waits for an OK (tests/db/family-board.test.ts).
