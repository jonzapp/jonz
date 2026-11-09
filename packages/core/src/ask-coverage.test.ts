import { describe, expect, it } from "vitest";

import { ASK_COVERAGE } from "./ask-coverage";
import { askRefKeys, askToolInput } from "./ask-operation-input";
import { ASK_CARD_OPERATIONS, ASK_FILLED_KEYS, ASK_KEEP_CURRENT, ASK_NOT_MOVES, ASK_REF_RECORDS, ASK_OWN_TOOLS, ASK_REFS, askRef, keptColumn, refRange } from "./ask-operations";
import { OPERATION_IO } from "./operation-io";
import { OPERATIONS, OPERATION_NAMES, TABLES } from "./operations";
import { PERMISSION_NAMES } from "./permissions";
import { TABLE_ROWS } from "./table-rows";

const nulls = (n: Parameters<typeof askToolInput>[0]) => Object.fromEntries(Object.keys(askToolInput(n).shape).map((k) => [k, null]));

const houseWrites = OPERATION_NAMES.filter((n) => OPERATIONS[n].scope === "house" && OPERATIONS[n].effect === "write");

describe("ASK_COVERAGE", () => {
  it("says how Ask Jonz handles every permission", () => {
    expect(Object.keys(ASK_COVERAGE).sort()).toEqual([...PERMISSION_NAMES].sort());
  });

  it("puts every write permission on the card, with at least one tool", () => {
    for (const [perm, c] of Object.entries(ASK_COVERAGE)) {
      if (perm.endsWith(":read")) expect(c, perm).toEqual({ by: "reads" });
      else expect(c.by === "card" && c.tools.length > 0, perm).toBe(true);
    }
  });
});

describe("the card's operations", () => {
  it("covers every house write: on the card, with a tool of its own, or not a move, never two of these", () => {
    for (const n of houseWrites) {
      const where = [ASK_CARD_OPERATIONS.includes(n as never), n in ASK_OWN_TOOLS, n in ASK_NOT_MOVES].filter(Boolean);
      expect(where, n).toHaveLength(1);
    }
  });

  it("names a table of the registry for every ref", () => {
    for (const [key, r] of Object.entries(ASK_REFS)) expect(r.table in TABLES, key).toBe(true);
  });

  it("gives every id an operation on the card takes a ref, or fills it in", () => {
    for (const n of ASK_CARD_OPERATIONS) {
      for (const [key, field] of Object.entries(OPERATION_IO[n].input.shape)) {
        const uuid = JSON.stringify((field as { toJSONSchema(): unknown }).toJSONSchema()).includes('"format":"uuid"');
        if (uuid) expect(key in ASK_REFS || key in ASK_REF_RECORDS || ASK_FILLED_KEYS.includes(key as never), `${n}.${key}`).toBe(true);
      }
    }
  });

  it("never needs a photo, which only the app can take", () => {
    for (const n of ASK_CARD_OPERATIONS) {
      const photo = (OPERATION_IO[n].input.shape as Record<string, { safeParse(v: unknown): { success: boolean } }>).photoPath;
      if (photo) expect(photo.safeParse(undefined).success, n).toBe(true);
    }
  });

  it("fills a settings row's unchanged keys from columns the row has", () => {
    for (const [n, keep] of Object.entries(ASK_KEEP_CURRENT)) {
      const columns = Object.keys((TABLE_ROWS as Record<string, { shape: object }>)[keep!.table].shape);
      const camel = (c: string) => c.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
      for (const column of Object.keys(keep!.where)) expect(columns, `${n} where ${column}`).toContain(camel(column));
      for (const key of Object.keys(OPERATION_IO[n as keyof typeof OPERATION_IO].input.shape)) {
        if (ASK_FILLED_KEYS.includes(key as never)) continue;
        expect(columns, `${n}.${key}`).toContain(camel(keptColumn(keep!, key)));
        expect(askToolInput(n as never).shape[key].safeParse(null).success, `${n}.${key}`).toBe(true);
      }
    }
    expect(askToolInput("save_house_rules").safeParse({ ...nulls("save_house_rules"), stakeMinor: 500 }).success).toBe(true);
  });

  it("builds each tool's input from the operation's, with refs for ids and nothing filled in", () => {
    for (const n of ASK_CARD_OPERATIONS) {
      const keys = Object.keys(askToolInput(n).shape);
      for (const k of ASK_FILLED_KEYS) expect(keys, n).not.toContain(k);
      for (const k of askRefKeys(n)) {
        const ref = ASK_REFS[k].many ? ["1a2b3c4d"] : "1a2b3c4d";
        expect(askToolInput(n).shape[k].safeParse(ref).success, `${n}.${k}`).toBe(true);
      }
    }
    // Preferences are keyed by Johns' refs.
    expect(askToolInput("save_prefs").safeParse({ days: [1], bestTime: null, rather: { "1a2b3c4d": -1 } }).success).toBe(true);
    for (const kind of Object.values(ASK_REF_RECORDS)) expect(kind in ASK_REFS).toBe(true);
    // A tick takes the John's ref; the photo is the app's to take.
    expect(Object.keys(askToolInput("mark_done").shape)).toEqual(["assignmentId"]);
    expect(askToolInput("answer_swap").safeParse({ offerId: "1a2b3c4d", accept: true }).success).toBe(true);
  });
});

describe("refs", () => {
  it("are the first characters of an id, and stand for every id that starts with them", () => {
    const id = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    expect(askRef(id)).toBe("1a2b3c4d");
    expect(refRange("1A2B3C4D")).toEqual({ from: "1a2b3c4d-0000-0000-0000-000000000000", to: "1a2b3c4d-ffff-ffff-ffff-ffffffffffff" });
    expect(refRange(id)).toEqual({ from: id, to: id });
  });

  it("aren't anything shorter or other than hex", () => {
    expect(refRange("1a2b")).toBeNull();
    expect(refRange("j1")).toBeNull();
    expect(refRange("1a2b3c4d'; drop")).toBeNull();
  });
});
