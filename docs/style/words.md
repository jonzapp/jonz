# Words on screen

- **Six text roles**, from `useTheme().type`, drawn by
  `components/text.tsx`: `Title` (once per screen, in the title bar),
  `Lead` (at most once per screen), `SectionLabel`, `RowTitle`, `Body`,
  `Meta`. Never a size typed by hand. (Focus, #17)
- **Only the page title is in caps.** A section is named in sentence case
  (`SectionLabel`, 15 ExtraBold). `type.caps` (12, tracked) is only for short
  small print: a grid's column heads, a calendar's weekdays, a
  `StatusMark`'s word. Keep any caps text to a few words. (#60) *Backed by*
  readability research: long runs of capitals read slower.
- **Meta lines** join their facts with commas, or make them a sentence,
  never " · ". Only the browser tab title keeps "Page · Jonz". (#60)
- Numbers that line up use tabular figures (`TABULAR`). (Focus, #17)
- Nothing smaller than 12. (Focus, #17)
- **A button says what happens** ("Mark done", "Send report"); what follows
  says it happened ("Key copied" for three seconds). (Copy key, #75)
- **Labels are never cut off** with "…". If words don't fit, they wrap, or
  the layout changes (a button row stacks). Only a person's or a house's
  name in a dense list may be cut, with the whole name spoken. (**New**)
  *Backed by* WCAG 1.4.10 (nothing lost at 320 wide) and NN/g's advice
  against cutting labels.
- **Text grows** with the phone's text size, up to double, without a
  layout breaking: rows grow taller, buttons wrap, nothing overlaps. (**New**)
  *Backed by* the HIG's Dynamic Type and WCAG 1.4.4. *Differs today:* not yet
  tested above the default size.
- The words themselves follow the voice in [feel.md](feel.md) and the
  shared sentences in `packages/core/src/copy.ts`.
- **A family's words.** In a family house an admin is a **Parent** and
  everyone else a **Kid**, wherever the app names a role (`roleCopy(kind)`
  in `packages/core/src/family.ts`); the roles underneath are the same.
  Never call a family's people housemates. (Family houses, this PR)

## One word for each thing

The Jonz words (glossary, 2026-10-29). Say the word in the middle column;
the last column lists names the app used to use, which are gone. Code and
database names keep their old words (`immunity_tokens`, `swap_tokens`, the
`excused` outcome, the Wall's event kinds): only what people read changes.
`packages/core/src/words.test.ts` fails the build if a retired word comes
back into the shared copy.

| Thing | Say | Not |
| --- | --- | --- |
| A chore on the house's list | a John, Johns | Jon, Jons, chore |
| The app | Jonz | |
| Giving out the week's Johns | deal, the deal, re-deal | hand out, share out |
| How big a John is | points (effort points in full) | effort score |
| What each of you should do | fair share, your share | |
| The money the house plays for | the Stake | |
| What you put in each month | your stake | your share |
| What a late or missed John costs | a forfeit | fine |
| Forfeits going to everyone else | split, from the others' forfeits | shared out, shared among, share of forfeits |
| Saying you did it | Mark done (the button), a tick (what it leaves) | Done it |
| Doing a housemate's overdue John | cover | |
| Saying a tick wasn't really done | dispute, then the house votes | |
| The vote's two answers | Done, Not done (tallies count done first) | It's fine, It was done, It wasn't, fine |
| Days you're not home | time away | |
| A pass on one John, no forfeit | a skip | immunity, immunity token, token, excused, let off |
| Trading a John with a housemate | a swap | trade, swap token |
| How you earn a swap | top the week | top the table |
| Paying each other after the month | settle up | |
| Nobody owes anybody | square | even |
| What you send to get housemates in | an invite | join link |
| Its eight letters and numbers | the code | join code, invite code |
| Making a new house | start a house | set up a house |
| What the house has agreed | house rules | settings |
| The standings | the Table | |
| What happened, newest first | the Wall | |
| Everyone who lives there | housemates | |
| The one who runs the house | admin | |
| The paid plan | House Pass | |
| Proof a John was done | a photo | photo receipt |
| Who a John is for | Who it's for | Shared by |

- **Share** means only the fair share. Forfeits are **split**; the front
  door says "part of your stake".
- **Fine** is not a word in the app: in a game with money, "1 fine" reads
  as a penalty. The money word is always **forfeit**.
- Today's setup card keeps "Set up The Terrace": by then the house exists,
  and set up means getting it ready, not making it.
- The phone's own **Share** button ("Share invite") stays. It isn't a game
  word.
- An admin can still **let off** a result or a month (History's fixes):
  that is the admin waiving it, not a skip.


## Ask Jonz's replies

Ask Jonz writes Markdown, as other chat apps do, and the app draws it in
these text roles: paragraphs in Body with **bold** runs, headings as
SectionLabel, lists with their bullets or numbers in a 24 gutter, a task
list's boxes, a table on the card colour with numbers at the end, a quote
behind a 3pt edge (2026-11-05).

- Johns, people and pages inside a sentence are chips: a pill on the card
  colour with a hairline edge, the John's lid, the person's plate or a page's
  arrow, and the words in bold. Tapping one opens the John's sheet, the
  person's page or the page. A chip for something the house no longer has is
  its words in bold, with nothing to tap.
- Facts about the house come as cards between the paragraphs (this week's
  Johns, fair shares, Johns on the list), drawn by the app from its own live
  data, never as numbers the model typed.
- Raw HTML, web links, images and code are shown as their words. Nothing
  in a reply runs.
- The formats live in `packages/core/src/reply-format.ts`; the prompt's
  guide is built from the same list, so Jonz can only name what the app
  draws. Every sample in `reply-samples.ts` is drawn at `/style/replies` and
  pictured by `e2e/client-replies.spec.ts`.
Backed by: WCAG 2.2 target size (a chip in a sentence is exempt from 24×24,
and still 28 tall).
