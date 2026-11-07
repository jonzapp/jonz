# Fair balances

## What it does

Fixes three places where the points or the money came out wrong before the roommate beta (beta review S6, S7 and the first "nice to have"):

- **A skipped John counts as neither owed nor done.** A John skipped with immunity, or excused (time away with nobody home), comes out of its week. Nobody is credited with it, and every share of that week shrinks by its part (`keptOfWeek`). Before, the holder was credited with its full points against a share that only held part of it, so a skip put them ahead and the house was dealt more the next week. The John sheet's Why? now says "It was skipped, so it counts for nobody: it comes out of everyone's share this week."
- **Only people still in the house share forfeits.** At month end, someone who moved out still pays their own forfeits, but gets no share of anyone else's (`settleMonth`). Before, a leaver who had paid a forfeit that month got a share of the others'.
- **Late points round up.** A late John earns half its points, rounded up (`pointsEarned`), so a 1-point John done late earns 1, not 0, and isn't the same as missing it.

## Inputs and outputs

- `house_balances(p_house, p_before)`: `owed` scales each week's shares by what's left after its excused Johns, and `credited` leaves excused Johns out unless someone covered them.
- Core `deal.ts`: `excusedJohn`, `keptOfWeek`; `creditedTo` gives nobody for a skip; `carryOver` scales shares. `PastJohn.excused` is new.
- Core `record.ts`: the Track record breakdown's share line uses the same scaling.

## Edge cases

- A covered John that had been excused still counts for whoever covered it.
- A week whose shares sum to 0 keeps its shares as they are.
- A forfeit from a leaver in a house left with nobody else is refunded to them.

## Platforms

Same everywhere: the rules are in core and the database.

## Done when

- [x] A skipped John leaves both balances at 0 in a house of two.
- [x] A leaver gets no share of others' forfeits but still pays their own.
- [x] A 1-point John done late earns 1 point.
