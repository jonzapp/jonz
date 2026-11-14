# Reset Ask Jonz use

## What it does

The app's owner can give Ask Jonz back to people who have run out: for one
house, some chosen people (in any house), or everyone. Their turns so far
stop counting toward every Ask Jonz limit, so each starts again: the
house's week, each person's share of it, the day's turns and the account's
7 days. Only an owner may (`ask_usage:write`; support helpers can't), from
the house panel on the admin pages, the owner's Ask Jonz card, `/v1` or MCP.

## Inputs and outputs

- `owner_reset_ask_usage` (`POST /v1/admin/ask/usage/reset`, the MCP tool of
  the same name): `{ audience: "house" | "people" | "everyone", houseId?,
  people?: uuid[] (1 to 500), reason? }` answers `{ turns, people }`: how
  many turns stopped counting, and whose.
- Nothing is deleted: each turn (`house_drafts`) keeps its tokens, as its
  cost. A reset stamps `reset_at`, and every limit (`ask_usage`,
  `ask_usage_people`, `ask_account_used`, `claim_ask_turn`) counts only turns
  without one.
- Each reset writes an audit entry, `ask.reset_usage`, with who it reached
  and the reason.
- On the house panel: an Ask Jonz section with "Reset Ask Jonz use", a sheet
  to pick everyone in the house, people ticked from it, or everyone in Jonz,
  and why. On the owner's Ask Jonz: the `reset_ask_usage` tool puts it on the
  card.

## Edge cases

- Nobody is told: it only gives room back.
- It isn't `destructive` (nothing is lost), so MCP doesn't hold it for
  approval. It can't be taken back either.
- A house that's gone: `not_found`. People with no ids: `ask_reset_who`.
  More than 500: `ask_reset_too_many` (use everyone).
- A person's reset covers their turns in every house, so their house's pool
  drops by what they used too.

## Platforms

The same everywhere: it's on the admin pages, which every platform shows.

## Done when

- [x] An owner resets a house, people or everyone, and the limits start
  again (`apps/api/tests/db/ask-usage-reset.test.ts`).
- [x] A support helper, an owner without their code and a house admin are
  refused.
