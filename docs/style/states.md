# States and feedback

## Where a John has got to

**One status map,** `STATUS_MARK` in core, for Today, Week, the John sheet
and the Wall: upcoming shows nothing; due soon an outline mark with a clock;
checking an outline mark with a tick; done a green tick; late a hazard clock
and "Late"; overdue a hazard triangle; missed a hazard X; disputed a hazard
flag; excused a quiet shield. Overdue and missed rows also wear the 4pt
hazard edge. Today's next John's plate turns hazard once it's overdue.
(Focus, #17; #60)

## Waiting

Every wait in Jonz looks one way (loading kit, picked 9 Nov). Nothing shows
for the first third of a second (`WAIT_DELAY`, 300ms), so a fast read never
flashes; once something shows it stays at least another 300ms (`WAIT_MIN`),
so it never blinks. Outlines breathe gently, all together, and hold still
when the phone asks for reduced motion. *Backed by* Nielsen's "visibility of
system status", NN/g on skeleton screens versus spinners (skeletons for
whole pages, a spinner only inside the control that is busy), and Material's
progress indicators (a linear line for a list refreshing in place).

- **A page's first read** shows the page's own shape in outline: its plate,
  its section labels and groups, rows as soft bars where the avatar, title
  and meta line will land (`Waiting` with pieces from `outline.tsx`). Never a
  spinner in empty space.
- **One part of a page** (the Table, the Wall, the Stake) keeps its real
  label, and its group holds outline rows until it has read, so the rest of
  the page can be used and nothing below it jumps.
- **A panel or a sheet** (an admin panel, Reset, Delete account, Ask Jonz
  opening) shows its heading, text, rows and buttons in outline, like a page.
- **A button after a tap** puts a spinner where its icon was and its words
  say what is happening ("Marking done", "Leaving", "Sending"). It keeps its
  colour, so it reads as working, not switched off; the other buttons in its
  row go pale until it's done. It can't be tapped twice. (`Button busy`,
  `busyLabel`; lint: `jonz/busy-not-disabled`.) The tick box spins the same
  way.
- **A long list finding a new search** shows it heard you from the first
  key: the search box's magnifying glass becomes a spinner and the count
  says "Searching…" (never the last search's number, which would pass for
  this one's) until the answer is in. After 300ms the old rows dim and a
  thin line runs under the box (`SearchLine`, `Dimmed`), so you keep your
  place. Nothing on the page moves while you type: the box's suggestions
  float over the rows, and words alone, which the list already searches as
  you pause, offer none. The box is never drawn afresh while you type in
  it, whatever the list does (no match, rows back), so the cursor stays.
  Loading more at the bottom is the list's foot ("Loading more"),
  unchanged. (Search loading A, 10 Nov)
- **A photo** holds its space as a box in the outline's tint, breathing,
  then fades in over 200ms (`Photo`). Nothing below it moves. An avatar shows
  its initials, then fades to the photo.
- **Opening Jonz** shows the J sign in the middle of the page's ground, Day
  or Night, as the phone apps' splash does: drawn in the web page itself
  (`public/index.html`) so it shows at once, then by `StartSign` until the
  app is ready. Never a white page.
- **An empty state** shows only after a read has finished with nothing in
  it, never while it is still reading.
- **A chat never opens on nothing:** under Jonz's greeting, three questions
  to tap ("Who has what this week?"), each sent as written; they go once
  the chat has begun, and aren't offered where the house can't ask. (UI
  review small fixes, 10 Nov)
- **Waiting on the AI:** three square ticks fill in turn with a shimmering
  step line, then fold to "Thought for 5s", which opens to the steps.
  (Thinking A, #69)

A spinner on its own is only for the kit's pieces (a busy button or tick,
the list's foot); anywhere else the lint rule `jonz/no-bare-spinner` stops
it.

## Mistakes

- **A done-type tap can't fire twice,** and a mistake can be undone from the
  same place it was made. (On-call taps, #62) *Backed by* Nielsen's "error
  prevention".
- **"Are you sure?"** (`ConfirmSheet`) only for a move that can't be undone.
  Everything else happens at once and offers Undo. (Undo, #47) *Backed by*
  NN/g: confirmations used for everything get tapped through unread.
- **Changes someone else drafted (Ask Jonz) wait on one card,** sorted by
  what they do: Taking off first, with the hazard minus, so a loss is never
  missed under the adds; then Changing, before → after; then Adding. Each is
  ticked and can be unticked; one button applies the ticked ones. (Ask Jonz
  edits, this PR) *Backed by* Nielsen's "visibility of system status" and
  "user control and freedom": the person sees every change and its effect
  before it happens.
- **An error** says what went wrong and what to do, in one sentence, with Try
  again where trying again can help. Refusals from the database come through
  `humanError` in core, never as the database's own words. A read that fails
  shows `ReadFailed` (the sentence and Try again) in its place, in a panel or
  a sheet too. (AGENTS.md; loading kit, 9 Nov) *Backed by* Nielsen's "help users
  recognise, diagnose and recover from errors".
- A screen that throws shows the root error page with "Try again".
  (AGENTS.md)

## Motion

Short and gentle (about 200ms), only to show where something came from or
went. It switches off when the phone asks for reduced motion. (**New**)
*Backed by* the HIG's Reduce Motion and WCAG 2.3.3.

## Tours

A tour dims the page and lights one part at a time with an amber ring and a
card beside it: a title, a sentence, and Skip, Back, Next (Done on the
last). Five steps at most, each title 32 characters and each sentence 140.
You start tours from Help; the only one offered is Today's, once, to
someone new, as a card on Today (never a pop-up over it). A tour never asks
you to tap the page: it shows, then gets out of the way. (Help and tours,
1 Nov)
*Backed by* Chameleon's tour data (tours you start finish twice as often;
3 to 4 steps finish best), Adobe Spectrum's coach marks, NN/g on help.

## Notices

An owner notice is a banner in its kind's colours across the top of the app;
the same notice in an email is the Panel shape. (Owner admin #72; email
Panel, 31 Oct)
