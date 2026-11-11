# The Jonz style guide

How Jonz looks and behaves, on a phone and on a laptop. Every rule here is
one Glyn has decided (it names where) or one he approved with this guide
(marked **New**, 31 October 2026). When this guide and an older spec or PR
description disagree, this guide wins; fix the older one.

Read the page for the topic you're working on before you change a screen:

| Topic | What it covers |
| --- | --- |
| [feel.md](feel.md) | Bin Night: colour, signage, voice, icons, Day and Night, drafts |
| [words.md](words.md) | The six text roles, caps, cut-off labels, text size |
| [words-fr.md](words-fr.md) | Jonz in French: tu, French typography, and the glossary |
| [layout.md](layout.md) | Phone and laptop: sizes, tabs and rail, the title bar, side panels, sheets, menus, depth |
| [lists.md](lists.md) | Rows, groups, spacing, order, long lists, admin lists, calendars, empty lists |
| [controls.md](controls.md) | Buttons, button rows, icon buttons, tap sizes, toggles, focus |
| [states.md](states.md) | Status marks, waiting, loading, errors, undo and "Are you sure?", motion |
| [decisions.md](decisions.md) | The log: every design pick, newest first, with its PR |

The values themselves (colours, spacing, sizes, the text roles) live in
code, not here: `packages/core/src/bin-night.ts` for colours,
`apps/client/src/theme.ts` for everything else. The brand guide
(`docs/brand/README.md`) covers the logo, the sign and the voice outside the
app.

## Each rule says where it came from

A rule ends with its source in brackets: a PR (`#59`), a decision date, or
**New**. "Backed by" names the outside guide that agrees with it: Apple's
Human Interface Guidelines (HIG), Google's Material Design, the web's
accessibility standard WCAG 2.2, Nielsen Norman Group (NN/g) or the
GOV.UK Design System. "Differs" says where Jonz chose otherwise and why.

## Changing a rule

The guide stays true only if every design decision lands in it.

1. When Glyn picks an option (a decision card, "A looks great", "go with
   B"), the PR that builds it also edits the rule here **and** adds a line
   to [decisions.md](decisions.md): the date, the pick in a sentence, the PR.
2. A rule that a pick replaces is rewritten, not left beside the new one.
3. A new kind of screen with no rule yet: follow the nearest rule, and say
   in the PR which gap you filled, so Glyn can confirm it.
4. Never change a rule without a pick behind it. Ask instead.

## What checks it

- **Lint** (`apps/client/eslint-rules/jonz.js`, part of `npm run lint`):
  no colour, text size, spacing or corner written by hand, no buttons laid
  side by side outside a `ButtonRow`, no hand-made pressables in screens, no
  spinner on its own while something reads (`no-bare-spinner`), no button
  switched off while it waits (`busy-not-disabled`).
  Older code that broke a rule before it existed is listed in
  `apps/client/eslint-suppressions.json`; fix it and run
  `npx eslint src --prune-suppressions` there to shrink the list. Never add
  to that list by hand.
- **Contrast** (`packages/core/src/bin-night.test.ts`): every colour pair in
  Day and Night.
- **The style page** (`/style`, in `apps/client/src/components/style-page/`):
  every building block and sample Today, Week, House and admin-list pages,
  built from the real components. Shown when running locally, on staging
  and its previews, and in the e2e's build; production says it isn't there.
  Open `/style?panel=1` on a laptop for the side panel beside it. A new
  building block goes on this page in the PR that adds it.
- **Style page tests** (`apps/api/e2e/client-style.spec.ts`, part of the
  e2e): at 320, 390, a 1024 laptop with the panel open and 1440, they
  measure the layout rules (buttons in a row one width and height, side by
  side or stacked; no words cut off; icon buttons a 48 square; columns
  sharing a top edge) and compare a picture of each width in Day and Night
  with the one kept in `client-style.spec.ts-snapshots/`. A change that
  means to alter how something looks makes the pictures again:
  `npx playwright test client-style --project=laptop-chrome --update-snapshots`
  in `apps/api`, and the new pictures go in the PR.

## For agents

Load the `house-style` skill (`.claude/skills/house-style/SKILL.md`) for any
change to a screen, a component or a draft: it is the checklist that goes
with this guide.
