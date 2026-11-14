import "server-only";

import {
  ASK_KEEP_CURRENT,
  ASK_REF_RECORDS,
  ASK_REFS,
  askRefKeys,
  askRefRecordKeys,
  keptColumn,
  CHAT_MOVES_MAX,
  firstName,
  OPERATION_IO,
  OPERATIONS,
  operationPermission,
  refRange,
  type AskCardOperation,
  type ChatMove,
  type EditResult,
  type Permission,
} from "@app/core";

import type { Caller } from "./disputes";

// Ask Jonz's card for any house write (core ask-operations.ts): Jonz names
// what it refers to by refs from its reads, and here each ref becomes the
// one id it stands for, looked up as the person, so a ref only ever reaches
// what they can see. The whole input is then checked against the
// operation's own (OPERATION_IO), and the move goes on the card with the
// names of what it touches. Nothing is done until they tap; the card makes
// the same call the app's own button does, which checks again.

/** What a card move's tool is given: its input in refs, and Jonz's few words for the card. */
export type OperationOffer = Record<string, unknown> & { say: string };

const NOT_ALLOWED: EditResult = { ok: false, said: "That isn't something this person can do." };

/** Who is asking, in which house, and how the card names people. */
interface Offering {
  caller: Caller;
  houseId: string;
  nameOf: (id: string) => string;
}

/** A card move as it is being made: its input, refs swapped for ids as it goes, and the labels found on the way. */
interface Draft {
  name: AskCardOperation;
  input: Record<string, unknown>;
  labels: string[];
}

const LOOKUP_FAILED = "That couldn't be looked up just now.";

/** The one id `ref` stands for in its table, and what to call it; or what's wrong. */
async function resolve({ caller, houseId, nameOf }: Offering, key: string, ref: string): Promise<{ id: string; label: string | null } | { problem: string }> {
  const r = ASK_REFS[key];
  const range = refRange(ref);
  if (!range) return { problem: `“${ref}” isn't a ref: give the first 8 characters of its id, from ${r.what.split(", from ")[1] ?? "a read"}.` };
  const columns = r.label ? `${r.column}, ${r.label}` : r.column;
  const { data, error } = await caller.db
    .from(r.table)
    .select(columns)
    .filter("house_id", "eq", houseId)
    .filter(r.column, "gte", range.from)
    .filter(r.column, "lte", range.to)
    .limit(2);
  if (error) return { problem: LOOKUP_FAILED };
  const rows = (data ?? []) as unknown as Record<string, string | null>[];
  if (rows.length === 0) return { problem: `Nothing in the house has the ref ${ref} for ${key}: it should be ${r.what}.` };
  if (rows.length > 1) return { problem: `More than one thing starts ${ref}: give more of its id.` };
  const id = rows[0][r.column] as string;
  const label = r.table === "members" ? nameOf(id) : r.label ? (rows[0][r.label] ?? null) : null;
  return { id, label };
}

/** Swaps each ref the input gives (one, or a list) for its id. Hands back what's wrong, or null. */
async function swapRefs(o: Offering, { name, input, labels }: Draft): Promise<string | null> {
  for (const key of askRefKeys(name)) {
    const value = input[key];
    if (value === undefined) continue;
    const refs = Array.isArray(value) ? value : [value];
    const ids: string[] = [];
    for (const ref of refs) {
      const found = await resolve(o, key, String(ref));
      if ("problem" in found) return found.problem;
      ids.push(found.id);
      if (found.label) labels.push(found.label);
    }
    input[key] = Array.isArray(value) ? ids : ids[0];
  }
  return null;
}

/** The same for inputs keyed by ref ({ ref: value }). */
async function swapRefRecords(o: Offering, { name, input, labels }: Draft): Promise<string | null> {
  for (const key of askRefRecordKeys(name)) {
    const value = input[key];
    if (value === undefined || typeof value !== "object" || Array.isArray(value)) continue;
    const keyed: Record<string, unknown> = {};
    for (const [ref, v] of Object.entries(value as Record<string, unknown>)) {
      const found = await resolve(o, ASK_REF_RECORDS[key], ref);
      if ("problem" in found) return found.problem;
      keyed[found.id] = v;
      if (found.label) labels.push(found.label);
    }
    input[key] = keyed;
  }
  return null;
}

