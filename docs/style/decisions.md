# Design decisions

Every design pick, newest first. The PR that builds a pick adds its line
here and changes the rule it affects (see [README.md](README.md)). Options
pages are private artifacts on claude.ai.

| Date | Decision | Where | Rule |
| --- | --- | --- | --- |
| 2026-11-01 | House's Overview is four figures (your month, the stake, housemates, the John list), then the Table beside the Wall; your settings, help and leaving move to a You page, the seventh in House's list | this PR | [layout](layout.md#navigation) |
| 2026-11-01 | Ten House pages are six: Groups on Johns, Admins beside Rules, Preferences with Time away as "Days and time away", History beside the Wall; old links land on the merged page | #94 | [layout](layout.md#navigation) |
| 2026-11-01 | House's pages on a laptop fill the room beside House's list, our own sections in columns (two at 1440, three at 1920); not names hanging left, one wide column or cards | #93 | [layout](layout.md#laptop-pages) |
| 2026-11-01 | Making an account with email asks for one name box (what housemates call you, no first and last) and a required tick box for the Terms and being 13 or older; no birthday | this PR | [controls](controls.md#inputs) |
| 2026-11-01 | Every 6-digit code is six equal boxes edge to edge with the button, filled in for you where a phone or password manager can, and checked on the sixth digit | #90 | [controls](controls.md#inputs) |
| 2026-11-01 | Sign-in works with password managers: real forms on the web, username and new-password boxes, Enter sends | #88 | [controls](controls.md#inputs) |
| 2026-10-31 | Report a problem in the app: House › Help, a sheet that lists the details before they're sent, Your reports with replies, and the owner's Inbox as the first admin page | #87 | [lists](lists.md#admin-lists) |
| 2026-10-31 | One style guide, a component kit with lint rules, and a screenshot-tested style page; the rules marked New in this guide approved with it | this guide | all |
| 2026-10-31 | Admin lists: one smart search box with filters as tags, for very many rows, no day headings | #85 | [lists](lists.md#admin-lists) |
| 2026-10-31 | Long lists load as you scroll with one shared foot; on a laptop list and panel scroll separately, search and column names pinned | #82 | [lists](lists.md#long-lists), [layout](layout.md#laptop-pages) |
| 2026-10-31 | Emails: look B, one sign and no logo above it; notices as the Panel shape | #77 | [feel](feel.md#signage) |
| 2026-10-31 | Copy key: full-width button, "Key copied" for 3 seconds | #75 | [controls](controls.md#kinds-of-button) |
| 2026-10-30 | Owner admin: title bar is title and sparkles only, actions beside what they change; panels become pages or sheets on a phone | #72 | [layout](layout.md#the-title-bar) |
| 2026-10-30 | AI thinking: square ticks and a step line, folding to "Thought for Ns" | #69 | [states](states.md#waiting) |
| 2026-10-30 | On call: a repeat Done it tap can't raise a second flag; undo removes it | #62 | [states](states.md#mistakes) |
| 2026-10-30 | In-app signs: street plate for Today's next John, square tick box, sentence-case section labels, commas in meta lines | #60 | [feel](feel.md#signage), [words](words.md) |
| 2026-10-29 | Laptop: docked side panel at the right edge, main up to 1040 from the left | #59 | [layout](layout.md#laptop-pages) |
| 2026-10-29 | Wall items name their John and use an icon for what happened | #55 | [lists](lists.md#rows) |
| 2026-10-29 | Undo and History; "Are you sure?" only when it can't be undone | #47 | [states](states.md#mistakes) |
| 2026-10-29 | Table's period is a menu (sheet on a phone, drop-down on a laptop); sparkles toggle has no grey highlight | #48 | [layout](layout.md#sheets-and-menus), [controls](controls.md#icon-buttons) |
| 2026-10-29 | Laptop columns share a top edge | #48 | [layout](layout.md#laptop-pages) |
| 2026-10-29 | House workspace on a laptop; Ask Jonz and an open John share the right slot | #44 | [layout](layout.md#laptop-pages) |
| 2026-10-29 | One title bar on every tab, sparkles at the right edge, page facts on the first line | #41 | [layout](layout.md#the-title-bar) |
| 2026-10-29 | Ask Jonz message box grows, send arrow inside it | #37 | [controls](controls.md#inputs) |
| 2026-10-29 | Back always returns to the tab's home | #34 | [layout](layout.md#navigation) |
| 2026-10-29 | Brand: the amber J road sign, signs on pavement, council-notice voice | #52 | [feel](feel.md) |
| 2026-10-29 | Plain international English, never "rota" | words | [feel](feel.md#voice) |
| 2026-10-28 | Track record as a week-by-week grid with a breakdown | #35 | [lists](lists.md#calendars-and-grids) |
| 2026-10-28 | Who's away as a month calendar, shaded days, a day sheet; today outlined | #23 | [lists](lists.md#calendars-and-grids) |
| 2026-10-28 | Options: 2 to 4 alternatives for one thing, one recommendation, one decision | working style | [feel](feel.md#drafts-and-options) |
| 2026-10-26 | Focus: three tabs, one John sheet, one row, six text roles, amber for one button | #17 | all |
