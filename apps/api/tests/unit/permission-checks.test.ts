import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Who may do what is asked one way: public.can(house, permission), which
 * reads role_permissions (supabase/migrations/20270112090000_baseline.sql).
 * This reads every migration in order, keeps each function's and table
 * rule's last definition (the one that's live), and fails if any of them
 * checks the role by hand instead.
 */

const DIR = fileURLToPath(new URL("../../../../supabase/migrations/", import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

/** Functions that read the role for a rule of the house, not for permission. */
const HOUSE_RULES: Record<string, string> = {
  finish_account_deletion: "a house always keeps an admin: one is handed admin when the last leaves",
  remove_member: "the last admin can't be removed",
  set_member_role: "the last admin can't step down, and a role must be admin or member",
  pocket_earn: "parents don't earn pocket money",
  undo_action: "undoing a role change puts the old role back",
  owner_house: "the owner's read of a house lists its admins first; who may read it is is_owner()",
};

/** The live definition of every public function and table rule, by name. */
function live(): { functions: Map<string, string>; policies: Map<string, string> } {
  const functions = new Map<string, string>();
  const policies = new Map<string, string>();
  for (const file of files) {
    const sql = readFileSync(DIR + file, "utf8");
    // In the order they're written: a function from its header to the end of its $$ (or $function$) body, a rule to its semicolon, and drops.
    // Names with or without quotes: the baseline is a dump, which quotes them all.
    const statement =
      /create (?:or replace )?function "?public"?\."?([a-z_]+)"?\s*\([\s\S]*?as (\$[a-z]*\$)([\s\S]*?)\2|drop function (?:if exists )?"?public"?\."?([a-z_]+)"?|create policy "([^"]+)" on "?public"?\."?([a-z_]+)"?([\s\S]*?);|drop policy (?:if exists )?"([^"]+)" on "?public"?\."?([a-z_]+)"?/gi;
    for (const m of sql.matchAll(statement)) {
      if (m[1]) functions.set(m[1].toLowerCase(), m[3]);
      else if (m[4]) functions.delete(m[4].toLowerCase());
      else if (m[5]) policies.set(`${m[6]}: ${m[5]}`, m[7]);
      else if (m[8]) policies.delete(`${m[9]}: ${m[8]}`);
    }
  }
  return { functions, policies };
}

const BY_HAND = /is_admin\s*\(|role\s*(=|<>|!=)\s*'admin'/i;

describe("permission checks", () => {
  const { functions, policies } = live();

  it("finds the migrations' functions and table rules", () => {
    expect(functions.has("can")).toBe(true);
    expect(functions.has("save_group")).toBe(true);
    expect(policies.has("johns: admins edit Johns")).toBe(true);
  });

  it("is_admin is gone", () => {
    expect(functions.has("is_admin")).toBe(false);
  });

  it("no function checks the role by hand, except for a rule of the house", () => {
    const byHand = [...functions].filter(([name, body]) => BY_HAND.test(body) && !(name in HOUSE_RULES)).map(([name]) => name);
    expect(byHand).toEqual([]);
  });

  it("no table rule checks the role by hand", () => {
    const byHand = [...policies].filter(([, body]) => BY_HAND.test(body)).map(([name]) => name);
    expect(byHand).toEqual([]);
  });

  it("every rule of the house still reads the role (or leaves this list)", () => {
    for (const name of Object.keys(HOUSE_RULES)) expect(BY_HAND.test(functions.get(name) ?? ""), name).toBe(true);
  });
});
