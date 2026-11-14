# The feel: Bin Night

Jonz is council signage on every platform: pavement and tarmac grounds, ink,
one hi-vis amber, hazard for what's gone wrong, and a bin-lid colour per
kind of John. Calm by default, loud only for the moments that count.

## Colour

- **Hi-vis amber has two jobs:** the fill of the one primary button on a
  screen, and the marker on the current tab. Never text, a border, a bar, a
  chip or an avatar. (Focus, #17) *Backed by* Material's "one high-emphasis
  action per screen" and the HIG's single prominent button; amber text on
  pavement would also fail contrast.
- **Hazard** is only for late, overdue, missed, disputed, and money lost or
  owed, and it always comes with an icon and a word. Destructive rows
  (Remove) use it as text; moves in a Danger zone wear it on their button. (Focus, #17) *Backed by* WCAG 1.4.1:
  colour is never the only way meaning is shown.
- **Green** only for the done tick and a good headline figure. (Focus, #17)
- **Colour stays neutral.** No colour per person, anywhere (the away
  calendar shades days, it doesn't colour people). A John's kind colour
  shows only as its `LidBar`. (Who's away, #23)
- **Each house picks its kinds' colours:** one of eleven ready colours (the
  six old lids first) or any colour. After dark a ready colour wears its
  own night shade, picked by eye; any other is made lighter (after dark) or
  darker (by day) until it reaches 3 to 1 against the card, keeping its hue
  (`kindLid`). So a lid always reads, whatever colour a house picks.
  (Kinds list A and Colour picker, 14 Nov) *Backed by* WCAG 1.4.11.
- **Contrast:** words meet 4.5 to 1 against what's behind them and icons,
  edges and focus rings 3 to 1, in Day and Night. A theme test checks the
  token pairs (`packages/core/src/bin-night.test.ts`). (**New**) *Backed by*
  WCAG 1.4.3 and 1.4.11.
- Hazard and green as **words** sit on a card or a group, never on the bare
  pavement: in Day they reach 4.1 and 4.2 to 1 there, enough for an icon,
  not for small words.
- **Never write a colour by hand.** Colours come from `useTheme()`, which
  reads `BIN_NIGHT` in `@app/core`. (AGENTS.md)

## Signage

- Inside the house the sign shows in three places only: Today's next John on
  a `StreetPlate`, each John's square `TickBox`, and the tab icons stroked
  like the J. (In-app signs, #60)
- Hazard tape inside the house is only a 4pt left edge on an overdue or
  missed John. The full tape, the boxed wordmark and big caps stay on the
  front door, sign-in, the join page and the invite sheet. (Focus, #17; #60)
- **One sign per place.** Never put a logo above something that already
  says Jonz (the email's sign carries the J, so no logo above it). (Email
  look, 31 Oct)
- No eyebrows: no small label above a heading. (#60)
- Decoration is `aria-hidden`. (AGENTS.md)

## Surfaces

- The pavement page, and one inset group per section (card colour,
  radius 10, no border, hairlines that start at the text). (Focus, #17)
- At most one stand-alone card per screen (Today's Next up, House's month
  card). A card never holds a card or a tinted panel. (Focus, #17)

## Voice

- A good council notice written by a housemate: plain, short and fair, with
  a dry joke now and then. States the rule, never scolds. No emoji and no
  exclamation marks, anywhere. (Brand kit, 29 Oct; `docs/brand/README.md`)
  *Backed by* GOV.UK's plain English guidance and Nielsen's "match between
  the system and the real world".
- Plain international English: "take turns", never "rota"; no
  British-only words like "fortnight" or "hoover" in new copy. (29 Oct)
- A chore is a **John**, many are **Johns**; the app is **Jonz**; the money
  is **the Stake**, the standings **the Table**, the feed **the Wall**,
  handing out a week **the deal**. (AGENTS.md, Words)
- Lucide icons only, reactions included. No emoji in the UI. (AGENTS.md)

## Day and Night

Both ship and follow the phone's setting unless you pick Day or Night under
House, You. Every screen is checked in both. (AGENTS.md)

## Drafts and options

Options and drafts shown to Glyn are pictures of the real app, or built
from its real components with sample data, never hand-drawn HTML. Hand
drawings drifted from the app twice. (Family version, 30 Oct; bug reports,
31 Oct) Give 2 to 4 true alternatives for one thing, lead with one
recommendation, and ask for one decision. (28 Oct)
They are shown in the standard design picker; how is in the `house-style`
skill, "Design options for Glyn". (3 Nov)
