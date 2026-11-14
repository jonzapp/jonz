# A house's own kinds of John

## What it does

Each house keeps its own kinds of John: the John list's sections, and the
lid colour of the Johns in each. A new house starts with none: its setup
chat makes the kinds it needs as it adds the Johns, sorting each John into
one. An admin adds kinds, renames them, gives them a colour, moves them up
or down and deletes them. A kind changes nothing in the deal; that is what
a group does (who shares a John).

A John in none of the house's kinds sits in **No kind**: the one catch-all,
at the foot of the list. No kind isn't a kind, so nobody can rename, move
or delete it, and no kind can take its name. (Houses made before 14
November 2026 started with six kinds; their Everything else was folded into
No kind.)

## Inputs and outputs

- **Kinds list** (Kinds list A, 14 Nov): under the John list, admins only.
  One row a kind (its lid bar, its name, how many Johns), then Add a kind.
  A kind opens in the panel beside the list on a laptop, a sheet on a
  phone: its name (1 to 30 characters, unique in the house whatever its
  capitals, and not No kind's), its colour, how a John of it looks, Move
  up and Move down (which happen at once), Save and Delete. No kind has no
  row.
- **Colour** (Colour picker, colours then any colour): eleven ready colours
  as round dots, six to a row, the twelfth a rainbow dot that opens a shade
  square, a hue track and a colour code (`#rrggbb`, `#rgb` or without the
  `#`). Grey, No kind's lid, is the last ready colour, so a new kind takes
  it only when every other is taken. After dark a ready colour wears its
  own night shade; any other is made lighter (after dark) or darker (by
  day) until its lid stands 3 to 1 against the card, keeping its hue
  (`kindLid`).
- **No kind** (one No kind, Dashed, 14 Nov): the Johns in none of the
  house's kinds (`johns.john_kind_id` null), last on the John list in a
  dashed outline with no card colour, with a line under it: "Johns in none
  of the kinds above.", and for an admin "Open one to give it a kind."
  Their lids are grey. Deleting a kind moves its Johns there; the kind's
  sheet says so above Delete when it has Johns.
- **John form**: Kind lists the house's kinds in their order, then No kind,
  always last, so an admin can put a John there on purpose. A new John
  starts in the first kind, or No kind when the house has none.
- **Everywhere a John is drawn** (Today, Week, the John sheet, Ask Jonz's
  cards): its kind's name and lid colour. A John in No kind leaves the kind
  out of its line and has a grey lid.
- **Setup chat and Ask Jonz**: list_johns ends with the house's kinds, and
  Claude names a John's kind (`add_john`, `change_john`'s `kind`) in the
  person's language: one of the house's, matched whatever its capitals, a
  new name when none fits, or No kind. Setting up a new house it names a
  few short kinds that fit (usually 3 to 6) and sorts every John into one.
  Nothing is made until they apply; then a new name becomes a kind, last,
  in the next free ready colour. The card counts a move to another kind as
  a change and says it by name ("Kitchen → Garden", "No kind → Garden").
- **Ready-made lists** (when Claude can't be reached, or an admin starts
  from one): each John goes in the house's kind that began as its old
  starting kind (`preset`), or else in one of that kind's name in the
  admin's language (Kitchen, Bathroom, Bins & recycling, Floors &
  hoovering, Errands & shopping), made when they keep it. Laundry and the
  like go in No kind.

### Database and API

- `john_kinds (id, house_id, name, colour, position, preset)`; `preset` is
  the old starting kind it began as (kitchen, bathroom, bins, floors or
  errands), null for one the house made. Members read them; `johns:write`
  changes them.
- Operations (in `/v1`, the permission matrix and the Jonz connector, for
  anyone with `johns:write`): `save_kind` (kindId null to add one, last),
  `order_kinds` (ids in the new order; any left out keep their old order
  after them), `delete_kind` (its Johns move to `moveToId`, or to No
  kind). `john_list` gives the kinds in order and each John's
  `johnKindId`; `house_today` gives each John dealt `kindName` (`''` for
  No kind, null when the read doesn't say) and `kindColour`.
- `add_john`, `add_johns` and `change_john` take `kindId`, or `kindName`
  (made, in the next free ready colour, if the house has none by that
  name; No kind's own name, "No kind" or "Sans type", is No kind). Left
  out, a new John is in No kind and a changed one keeps its kind. In
  `change_john`, `kindId: null` moves the John to No kind: the function
  can't tell null from left out, so the operation sends it as the flag
  `p_no_kind` (`OperationIo.nulls`).
- `public.no_kind_name` says whether a name is No kind's; `add_kind` and
  `save_kind` refuse it as `kind_name_taken`.
- A John's kind is its `john_kind_id` alone. The older `johns.category`
  (and the copy each dealt John kept in `assignments.category`) went in
  `20270117090000_drop_john_category.sql` (Glyn, 14 November 2026). A John
  dealt or on call wears its kind's colour, or grey in No kind.
- A drafted John (`HouseDraft`) has `kind`: its name, or null for No kind.
  Applying writes `kindName`, or `kindId` null for No kind.
- `20270118090000_no_kind_section.sql` folded each house's Everything else
  into No kind (one a house had renamed stays, as a kind of its own),
  stopped giving new houses kinds, and made Reset everything leave none.
- Starting a house from another copies its kinds and keeps each John in
  the kind of the same name (a John in No kind stays there).

## Edge cases

- A kind with no Johns isn't a section on the list; it still has its row on
  the Kinds list ("No Johns"). No kind shows only when a John is in it.
- Deleting every kind moves every John to No kind.
- A John whose kind isn't among the kinds read (a read from before) shows
  under No kind.
- A housemate sees the sections but not the Kinds list, and No kind's line
  without "Open one to give it a kind."

## Platforms

The same on iOS, Android and web. The shade square and hue track are drawn
with Views and dragged with a PanResponder, so they work everywhere. No
kind's dashed outline is drawn over its group, so its rows line up with
every other section's.

## Done when

- [x] An admin adds a kind in a ready colour or any colour, renames it,
      moves it and deletes it, and the list follows at once.
- [x] An admin can put a John in No kind from the John form, and a deleted
      kind's Johns go there.
- [x] Nobody can rename or delete No kind, or name a kind after it.
- [x] Lids read on the card by day and after dark, whatever the colour.
- [x] A new house starts with no kinds; its setup chat makes them with its
      Johns, in its maker's language.
- [x] Ask Jonz drafts a John in one of the house's kinds by name, in a new
      one that's made when the admin applies it, or in No kind.
