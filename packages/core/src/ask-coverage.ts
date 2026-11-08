import { PERMISSIONS, type Permission } from "./permissions";
import { PAGES, type PageName } from "./reply-format";

/**
 * How Ask Jonz handles every permission, so nothing someone may do is left
 * for Jonz to refuse with no way forward. Each is one of:
 *
 * - "reads": Jonz looks it up with its read tools.
 * - "card": Jonz proposes it with these tools, and the person approves it
 *   on the card. The API's tests check each tool is given with the
 *   permission and only then.
 * - "page": not from the chat yet. Jonz says so and gives a chip to the page
 *   where it's done, built from this list into Jonz's instructions.
 *
 * It's a Record over every permission, so adding a permission without
 * saying how Jonz handles it doesn't compile.
 */
export type AskCoverage =
  | { by: "reads" }
  | { by: "card"; tools: readonly string[] }
  | { by: "page"; page: PageName; where: string };

export const ASK_COVERAGE: Record<Permission, AskCoverage> = {
  "house:read": { by: "reads" },
  "ticks:write_own": { by: "page", page: "today", where: "their John on Today" },
  "away:write_own": { by: "card", tools: ["book_away", "cancel_away"] },
  "swaps:write_own": { by: "page", page: "today", where: "the John on Today (Ask to swap, or cover an overdue one), or the ask on Today to answer it" },
  "flags:write_own": { by: "page", page: "today", where: "the on-call John on Today" },
  "disputes:write_own": { by: "page", page: "week", where: "the ticked John on the Week" },
  "wall:write_own": { by: "page", page: "wall", where: "the Wall" },
  "perks:write_own": { by: "page", page: "today", where: "the John on Today" },
  "profile:write_own": { by: "page", page: "you", where: "You" },
  "members:write_own": { by: "page", page: "house", where: "the bottom of the House page" },
  "history:write_own": { by: "page", page: "history", where: "the move on History" },
  "payments:write_own": { by: "page", page: "stake", where: "the Stake page" },
  "billing:write_own": { by: "page", page: "pass", where: "the House Pass page" },
  "house:write": { by: "page", page: "rules", where: "House rules (a new code: Invite on the House page)" },
  "johns:write": { by: "card", tools: ["add_john", "change_john", "remove_john"] },
  // Making a group and changing who's in one; deleting one is on Groups (Jonz's instructions say so).
  "groups:write": { by: "card", tools: ["set_group"] },
  "weeks:write": { by: "page", page: "week", where: "the Week's menu" },
  "history:write": { by: "card", tools: ["offer_reset"] },
  "flags:write": { by: "page", page: "today", where: "the flagged John on Today" },
  "ticks:write": { by: "page", page: "today", where: "the kid's ticked John on Today" },
  "pocket_money:write": { by: "page", page: "house", where: "Pocket money on the House page" },
  "members:write": { by: "page", page: "house", where: "the person's page (remove, make admin), Admins, or Add a child, on the House page" },
};

/** The tools that carry out writes, from ASK_COVERAGE. */
export const ASK_WRITE_TOOLS: readonly string[] = [
  ...new Set(Object.values(ASK_COVERAGE).flatMap((c) => (c.by === "card" ? c.tools : []))),
];

/**
 * For Jonz's instructions: each move that isn't on the card yet, and the
 * page chip that does it, so Jonz always says where.
 */
export const ASK_ELSEWHERE_GUIDE = (Object.keys(ASK_COVERAGE) as Permission[])
  .flatMap((p) => {
    const c = ASK_COVERAGE[p];
    if (c.by !== "page") return [];
    return [`- ${PERMISSIONS[p]}: ${c.where}, [${PAGES[c.page].label}](jonz:page/${c.page}).`];
  })
  .join("\n");
