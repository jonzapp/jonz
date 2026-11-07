# Fair checks

## What it does

Closes the ways one housemate could use questions, votes, flags or admin powers against another before the roommate beta (beta review B1, S1, S4):

- **One voter can't strike alone at once.** When only one housemate can vote on a tick (a house of two, or a cover in a house of three), the question waits for the vote to close. Whoever ticked it can answer with a photo of it done, and that settles it: the tick stands.
- **A photo answers a question.** With more voters, the photo goes on the John and the question for the house to see, and the vote goes on.
- **A strike leaves time to redo it.** A struck tick always gets at least 12 hours (`redo_hours()`, core `REDO_HOURS`) before it can be marked missed, however late the strike came.
- **A cover is checked by the rest of the house.** Whoever's John was covered can't question or vote on the cover (`own_john`); their sheet says the rest of the house is checking it.
- **An on-call John is flagged once per window.** A housemate can't flag it again until its respond window has passed since the last flag that was done (`flagged_recently`). Whoever is on call can always flag it.
- **The check window is 12 hours or more** in a housemates' house (`houses_dispute_hours_fair`; choices 12, 24, 48, 72). Family houses keep 0.
- **An admin can't change their own result.** A result or person-week reset on yourself is refused (`own_result`) unless you're the only one in the house. Another admin, or a question from the house, can.

Left out on purpose: a "Doesn't need doing" answer to a flag. The once-per-window limit covers the spam case.

## Inputs and outputs

- `answer_dispute(p_dispute uuid, p_photo_path text) returns boolean`: true when the photo settled it (one voter), false when the vote goes on. Errors: `not_yours`, `vote_closed`, `photo_required`, `photo_path`.
- `disputes.photo_path` (new), shown as `DisputeView.answered`.
- Voters: core `votersOn(members, { userId, coveredBy })`, used by the engine, the push to voters and the board.

## Edge cases

- The photo must be in that John's folder (`<house>/<assignment>/...`); the coverer may upload while a question is open.
- Existing houses with a window under 12 hours move to 12.
- A struck flag (on-call) keeps the later of its own close and the redo time.

## Platforms

Same on iOS, Android and web; the photo comes from the camera or the library.

## Done when

- [x] In a house of two, a question waits for the close, then strikes with 12 hours to redo.
- [x] A photo from whoever ticked it settles a one-voter question.
- [x] The owner of a covered John can't question or vote on it.
- [x] A housemate can't re-flag a John just done after a flag.
- [x] A 0-hour window is refused; an admin's reset of their own result is refused.
