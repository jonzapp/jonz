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
  "house.read": { by: "reads" },
  "ticks.own": { by: "page", page: "today", where: "their John on Today" },
  "away.book": { by: "card", tools: ["book_away", "cancel_away"] },
  "swaps.ask": { by: "page", page: "today", where: "the John on Today (Ask to swap), or the ask on Today to answer it" },
  "covers.take": { by: "page", page: "today", where: "the overdue John on Today" },
  "flags.raise": { by: "page", page: "today", where: "the on-call John on Today" },
  "disputes.raise": { by: "page", page: "week", where: "the ticked John on the Week" },
  "wall.react": { by: "page", page: "wall", where: "the Wall" },
  "perks.use": { by: "page", page: "today", where: "the John on Today" },
  "self.edit": { by: "page", page: "you", where: "You" },
  "house.leave": { by: "page", page: "house", where: "the bottom of the House page" },
  "house.settings": { by: "page", page: "rules", where: "House rules" },
  "johns.add": { by: "card", tools: ["add_john"] },
  "johns.edit": { by: "card", tools: ["change_john"] },
  "johns.remove": { by: "card", tools: ["remove_john"] },
  // Making a group and changing who's in one; deleting one is on Groups (Jonz's instructions say so).
  "groups.edit": { by: "card", tools: ["set_group"] },
  "week.deal": { by: "page", page: "week", where: "the Week's menu" },
  "history.reset": { by: "card", tools: ["offer_reset"] },
  "history.undo_any": { by: "card", tools: ["offer_reset"] },
  "flags.remove_any": { by: "page", page: "today", where: "the flagged John on Today" },
  "ticks.ok": { by: "page", page: "today", where: "the kid's ticked John on Today" },
  "pocket.pay": { by: "page", page: "house", where: "Pocket money on the House page" },
  "people.remove": { by: "page", page: "house", where: "the person's page, from the House page" },
  "people.roles": { by: "page", page: "house", where: "Admins on the House page, or the person's page" },
  "people.kids": { by: "page", page: "house", where: "Add a child on the House page" },
  "invite.reset": { by: "page", page: "house", where: "Invite on the House page" },
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
