import { OPERATIONS, OPERATION_NAMES, isDangerous, type Operation, type OperationName } from "./operations";
import { OWNER_PERMISSION_NAMES, type OwnerAskCoverage, type OwnerMoveKind, type OwnerPermission } from "./owner-moves";

// How the owner's Ask Jonz does each of the admin pages' writes, made from
// the registry, as ask-operations.ts is for a house: every app write is a
// card move (with the tool that puts it there) or isn't a move someone asks
// for, with why. A new admin write doesn't compile until it says which, and
// each move's permission is its operation's own.

type Ops = typeof OPERATIONS;
type AppWrite = { [K in keyof Ops]: Ops[K] extends { scope: "app"; effect: "write" } ? K : never }[keyof Ops];

/** App writes that aren't a move someone asks the owner's Jonz to make, and why. */
export const OWNER_ASK_NOT_MOVES = {
  claim_owner_ask: "It's the owner's Ask Jonz itself, starting a turn.",
  finish_owner_ask: "It's the owner's Ask Jonz itself, finishing a turn.",
  ask_owner: "It's the owner's Ask Jonz itself.",
  keep_owner_ask_chat: "The chat saves itself.",
  update_owner_ask_chat: "The chat saves itself.",
  delete_owner_ask_chat: "Saved chats are deleted from Your chats.",
  owner_open_report: "Reading a report runs it: a new one is marked open.",
  claim_support_draft: "The support agent drafts a reply when the owner opens a report.",
  finish_support_draft: "The support agent saves its own draft.",
  owner_set_support_draft: "A draft is used or set aside on the report's sheet; Jonz puts its own reply on the card instead.",
  write_notice_copy: "Saving or ending a notice writes the copy itself.",
} as const satisfies Partial<Record<AppWrite, string>>;

type OwnerCardOperation = Exclude<AppWrite, keyof typeof OWNER_ASK_NOT_MOVES>;

/** Each admin write on the owner's card: the tool Jonz puts it there with, and the move the card makes. */
export const OWNER_ASK_OPERATIONS = {
  owner_reply_report: { tool: "reply_to_report", move: "report_reply" },
  owner_fix_report: { tool: "mark_report_fixed", move: "report_fixed" },
  owner_set_report_state: { tool: "reopen_report", move: "report_open" },
  owner_same_as: { tool: "set_same_as", move: "report_same_as" },
  save_notice: { tool: "save_notice", move: "notice_save" },
  end_notice: { tool: "end_notice", move: "notice_end" },
  owner_send_message: { tool: "send_message", move: "message_send" },
  owner_make_promotion: { tool: "make_promotion", move: "promotion_make" },
  owner_stop_promotion: { tool: "stop_promotion", move: "promotion_stop" },
  owner_promotion_emails: { tool: "email_promotion", move: "promotion_email" },
  retry_promotion: { tool: "retry_promotion", move: "promotion_retry" },
  owner_delete_now: { tool: "delete_account_now", move: "deletion_now" },
  owner_stop_deletion: { tool: "stop_deletion", move: "deletion_stop" },
  owner_request_deletion: { tool: "start_deletion", move: "deletion_start" },
  owner_delete_house: { tool: "delete_house", move: "house_delete" },
  owner_reset_house_data: { tool: "reset_house", move: "house_reset" },
} as const satisfies Record<OwnerCardOperation, { tool: string; move: OwnerMoveKind }>;

type CardEntry = (typeof OWNER_ASK_OPERATIONS)[OwnerCardOperation];
const CARD = Object.entries(OWNER_ASK_OPERATIONS) as [OwnerCardOperation, CardEntry][];

/** The app permission an operation asks for. */
export function ownerOperationPermission(name: OperationName): OwnerPermission | null {
  const g: Operation["guard"] = OPERATIONS[name].guard;
  return g.by === "permission" && (OWNER_PERMISSION_NAMES as readonly string[]).includes(g.permission) ? (g.permission as OwnerPermission) : null;
}

/** The operation each card move makes, when the owner taps. */
export const OWNER_MOVE_OPERATION = Object.fromEntries(CARD.map(([op, c]) => [c.move, op])) as Record<OwnerMoveKind, OwnerCardOperation>;

/** Which permission each move needs: its operation's own. */
export const OWNER_MOVE_PERMISSION = Object.fromEntries(CARD.map(([op, c]) => [c.move, ownerOperationPermission(op)!])) as Record<OwnerMoveKind, OwnerPermission>;

/** What a move's tool tells Jonz it does, first: its operation's words in the registry. */
export const ownerToolAbout = (tool: string): string => {
  const found = CARD.find(([, c]) => c.tool === tool);
  return found ? OPERATIONS[found[0]].about : "";
};

/**
 * How the owner's Ask Jonz handles each permission: it reads it, or it
 * puts it on the card with the tools of the admin writes that ask for it.
 * Every one is in the chat: none is left for the owner to go and do on a page.
 */
export const OWNER_ASK_COVERAGE: Record<OwnerPermission, OwnerAskCoverage> = Object.fromEntries(
  OWNER_PERMISSION_NAMES.map((p) => {
    const tools = CARD.filter(([op]) => ownerOperationPermission(op) === p).map(([, c]) => c.tool);
    return [p, p.endsWith(":read") ? { by: "reads" } : { by: "card", tools }];
  }),
) as Record<OwnerPermission, OwnerAskCoverage>;

/** The owner's write tools, from OWNER_ASK_COVERAGE. */
export const OWNER_WRITE_TOOLS: readonly string[] = [...new Set(Object.values(OWNER_ASK_COVERAGE).flatMap((c) => (c.by === "card" ? c.tools : [])))];

/** Every app write, for the tests: on the card or not a move. */
export const APP_WRITES = OPERATION_NAMES.filter((n) => OPERATIONS[n].scope === "app" && OPERATIONS[n].effect === "write");

/** Whether an owner's card move can't be taken back: the `destructive` of the operation it makes. */
export function ownerMoveIsDangerous(kind: OwnerMoveKind): boolean {
  return isDangerous(OWNER_MOVE_OPERATION[kind]);
}
