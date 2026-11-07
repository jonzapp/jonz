import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  "errors.ts": [/\blet (it |\w+ )?off\b/i],
  // The sign-in emails' code placeholder is Supabase's {{ .Token }}.
  "auth-email.ts": [/\btokens?\b/i],
  // History's own name for a skip's event, matched in code, never shown.
  "history.ts": [/\bimmunity\b/i],
};

/** The text inside every string and template in `source`, with `${…}` and comments left out. */
export function stringsOf(source: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = source.length;
  const code = (stopAtBrace: boolean): void => {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (c === "/" && source[i + 1] === "/") {
        while (i < n && source[i] !== "\n") i++;
      } else if (c === "/" && source[i + 1] === "*") {
        i = source.indexOf("*/", i + 2);
        i = i < 0 ? n : i + 2;
      } else if (c === '"' || c === "'") {
        let s = "";
        i++;
        while (i < n && source[i] !== c) {
          if (source[i] === "\\") i++;
          s += source[i];
          i++;
        }
        i++;
        out.push(s);
      } else if (c === "`") {
        i++;
        let s = "";
        while (i < n && source[i] !== "`") {
          if (source[i] === "\\") {
            s += source[i + 1];
            i += 2;
          } else if (source[i] === "$" && source[i + 1] === "{") {
            i += 2;
            out.push(s);
            s = "";
            code(true);
          } else {
            s += source[i];
            i++;
          }
        }
        i++;
        out.push(s);
      } else if (c === "{") {
        depth++;
        i++;
      } else if (c === "}") {
        i++;
        if (stopAtBrace && depth === 0) return;
        depth--;
      } else {
        i++;
      }
    }
  };
  code(false);
  return out.filter((s) => s.trim() !== "");
}

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
});
