# Fair time away and swaps

## What it does

Closes two ways a trip or a swap could dump work on a housemate before the roommate beta (beta review B2 and S5):

- **Whoever is handed a John hears about it.** Booking time away that starts too soon to do your Johns first (departure within 12 hours) hands each one to the housemate with the fewest points that week, or skips it with nobody home. Booking now goes through `set_away on /v1`, which pushes each housemate the John they were given and when it's due. The booking screen says what went where.
- **Cancelling hands it back.** Cancelling a trip, coming back early, or undoing the booking (`end_away`, one way for all three and for a deletion's own time away) gives back every John the trip handed on or skipped that's still open and due from today. A John the housemate already ticked, covered, or skipped with their own token stays with them.
- **The Wall post stays.** It says the trip was cancelled, or ended early, instead of disappearing. The post for a booking also says how many Johns went to housemates or were skipped.
- **A swap token trades only Johns not yet due**, yours and theirs (`swap_due`). The swap list leaves overdue ones out.

## Inputs and outputs

- `set_away on /v1` `{ from, to, note? }` → `{ ok: true, before, handed, skipped }` (`AwayResponse`).
- `assignments.handed_from` (who went away) and `assignments.handed_by_away` (the trip), set by `start_away`, cleared on hand-back.
- The `away` event's data gains `cancelled: true` or `back_on: <date>`.

## Edge cases

- Someone who has left the house gets nothing back.
- A John handed on and since overdue still goes back on cancel: it was yours, and you're home.
- Asks to swap (offer and answer) are unchanged: both people agree to those.

## Platforms

Same everywhere. The push uses the "deal" setting (new Johns for you).

## Done when

- [x] A trip from today hands its John on, and cancelling it hands it back, keeping the Wall post as cancelled.
- [x] Undoing the trip hands it back too; a skipped John is un-skipped.
- [x] A John the housemate already ticked stays theirs.
- [x] A swap token can't trade away, or take, an overdue John.
