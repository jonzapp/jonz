# Code standards

The 12 rules every source file in `apps`, `packages` and `scripts` follows.
Glyn agreed them on 12 November 2026 (the "Jonz clean code review" doc).
They are Robert C. Martin's *Clean Code*, fitted to this repo. Read this
before a refactor, and before adding a file or a long function.

`npm run code:standards` checks every rule a machine can check
(`scripts/ci/code-standards.mjs`). CI runs it in `checks`, so a PR that
breaks a rule fails. What already broke a rule on the day the check was
added is listed in `scripts/ci/code-standards-exceptions.json`. The check
fails when:

- something breaks a rule and isn't on the list (a new break);
- something on the list got worse (a long file or function grew past the
  size it was listed at);
- something on the list is fixed (take it off: `npm run code:standards --
  --update`), so the list only ever shrinks.

A PR that has to add to the list says why in its description. The database
has its own rules in `database.md`, and how the app looks has `docs/style/`.

## The rules

1. **One home for each rule.** Anything that decides something is written
   once, in `packages/core`, and the apps call it. Copy something a third
   time and it becomes a shared function; not before, so nothing is built
   for a use that never comes. *Checked: the same 8 lines twice in source
   (jscpd).*
2. **No dead code.** Unused files, functions, exports, packages, finished
   feature switches and commented-out code are deleted. Git remembers them.
   A package is listed in the workspace that imports it. *Checked: unused
   files, exports and packages, and packages used but not listed (knip,
   `knip.json`).*
3. **Small files.** A source file over 500 lines is flagged, and over 800
   it must be split. Generated files, plain lists of data
   (`operation-io.ts`) and migrations are exempt. *Checked.*
4. **Small functions that do one thing.** A function is at most 60 lines (a
   screen component 150) and nests at most 4 levels of `if`, loop, `switch`
   and `try`. *Checked.*
5. **Few arguments.** More than 3 means one named options object. No
   true/false argument that switches what a function does: write two
   functions, or name the choice (`{ replace: true }`). An answer (`approve`,
   `accept`) is not a switch. *Checked: the count. The switch is for review.*
6. **Names say what it is.** One word per thing (`docs/style/words.md`), no
   abbreviations, no `data`, `info` or `helper2`. A file is named for what
   it holds, not where it shows on a screen. *For review.*
7. **Comments say why, never what.** No stale comment, and no TODO without
   who or when. *For review.*
8. **Imports flow one way.** Apps use packages, never each other; screens
   show and core decides; no two files import each other's values in a
   circle. *Checked: circles (a type-only import doesn't count, since it is
   gone once compiled). The one-way rule is AGENTS.md's.*
9. **Errors are never swallowed.** No empty `catch`, and one way to turn an
   error into a sentence (`errors.ts`). *For review.*
10. **Honest types.** No `any`, and no switching off the type checker or a
    lint rule without the reason beside it. *Checked by lint.*
11. **Tests are code too.** Shared set-up instead of copy-paste, one reason
    to fail per test, and never the real clock: a test passes the same on
    any day at any hour. *Checked: `new Date()` and `Date.now()` in a test
    file.*
12. **Cleanups change nothing a person can see.** They go in their own PRs,
    apart from features, with the tests green before and after.

## Working with the check

- **It failed on something new.** Fix it: split the function, delete the
  export, list the package. That is nearly always quicker than it looks.
- **It failed because a listed file or function grew.** Move the new part
  into its own function or file. The listed size is a ceiling, not a target.
- **It says something is fixed.** Run `npm run code:standards -- --update`
  and commit the shorter list.
- **The break is right for a reason.** Run `--update`, and say why in the
  PR. A reviewer sees every line the list gains.
