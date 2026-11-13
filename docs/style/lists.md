# Lists and rows

## Rows

- **One `Row` everywhere:** a 32pt leading slot (tick box, avatar or icon),
  a one-line title, a meta line, one trailing item (a value, a status mark
  or a text button), 56 to 64pt tall with 48pt targets. A John is always a
  `JohnRow`. (Focus, #17)
- **A row's words are never cut off with "…":** its meta line wraps onto a
  second line, and so does a value in words, the row growing to hold them.
  If two lines still aren't enough, shorten the words or move some into the
  meta line. (Cut-off words A, 10 Nov)
- **A row says what sets its thing apart, not what is usual.** On the John
  list a row is when it's due, then only what is unusual (every 2 weeks, a
  photo, its group, on call); the rest is in the John's own sheet. Each kind
  is a section with its count on the right, and the page's sum and Add a
  John sit over the list on a phone as on a laptop. (John list A, 10 Nov)
- **An admin's fixes are one row, not a row of buttons:** in a John's sheet,
  "Admin" holds one row, Fix the result, which opens the results to choose
  from in its place. (Admin fixes A, 10 Nov)
- A Wall item is a `Row` with a sentence that names its John and an icon
  that says what happened (a flag for a flag), never just "flagged". (Wall
  items A, #55)

## Groups and spacing

- One inset `Group` per section; a 16pt gutter plus 16pt inset; 8 from a
  section label to its group; 32 between sections. All from `SPACE`, `GUTTER`,
  `INSET`, `LABEL_GAP` and `SECTION_GAP`, never a typed number. (Focus, #17)

## Order

- **Urgent first,** not the order the data arrives in: what needs you, then
  what's next, then the rest. (UI review, 25 Oct) *Backed by* NN/g on
  progressive disclosure, and Nielsen's "aesthetic and minimalist design".
- Finished things fold away (`DoneFold`: "Done (3)", with how many were
  late). (Focus, #17)
- **Quiet news folds, news that matters leads.** On the Wall a day's ticks
  made on time (two or more) fold into one row at the day's foot, "3 ticked
  on time" with who under it, so misses, late ticks, disputes, perks and
  notices are read first. (The Wall A, 10 Nov)
- One home per thing: a John, a person, a setting each have one page or
  sheet; other places link to it rather than repeat it. (Focus, #17; fair
  shares, 28 Oct)

## Long lists

- **Load as you scroll,** the same way everywhere (the Wall, the
  audit log, any list that grows), with one shared foot: how far back,
  Loading more, That's everything, Try again. "Show more" stays for the
  keyboard and short pages. On a laptop the foot is pinned full width along
  the bottom. (Long lists A, 31 Oct, #82) *Backed by* NN/g: endless lists
  suit feeds but need a reachable foot and a keyboard way in.
- Never fetch a whole table into the app. (Admin lists, 31 Oct)

## Admin lists

Built for very many rows from the start. (Admin lists, 31 Oct)

- No day headings; a time column instead.
- Search and filters run on the server, with indexes, and only the visible
  rows are drawn.
- **One search everywhere:** a single smart box, filters as tags. The empty
  box lists the page's filters (Who, What, When or the page's own) and recent
  searches, so nothing is hidden. Filters stay in the link. A count and
  Download, a "14 new" pill, and "Show more like this" on an entry. (Busy
  lists B, 31 Oct) How it shows a search on its way is in
  [states](states.md#waiting). (Search loading A, 10 Nov)
- Lists of things page by 50; timelines load as you scroll and have a When
  filter. (Owner admin, 30 Oct)
- A list of things waiting on you (the Inbox) opens on everything, never
  hiding what's done: what needs you first as its own group, then everything
  else, each under its name and count ("Needs a reply, 3"). Search and
  filters narrow both groups at once and an empty group is left out; picking
  a state by hand shows one plain list. (Inbox two groups A, 13 Nov)

## Calendars and grids

- A month calendar shades days; tapping a day opens a sheet listing who.
  (Who's away F, #23)
- Today is an outlined whole day, never a filled circle or ring. (Who's
  away B, #23)
- A week-by-week grid for records over time (the Track record), with the
  breakdown one tap away. (Fair shares, 28 Oct, #35)

## Empty lists

Every list has a designed empty state: what will appear here, why it's
empty, and how to add the first one, with that action as its one button.
Never a blank group. (**New**) *Backed by* NN/g's guidance on empty states.
