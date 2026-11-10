import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { BOOK_SOURCES, copyFor, FAMILY_BOOK, HOUSEMATES_BOOK } from "./copy-book";
import { joinPreview, joinSign } from "./share";
import { stringsOf } from "./strings-of";

/**
 * Families read their own words (docs/style/words.md, "Families"). A line
 * that names housemates or admins either suits both kinds of house, or sits
 * in the copy book (copy-book.ts) with a family line beside it, and is read
 * through copyFor(kind) (useCopy() in the app). These checks keep it so.
 */

/** Words a family must never read. */
const HOUSE_ONLY = /\b(housemates?|flatmates?|admins?)\b/i;

/**
 * Book lines a family never sees, so they need no family line: the Stake and
 * the housemate check's vote are hidden from a family (familyHides).
 */
const HOUSEMATES_ONLY: Record<string, string> = {};

/**
 * Sections outside the book that may say housemate: each says why a family
 * never reads it, or reads its own words elsewhere.
 */
const SECTION_REASONS: Record<string, string> = {
  ROLE_WORDS: "names both kinds' roles on purpose",
  FAMILY_COPY: "the family's own front door and Start a house, beside the housemates' words",
  KIND_SWITCH_COPY: "Rules' switch between the two kinds names both on purpose",
  HOUSE_DRAFT_COPY: "Describe your house's kinds of house, one of which is a flat share",
  PASS_COPY: "a family reads FAMILY_PASS_COPY through passWords",
  DISPUTE_COPY: "the housemate check, hidden from a family",
  NOTIFY_COPY: "in the book (checked above)",
};

/** Other files' strings that may say housemate, and why. */
const FILE_REASONS: Record<string, RegExp[]> = {
  // The switch between the two kinds names both.
  "wall.ts": [/the house housemates/i, /the house as housemates/i],
  // Book lines (HISTORY_COPY and SHARE_COPY), checked above.
  "history.ts": [/is a housemate now/i],
  "share.ts": [/^housemates?$/],
  // The style page's sample replies, about a sample house of housemates.
  "reply-samples.ts": [/./],
  // Ask Jonz's and the roles' own descriptions of paying the Stake, which a family hasn't got.
  "operations.ts": [/between housemates/i, /between housemates and family/i],
  "permissions.ts": [/between housemates/i],
  // How it works says a family is not housemates.
  "how-it-works.ts": [/is housemates, not a family/i, /a housemate can question a tick/i],
  // A bug report's role, read by the owner, not the house.
  "reports.ts": [/^housemate$/],
  // The legal pages are about every kind of house.
  "legal.ts": [/./],
  // Staging's demo house is housemates.
  "staging.ts": [/./],
  // The deal's test houses, never shown.
  "steady-houses.ts": [/./],
};

/** Every line of a section, by its path, as text: a function is called with a few likely arguments. */
function lines(section: unknown, path: string[] = []): { path: string[]; text: string }[] {
  if (typeof section === "string") return [{ path, text: section }];
  if (typeof section === "function") {
    const tries: unknown[][] = [[2, 2], [1, 1], ["Sam", "Sam"], [true, false], [false, true], [true, true]];
    const out = tries.map((args) => {
      try {
        const r = (section as (...a: unknown[]) => unknown)(...args);
        return typeof r === "string" ? r : "";
      } catch {
        return "";
      }
    });
    return [{ path, text: out.join(" | ") }];
  }
  if (typeof section === "object" && section !== null && !Array.isArray(section)) {
    return Object.entries(section).flatMap(([k, v]) => lines(v, [...path, k]));
  }
  return [];
}

function has(top: unknown, path: string[]): boolean {
  let at = top;
  for (const k of path) {
    if (typeof at !== "object" || at === null || !(k in at)) return false;
    at = (at as Record<string, unknown>)[k];
  }
  return true;
}

