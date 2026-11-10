# Phone and laptop

## The sizes

| Name | Width | What changes |
| --- | --- | --- |
| Small phone | 320 to 359 | Below `NARROW` (360): pairs of buttons stack |
| Phone | 360 to 1023 | Tabs along the bottom, sheets from the bottom |
| Laptop | `WIDE` (1024) and up | The left rail, docked side panels, centred sheets, drop-down menus |
| Laptop with a panel open | A laptop minus `PANEL` (400) | Ask Jonz or a John open on the right: the page narrows, it doesn't reflow |

Every screen is checked at 320, 390, a laptop with a panel open, and 1440,
in Day and Night. (#40, #59; 320 is **New**) *Backed by* WCAG 1.4.10, which
asks for nothing lost at 320 wide.

*Differs:* Material designs for a middle size (600 to 840) for tablets and
folding phones. Jonz has none: up to 1024 is the phone layout. Decide before
the store release; until then a tablet gets the phone layout, which must
still look right stretched (content capped, nothing pinned to far edges).

## Navigation

- Three tabs, Today, Week and House: along the bottom on a phone, a left rail
  from `WIDE`. Pages pushed from House keep the tabs. (Focus, #17)
- **At most two levels deep:** a tab, then a pushed page or a sheet. Back
  always returns to the tab's home (`dismissTo`), never through tab history.
  (Focus, #17; #34) *Backed by* the HIG's tab bar guidance and Nielsen's
  "user control and freedom".
- **Things you set together are on one page.** House's pages are Overview,
  The Wall (with History beside it), Johns (with their groups), Rules (with
  who the admins are), Days and time away (your days, best time and Johns
  you'd rather, beside the house's time away), House Pass, and You (your
  name, look and sign-in beside help and leaving). A merged
  page puts its two parts side by side on a laptop (`Pair`) and one after
  the other on a phone, or a switch where both are long lists (the Wall
  and History). An old link to a merged page lands on the page it joined.
  (House pages, 1 Nov)
- **House's Overview is the house at a glance:** a row of four figures
  (`Figures`: your month, the stake, the housemates, the John list), each
  opening its page, then settling up while there's any, then the Table
  beside the Wall's latest. Your own settings are on You, not the
  Overview. (House pages, 1 Nov)
- **On a phone House is two halves under a switch,** "Overview" and "Setup
  and you": the figures, settling up, the Table and the Wall, or the house's
  setup, the House Pass and the row to You. The switch stays where you left
  it on the way back from a setup page. A laptop needs none: the list of
  House's pages is beside the Overview. (House on a phone B, 10 Nov)
- **A kid's House is one short page:** pocket money, the Table, the Wall,
  then "How the family runs" (the Johns, the rules and time away to read,
  "Set by your parents") and You. No invite, no Ask Jonz usage, no Pass, on
  the page or in the laptop's list. (A kid's House B, 10 Nov)

## The title bar

- One 52pt bar on every tab: the page's name on the left, the sparkles (Ask
  Jonz, admins) always at the right edge, the page's own `•••` just inside
  them. (Header A, #41)
- The bar holds only the title, the sparkles, the question mark and `•••`. A page's actions sit
  next to what they change. (Owner admin, 30 Oct)
- What a page says about itself (Today's date, Week's dates) is its first
  line, under the bar; House says it in its figures. (#41; House pages,
  1 Nov)
- Pushed pages put "‹ House" above the title. (Focus, #17)
- From `WIDE` the bar runs the full width of the content area; it isn't
  boxed to a centred column. (#59)
- Every tab's bar has a question mark just inside the sparkles: Help, with
  the page's tour and Report a problem. Pushed pages leave it out. (Help
  and tours, 1 Nov)
- The bar's buttons are one group at the right edge, always in this order:
  the page's own button (`•••`, or Today's "You ▾"), the question mark, then
  the sparkles at the edge. Their 48 squares touch, with no gaps or margins
  of their own, so the space between glyphs is the same everywhere and a
  long title like THIS WEEK fits on a phone. Without the sparkles (a
  housemate) the question mark takes the edge. (Bar buttons A, 5 Nov)
- Ask Jonz's bar follows chat apps (ChatGPT, Claude) and Apple's toolbar
  rules: Your chats (a clock) is the one button on the leading edge, its
  glyph on the content's edge, before the title; New chat (a pencil), and
  Close in the laptop panel, at the trailing edge. Icons only: never words
  beside icons in a bar. Your chats has "‹ Ask Jonz" above its title, back
  to the chat. (Ask Jonz bar A, 7 Nov)

## Laptop pages

- **The docked side panel:** a main column from the left, and a side panel
  docked at the window's right edge behind a hairline (`Columns`). The main
  column runs to the panel at any width (Today, Week and the owner's pages
  alike), so no room is left blank between them on a big screen, and a
  `Pair` or `Flow` in it shares that width out as on a page that fills the
  room. Nothing floats centred in empty space; a one-column page sits at
  the left. (Option C, #59; Laptop width B, 10 Nov) *Backed by* Material's
  list-detail and supporting-pane layouts and the HIG's split view.
- **Today on a laptop:** Next up (under the day's line) beside the rest of
  your week (`Pair`), the two sharing a top edge; what the house wants of
  you (Needs you, On call, This week) in the panel. Where the main column
  has no room for two, they stack as on a phone. (Laptop width B, 10 Nov)
- **The owner's pages use the whole room:** their lists are tables, so the
  main column running to the panel suits them. A long form there (Messages,
  Promotions) puts what it says beside how it goes out (`FormPair`), the
  two sharing a top edge, where the main column has room for two columns;
  only where it hasn't is it one stack, `FORM_MAX` wide. (Owner admin, 7
  Nov; Laptop width B, 10 Nov)
- **A page a phone pushes from a list opens beside the list on a laptop,**
  never in one column with the room blank beside it: an owner's house or
  report beside its table, a housemate's track record (you, to start)
  beside the grid, a Guide topic (the first, to start) beside the topics.
  The open one in the list is on the tint with an ink edge, and clicking
  down the list changes what's beside it without leaving the page. A link
  to the pushed page lands on the list with it open; on a phone it's still
  a page of its own. (Owner admin, 7 Nov; Laptop width B, 10 Nov) *Backed
  by* Material's list-detail layout and the HIG's split view.
- **A page to read lists its sections beside the words on a laptop** (Help,
  the Privacy Policy, the Terms): On this page, a row per heading, and the
  words beside it in one column in their order, about a phone's width; a
  heading jumps to its section. On a phone, the words alone. (Laptop width
  B, 10 Nov) *Not* the sections as cards in columns: a page meant to be
  read in order then reads across and down.
- Things side by side share a top edge: the page's first line sits in the
  main column so a bare card in main lines up with the side's first group.
  (#48)
- A list and its side panel scroll separately; the search box, count and
  column names stay pinned while rows scroll. (Owner admin, 31 Oct, #82)
- One right-hand slot: Ask Jonz and an open John share it, and opening one
  closes the other. (#44)
- The House tab is a workspace: its pages listed down the left, the open
  page beside them. (House workspace B, #44)
- **House's pages fill the room beside House's list** (`Screen` with
  `fills`), up to `FILL_MAX` (1600), with our own sections (the name above
  a grey group) side by side. `Flow` shares out a page's sections of one
  kind (the John list's kinds, a housemate's record) into as many columns
  of at least `COLUMN_MIN` (352) as fit, two on a 1440 laptop and three on
  a 1920 screen, each to the shortest column so the columns end near each
  other. `Pair` puts two stacks side by side: what a page gives or explains
  beside what you choose. A page's own tools sit at the top right over the
  columns (Add a John, with the week's Johns and points). On a phone, and
  where two columns don't fit, the same sections stack in their phone
  order. (House pages, 1 Nov) *Not* the section names hanging in a column
  left of their groups, one wide column, or cards on a blank page: each
  leaves the room unused. *Backed by* Material's canonical layouts (feed
  and supporting pane), which fill a wide window with columns rather than
  stretching one.

## Phone pages

- **A phone page that runs past about two screens is split, not shortened:**
  a `Segmented` switch at the top shows one half at a time, each a whole
  thing to do (see what's going on; set it up). (House on a phone B, 10 Nov)
- What is a side panel on a laptop is a pushed page or a sheet on a phone.
  (Owner admin, 30 Oct)
- Content keeps a 16pt gutter (`GUTTER`) and is capped at `CONTENT_MAX`
  (680) on a phone or tablet. (Focus, #17)

## Sheets and menus

- A `Sheet` rises from the bottom on a phone and sits centred over a scrim
  from `WIDE`. **One sheet at a time:** it changes its own content rather
  than opening a second. (Focus, #17) *Backed by* the HIG's sheet guidance
  (avoid stacking modals) and Material's bottom sheets.
- **A choice from a short list** is a `PickMenu`: a sheet on a phone, a
  drop-down from `WIDE`. Not a segmented switch squeezed into a label line.
  (Table B, #48)
- A tap on a day, a John or a Wall item opens its sheet; a sheet opened
  from a link scrolls to what the link named (`openAt`). (Who's away F, #23)
