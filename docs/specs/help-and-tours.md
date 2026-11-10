# Help and tours

## What it does

A question mark in the title bar of every tab opens Help. It leads, as
help centres do, with the two ways to find something out: Ask Jonz (the
chat, for anyone who may use it) and Read the guide. Then Show me around:
the tours, the page you're on first ("This page"). Then the ways to report a
problem or send an idea (the same ones as the You page's Help section, #87). A
tour dims the page, lights one part of it at a time with an amber ring, and
says what it is in a card beside it. Someone new is offered Today's tour
once, on Today; Not now puts it away for good.

## Inputs and outputs

- Tours are data in `@app/core` (`TOURS` in `tours.ts`): a title, the page
  it starts on, who it's for, and up to five steps. A step names a spot
  (`TOUR_SPOTS`), its words, and optionally another page and a condition
  (`admin`, `phone`, `laptop`, `toCheck`, `hasJohns`).
- A screen tags a spot with `<TourSpot id="today.nextUp">`. It draws
  nothing; the tour player measures it and brings it into view.
- `TourProvider` (in the house layout) plays a tour: it opens the step's
  page, waits for the spot, skips a step whose spot never shows (2.5s), and
  places the card with `placeTourCard` (pure, tested in core).
- Which tours you've seen, and whether you've been offered Today's, are
  saved on your account (`user_metadata.tours = { seen, offerDone }`). No
  table and no migration.
- The first four tours: Today, Week, House, and Setting up your house (for
  admins, across the John list, the rules, Week and Today).

## The guide

- Read the guide opens `/house/guide`: How Jonz works, grouped (Getting
  started, How it works, Money, and Your family in a family), each topic a
  page at `/house/guide/<topic>`.
- A page's words are `howItWorks(topic, …)` from core's `how-it-works.ts`,
  with the house's own Stake, hours and prices: the very words Ask Jonz
  reads with its `how_it_works` tool, so reading and asking agree. Today,
  Week and House are written from their tours' steps, so the guide and the
  tour say the same.
- Every guide page ends with Ask Jonz about this (when you may ask), and
  Jonz can point to the Guide with a page chip.
- Adding a topic: add it to `HOW_TOPICS`, `howItWorks`, its `door.guide.topic.<topic>` words and a
  section in `GUIDE_SECTIONS`; the core tests check every topic is listed.

## Adding a tour

1. Add its spots to `TOUR_SPOTS` and its entry to `TOURS` in core. The core
   tests check the limits (five steps, short words, sentence case, no
   "rota").
2. Wrap each spot on its screen in `<TourSpot id=…>`.
3. Add it to `client-tours.spec.ts`'s walk-through, which fails if a spot
   goes missing from its page.

## Edge cases

- A spot that isn't drawn (nothing to check, no Johns yet) is left out by
  its step's condition, so the count is what you see. One that still
  doesn't show after 2.5s is passed over rather than dimming nothing.
- Taps on the dimmed page do nothing: a tour shows, it never asks you to use
  the app. Skip on every step but the last; Escape or a phone's back skips.
- Turning the phone or resizing the window measures the spot again.
- Signed out, or outside a house: no question mark and no tours.

## Platforms

- Web: arrow keys step through, Escape skips, the browser scrolls the spot
  into view.
- iOS and Android: the spot's page scrolls to it (the Screen's own scroll or
  one of its columns); the card is announced to screen readers as it
  changes.

## Done when

- [ ] Every tab has the question mark; Help leads with Ask Jonz and Read
      the guide, then Show me around (this page first, "Seen" marks), and
      the report rows.
- [ ] The guide lists every topic for the kind of house, and each page
      shows the house's own numbers.
- [ ] Every tour plays to Done on a phone and a laptop with each spot lit
      and the card clear of it (`client-tours.spec.ts`).
- [ ] Someone new sees the offer once; Show me, Not now and Skip all put it
      away for good, after a reload too.
