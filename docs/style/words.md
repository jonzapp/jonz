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