describe("copyFor", () => {
  it("gives a family its own lines and housemates the copy as written", () => {
    expect(copyFor("family").NEXT_UP.invite).toBe("Invite your family");
    expect(copyFor("family").SHELL.housemates(4)).toBe("4 in the family");
    expect(copyFor("family").NOTIFY.kinds).toMatchObject({ checks: "Ticks to OK", reminders: HOUSEMATES_BOOK.NOTIFY.kinds.reminders });
    expect(copyFor("family").NEXT_UP.label).toBe(HOUSEMATES_BOOK.NEXT_UP.label);
    expect(copyFor("housemates")).toBe(HOUSEMATES_BOOK);
  });

  it("names the family on its join link's card", () => {
    expect(joinSign({ name: "The Parks", members: 4, kind: "family" }).plate).toBe("Join the family on Jonz.");
    expect(joinPreview("TRC4QX7M", { name: "The Parks", members: 4, kind: "family" }).description).toMatch(/^4 in the family\./);
  });
});

describe("a family's words", () => {
  it("has a family line for every book line that names housemates or admins", () => {
    const missing: string[] = [];
    for (const [section, words] of Object.entries(HOUSEMATES_BOOK)) {
      for (const { path, text } of lines(words)) {
        const id = [section, ...path].join(".");
        if (!HOUSE_ONLY.test(text) || HOUSEMATES_ONLY[id]) continue;
        if (!has((FAMILY_BOOK as Record<string, unknown>)[section], path)) missing.push(`${id}: ${text}`);
      }
    }
    expect(missing, "add a family line to FAMILY_BOOK in copy-book.ts (or reword it for both kinds)").toEqual([]);
  });

  it("never names housemates or admins in a family line", () => {
    const wrong = Object.entries(copyFor("family"))
      .flatMap(([section, words]) => lines(words).map((l) => ({ ...l, id: [section, ...l.path].join(".") })))
      .filter((l) => HOUSE_ONLY.test(l.text) && !HOUSEMATES_ONLY[l.id])
      .map((l) => `${l.id}: ${l.text}`);
    expect(wrong).toEqual([]);
  });

  it("says housemate outside the book only where a family never reads it", () => {
    const copy = readFileSync(join(__dirname, "copy.ts"), "utf8");
    const inBook = new Set(Object.values(BOOK_SOURCES));
    const found: string[] = [];
    for (const block of copy.split(/^(?=export const )/m)) {
      const name = /^export const (\w+)/.exec(block)?.[1];
      if (!name || inBook.has(name) || SECTION_REASONS[name]) continue;
      for (const s of stringsOf(block)) if (/\bhousemates?\b/i.test(s)) found.push(`copy.ts ${name}: ${s}`);
    }
    const others = readdirSync(__dirname).filter((f) => f.endsWith(".ts") && !f.includes(".test.") && f !== "copy.ts" && f !== "copy-book.ts");
    for (const file of others) {
      const allowed = FILE_REASONS[file] ?? [];
      for (const s of stringsOf(readFileSync(join(__dirname, file), "utf8"))) {
        if (/\bhousemates?\b/i.test(s) && !/^housemates$/.test(s) && !allowed.some((r) => r.test(s))) found.push(`${file}: ${s}`);
      }
    }
    expect(found, "say it so it suits a family too, or move it into the copy book").toEqual([]);
  });

  it("reads the book's lines through copyFor, never straight from their section", () => {
    const root = join(__dirname, "..", "..", "..");
    const reads = Object.entries(FAMILY_BOOK).map(([section, family]) => {
      const source = BOOK_SOURCES[section as keyof typeof BOOK_SOURCES];
      return new RegExp(`\\b${source}\\.(${Object.keys(family).join("|")})\\b`);
    });
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (f === "node_modules" || f === "__tests__" || f.startsWith(".")) return [];
        return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
      });
    const found: string[] = [];
    for (const dir of ["packages/core/src", "apps/client/src", "apps/api/lib", "apps/api/app"]) {
      for (const file of files(join(root, dir))) {
        if (file.endsWith("copy-book.ts")) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (reads.some((r) => r.test(line))) found.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(found, "read it from copyFor(kind) or useCopy(), so a family gets its own line").toEqual([]);
  });
});
