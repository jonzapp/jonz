# Admins and resets

Design: https://claude.ai/artifact/WMLo693iKzjmhLMyzE5snL (Glyn picked the
whole package, 29 Oct 2026). Step 1 is undo and History
(`docs/specs/undo-history.md`); step 2 is the resets below; step 3 is Ask
Jonz for both.

## Admins

House › Setup › **Admins** lists who looks after the house, with
"Add an admin" (pick a housemate who isn't one) and Remove beside every
other admin. Both happen at once and offer Undo in the toast. A house always
keeps one admin (the database checks). The only admin leaves from House by
picking who looks after the house: "Make Sam admin and leave" is one step
(`hand_over`).

## The six resets

| Reset | Where | What it does |
| --- | --- | --- |
| Change one result | John sheet › Admin › Fix the result | Done, late, missed or let off. Its forfeit goes or comes. The Track record square gets an amber dot. |
| Reset one person's week | Their page | Their Johns this week go back to open: ticks, covers and their forfeits come off. |
| Reset this week | Week ••• | Everyone's Johns this week go back to open; flags and open disputes are cleared. |
| Re-deal this week | Week ••• | As reset, then the week is dealt again from the list as it is now. Allowed after ticks now. Only this week. |
| Skip this week | Week ••• | The week counts for nothing: no shares, no credit, no forfeits. Whatever wasn't done is let off. Streaks neither grow nor break. The Track record shows it grey. |
| Let everyone off a month | Stake history | The month's forfeits go. Marks stay; the month is labelled "Let off". |

To take the whole house back to before its first deal, see
`docs/specs/house-reset.md` (Reset history and Reset everything, in House
rules' Danger zone).

Every reset opens the same **reset sheet** (`components/reset-sheet.tsx`). It
asks the server what the reset would change (`POST /api/resets` without
`apply`) and says it in numbers before anything changes: ticks cleared per
person, balances, the Stake, the Track record, who gets a notification, and
how long it can be undone. The hazard button names the reset. Afterwards the
toast offers Undo, and History keeps it.

Resetting and re-dealing only work on a week that hasn't closed; a closed
week is fixed one result at a time. A reopened John that is past due counts
as late if it's ticked now, and missed at the week's end, and the sheet says
so.

## Money

Shared-out money is never rewritten. When a forfeit goes (or comes) in a
month whose Stake is already shared out, it becomes a **correction** in the
month that's open: a `correction` ledger row giving the person the money back
(or charging it), and the rest of the house paying (or getting) it between
them, so the month still sums to zero. Letting off a month that's already
shared out hands back each person's net for that month the same way.
Corrections count in "this month so far", and are settled when the month
closes.

## Undo

Each reset is one History row (`house_actions.kind = 'reset'`) holding every
row it changed, as it was. Undo puts them back, for an admin, until the month
it touched (and the month its corrections went in) is shared out, and only
while nobody has ticked or flagged any of it since. A re-deal's undo brings
the old deal back.

## Telling people

Everyone a reset touches, except the admin, gets a push ("Glyn reset your
week") and the Wall says what happened. Undoing someone else's reset posts
"Sam undid Glyn's reset."

## Streaks and tokens

Streaks are counted again from the closed weeks after any reset or its undo
(`recount_streaks`), as the clock counts them. Tokens already earned stay
earned.

## Ask Jonz

An admin can say what went wrong in Ask Jonz ("Sam's tick was a mistake",
"reset this week"). For a house that's running, Jonz is told the last two
weeks' Johns and the moves History can still undo, each by a short ref
(`lib/moves/ask-resets.ts` `resetState`), and answers with the fixes in
those refs. The server turns refs into ids and asks the database what each
would change, as the reset sheet does; a ref Jonz made up, or a reset the
database refuses or that changes nothing, isn't offered.

The fixes come back on a **Resets card** in the chat: hazard tape across the
top, one ticked row per fix with its numbers in a line, who gets a
notification, and a hazard button "Reset N things". Unticking a row keeps
it. Nothing changes until that button; afterwards the card says what was
done, and Undo takes the resets back. An undo from History is offered as
its own row, and isn't undone again. Jonz can't start the house over,
delete it or wipe its history, only offer the resets above, at most six at
a time.

## Where it lives

- `supabase/migrations/20261101100000_admin_resets.sql`: `admin_reset` (the
  preview and the change, service role), `undo_reset`, `reset_reach`,
  `add_correction`, `recount_streaks`, `hand_over`, and the skipped week in
  `house_balances`.
- `apps/api/lib/moves/resets.ts`: who may ask, what forfeits cost (rules and
  House Pass), the re-deal, the pushes. `POST /api/resets` and Ask Jonz
  share it.
- `apps/api/lib/moves/ask-resets.ts`: what Jonz is told, and its fixes as
  the Resets card offers them (`components/house/resets-card.tsx`).
- `packages/core/src/resets.ts`: the request and preview, and the sheet's
  words (`resetSheet`).
