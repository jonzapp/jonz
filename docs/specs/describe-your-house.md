# Describe your house

## What it does

An admin setting up a house chats with Jonz about it, as in other apps'
assistants. Jonz greets them and asks about the house; they answer in
words ("Four of us, two bathrooms, Sam and Priya share the upstairs one")
and Jonz drafts the John list: each John's kind, effort points, how often,
its due day and time, whether it's on call, and the groups that share some
of them. Jonz drafts as soon as it can and asks at most a couple of
questions, one at a time, each with quick answers to tap or a day picker.
Every later message changes the draft ("oven every month").

The draft shows in the chat as a card made of the app's own parts: the
setup checklist's rows (every John ticked), "See all" opening it into the
whole list with its groups, and the amber button that adds the ticked
Johns. Quick answers are the app's outline buttons and the day picker is
its Segmented, so the chat looks like the rest of Jonz. Nothing is added
until the admin presses Add; after that the chat shows how many were added
and opens the list. Starter lists (flat share, couple, family) sit under
the greeting for anyone who'd rather not write, and stand in whenever
Claude can't be reached. It's free for every house.

Once the house has Johns, the same page is **Ask Jonz**, for changes
("Sam's moving out", "bathroom is more work") and questions ("who's on
bins?"). Jonz acts as the person asking: it can look at anything they can
see in the app (the list, the week, people, time away, History, fair
shares, the rules) without asking, and propose anything they may change.
Every change waits on a card. The card is sorted by what each change
does: **Taking off** first (a minus in the hazard colour), then
**Changing** (a pencil, before → after: "Every week → every 2 weeks, 3 → 4
pts"), then **Adding** (a plus), each ticked, with the house's points a
week before and after. Nothing changes until they press Apply, and the
chat carries on after it, from the list as it now is. Anyone in the house
can ask; someone who can't change the list (a member, a kid) gets answers
and no card. This part is the House Pass's: without it the message
box gives way to the Pass (shown only once `PASS_ENFORCED` is on).

The message box is one line while empty (a lighter hint that never
wraps) and grows with what's typed, up to about five lines, then scrolls
inside itself. Everyone opens the chat from the sparkles in the title bar
on Today, Week and House (not while a parent is acting for a kid).

## Inputs and outputs

- `POST /api/setup/draft` `{ houseId, messages, draft }` (`ChatRequest`):
  the chat so far (at most 24 messages of up to 800 characters, ending with
  the admin's) and the draft as it stands, or null. It answers
  `{ reply, ask, draft, source }` (`ChatResponse`): Jonz's words; `ask`,
  null or a question to tap an answer to (`choices`, up to 5 quick answers,
  or `day`); `draft`, the whole new draft or null when this turn left it as
  it was; `source`, `"ai"` from Claude or `"starter"` when a starter list
  stood in. A draft is `{ johns, groups, note }` (`HouseDraft`): each John
  as the list holds it plus `group` and `why`; each group with `memberIds`
  (housemates already in the house) and `waitingFor` (names nobody goes by
  yet); `note`, what the draft assumed.
- Anyone in the house may ask (403 otherwise). What Jonz may propose is
  what they may do (`my_permissions`, `packages/core/src/permissions.ts`). A house gets
  `CHAT_TURNS_PER_DAY` (30) turns from Claude in any 24 hours (409
  `draft_limit` after that); starter lists are unlimited.
- Claude is `anthropic/claude-haiku-5.5` through Vercel's AI Gateway (OIDC
  on Vercel, no key), with tools and a structured last word
  (`apps/api/lib/ai/house-draft.ts` on the shared loop in
  `apps/api/lib/ai/agent.ts`, at most 12 steps a turn). Reads
  (`list_johns`, `week`, `people`, `time_away`, `history`, `balances`,
  `stake`, `why_john`, `how_it_works`, `house_rules`, in
  `apps/api/lib/moves/ask-reads.ts`) run through the person's own session,
  so row rules decide what Jonz sees. Everyone in the house gets every
  read, so anyone can ask how things work: why they got a John (`why_john`
  is the John sheet's Why?), why they're behind or owe money (`balances`,
  `stake`), what the House Pass is for. `how_it_works` gives each rule in
  words built from the app's own copy and code with the house's numbers
  (`packages/core/src/how-it-works.ts`), and Jonz walks through the maths
  with the person's real numbers rather than guessing. Writes
  (`add_john`, `change_john`, `remove_john`, `set_group`, `offer_reset`)
  are offered only with the matching permission and change a draft held
  for the turn, one John a call (`editDraft` in
  `packages/core/src/draft-edits.ts`), by the John's short ref. The draft
  is in words (`draftForModel`: "me", first names, on call). Core's `tidyDraft` and `tidyAsk` check every value
  afterwards: names cut to fit, numbers put in range, unknown kinds made
  Other, duplicates dropped, group members matched to housemates by name,
  at most 30 Johns and 6 groups. Effort follows the John list's existing
  scale (points 1 to 20), and how often any period the list takes, in weeks
  or months (`docs/specs/any-length-repeats.md`).
- Each turn asked of Claude is a `house_drafts` row (outcome, how many
  Johns drafted, tokens), readable only by the service role. The chat is
  never stored.
- Keeping makes the groups the kept Johns need through `save_group`, then
  adds the Johns in one insert through the admins' column grants
  (`keepDraft`, `addJohns` in `apps/client/src/api`). A drafted group with
  nobody in the house yet can't be made, so its Johns go to everyone until
  the admin makes it by hand. A group the house already has with that name
  is used as it is.
- Changing a list: the request's `draft` starts as the list itself
  (`listAsDraft`), each John carrying its `id`. Claude sees each one's
  short `ref` and keeps it on Johns it keeps; a John left out is taken off.
  `draftChanges(base, next)` gives the changes (`add:i`, `change:id`,
  `remove:id`), and `applyDraft` applies the ticked ones through the list's
  own writes: `addJohns`, `saveJohn`, `archiveJohn` (archived, so past
  weeks keep their history). Changes take effect from the next deal. A
  house with a list and no Pass is refused with 409 `pass_needed`.

## Edge cases

- No AI Gateway (locally and in CI), or Claude erroring, refusing or being
  cut off: `offlineTurn` answers. Before there's a draft it gives the
  starter list the admin named, or the one `guessStarter` picks from what
  they wrote, and says so; once there's a draft it leaves it as it is and
  says the change didn't go through. The app falls back to `offlineTurn`
  too if the API can't be reached at all, so setup never stops here.
- A message that isn't about the house: Claude answers in words and the
  draft stays as it was.
- A refusal (the daily limit): the message goes back in the box, with the
  reason above it.
- Two housemates with the same first name: a drafted group naming that
  first name waits for them rather than guessing.
- Time away isn't drafted: only each housemate can book their own.

## Platforms

On a phone or a tablet, a page in House's stack (`/house/describe`),
opened from Today's setup card while the list is empty, from the empty John
list, and from the sparkles in the title bar. From laptop width (`WIDE`) the
same chat opens as a panel down the right of the window (`AskPanel`), with
the page still beside it: the sparkles open and close it, and the done row
goes to the John list without closing it. The message box stays above the
keyboard.

## Done when

- [x] An admin with an empty list can chat about the house, answer by
  tapping, open the draft, untick Johns and add the rest.
- [x] Starter lists work with no gateway, and when Claude fails.
- [x] A house is held to 30 turns a day.
- [x] Anyone in the house can ask Jonz about the house; only what they
  may change is offered, and everything waits on the card.
- [x] Jonz can change, add and take off any John, or the whole list, one
  at a time, and the card sorts them by kind.
- [x] An admin with a list can ask Jonz for changes from the title bar's
  sparkles, untick some and apply the rest; it's the House Pass's.
- [ ] On production, a real chat drafts a sensible list through the AI
  Gateway.
