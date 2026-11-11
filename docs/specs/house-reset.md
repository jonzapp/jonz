# Reset a house

Glyn asked for it on 11 Nov 2026: a house dealt its first week too early,
before everyone had joined, and needs to go back to "not dealt yet" even
after things have happened. He picked two actions, one permission of their
own, and the app's owner able to do it for any house.

## What it does

Two resets, in a GitHub-style **Danger zone** at the foot of House rules
(admins only) and of the owner's Houses panel:

| Reset | What goes | What stays |
| --- | --- | --- |
| Reset history | Every week dealt (its Johns, ticks, covers, flags, questions, votes, swaps), money (forfeits, month closes, let-offs, pocket money paid), History (`house_actions`), the Wall's deal posts, everyone's streak, skips and swaps. `first_dealt_at` goes back to null. | The house, its name and join code, everyone and who's admin, the John list, groups, rules, time away, the House Pass, Ask Jonz chats, and the Wall's joined, moved out, kind changed and Jonz message posts. |
| Reset everything | All of the above, and the John list, groups, time away, and the rules back to a new house's of its kind (`create_house`'s values). | The house, its name and join code, everyone and who's admin, the House Pass, Ask Jonz chats, and those Wall posts. |

The House Pass is never touched, so a reset doesn't give a house a second
free month. Nothing is dealt again until an admin deals the first week:
the clock only deals houses with `first_dealt_at` set.

Both can't be undone. Each sheet says what goes and what stays, and its
button only works once the house's name is typed (case and spaces aside).

## Who can

- A house's admins: the house permission `house_reset:write`, an admin's
  only by default (`HOUSE_MATRIX`). It's its own permission so it can be
  given or kept apart from History's `history:write`.
- The app's owner, for any house: the app permission `houses:write`
  (owner role, with their second factor), the same as Delete house. A
  support helper can't. The owner's version writes an `admin_audit` row
  (`house.reset_history` or `house.reset_everything`, with the reason and
  how many weeks went) and names nobody on the Wall.

## Inputs and outputs

One operation each, with an `everything` switch (`packages/core/src/operations.ts`):

- `reset_house_data`: `POST /v1/houses/{houseId}/reset` `{ everything? }`,
  database function `reset_house_data(p_house, p_everything)`.
- `owner_reset_house_data`: `POST /v1/admin/houses/{houseId}/reset`
  `{ everything?, reason? }`, `owner_reset_house_data(p_house, p_everything, p_reason)`.

Both answer `{ weeks, people }`: how many weeks went and how many people
are in the house. Both are `destructive`, so over MCP or a connected app
they wait for the person to approve at jonz.app/approve. Ask Jonz offers
the house one on its tap-to-confirm card; the owner's Ask Jonz has a
`reset_house` tool that puts it on the owner's card.

The Wall gets a `started_over` post (`data.everything`), and everyone else
in the house gets a push saying who reset it.

## Edge cases

- A house never dealt: the reset still runs and says 0 weeks.
- Photos people added as proof stay in Storage, unreferenced (the weeks
  that named them are gone); a later clean-up can sweep them.
- Family houses: rules go back to a family house's (no Stake, pocket money
  cap 10.00) and the words say parent and Family Pass.

## Done when

- [x] An admin can reset history or everything from House rules, on a phone and a laptop.
- [x] The owner can do either for any house from the Houses panel or their Ask Jonz.
- [x] Over the API and MCP both wait for approval.
- [x] A member, someone from another house, a support helper and an owner without their code are refused, and nothing changes.
