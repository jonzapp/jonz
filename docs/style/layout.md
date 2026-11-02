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
  Overview; on a phone a row at the Overview's foot opens it. (House
  pages, 1 Nov)

## The title bar

- One 52pt bar on every tab: the page's name on the left, the sparkles (Ask
  Jonz, admins) always at the right edge, the page's own `•••` just inside
  them. (Header A, #41)
- The bar holds only the title, the sparkles and `•••`. A page's actions sit
  next to what they change. (Owner admin, 30 Oct)
- What a page says about itself (Today's date, Week's dates) is its first
  line, under the bar; House says it in its figures. (#41; House pages,
  1 Nov)
- Pushed pages put "‹ House" above the title. (Focus, #17)
- From `WIDE` the bar runs the full width of the content area; it isn't
  boxed to a centred column. (#59)

## Laptop pages

- **The docked side panel:** main content up to `MAIN_MAX` (1040) from the
  left, and a side panel docked at the window's right edge behind a hairline
  (`Columns`). Nothing floats centred in empty space; a one-column page sits
  at the left. (Option C, #59) *Backed by* Material's list-detail and
  supporting-pane layouts and the HIG's split view.
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
  of at least `COLUMN_MIN` (360) as fit, two on a 1440 laptop and three on
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
