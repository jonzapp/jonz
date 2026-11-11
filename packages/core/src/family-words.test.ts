import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { EN, EN_FILES, type WordId } from "./locales";
import { joinPreview, joinSign } from "./share";
import { stringsOf } from "./strings-of";
import { wordsFor, type WordValues } from "./words-for";

/**
 * Families read their own words (docs/style/words.md, "Families"). A line
 * that names housemates or admins either suits both kinds of house, or sits
 * in the words files (locales/en/) as `{kind, select, family {…} other {…}}`,
 * a whole sentence for each. These checks keep it so.
 */

/** Words a family must never read. */
const HOUSE_ONLY = /\b(housemates?|flatmates?|admins?)\b/i;

/** Lines a family never sees, so they need no family sentence, and why. */
const HOUSEMATES_ONLY: Partial<Record<WordId, string>> = {
  "common.report.role.admin": "the owner's Inbox names a reporter's role as the database does",
  "common.report.role.member": "the owner's Inbox names a reporter's role as the database does",
  "common.staging.demoBody": "staging's demo house is a housemates house",
  "ask.draft.starter.flat_share.meta": "names the flat-share starter list, picked by name in any house",
  "errors.ask_limit": "the owner's Ask Jonz limit, which points at the owner's admin pages",
  "door.newHouse.intro": "a family reads house.family.newIntro through newHouseWords",
  "house.family.kinds.housemates": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.keep": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.toFamilyNow": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.toFamilyLater": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.toHousematesTitle": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.toHousemates": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.toHousematesConfirm": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.done.housemates": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.done.kept": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.wall.kept": "Rules' switch between the two kinds names both on purpose",
  "house.kindSwitch.wall.housemates": "Rules' switch between the two kinds names both on purpose",
  "door.guide.page.family.not": "the guide's family page as a housemates house reads it",
  "house.pass.free": "a family reads house.familyPass.free through passWords",
};

/** Every gap a line has, by name, and what kind of gap it is. */
function gaps(elements: MessageFormatElement[], out = new Map<string, MessageFormatElement>()) {
  for (const e of elements) {
    if (e.type === TYPE.literal || e.type === TYPE.pound) continue;
    if (!out.has(e.value)) out.set(e.value, e);
    if (e.type === TYPE.select || e.type === TYPE.plural) for (const o of Object.values(e.options)) gaps(o.value, out);
    if (e.type === TYPE.tag) gaps(e.children, out);
  }
  return out;
}

/** The ways a line can be read: every select's options and a few counts, with names in the other gaps. */
function readings(id: WordId): WordValues[] {
  let all: WordValues[] = [{}];
  for (const [name, e] of gaps(parse(EN[id]))) {
    if (name === "kind") continue;
    const values: (string | number)[] =
      e.type === TYPE.select ? Object.keys(e.options) : e.type === TYPE.plural || e.type === TYPE.number ? [0, 1, 2, 5] : ["Sam"];
    all = all.flatMap((v) => values.map((x) => ({ ...v, [name]: x })));
  }
  return all;
}

/** Other files' strings that may say housemate, and why. */
const FILE_REASONS: Record<string, RegExp[]> = {
  // The Wall's line for the switch between the two kinds, by its id.
  "house-lower.ts": [/^house\.kindSwitch\./],
  // The switch between the two kinds names both.
  "wall.ts": [/the house housemates/i, /the house as housemates/i],
  // The style page's sample replies, about a sample house of housemates.
  "reply-samples.ts": [/./],
  // Ask Jonz's and the roles' own descriptions of paying the Stake, which a family hasn't got.
  "operations.ts": [/between housemates/i, /between housemates and family/i],
  "permissions.ts": [/between housemates/i],
  // How it works says a family is not housemates.
  "how-it-works.ts": [/is housemates, not a family/i, /a housemate can question a tick/i],
  // The owner's house panel names the kind of house; only the owner reads it.
  "owner-houses.ts": [/^Housemates$/],
  // A bug report's role, read by the owner, not the house.
  "reports.ts": [/^housemate$/],
  // The legal pages are about every kind of house.
  "legal.ts": [/./],
  // Staging's demo house is housemates.
  "staging.ts": [/./],
  // The deal's test houses, never shown.
  "steady-houses.ts": [/./],
};

describe("wordsFor", () => {
  it("gives a family its own lines and housemates theirs", () => {
    const family = wordsFor("en", "family");
    const house = wordsFor("en", "housemates");
    expect(family("today.nextUp.invite")).toBe("Invite your family");
    expect(house("today.nextUp.invite")).toBe("Invite housemates");
    expect(family("common.members", { count: 4 })).toBe("4 in the family");
    expect(house("common.members", { count: 1 })).toBe("1 housemate");
    expect(house("common.members", { count: 4 })).toBe("4 housemates");
    expect(house("today.nextUp.soFar", { count: 1 })).toBe("Just you so far");
    expect(family("today.nextUp.soFar", { count: 4 })).toBe("4 in the family so far");
    expect(family("house.setup.canChange", { names: "Sam", count: 1 })).toBe("Sam (parent) can change these.");
    expect(house("house.setup.canChange", { names: "Sam and Tom", count: 2 })).toBe("Sam and Tom (admins) can change these.");
  });

  it("names the family on its join link's card", () => {
    expect(joinSign({ name: "The Parks", members: 4, kind: "family" }).plate).toBe("Join the family on Jonz.");
    expect(joinPreview("TRC4QX7M", { name: "The Parks", members: 4, kind: "family" }).description).toMatch(/^4 in the family\./);
  });

  it("fails loudly on a line's missing gap while building", () => {
    expect(() => wordsFor("en", "family")("house.admins.make")).toThrow();
  });
});

describe("the words files", () => {
  it("start every id with the file's name, once across all of them", () => {
    const seen = new Set<string>();
    for (const [file, lines] of Object.entries(EN_FILES)) {
      for (const id of Object.keys(lines)) {
        expect(id.startsWith(`${file}.`), id).toBe(true);
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
  });

  it("are all ICU messages that read for both kinds of house", () => {
    for (const id of Object.keys(EN) as WordId[]) {
      for (const values of readings(id)) {
        expect(wordsFor("en", "housemates")(id, values), id).not.toBe("");
        expect(wordsFor("en", "family")(id, values), id).not.toBe("");
      }
    }
  });
});

describe("a family's words", () => {
  it("never names housemates or admins in a family's line", () => {
    const family = wordsFor("en", "family");
    const wrong = (Object.keys(EN) as WordId[])
      // The owner's admin pages (admin.*) are read by the owner, never by a family.
      .filter((id) => !HOUSEMATES_ONLY[id] && !id.startsWith("admin."))
      .flatMap((id) => readings(id).map((v) => `${id}: ${family(id, v)}`))
      .filter((line) => HOUSE_ONLY.test(line.slice(line.indexOf(": ") + 2)));
    expect(wrong, "give the line a family sentence: {kind, select, family {…} other {…}}").toEqual([]);
  });

  it("says housemate or admin outside the words files only where a family never reads it", () => {
    const found: string[] = [];
    const others = readdirSync(__dirname).filter((f) => f.endsWith(".ts") && !f.includes(".test."));
    for (const file of others) {
      const allowed = FILE_REASONS[file] ?? [];
      for (const s of stringsOf(readFileSync(join(__dirname, file), "utf8"))) {
        if (/\bhousemates?\b/i.test(s) && !/^housemates$/.test(s) && !allowed.some((r) => r.test(s))) found.push(`${file}: ${s}`);
      }
    }
    expect(found, "say it so it suits a family too, or move it into a words file with a family sentence").toEqual([]);
  });
});
