# Shared Jonz

Johns done together, and help on any John. Asked for on 29 October 2026,
with any-length repeats (`any-length-repeats.md`): a general way to do a
John as a group, track who took part, and add someone who helped. Glyn
picked the roll call (option A of the design page) the same day.

The one rule: **a John's points are shared evenly by everyone who did it.**

## What it does

- A John has **Done by**: one person (as before), 2 to 6 people, or
  **everyone home**. Its effort is per person, so a garden tidy for 3 at 4
  pts is 12 pts of work in all; the editor says so under the choice ("4 pts
  each, so 12 pts in all"). On call stays one person: whoever is on call.
- **The deal** hands a John done together out as one place per person, each
  worth its points, linked by a job (`assignments.job_id`). Each place goes
  to whoever home that day is furthest behind and isn't on the job yet, with
  the usual nudge away from whoever had it last time. Never more places than
  sharers home; "everyone home" is one each for them.
- **The roll call** ticks it. Mark done on a John done together opens "Who
  did it?": you first (whoever ticks it did it), then everyone else with a
  place, all ticked. Untick someone and it says "Counts as a miss for Sam".
  "Add someone who helped" adds anyone else in the house. Under the list,
  the split: "12 pts ÷ 3 · 4 pts each". A John done by one keeps its one-tap
  Mark done, and gains **Done with help**, the same roll call.
- One roll call settles **every place of the job at once**: done for each
  holder on it, left off (`assignments.absent_at`) for each holder who isn't.
  Everyone on it shares the points of the places it settled, helpers
  included (bins at 2 pts done with help is 1 each).
- **Left off** is a miss once the roll call stands: no points, the missed
  forfeit, a broken streak. Their part goes to whoever did it (the split
  above), and their forfeit is shared among whoever did it at month close
  (`ledger.doers`), as a covered John's goes to its coverer. Someone away
  keeps their place excused; if they turn up anyway, their place's points
  join the share.
- **Nobody does it**: every place misses. Once past the grace, someone with
  no place in it can cover the whole job (every open place), and gets all of
  it.
- **Undo and resets** (after Undo and History, and admin resets): taking a
  roll call back any way (the toast's Undo, History, an admin) opens every
  place it settled and drops its crew; a cover of a job taken back opens all
  it covered. An admin changing one place's result, or putting one person's
  week back to open, takes that place's points out of the share and its
  holder off the crew; the rest share what's left. Kept by triggers
  (`job_follows`, `left_off_settled`), so undo_action and admin_reset stay
  as they are.
- **Checks**: one check per roll call. It's checked on the place it was
  ticked from (`checked_place`); anyone named or left off can dispute it.
  Upheld opens every place again and the roll call goes. Undo takes the
  whole roll call back, and only whoever ticked it can.
- **The Table** counts each person's share (late halves it, as ever).
  Helping adds points but not to your streak, and the Track record has a
  **Helped** line. **Why?** says "Needs 3. You, Sam and Ada were furthest
  behind of the 4 home.", and once ticked, whose work it counted as.
- **Week** shows each John done together once, under **Together** on a
  phone, and as one row in the laptop's table; each person's group still
  counts their place.
- **Notifications**: everyone the roll call names hears "Glyn added you to
  Garden tidy, +4 pts" ("It counts as your work. If you didn't help, say so
  on the John."); anyone it left off hears "Glyn ticked Garden tidy without
  you" ("That counts as a miss for you. If you were there, dispute it on the
  John."). Both are the "checks" kind of push.
- **Ask Jonz** drafts Done by ("the whole house does the big clean together").

## Inputs and outputs

- Migration `20261102090000_shared_jonz.sql`, additive:
  - `johns.crew` (1 to 6, or 0 for everyone home; 1 on call:
    `johns_crew_on_call`).
  - `assignments.job_id` (places of one job; unique per person:
    `assignments_one_place_each`) and `absent_at` (left off a roll call;
    never with a tick, a cover or an excuse: `assignments_absent_shape`).
  - `crew` (`job_id`, `user_id`, `assignment_id` of the place it was ticked
    from, `house_id`, `helper`, `points`): who did a John and what each
    earned. Members read their house's; only the functions write.
  - `ledger.doers`: who a left-off place's forfeit goes to at month close.
  - `roll_call(p_assignment, p_crew uuid[], p_photo_path)` answers how many
    did it. Refusals: `not_in_crew`, `left_off`, `already_done`,
    `photo_required`, `not_in_house`. `mark_done` refuses a place in a job
    (`roll_call_needed`); `undo_done` on someone else's roll call is
    `not_your_tick`; a swap within one job is `same_job`.
  - Changed: `my_open_assignment`, `mark_done`, `undo_done`, `cover_john`,
    `undo_cover`, `raise_dispute`, `resolve_dispute`, `settle_assignments`,
    `house_balances`, `deal_week`, `use_swap`, `set_away`; new
    `checked_place`.
  - Events: a roll call's `done`/`late` row adds `data.with` (everyone else
    on it), `data.absent` (holders left off) and `data.total`; a cover of a
    job adds `data.for_all`.
- `roll_call on /v1` `{ assignmentId, crew, photoPath? }` →
  `{ ok: true, people }` (`RollCallRequest`, `RollCallResponse`). The client
  goes through the API so the server can tell the people it names.
- `@app/core` `crew.ts`: `crewByJob`, `tableInputs`, `rollCallPlan`,
  `rollCallStart`, `jobPlaces`, `rollCallPlace`, `crewLine`; `deal.ts`
  `togetherPlaces`; `points.ts` `standings(rows, members, jobs)`.

## Edge cases

- Fewer sharers home than Done by: fewer places, never two for one person.
- A roll call racing another settles once (the job's places are locked).
- Someone named who has since left the house: refused (`not_in_house`).
- A place handed on because its holder is away goes to a sharer home who
  isn't on the job; with nobody, it's excused.
- Swaps never trade into a job you're already on.

## Platforms

The same on iOS, Android and web. Push reminders on a place in a job have no
Done button: the tick needs the roll call, in the app.

## Done when

- [x] Done by on the John editor, with what it adds up to.
- [x] The deal hands out one place per person on one job.
- [x] The roll call with helpers, its split, and the notifications.
- [x] Shares through balances, the Table, Track record, Why? and the Stake.
- [ ] A helper's own "I helped" from a John they hold no place in (later).
- [ ] Undoing an admin's week reset brings back the ticks but not who did a
      roll call (its crew), and a reset's preview counts a roll call's
      places as their holders' (later).
