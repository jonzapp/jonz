# Family houses

The family version of Jonz, from the review "Should Jonz have a family
version?" and its mockups (Glyn approved building it on 4 November 2026).
It lands in five steps, one PR each, merged one at a time:

1. **Family houses** (this spec's first part): the kind of house, its words
   and no Stake.
2. **A parent's OK**: a kid's tick waits for a parent's "It's fine" or
   "Not yet", in place of the housemate check's vote.
3. **Pocket money and Pay day**: each OK'd John earns, up to a monthly cap
   per kid; a parent pays outside Jonz and taps Paid; the Table lists kids.
4. **Kids without a sign-in**: profiles a parent runs for under-13s, a kid
   switcher on Today, and a youngest age on a John.
5. **Family Pass**: the Pass page's words for a family. `FAMILY_OPEN`
   turns on here, and the front door and Start a house offer Family to
   everyone.

Housemate houses don't change at all.

## What it does

A house is housemates (equals sharing a place, as Jonz has always been) or
a family. A family is the same house underneath, with its own words: an
admin is a **parent**, everyone else a **kid**. A family has no Stake:
nobody puts money in or forfeits it.

## Inputs and outputs

- `houses.kind`: `housemates` (the default) or `family`. Set once, by
  `create_house(..., p_kind)`; there is no grant to change it.
  `start_house_from` gives the new house the old one's kind.
- `houses_family_no_stake`: a family's `stake_minor`, `late_forfeit_minor`
  and `missed_forfeit_minor` are always 0. A family starts that way, and the
  database refuses any change that would give it a stake.
- `house_by_code` returns the kind, so a join link to a family says so.
- The front door: once `FAMILY_OPEN`, a Housemates / Family switch above the
  headline swaps the headline, the three sentences and Start ("Start a
  family" leads to `/house/new?kind=family` through sign-in). The device
  remembers the choice (`door-kind.ts`).
- Start a house: "Who lives here?" above the name, with Family picked when
  the link says `?kind=family` (or the device remembers it). Family's sign
  is "Set up your family", and its defaults line has no stake. A move
  (`?from=`) doesn't ask: the kind follows the old house.
- Words (`roleCopy(kind)`, `PARENTS_COPY`): Rules' Admins section is
  Parents ("Add a parent"), a person's page says Parent or Kid, the You page
  says "The Parks, parent", and leaving as the only parent hands the family
  over.
- What a family hides (`familyHides`): House's money figures and settling
  up, the Pass lock for them, a person's money section, and the Rules'
  stake, forfeits and where to settle up. Today's late and missed costs are
  already hidden when the stake is 0.

## Edge cases

- Until `FAMILY_OPEN`, nobody sees the choice unless a link asks for a
  family. A family started that way works, with the housemate check still
  in place until step 2.
- A kind the app doesn't know reads as housemates (`houseKind`).
- Storage that can't be read (a private window) means the front door opens
  on housemates.

## Platforms

The same on iOS, Android and web. The remembered choice uses the same
storage as the session (localStorage on the web, SQLite-backed on phones).

## Done when

- [x] A family starts with no stake and can't be given one (tests/db/family-houses.test.ts).
- [x] Start a house asks who lives here when a family is asked for, and sends the kind.
- [x] Parents and kids are named as such on Rules, a person's page and You.
- [x] A family's House, person pages and Rules show no money.