/** Jonz gave what changes; everything else stays as the row has it now. Hands back what's wrong, or null. */
async function keepCurrent({ caller, houseId }: Offering, { name, input }: Draft): Promise<string | null> {
  const keep = ASK_KEEP_CURRENT[name];
  if (!keep) return null;
  const keys = Object.keys(OPERATION_IO[name].input.shape).filter((k) => k !== "houseId" && (input[k] === undefined || k in ASK_REF_RECORDS));
  if (keys.length === 0) return null;
  let query = caller.db.from(keep.table).select(keys.map((k) => keptColumn(keep, k)).join(", "));
  for (const [column, who] of Object.entries(keep.where)) query = query.filter(column, "eq", who === "house" ? houseId : caller.userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return LOOKUP_FAILED;
  const row = data as unknown as Record<string, unknown>;
  for (const k of keys) {
    const now = row[keptColumn(keep, k)];
    if (now === null || now === undefined) continue;
    if (input[k] === undefined) input[k] = now;
    else if (typeof now === "object" && !Array.isArray(now)) input[k] = { ...(now as object), ...(input[k] as object) };
  }
  return null;
}

/** The input in ids, filled in and checked, as a card move; or what's wrong. */
async function draftMove(o: Offering, name: AskCardOperation, given: OperationOffer): Promise<Extract<ChatMove, { kind: "operation" }> | { problem: string }> {
  const { say, ...args } = given;
  const draft: Draft = { name, input: {}, labels: [] };
  for (const [key, value] of Object.entries(args)) if (value !== null && value !== undefined) draft.input[key] = value;
  const refs = (await swapRefs(o, draft)) ?? (await swapRefRecords(o, draft));
  if (refs) return { problem: refs };
  if ("houseId" in OPERATION_IO[name].input.shape) draft.input.houseId = o.houseId;
  const kept = await keepCurrent(o, draft);
  if (kept) return { problem: kept };

  const parsed = OPERATION_IO[name].input.safeParse(draft.input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { problem: `That doesn't fit ${name}: ${issue.path.join(".") || "its input"} ${issue.message.toLowerCase()}.` };
  }
  return {
    kind: "operation",
    operation: name,
    input: parsed.data as unknown as Record<string, never>,
    title: say.trim().slice(0, 120) || OPERATIONS[name].about,
    meta: [OPERATIONS[name].about, ...draft.labels].join(" · ").slice(0, 300),
  };
}

export function operationMoves(
  caller: Caller,
  houseId: string,
  may: (p: Permission) => boolean,
  people: readonly { userId: string; name: string }[],
  moves: ChatMove[],
) {
  const nameOf = (id: string) => (id === caller.userId ? "you" : firstName(people.find((p) => p.userId === id)?.name ?? "someone"));

  return {
    async offer(name: AskCardOperation, given: OperationOffer): Promise<EditResult> {
      const permission = operationPermission(name);
      // The tool is only offered to someone who may, but a model's call is checked all the same.
      if (!permission || !may(permission)) return NOT_ALLOWED;
      if (moves.length >= CHAT_MOVES_MAX) return { ok: false, said: `That's ${CHAT_MOVES_MAX} on the card already.` };

      const move = await draftMove({ caller, houseId, nameOf }, name, given);
      if ("problem" in move) return { ok: false, said: move.problem };
      if (moves.some((m) => m.kind === "operation" && m.operation === name && JSON.stringify(m.input) === JSON.stringify(move.input))) {
        return { ok: true, said: "Already on the card." };
      }
      moves.push(move);
      return { ok: true, said: "On the card: they tap to do it." };
    },
  };
}
