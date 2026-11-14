import { OPERATIONS, OPERATION_NAMES, type Operation, type OperationName, type TableName } from "./operations";
import type { Permission } from "./permissions";

// Which of the house's writes Ask Jonz can put on a card, made from the
// registry, so a new house write is on the card without anyone writing a
// tool for it. Each one is a tool named after its operation, with the
// operation's own input (ask-operation-input.ts); the card applies it
// through the same call the app's own button makes, as the person, and
// nothing happens before they tap. A few writes have tools of their own
// that build richer cards (the John list, groups, resets, time away), and
// a few aren't moves someone asks for at all: both are listed here with why.

/** House writes Jonz does with a tool of its own, and which. */
export const ASK_OWN_TOOLS = {
  add_john: "add_john",
  add_johns: "add_john",
  change_john: "change_john",
  remove_john: "remove_john",
  save_group: "set_group",
  reset_house: "offer_reset",
} as const satisfies Partial<Record<OperationName, string>>;

/** House writes that aren't a move someone asks Jonz to make, and why. */
export const ASK_NOT_MOVES = {
  catch_up: "The app runs it when it opens, to deal any week that's due.",
  ask_house: "It's Ask Jonz itself.",
  undo_latest: "undo_action undoes any of the person's moves, by its ref from history.",
  answer_dispute: "It answers with a photo, which can only be taken in the app.",
  proof_upload: "It gets a place for a photo's bytes, which only the app has.",
} as const satisfies Partial<Record<OperationName, string>>;

const houseWrite = (name: OperationName) => {
  const o: Operation = OPERATIONS[name];
  return o.scope === "house" && o.effect === "write";
};

type Ops = typeof OPERATIONS;
type HouseWrite = { [K in keyof Ops]: Ops[K] extends { scope: "house"; effect: "write" } ? K : never }[keyof Ops];
/** A house write on the generic card. */
export type AskCardOperation = Exclude<HouseWrite, keyof typeof ASK_OWN_TOOLS | keyof typeof ASK_NOT_MOVES>;

/** The house writes Jonz puts on the generic card, one tool each. */
export const ASK_CARD_OPERATIONS = OPERATION_NAMES.filter(
  (n): n is AskCardOperation => houseWrite(n) && !(n in ASK_OWN_TOOLS) && !(n in ASK_NOT_MOVES),
);

/** The house permission an operation asks for, when it asks for one. */
export function operationPermission(name: OperationName): Permission | null {
  const g: Operation["guard"] = OPERATIONS[name].guard;
  return g.by === "permission" ? (g.permission as Permission) : null;
}

/**
 * Input keys that name something in the house by its id. Jonz gives a ref
 * (the first characters of the id, as its reads show them) and the card
 * finds the one row it stands for in `table`, as the person, so a ref only
 * ever reaches what they can see. `label` is the column that names it on
 * the card.
 */
export const ASK_REFS: Record<string, { table: TableName; column: string; label: string | null; what: string; many?: true }> = {
  assignmentId: { table: "assignments", column: "id", label: "name", what: "a John this week or last, from week" },
  mine: { table: "assignments", column: "id", label: "name", what: "the person's own John, from week" },
  theirs: { table: "assignments", column: "id", label: "name", what: "someone else's John, from week" },
  johnId: { table: "johns", column: "id", label: "name", what: "a John on the list, from list_johns" },
  disputeId: { table: "disputes", column: "id", label: null, what: "a questioned tick, from disputes" },
  offerId: { table: "swap_offers", column: "id", label: null, what: "a swap ask, from swaps" },
  actionId: { table: "house_actions", column: "id", label: "kind", what: "a move, from history" },
  eventId: { table: "events", column: "id", label: "kind", what: "a post on the Wall, from wall" },
  groupId: { table: "groups", column: "id", label: "name", what: "a group, from people" },
  kindId: { table: "john_kinds", column: "id", label: "name", what: "a kind of John, from list_johns" },
  moveToId: { table: "john_kinds", column: "id", label: "name", what: "the kind its Johns move to, from list_johns" },
  kinds: { table: "john_kinds", column: "id", label: "name", what: "every kind of John in the new order, from list_johns", many: true },
  weekId: { table: "weeks", column: "id", label: "starts_on", what: "a week, from week" },
  userId: { table: "members", column: "user_id", label: null, what: "someone in the house, from people" },
  fromId: { table: "members", column: "user_id", label: null, what: "someone in the house, from people" },
  toId: { table: "members", column: "user_id", label: null, what: "someone in the house, from people" },
  kidId: { table: "members", column: "user_id", label: null, what: "a child in the house, from people" },
  crew: { table: "members", column: "user_id", label: null, what: "each person who helped, from people", many: true },
};

/**
 * Card operations whose input is a whole row of settings: Jonz gives only
 * what changes, and the card fills the rest from the row as it is now. The
 * row is the one in `table` whose columns in `where` are the house's and
 * the person's; each key is read from its snake_case column, or the one
 * `columns` names. A record keyed by refs (ASK_REF_RECORDS) is added to the
 * row's, not put in its place.
 */
export type KeepCurrent = {
  table: TableName;
  where: Record<string, "house" | "me">;
  columns?: Record<string, string>;
};

export const ASK_KEEP_CURRENT: Partial<Record<AskCardOperation, KeepCurrent>> = {
  save_house_rules: { table: "houses", where: { id: "house" } },
  save_prefs: { table: "members", where: { house_id: "house", user_id: "me" }, columns: { days: "suits_days" } },
};

/** The column a kept key is read from. */
export const keptColumn = (keep: KeepCurrent, key: string) => keep.columns?.[key] ?? columnOf(key);

/** A camelCase input key's snake_case column. */
export const columnOf = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Input keys that are a record keyed by ids: Jonz keys it by refs, of the kind named here. */
export const ASK_REF_RECORDS: Record<string, string> = {
  rather: "johnId",
};

/** Input keys the card never asks Jonz for: the house is the chat's, and a photo can only be taken in the app. */
export const ASK_FILLED_KEYS = ["houseId", "photoPath"] as const;

/** How many characters of an id a ref is, as the reads show it. */
export const REF_LENGTH = 8;

/** An id as Jonz's reads show it. */
export const askRef = (id: string) => id.slice(0, REF_LENGTH);

/**
 * Every id a ref could stand for, as the first and last uuid that start
 * with it: a ref of hex digits only, at least REF_LENGTH of them, or null.
 */
export function refRange(ref: string): { from: string; to: string } | null {
  const hex = ref.trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]+$/.test(hex) || hex.length < REF_LENGTH || hex.length > 32) return null;
  const uuid = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { from: uuid(hex.padEnd(32, "0")), to: uuid(hex.padEnd(32, "f")) };
}

/** The card operations someone may make, from the permissions they hold. */
export function askOperationsFor(may: (p: Permission) => boolean): AskCardOperation[] {
  return ASK_CARD_OPERATIONS.filter((n) => {
    const p = operationPermission(n);
    return p !== null && may(p);
  });
}
