# Tell people

## What it does

Makes sure nobody is surprised by what happened to their John, by the house's rules or by the Pass before the roommate beta (beta review B3, S2, S3, S4, S9):

- **The join screen shows the stake.** Before you join a housemates' house, it says what the house plays for: "This house plays for money: £20 a month each, £1 for a late John and £3 for a missed one, split between everyone else." A house without money says it keeps score in points. Family houses don't show it.
- **Four new pushes, once each.** The clock (`tellHouse`, every tick) pushes:
  - the owner, when someone covers their John;
  - the housemate a swap token was used on;
  - whoever ticked it, when a question on their tick is decided (struck, with 12 hours to redo it, or stood);
  - everyone but the admin who made it, when the house rules change.
  Hand-offs from time away already push their new holder (fair away).
- **Rule changes go on the Wall.** Changing the stake, a forfeit, the check window, the late window or the cover grace posts "Glyn changed the missed forfeit from £3 to £5." Only a change made by a person posts; the clock and servers don't.
- **"I'm on it" against covers.** When covering opens on your overdue John you get a push ("Housemates can cover it now and take its points. On it? Say so and covers wait 2 hours."). The John sheet offers **I'm on it** once, which holds covers off for 2 hours, or until the John turns missed if that comes sooner. Housemates see "Sam is on it. Anyone else can cover it from 21:40."
- **Covering sits lower on Today.** Housemates' overdue Johns moved out of Needs you into their own "You could cover" section, under your own Johns and On call, so covering is never your top task. Needs you keeps the votes.
- **The Pass is free during the beta.** While the extras aren't locked (`PASS_ENFORCED` off) the Pass page shows the plans but sells nothing, and says "Free during the beta". The checkout API refuses too. A buyer can still manage a plan they hold.

## Inputs and outputs

- `house_by_code(p_code)` now also returns `currency, stake_minor, late_forfeit_minor, missed_forfeit_minor`.
- `events.kind` gains `rules`, with `data = { changes: { field: [old, new] }, currency }`, from the `post_rule_change` trigger on `houses`.
- `events.told_at`: when the clock told people about the post; null until then. Existing posts count as told.
- `assignments.cover_told_at`: when the owner was told covering opened. `assignments.cover_held_until`: set by `hold_cover`.
- `hold_cover(p_assignment uuid) returns timestamptz`: the owner only. Errors: `not_yours`, `already_done`, `cover_held_once`.
- `cover_john` refuses `cover_held` while the hold lasts.
- Core: `tell.ts` (`TOLD_KINDS`, `tellOf`, `ruleChanges`, `TELL_COPY`), `holdable` and `canCover` (respects `heldUntil`) in `outcome.ts`.

## Edge cases

- A post more than a day old when the clock first sees it is marked told without a push.
- Housemates who have left get no push.
- "I'm on it" is offered only once covers are open, so the hold is never spent inside the grace. Not on a Together John.
- A held John that turns missed still turns missed at its usual time.

## Platforms

Same on iOS, Android and web. Pushes are web push for now.

## Done when

- [x] The join screen shows the stake and fines, or says the house plays for points.
- [x] Each of the four pushes goes once, to the right person.
- [x] A rule change by an admin is on the Wall; one by the clock isn't.
- [x] "I'm on it" holds covers off for 2 hours, once.
- [x] Cover rows sit under On call on Today.
- [x] The Pass page sells nothing while `PASS_ENFORCED` is off.
