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

- **Waiting on the AI:** three square ticks fill in turn with a shimmering
  step line, then fold to "Thought for 5s", which opens to the steps.
  (Thinking A, #69) *Backed by* Nielsen's "visibility of system status".
- **Loading** shows the page's shape (its groups and rows, blank), not a
  spinner in empty space. A wait under about a second shows nothing at all.
  (**New**) *Backed by* NN/g on skeleton screens versus spinners.

## Mistakes

- **A done-type tap can't fire twice,** and a mistake can be undone from the
  same place it was made. (On-call taps, #62) *Backed by* Nielsen's "error
  prevention".
- **"Are you sure?"** (`ConfirmSheet`) only for a move that can't be undone.
  Everything else happens at once and offers Undo. (Undo, #47) *Backed by*
  NN/g: confirmations used for everything get tapped through unread.
- **An error** says what went wrong and what to do, in one sentence, with Try
  again where trying again can help. Refusals from the database come through
  `humanError` in core. (AGENTS.md) *Backed by* Nielsen's "help users
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
