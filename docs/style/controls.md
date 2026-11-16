# Buttons and controls

## Sizes

- **Every control is at least `TAP` (48) tall,** links included (`TextLink`,
  or `Button` with `href`). (AGENTS.md) *Backed by* Material's 48dp, above
  the HIG's 44pt and WCAG 2.2's 24px minimum.
- An icon beside a control's words is `ICON` (20); the glyph in an icon-only
  control is `ICON_ONLY` (22) in a `TAP` square. (**New**)

## Kinds of button

- `Button` `primary` (amber): the one thing to do on a screen, **at most one
  per screen**. `outline`: the secondary. `ghost`: no edge. `hazard`: a
  choice that strikes something out, edged in hazard, words in ink.
  (Focus, #17)
- `TextButton`: a quiet action or a link onward (Undo, See all, Change
  dates ›). (Focus, #17)
- One of a pair you pick from (the vote) uses `chosen`: ink edge on the
  tint, never amber. (Focus, #17)
- **A button on its own fills its column on a phone** (Deal week 1, Copy
  key, Send report, Try again). On a laptop it still fills a card, a sheet,
  a form or a side panel (Today's setup card, Copy key). One on the bare
  page (an empty page's action, Re-deal under the list, Try again) keeps
  its own width at the leading edge of a laptop column wider than
  `FORM_MAX` (520), never stretched across a page (`ButtonRow atEdge`).
  (Copy key A, #75; Week's Deal week 1, 7 Nov) *Backed by* GOV.UK's
  buttons, full width on a phone and their own width from a tablet up, and
  Material's guidance against full-width buttons on wide screens.
- That is a `ButtonRow` with one button in it. **Every `Button` sits in a
  `ButtonRow`**, alone or with others, so no screen decides a button's width
  by hand. The lint rule `jonz/button-in-row` refuses a `Button` laid
  straight in a `View`, and `e2e/client-buttons.spec.ts` measures Week,
  Today, House, its pages and a John's sheet on each phone and the laptop.
  An icon-only button is exempt (it's a square), and so is a button sharing
  its line with words or links: Next up's Photo, the John list's Add a John
  beside its count, the tour's Next beside Back and Skip.
- Screens never restyle a button: no `style` on `Button`, and no hand-made
  `Pressable` dressed as one outside `components/`. (**New**, enforced by
  lint)

## Buttons together

- **Buttons side by side are equal widths,** never sized to their words.
  When they don't both fit on one line (below `NARROW`, or when a label
  would wrap), they stack at full width, the main action first. Use the
  shared button row; never lay one out by hand. (**New**, from the bug
  report drafts, 31 Oct) *Backed by* the HIG's two-button alerts, which sit
  side by side at equal widths and stack when a label is too long, and
  GOV.UK's button groups.
- That is `ButtonRow`: equal shares of the line while each button has at
  least `BUTTON_MIN` (136) and every label fits on one line; otherwise a
  full-width stack. `stacked` keeps it a stack (the front door on a phone).
  The lint rule `jonz/no-hand-made-button-row` refuses buttons laid side by
  side any other way.
- **The one exception** is Today's Next up: Mark done fills the line and
  Photo keeps its own width beside it (an icon alone on a small phone), as
  Focus drew it. (Focus, #17)
- A primary and its secondary are the same height and width, whether side
  by side or stacked. (**New**)

## Danger zone

- **A move that can't be taken back sits in a Danger zone** (`DangerZone`),
  GitHub's way: one group edged in hazard, labelled "Danger zone". What
  counts is the registry's `destructive` (`isDangerous` in core), the same
  flag that holds a move for approval over /v1 and MCP, so the app, the API
  and Ask Jonz never disagree. (House reset, #218, 11 Nov)
- On a page it goes at the foot of the page that owns the moves, each a
  `DangerRow`: what it does on the left, a `hazard` button with an icon on
  the right, under the words at full width when the row is too narrow. The
  button only opens the move's own sheet, which says what goes and what
  stays; resetting, deleting or leaving a house also asks for the house's
  name typed, and deleting your account for DELETE.
- Your own moves have their own Danger zone at the foot of You, for
  everyone: Leave the house and Delete my account (moving out, which can
  change, stays above it). (You Danger zone B, 11 Nov)
- On an Ask Jonz card (a house's or the owner's), `MoveList` puts the moves
  that can't be undone after the others, in their own Danger zone, and the
  card's button turns `hazard` with a warning icon while one is ticked. A
  card of nothing else keeps its own label on the zone.
- Screens never draw a hazard edge by hand: a new danger move goes in a
  `DangerZone`. The style page shows one.

## Icon buttons

- Close, `•••`, the sparkles and any other icon-only control are an
  `IconButton`: one size
  (a 48 square, 20 icon) with one look: no edge, or the outline button's
  edge. Never a heavier ink border. Each has a spoken name. (**New**)
  *Backed by* Nielsen's "consistency and standards" and WCAG 4.1.2.
- **A toggle shows its state in its icon,** with no grey square behind it
  while it's on. (Sparkles A, #48)
- **An icon-only control names itself on a laptop:** its name in a small
  ink label under it (a `Tooltip`), once the mouse has rested on it for half
  a second, or straight away when the keyboard lands on it. It runs toward
  the middle of the window, never off its side, and goes when the mouse
  leaves, it's pressed or focus moves on. Every `IconButton` has one, from
  its spoken name; a phone has none, as a finger can't hover. (Kit plan,
  Tooltip, 15 Nov) *Backed by* WAI-ARIA's tooltip pattern and the HIG's
  help tags.

## Inputs

- A chat's message box grows as you type to about 5 lines, then scrolls;
  the send arrow sits inside the box. (Ask Jonz, #37)
- In a chat's message box on a computer, Enter sends and Shift+Enter
  starts a new line, as in other chat apps. On a touch screen (a phone, a
  tablet without a mouse) and in the phone apps, Return is a new line and
  the arrow sends. (Ask Jonz Enter, 10 Nov)
- Forms sit in a column capped at `FORM_MAX` (520) on a laptop. (**New**)
- **Picking one from a list is a `Select`** (shadcn's Select): a box like a
  text box showing what's chosen, with a chevron and its name over it;
  pressed, its list floats under it (over it near the window's foot), the
  chosen one ticked, each with its line on what it does, and picking one
  puts it away. The same on a phone and a laptop: the house rules, a John,
  Start your house's currency and first day. (Kit to shadcn's breadth,
  Select A, 15 Nov; was a row that opened in place, `PickRow`, and grey
  switches on Start your house) A radio or checkbox in a list is a
  `ChoiceRow`.
- **The small Select** has no box and no name over it: the chosen words in
  bold ink with a small ⌄, sitting where a See all would, its words ending
  at the edge, beside a section's heading or at a row's end (Language, each
  John on Your preferences, the Table's This week | October, the owner's
  Overview, a parent's switch to a kid's Today). It opens the same list as
  the Select. (Small picks A, 16 Nov; was the Select's edged box sized to
  its words, which read as a form in a list)
- **A John's effort on a laptop is a `Slider`** (shadcn's Slider): its
  name over it with the points at the end ("8 pts"), the grey track inked
  up to a round knob, and 1, 5 and 20 marked under it, as the John list's
  hint names them (the bins, a deep clean, a whole day). Drag the knob,
  click the track, or use the arrows (Page Up and Down by five, Home and
  End to the ends); the knob wears the focus ring. A screen reader hears a
  slider and its points, which swiping up and down changes. On a phone
  effort stays a `Select`, where a thin knob is fiddly under a thumb. (Kit
  plan, laptop extras, 16 Nov; was a Select of 1 to 20 on a laptop too)
  *Backed by* shadcn's Slider and WAI-ARIA's slider role.
- **A text box with something inside it is an input group** (`InputGroup`,
  `InputBox`): a search's magnifier at its start, a password's Show at its
  end (every password box), an address's Copy at its end (`CopyLine`), all
  in the one edged box. (Kit to shadcn's breadth, 15 Nov)
- **Turning one thing on or off, straight away, is a `Switch`:** a track
  with a knob, dark and to the right when on (ink, never amber), pale and to
  the left when off. The whole 48 square round it takes the tap, and a
  screen reader hears a switch, its name and whether it's on (Reminders'
  kinds of push). Choosing several things in a list stays a tick box
  (`ChoiceRow`), and so does a setting saved with the rest of a form. (Kit
  to shadcn's breadth, 15 Nov; was an On | Off `Segmented`) *Backed by*
  Apple's and Material's switch guidance and WAI-ARIA's switch role.
- **A choice from a long list** (the house's time zone) is a `Combobox`:
  the Select's box, opening a search box over the likely ones first under
  Suggested, then the whole list A to Z, each row saying enough to check it
  (a zone's offset and its time now). Typing narrows it by any word. On a
  laptop it drops from the box as a card (rising over it near the window's
  foot, as a Select's list does); on a phone it opens as a sheet.
  (Search by city, 14 Nov; Combobox, 15 Nov)
- **Picking a day in a form is a `DateField`** (shadcn's Date Picker):
  the Select's box showing the day in words with its year ("Tue 15 Dec
  2026") and a calendar mark; pressed, a `Calendar` floats under it on a
  laptop (over it near the window's foot) and opens as a sheet on a phone,
  and tapping a day puts it away. Never a day typed as 2026-12-31 (a
  promotion's last day). A page whose whole job is picking days keeps the
  `Calendar` open on it (moving out, time away's sheet). (Kit to shadcn's
  breadth, 15 Nov; was a typed day)
- **A few quick choices side by side are a `Segmented`,** wrapped into
  equal rows with `perRow` where the words don't fit one row; never pills
  of our own, and the chosen one is never amber (the John editor's How
  often, By what time and Done within, 13 Nov). A count with − and + uses
  `IconButton`s with the outline edge.
- **What period a section shows (this week or this month) is the small
  `Select` beside its heading,** showing the chosen one, as the House Table's This
  week | October and the owner's Overview figures do. A switch across the
  top of a page (the track record's span, a tab's pages) stays a
  `Segmented`. (Glyn, one selector for one job, 14 Nov)
- **A colour is picked from dots, then any colour** (`ColourPicker`): the
  eleven ready colours as round dots, six to a row, the twelfth the rainbow
  dot, which opens a shade square, a hue track and the colour's code under
  them. The chosen dot wears a ring and a tick; each dot shows as its lid
  will in this scheme. Each has a spoken name (Brown, Sky blue), and the
  square and track can be moved with a screen reader. (Colour picker, 14
  Nov) *Not* named bin lids, a picker of our own design, or a full picker
  always open: the dots are what label apps (Linear, Notion, GitHub,
  Google Calendar) lead with.
- **A menu opened from a control drops from it on a laptop** (from `WIDE`:
  the "•••", `DropMenu`), its right edge on the control's, put away by a tap
  anywhere else or Escape; on a phone it is a sheet. A Select's list drops
  the same way on any screen. (••• menu A, 13 Nov; Select A, 15 Nov)
- **A number or a rule explained opens a `Popover`:** on a laptop a small
  card floats beside what you tapped, its right edge on its opener's, with
  its title, a line on what it is and the detail (Week's fair shares; the
  Table's How points and the stake work). A tap anywhere else or Escape
  puts it away. On a phone the same opens as a sheet. (Kit plan, Popover,
  15 Nov) *Backed by* WAI-ARIA's dialog pattern (non-modal) and shadcn's
  Popover. A John's "Why?" stays a section of its own sheet.
- **Sign-in and password boxes work with password managers.** On the web
  each step is a real form (`SignInForm`), Enter sends it, the email box is
  `username` and a new password is `new-password` (with `passwordRules` on
  iOS); where the step has no email box, `HiddenUsername` names the account.
  No spellcheck or autocorrect on either. (Glyn, 1 Nov) *Backed by*
  Chrome's and Apple's password autofill guides.
- **Making an account asks for one name box**, not first and last: what
  your housemates call you. Agreeing to the Terms (and being 13 or older)
  is a tick box you must tick, not a line under the button; no birthday.
  (Glyn, 1 Nov) *Backed by* W3C and GOV.UK guidance on names.
- **A short code is six boxes** (`CodeBoxes`): the admin code and the codes
  we email. The six are equal and span the column edge to edge with the
  button, each a little taller than wide (48 to 64). One real field lies
  over them, so a phone or password manager can fill in the code
  (`one-time-code`), paste works with a space or dash in it, and a screen
  reader hears one field. The code is checked on its sixth digit unless the
  step still needs more (a new password); after a wrong code, the next digit
  starts it over. (Code boxes, 1 Nov) *Backed by* Apple's and the HTML
  standard's one-time-code autofill and WCAG 1.3.5 (input purpose).

## One move, one place

Every John action (tick, photo, undo, immunity, swap, dispute, vote) lives in
the John sheet, opened by tapping that John anywhere. (Focus, #17)

## State and focus

- A chosen, ticked or pressed state is an `aria-*` prop (`aria-checked`,
  `aria-selected`, `aria-disabled`; `aria-pressed` and `aria-expanded` on the
  web), never `accessibilityState`, which react-native-web ignores.
  (AGENTS.md)
- **One focus ring for everything:** the control's edge turns `ring` (ink
  by day, amber after dark) with a soft 3pt halo of it round the outside
  (`focusRing` in `theme.ts`); a row draws it inside its own edges. A box you
  type in (a `Field`, `SearchBox`, an admin list's search, the chat box, the
  code boxes' next box) wears it while you type. A button or a row shows it
  only when the keyboard brought you there, never after a tap or a click, and
  never on a sheet's close button just because the sheet opened
  (`FocusRings`, the browser's `:focus-visible`). (Look A, 15 Nov) *Backed
  by* WCAG 2.4.7 and 1.4.11, and the browser's focus-visible behaviour.
- **A hover tint on a laptop:** under the mouse, a row, a menu's line, a
  table's row or a button with no fill takes the same light wash of ink as a
  press (`pressTint`); a filled button lightens a little. A phone never shows
  it. (Look A, 15 Nov) *Backed by* Material's hover state and NN/g on
  clickability signifiers.
