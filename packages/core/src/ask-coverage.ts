import { ASK_CARD_OPERATIONS, ASK_OWN_TOOLS, operationPermission } from "./ask-operations";
import { OPERATION_NAMES } from "./operations";
import { PERMISSION_NAMES, type Permission } from "./permissions";

/**
 * How Ask Jonz handles every permission, so nothing someone may do is left
 * for Jonz to refuse with no way forward. Each is one of:
 *
 * - "reads": Jonz looks it up with its read tools.
 * - "card": Jonz proposes it with these tools, and the person approves it
 *   on the card. The API's tests check each tool is given with the
 *   permission and only then.
 *
 * Every write permission is on the card: its tools are the house writes
 * that ask for it (ask-operations.ts), so a new write is covered as soon as
 * it's in the registry. core's test fails if one is left with none.
 */
export type AskCoverage = { by: "reads" } | { by: "card"; tools: readonly string[] };

/**
 * Card tools a permission gives that its house writes don't name: time away
 * is the person's own (an account write) but asks for away:write_own, and
 * remove_flag removes anyone's flag for someone with flags:write.
 */
const OTHER_TOOLS: Partial<Record<Permission, readonly string[]>> = {
  "away:write_own": ["book_away", "cancel_away"],
  "flags:write": ["remove_flag"],
};

function toolsFor(p: Permission): string[] {
  const own = OPERATION_NAMES.flatMap((n) => {
    const tool = (ASK_OWN_TOOLS as Partial<Record<string, string>>)[n];
    return tool && operationPermission(n) === p ? [tool] : [];
  });
  const card = ASK_CARD_OPERATIONS.filter((n) => operationPermission(n) === p);
  return [...new Set([...(OTHER_TOOLS[p] ?? []), ...own, ...card])];
}

export const ASK_COVERAGE: Record<Permission, AskCoverage> = Object.fromEntries(
  PERMISSION_NAMES.map((p) => [p, p.endsWith(":read") ? { by: "reads" } : { by: "card", tools: toolsFor(p) }]),
) as Record<Permission, AskCoverage>;

/** The tools that carry out writes, from ASK_COVERAGE. */
export const ASK_WRITE_TOOLS: readonly string[] = [
  ...new Set(Object.values(ASK_COVERAGE).flatMap((c) => (c.by === "card" ? c.tools : []))),
];
