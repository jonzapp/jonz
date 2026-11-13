# Undo and History

> 13 Nov 2026: History is gone as a list (Glyn: the Wall says it already).
> Each move's Undo is in the sheet that opens from its post on the Wall
> (`undoForPost`) or from its John (`undoableOn`), read from
> `house_history`; an old link to History lands on the Wall. The rules
> below are unchanged.

Design: https://claude.ai/artifact/WMLo693iKzjmhLMyzE5snL (Glyn picked the
whole package, 29 Oct 2026). This is step 1 of 3: undo and History. Step 2
is admins and resets, step 3 Ask Jonz for both.

## What it does

Every move someone makes in the house can be taken back. Right after it,
the toast says what happened with **Undo** for ten seconds. Later, House ›
Setup › **History** lists every move, newest first, with Undo on the ones
that still reach.

## Who can undo, and how far back

One rule for every move (`undo_reach` in the migration):

- **Your own, while it's open.** Whoever did it can undo it until it
  settles: a tick until it stands (or its John closes), a swap or a flag
  while neither John is ticked, immunity until the week closes, a dispute
  until someone else votes, a vote while voting is open, a payment for
  seven days, time away until it's over.
- **Admins, until the month is shared out.** Any admin can undo anyone's
  move, settled or not, until its month's Stake is shared out. A settled
  tick goes back to open, its forfeit goes, and the clock settles it again
  (missed, if its John has closed). The person whose move it was sees
  "Glyn undid your tick on Bins." on the Wall.
- **After that, nothing.** Shared-out money isn't rewritten; fixing a
  closed month is a correction (`docs/specs/admin-resets.md`).

Still blocked, as before: a tick under dispute, and your own tick once a
housemate has covered it.

## What's recorded

`house_actions`, written by triggers on `events`, `dispute_votes` and
`members`, so every move is recorded however it's reached (the app, a
notification's button, Ask Jonz) and the move functions stay as they were:

| kind | from | undo puts back |
| --- | --- | --- |
| tick | `mark_done` | the John open, its forfeit gone |
| cover | `cover_john` | the John open for its owner |
| flag | `raise_flag` | no flag; its share off everyone |
| swap | `use_swap` | both Johns back, the token back |
| immunity | `use_immunity` | the John open, the token back |
| dispute | `raise_dispute` | no dispute |
| vote | `cast_vote` | no vote |
| payment | `confirm_payment` | no payment |
| away | `set_away` | as `cancel_away`, for whoever it was |
| role | `set_member_role` | the role before |
| remove | `remove_member` (by an admin) | them back, with streak and tokens, within 7 days; the join code stays new |

Leaving yourself isn't recorded (rejoin with the code). The engine's own
writes aren't moves and aren't recorded.

## Inputs and outputs

- `house_history(p_house, p_before?, p_limit?)`: moves with `reach`
  (`own`, `admin` or null) for whoever asks.
- `undo_action(p_action)`: the Undo in a post's or a John's sheet.
- `undo_latest(p_kind, p_about?)`: the toast's Undo, your latest move of
  that kind about a John, dispute or housemate.
- Refusals: `cannot_undo`, `already_undone`, `last_admin`.

## Edge cases

- A move undone twice: `already_undone`.
- Ticked, struck by a dispute, ticked again: only the latest tick undoes.
- A removed housemate who has joined another house can't be put back.
- Streaks and tokens already earned when a closed week's tick is undone
  stay as they were; step 2's resets work them out again.

## Platforms

The same on iOS, Android and web. The toast's button is a thumb tall with
its hit slop, and says "Undo: Marked done." to a screen reader.

## Done when

- [x] Ticking, flagging, swapping, voting, disputing, paying, booking away,
  and changing or removing a housemate each offer Undo in the toast.
- [x] History lists them, Everyone or Mine, with Undo while it reaches.
- [x] An admin undoing someone else's move tells them on the Wall.
