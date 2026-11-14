# On-call Johns

Some Johns don't fall due on a day. The bins need taking out whenever
they're full, which might be twice one week and four times the next. An
on-call John has one housemate on call for the week; anyone flags it when it
needs doing, and the flag lands on that housemate's Today, due a set time
later. Chosen on 27 October 2026 as option A ("flag it") of the on-call
proposal. Rewarding someone for covering another housemate's John is a
separate feature.

## What it does

- In the John editor, an admin picks **When: On a day** (as now) or **On
  call**. An on-call John has **Do it within** (2, 4, 8, 12, 24 or 48 hours;
  12 by default) and **About how often** (1 to 7 times a week; 2 by default),
  which only weighs it in the deal.
- Each deal puts one sharer **on call** for the week by fair shares, counting
  the John as points × about how often. Nobody is handed an assignment for it
  up front, and the stored shares leave it out.
- **Today** has an **On call** section: each on-call John with who has it and
  how many times it's been flagged this week. Anyone taps **Needs doing** to
  flag it. Whoever is on call sees **Done it** instead, which flags and ticks
  it at once (a photo John is only flagged, then ticked with its photo).
- A flag is an ordinary assignment for whoever is on call, due the John's
  window after it was raised, with the John's points. Raising it adds its
  points to every sharer's share, split as any John is. It is ticked, checked
  by housemates, late and forfeited like any other John, and shows on the
  Wall ("Cal flagged Bins for Ben.").
- Flagging a John that's already flagged hands back the open flag.
- **A Done it counts once.** For 10 minutes after one, the row shows a green
  Done mark instead of the button, and the database refuses another Done it
  on the same John from the same person (`just_done`). Housemates can still
  say it needs doing.
- **Taking back a Done it leaves nothing to do.** Undoing its tick, from the
  toast, the John's sheet or History, takes the flag with it, its points
  and Wall post included. A flag a housemate raised stays open when its tick
  is taken back.
- **Remove flag**, on an open flag's sheet, for whoever raised it and for
  admins. Whoever is on call can't take down a flag someone else raised
  (the sheet says who can). A flag opened again after a miss can only be
  taken down by an admin. Added 30 October 2026.
- A flag never swaps and never hands over. It is **missed** at twice its
  window, or at the week's end if it's already overdue then. A missed flag is
  its holder's miss, and a fresh flag opens for whoever is on call now, with
  a push.
- If whoever is on call is away today, the flag goes to the fairest sharer
  who is home.
- **Week** shows who is on call for what in each housemate's group.

## Inputs and outputs

- `raise_flag on /v1` with `RaiseFlag {johnId}` answers `FlagResponse {ok,
  assignmentId}`. A bad body is 400 "Say which John needs doing."; refusals
  are 409 in words.
- SQL: `raise_flag(p_john)` for housemates; `remove_flag(p_assignment)`; `open_flag`, `closes_at` and
  `deal_week(…, p_on_call)` for the engine. New columns `johns.kind`,
  `respond_hours`, `per_week`; `assignments.flagged_at`, `flagged_by`; table
  `on_call`; event kind `flagged`.
- Refusals: `not_on_call` (the John is due on a day), `not_dealt` (the week
  hasn't been handed out), `nobody_home` (everyone who shares it is away),
  `not_swappable` (a flag offered in a swap), `just_done` (a second Done it
  within 10 minutes), `not_your_flag` and `flag_settled` (removing a flag).
  A week with a flag in it can't be re-dealt.

## Edge cases

- A flag raised late on a Sunday stays with its holder into the next week:
  Today reads open flags from earlier weeks, and the old week closes once the
  flag settles (at most twice its window late).
- An archived on-call John drops off Today and isn't dealt.
- A house with no on-call Johns shows no On call section.
- Turning a John from on a day to on call takes effect at the next deal.

## Platforms

Same on iOS, Android and web. The push for a flag uses the existing push
path.

## Done when

- [ ] An admin can make a John on call and set its window and how often.
- [ ] The deal puts someone on call, shown on Today and Week.
- [ ] Anyone can flag it; whoever is on call gets it on Today with a push.
- [ ] Whoever is on call can say Done it without a flag.
- [ ] A flag left too long is missed on its holder and opens again.
