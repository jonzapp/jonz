import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EN } from "./locales";
import { stringsOf } from "./strings-of";

/**
 * The Jonz words (docs/style/words.md, "One word for each thing"): what
 * people read never uses a name the glossary retired. Only the text inside
 * strings is checked, so code names that keep the old words (immunity_tokens,
 * the excused outcome, IMMUNITY_EVERY) are fine.
 */
const FILES = [
  "copy.ts",
  "errors.ts",
  "wall.ts",
  "history.ts",
  "resets.ts",
  "format.ts",
  "legal.ts",
  "tours.ts",
  "auth-email.ts",
  "email.ts",
  "reports.ts",
  "pass.ts",
  "chat-moves.ts",
  "ask-coverage.ts",
  "ask-chats.ts",
];

const RETIRED: [RegExp, string][] = [
  [/\bhand(s|ed|ing)? (it |them )?out\b/i, "deal"],
  [/\bshar(e|es|ed|ing) (it |them )?out\b/i, "deal, or split for forfeits"],
  [/\bshared among\b/i, "split among"],
  [/\bshare of (the )?(month’s |others’ )?forfeits\b/i, "from the others’ forfeits"],
  [/\bimmunity\b/i, "a skip"],
  [/\btokens?\b/i, "a skip, or a swap"],
  [/\blet (it |\w+ )?off\b/i, "skipped (for a skip)"],
  [/\bjoin (link|code)\b/i, "an invite, or the code"],
  [/\binvite code\b/i, "the code"],
  [/^(it[’']s fine|it was done|it wasn[’']t)$/i, "Done / Not done"],
  [/\b\d* ?fine\b/i, "Done (the vote) or forfeit (the money)"],
  [/\btrade\b/i, "swap"],
  [/^done it\b/i, "Mark done"],
  [/\bphoto receipts?\b/i, "photos"],
  [/\beffort score\b/i, "points"],
  [/\bshared by\b/i, "Who it’s for"],
  [/\byou[’']re even\b/i, "square"],
  [/\bset up (your|the|a) house\b/i, "start a house"],
  [/\btop(ped)? the table\b/i, "top the week"],
  [/\brota\b/i, "take turns"],
];

/**
 * Admin fixes still let a result or a month off: that is the admin's own
 * word for waiving it, not a skip. These are the only places it may appear.
 */
const ALLOWED: Record<string, RegExp[]> = {
  "resets.ts": [/\blet (it |\w+ )?off\b/i],
  "copy.ts": [/\blet (it |\w+ )?off\b/i],
  // The sign-in emails' code placeholder is Supabase's {{ .Token }}.
  "auth-email.ts": [/\btokens?\b/i],
  // History's own name for a skip's event, matched in code, never shown.
  "history.ts": [/\bimmunity\b/i],
};

/** The same, for lines in the words files: the Stake's "Let off" is a month an admin waived. */
const ALLOWED_IDS: Record<string, RegExp[]> = {
  "house.stake.letOff": [/\blet (it |\w+ )?off\b/i],
  // An admin's reset that waived someone's John, or a month's forfeits (resets.ts).
  // An admin's reset outcomes, as the database names them (errors.ts).
  "errors.unknown_outcome": [/\blet (it |\w+ )?off\b/i],
  "errors.already_let_off": [/\blet (it |\w+ )?off\b/i],
  "wall.history.reset.excused": [/\blet (it |\w+ )?off\b/i],
  "wall.history.reset.letoff": [/\blet (it |\w+ )?off\b/i],
  "wall.history.reset.letoffAny": [/\blet (it |\w+ )?off\b/i],
};

describe("the Jonz words", () => {
  it("reads strings, not code or comments", () => {
    expect(stringsOf('// immunity\nconst a = "Use a skip"; /* token */ const b = `${n} ${n === 1 ? "skip" : "skips"} left`;')).toEqual([
      "Use a skip",
      "skip",
      "skips",
      " left",
    ]);
  });

  for (const file of FILES) {
    it(`${file} says each thing by its one name`, () => {
      const text = stringsOf(readFileSync(join(__dirname, file), "utf8"));
      const allowed = ALLOWED[file] ?? [];
      const found: string[] = [];
      for (const s of text) {
        for (const [word, say] of RETIRED) {
          if (word.test(s) && !allowed.some((a) => a.source === word.source)) found.push(`"${s}": say ${say}`);
        }
      }
      expect(found).toEqual([]);
    });
  }

  it("the words files (locales/en/) say each thing by its one name", () => {
    const found: string[] = [];
    for (const [id, line] of Object.entries(EN)) {
      for (const [word, say] of RETIRED) if (word.test(line) && !(ALLOWED_IDS[id] ?? []).some((a) => a.source === word.source)) found.push(`${id} "${line}": say ${say}`);
    }
    expect(found).toEqual([]);
  });

  it("keeps the gap named kind for the house's kind", () => {
    // wordsFor fills {kind} with the house's kind, over anything the screen passes.
    const misused = Object.entries(EN).filter(([, line]) => /\{kind(\}|,\s*(plural|number|date|time))/.test(line));
    expect(misused).toEqual([]);
  });
});
