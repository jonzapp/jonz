# A house's own kinds of John

## What it does

Each house keeps its own kinds of John: the John list's sections, and the
lid colour of the Johns in each. A house starts with the six it always had
(Kitchen, Bathroom, Bins & recycling, Floors & hoovering, Errands &
shopping, Everything else), named in its maker's language. An admin adds
kinds, renames them, gives them a colour, moves them up or down and deletes
them. A kind changes nothing in the deal; that is what a group does (who
shares a John).

## Inputs and outputs

- **Kinds list** (Kinds list A, 14 Nov): under the John list, admins only.
  One row a kind (its lid bar, its name, how many Johns), then Add a kind.
  A kind opens in the panel beside the list on a laptop, a sheet on a
  phone: its name (1 to 30 characters, unique in the house whatever its
  capitals), its colour, how a John of it looks, Move up and Move down
  (which happen at once), Save and Delete.
- **Colour** (Colour picker, colours then any colour): eleven ready colours
  as round dots, six to a row, the twelfth a rainbow dot that opens a shade
  square, a hue track and a colour code (`#rrggbb`, `#rgb` or without the
  `#`). After dark a ready colour wears its own night shade; any other is
  made lighter (after dark) or darker (by day) until its lid stands 3 to 1
  against the card, keeping its hue (`kindLid`).
- **No kind** (No kind C, 14 Nov): any kind can be deleted, Everything else
  and the last one too. Its Johns then have no kind (`johns.john_kind_id`
  null) and sit together in a grey No kind section at the foot of the John
  list; the John form's Kind says No kind until an admin picks one. The
  kind's sheet says so above Delete when it has Johns.
- **John form**: Kind lists the house's kinds in their order; a new John
  starts in the first.
- **Everywhere a John is drawn** (Today, Week, the John sheet, Ask Jonz's
  cards): its kind's name and lid colour. A John with no kind leaves the
  kind out of its line and has a grey lid.

### Database and API

- `john_kinds (id, house_id, name, colour, position, preset)`; `preset` is
  the starting kind it began as, null for one the house made. Members read
  them; `johns:write` changes them.
- Operations: `save_kind` (kindId null to add one before Everything else),
  `order_kinds` (ids in the new order; any left out keep their old order
  after them), `delete_kind` (its Johns move to `moveToId`, or have no
  kind). `john_list` gives the kinds in order and each John's
  `johnKindId`; `house_today` gives each John dealt `kindName` (`''` for
  no kind, null when the read doesn't say) and `kindColour`.
- `add_john`, `add_johns` and `change_john` take `kindId`, or `kindName`
  (made, in the next free ready colour, if the house has none by that
  name), or the older `category`. Left out, a new John goes in the kind its
  category began as (Everything else) and a changed one keeps its kind.
- `johns.category` stays for now, kept in step from the kind by a trigger
  (the preset, or `other`), so older apps still work; a later migration
  drops it. The app never sends `category` for a John it read with a kind,
  or a John with no kind would land in Everything else.
- Starting a house from another copies its kinds and keeps each John in
  the kind of the same name (a John with no kind keeps none). Reset
  everything puts the six starting kinds back.

## Edge cases

- A kind with no Johns isn't a section on the list; it still has its row on
  the Kinds list ("No Johns").
- Deleting every kind leaves every John with no kind, and a John added then
  has none either.
- A John whose kind isn't among the kinds read (a read from before) shows
  under No kind.
- A housemate sees the sections but not the Kinds list.

## Platforms

The same on iOS, Android and web. The shade square and hue track are drawn
with Views and dragged with a PanResponder, so they work everywhere.

## Done when

- [x] An admin adds a kind in a ready colour or any colour, renames it,
      moves it and deletes it, and the list follows at once.
- [x] A deleted kind's Johns show under No kind until they are given one.
- [x] Lids read on the card by day and after dark, whatever the colour.
- [x] A French house starts with its kinds in French.
