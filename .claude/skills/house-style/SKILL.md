---
name: house-style
description: Jonz's house style checklist. Load before changing any screen, component, sheet, email or draft mockup in this repo, and before showing Glyn design options.
---

# House style checklist

The rules are in `docs/style/` (start at `docs/style/README.md`). This is
the checklist that goes with them. Work through it for every UI change.

## Before you start

1. Read the guide's page for each topic you touch: `feel.md` always, then
   `layout.md`, `lists.md`, `controls.md`, `states.md` or `words.md`.
2. Use the shared components in `apps/client/src/components/` (listed in
   `apps/client/AGENTS.md`). If one is missing, add it there, not inside a
   screen.
3. Take every value from the theme: `useTheme()` colours and text roles,
   `SPACE`, `TAP`, `RADIUS`, `GUTTER`, `INSET` and the other sizes in
   `apps/client/src/theme.ts`. No colour, font size or spacing typed by hand.

## While you build

- One amber button per screen at most. Hazard only for late, missed,
  disputed or money owed, always with an icon and a word.
- Buttons side by side: equal widths, stacking at full width when they don't
  fit. Never sized to their words, never cut off with "…".
- Icon-only buttons: one size, one look, each with a spoken name.
- A side panel on a laptop is a pushed page or a sheet on a phone. One sheet
  at a time. Short choices are a `PickMenu`.
- Lists: one `Row`, urgent first, finished things folded, long lists load as
  you scroll with the shared foot, a designed empty state.
- Words: the six text roles, caps only for the page title and short grid
  labels, commas not " · ", plain international English, no emoji, no
  exclamation marks. A chore is a John.

## Before you say it's done

1. `npm run lint`, `npm run typecheck`, `npm test`.
2. Look at the change at 320 (small phone), 390 (phone), a laptop with the
   Ask Jonz panel open, and 1440, each in Day and Night. Check: nothing cut
   off or overlapping, buttons in a row equal, columns sharing a top edge,
   targets at least 48. The style page (`/style`, `/style?panel=1`) shows
   every building block at once; add any new block to it.
3. Put those pictures in the PR (its Pictures section). If the style page's
   pictures changed on purpose, make them again (docs/style/README.md, "What
   checks it") and say why in the PR.

## Design options for Glyn

- Show them in the standard picker: load the `design-options-picker` skill
  (`.claude/skills/design-options-picker/SKILL.md`). It opens on One at a
  time, with Phone and Laptop, Day and Night.
- Theme the picker in Bin Night, using the `theme` block in this skill's
  `picker-theme` section below.
- Show the real app: every step is a screenshot of the web build (or a draft
  built from the real components with sample data). Never hand-drawn HTML.
  For Live preview, give the option a `liveUrl` to the branch's Vercel
  preview or to staging.
- 2 to 4 true alternatives for one thing, one recommended, one decision.
  Several pages in one piece of work (say the admin page and the app page)
  are separate `items` in one picker, not separate pages.
  Plain English; he often reads on an iPhone.

### picker-theme

```js
theme: {
  font: '"Overpass", "Helvetica Neue", Arial, sans-serif',
  display: '"Overpass", "Arial Black", Arial, sans-serif',
  titleCase: 'uppercase', titleWeight: 900,
  light: { bg: '#e7e9e5', surface: '#f7f8f5', sunk: '#dde0db', fg: '#16181a', muted: '#596066', line: '#c5c9c3', accent: '#16181a', onAccent: '#f7f8f5', rec: '#f6b800', onRec: '#16181a', bezel: '#16181a' },
  dark: { bg: '#111315', surface: '#1a1d20', sunk: '#24282c', fg: '#edefeb', muted: '#99a0a5', line: '#2c3135', accent: '#ffc21a', onAccent: '#111315', rec: '#ffc21a', onRec: '#111315', bezel: '#2c3135' }
}
```

If `apps/client/src/theme.ts` changes these colours, change them here too.

## When Glyn picks something

In the PR that builds it, change the rule in `docs/style/` and add a line to
`docs/style/decisions.md` (date, the pick in a sentence, the PR). If the pick
replaces a rule, rewrite that rule rather than adding a second one. Never
change a rule without a pick behind it.
