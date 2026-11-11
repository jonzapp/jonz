# The app's words, ready to translate

## What it does

Every sentence the app shows comes from one place, the words files, read
through FormatJS. A family reads its own sentences (never "housemates" or
"admins"), and adding a language later is a folder of the same lines.

## How it works

- **The words files.** `packages/core/src/locales/en/<part>.json`, one per
  part of the app (`today`, `week`, `john`, `house`, `people`, `wall`,
  `email`, `common`, and more as the lines move). Flat ids that start with the file's name
  (`today.nextUp.invite`), each line an ICU message:
  - a family's own sentence: `{kind, select, family {Invite your family} other {Invite housemates}}`
  - a count: `{count, plural, one {# housemate} other {# housemates}}`
  - a gap: `Make {name} a parent`
  Write whole sentences in each branch, never a word stitched into another
  sentence, so a translator can reorder them.
- **Reading them.** In the app, `const words = useWords()` then
  `words('today.nextUp.invite')` or `words('common.members', { count })`. A
  screen showing a house it was handed passes that house's kind:
  `useWords(view.snapshot.house.kind)`. Shared code, the API, emails and
  push use `wordsFor(language, kind)` from `@app/core`. The house's kind
  goes into every line by itself. Ids are typed, so a wrong id fails
  typecheck; a missing gap throws in tests and development. `kind` is the
  house's kind in every line, so never name another gap `kind`.
- **The checks.** `family-words.test.ts` reads every line every way it can
  be read (each select option, counts 0, 1, 2 and 5) and fails if a
  family's reading says housemate, flatmate or admin, or if a line doesn't
  parse; it also fails on housemate left in a core file's strings outside
  the words files. `words.test.ts` checks the words
  files for retired words too. In the app, ESLint's
  `formatjs/no-literal-string-in-jsx` stops new text typed into a screen;
  the screens that still have some are listed in `eslint-suppressions.json`.
- **Another language** (later): a folder beside `en/` with the same ids. A
  line it hasn't got yet is read in English. Each person picks their own
  language (`profiles.language`, from the phone's language at first).
  Privacy and Terms stay in English.

## The moves

The lines move part by part, one pull request each, merged one at a time:

1. FormatJS, `useWords()`/`wordsFor()`, the checks, and every line that
   differs for a family.
2. Today, Week and the John sheet (`today.json`, `week.json`, `john.json`).
   Shared code that says these lines takes the reader's `words` as its last
   argument (before any optional one), so the API and pushes pass
   `wordsFor(language, kind)` and screens pass `useWords()`.
3. House (Rules, the Johns, the Table, the Stake, You).
4. The Wall, History, emails and push.
5. The front door, sign-in, joining, errors, the Guide and tours.
6. In three parts. 6a: the shell, tabs, lists, busy buttons, page titles,
   link previews and Ask Jonz's chat and usage (`common.json`, `ask.json`);
   `copy.ts` is deleted and what wasn't words (the name, sections, looks)
   lives in `app.ts`. 6b: the other screens' leftover objects (resets,
   offers, reports, notices, approvals, account deletion, saved chats).
   6c: owner admin (`admin.json`), tours and the Guide's pages
   (`door.tour.*`, `door.guide.page.*`), and text typed into screens,
   joins included (`common.join.*`: a language may join two lines with
   something other than ", "); the lint rule's suppressions go, and only
   the style page (/style, a sample book) keeps written-in text.
7. The language setting, dates and money in the reader's language, Ask Jonz
   answering in it, and a pseudo-language to spot lines that never moved.

## Edge cases

- A link preview (a pasted join link) has no reader, so it's English.
- A line with a count of 0 or 1 says "Just you so far" where the house has
  only you.

## Done when

- [ ] A family reads no "housemate" or "admin" anywhere (`family-words.test.ts`).
- [ ] Every line on screen comes from a words file (step 6).
- [ ] A second language can be added as a folder, and each person can pick it (step 7).
