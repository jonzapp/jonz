# Steady weeks

The old deal handed out the whole John list every week, however long it was,
and a week dealt part-way through crammed every John whose day had gone into
the next 24 hours. On 30 October 2026 a new house got six Johns and a week on
call in one go, four of them due at the same minute. Steady weeks replaces it
with one deal for every house, in one of two modes, with a points budget and
preferences each person can set. Chosen on 30 October 2026 ("Lighter weeks",
built as one pull request with one migration).

## What it does

- **How you share Johns** (House rules, Workload, admins; asked once in
  Describe your house when a new house's first list is in):
  - **Smart** (suggested): turns planned from points, who did what recently
    and everyone's preferences. Nobody gets the same John twice running.
  - **Classic**: each John has its own order of turns and goes round everyone
    the same way each time.
- **Effort each week**: Light 2, Usual 4 or Busy 6 points each, or no limit
  (the old deal). Each size says what it does to this house's own list
  ("About two each. Weekly Johns come round every 1 to 2 weeks."), and the one that fits is
  marked Suggested: the smallest at which every John still comes round within
  three times its own schedule. A new house starts on Usual; a house that
  already existed keeps no limit until an admin picks.
- **One a day.** Everyone home is owed one John of their own, even one bigger
  than their budget, and after that a John goes to someone only if it fits.
  Johns go to the nearest free day that suits the person, then the nearest
  free day, and only then a day that already has one.
- **Keep its day** (John editor): bins night stays on its night, and is
  always dealt whatever the budget. An on-call John has no day to keep.
- **Waiting their turn.** A John that doesn't fit waits for next week and
  goes ahead of the rest the week after. It merges with its next turn, so it
  never doubles up and is never skipped. Week lists them ("Nothing silently
  disappears").
- **Fresh starts.** A week dealt part-way through (the first deal, an admin's
  re-deal) only uses the days still to come; a John that keeps its day whose
  day has gone sits the week out. Someone who joins mid-week starts the next
  Monday at a balance of 0 instead of owing a week already under way.
- **Preferences** (House, You, Preferences), all optional: days that suit
  me, my best time (morning, afternoon or evening), and for each John Rather
  do, No preference or Rather not. They change when you get a John and the
  order of turns; everyone still does their full share.
- **Plan it** (Today's next John and the John sheet): one tap plans your
  John at your best time on the latest day before it's due, with Undo;
  Change picks another day and time or clears it. The reminder comes then
  instead of "due tomorrow" and "due soon". It moves nothing else.
- **Week** shows, in Smart, "after Ada" on each John (who had it last) and
  Whose turn next; in Classic, whose turn it is this week and the next two
  ("Next week", "Week of 16 Nov"). The next two weeks are worked out by the
  same deal with the same inputs when the week is dealt and kept on the week,
  so they match what the next deal does unless something changes.
- **Asking to swap.** When your John is one you'd rather not and a housemate
  would rather do it, Today offers "Ada would rather do it, Swap it for her
  Kitchen, 2 pts, [Ask Ada]". Ada gets a push and a card on her Today with
  Swap and No thanks. If she says no or doesn't answer by the end of the day
  (the house's zone), it stays yours. No swap token: it's hers to agree to.

### The rules, and why

The deal is `@app/core` `steady.ts`, pure and deterministic; its header has
every rule. In short:

- **Order.** Missed Johns coming back first, then Johns that keep their day
  or are done together, then Johns that have waited two weeks, then the rest
  by how late they are for their own schedule. Fair-shares balances (#24,
  #26) still come from what is dealt, so a waiting John lowers everyone's
  share alike.
- **Smart** gives everyone a target (the budget, up to half again for someone
  behind, half less for someone ahead), lets whoever is furthest behind
  choose first, and never hands the same John twice running unless they'd
  rather do it, they're well behind, or it has waited two weeks.
- **Classic** plans each John's order of turns so each week's points split
  evenly. Whoever's turn it is may go up to half the budget over (Glyn,
  2026-11-12: the budget is a guide, not a hard limit); away or fuller than
  that, the next in line with room does it and they stay first. Someone new
  joins the back of every order they share.
- **Pools.** A group's Johns are balanced within the group, and the whole
  house's Johns across everyone. Each member's balance is split by pool (the
  whole house, and each group they're in now); Smart picks who gets a John
  by how far behind they are in that John's pool, so a group's Johns never
  cut anyone's share of the rest. The budget still caps the whole load.
  A cover by someone outside the group counts toward their whole-house
  balance; someone who leaves a group takes their balance there into their
  whole-house balance; someone who joins starts at 0 in the group's pool.
  Tests: `steady-pools.test.ts` (Glyn's main-floor bathroom example).
- Research behind it (implementation intentions, fresh starts, choice, small
  wins) is in the Lighter weeks design, `johns-load/lighter-weeks.html`.

## Inputs and outputs

- Migration `20261103090000_steady_weeks.sql`:
  - `houses.deal_mode` (`smart` | `classic`, default `smart`) and
    `houses.deal_budget` (0, 2, 4, 6), admins update them.
  - `johns.keep_day` (never on an on-call John).
  - `members.suits_days`, `best_time`, `rather` (John id → 1 or -1), written
    only by `save_prefs(p_house, p_days, p_best_time, p_rather)`.
  - `assignments.planned_at`, written by `plan_john(p_assignment, p_at)`;
    cleared when a John changes hands.
  - `weeks.turns` (Classic's orders), `weeks.waiting` (John id → weeks
    waited) and `weeks.ahead` (the next two weeks: `[{startsOn, johns}]`),
    written by `deal_week(…, p_state)`.
  - `swap_offers` (only the two people in an ask can read it), written by
    `offer_swap(p_mine, p_theirs)` and `answer_swap(p_offer, p_accept)`.
- Migration `20270108090000_group_pools.sql` (server only):
  `week_group_shares` (each week's share of each group's Johns, per person,
  written by the deal after `deal_week`) and `house_group_balances(p_house,
  p_before)` (share and work per group). The deal splits each balance into
  pools with them: each group someone is in now, and the whole house for the
  rest. Weeks dealt before it count as the whole house's.
- `POST /api/swaps` with `SwapAskRequest {mine, theirs}` answers
  `SwapAskResponse {ok, offerId}` and pushes the housemate asked. A bad body is
  400 "Say which two Johns to swap."; refusals are 409 in words.
- Refusals: `bad_prefs` (a day, time or John that isn't one), `plan_time`
  (a plan outside now to the week's end), `not_your_john`, `already_settled`,
  `not_swappable` (not both open this week, or a flag, or they wouldn't rather
  do it), `already_asked` ("You’ve already asked about that John today."),
  `swap_gone` ("That ask has run out, so the Johns stay as they were."), and
  `not_found`, each in words in `errors.ts`.

## Edge cases

- A list too long for even Busy says so, and how many points a week it asks.
- Someone away keeps their part by the house's make-up rate; a John they'd
  have had goes to someone home, or waits.
- A group's John goes only to the group's members; a John nobody home shares
  waits.
- An ask whose John has been ticked, swapped or handed over is no longer
  offered, and answering it says it has run out.
- Clocks changing: Plan it's times and the week's days are in the house's own
  zone.
- Switching modes takes effect at the next deal; Classic plans its orders
  then.

## Platforms

The same on iOS, Android and web. Plan it's reminder is a push, so with
notifications off it only shows on Today.

## Done when

- [ ] An admin picks Smart or Classic and a budget in House rules, and Describe
  your house asks the mode once for a new house.
- [ ] A week dealt on a Thursday puts nothing due in a pile tomorrow.
- [ ] A John that doesn't fit shows under Waiting their turn and goes out the
  next week.
- [ ] Preferences save as they're picked and move days and turns.
- [ ] Plan it is one tap, with Undo, and the reminder comes at the planned time.
- [ ] Week shows whose turn is next (Smart) or the next two weeks (Classic).
- [ ] A swap ask reaches the housemate, Swap swaps the Johns, and No thanks or
  the end of the day leaves them be.
