import { z } from "zod";

import { ASK_FILLED_KEYS, ASK_KEEP_CURRENT, ASK_REF_RECORDS, ASK_REFS, REF_LENGTH, type AskCardOperation } from "./ask-operations";
import { OPERATION_IO } from "./operation-io";

// What Jonz gives a card operation's tool, made from the operation's own
// input (OPERATION_IO): the same keys and kinds, except that an id is a
// ref from a read (ASK_REFS), the house is the chat's, and a photo is left
// out. The API turns refs back into ids and checks the whole input against
// OPERATION_IO before anything goes on the card.

const filled = new Set<string>(ASK_FILLED_KEYS);

const refField = (key: string, optional: boolean) => {
  const r = ASK_REFS[key];
  const one = z.string().describe(`The ref (first ${REF_LENGTH} characters) of ${r.what}.`);
  const s = r.many ? z.array(one).describe(`The refs of ${r.what}.`) : one;
  return optional ? s.nullable() : s;
};

/** A record keyed by ids, keyed by refs instead: the values as the operation has them. */
const refRecord = (field: z.ZodType, optional: boolean, kind: string) => {
  const values = (field as z.ZodRecord).valueType as z.ZodType;
  const s = z.record(z.string(), values).describe(`Keyed by the ref (first ${REF_LENGTH} characters) of ${ASK_REFS[kind].what}.`);
  return optional ? s.nullable() : s;
};

/** The tool input Jonz fills for a card operation. */
export function askToolInput(name: AskCardOperation): z.ZodObject {
  const shape = OPERATION_IO[name].input.shape as Record<string, z.ZodType>;
  const out: Record<string, z.ZodType> = {};
  const keep = name in ASK_KEEP_CURRENT;
  for (const [key, field] of Object.entries(shape)) {
    if (filled.has(key)) continue;
    // A settings row: only what changes, the rest stays as it is.
    const optional = keep || field.safeParse(undefined).success;
    // Optional fields are nullable for Claude, whose tool calls give every key.
    if (key in ASK_REFS) out[key] = refField(key, optional);
    else if (key in ASK_REF_RECORDS) out[key] = refRecord(field, optional, ASK_REF_RECORDS[key]);
    else out[key] = optional ? field.nullable() : field;
  }
  return z.object(out);
}

/** The ref keys a card operation's tool input holds. */
export function askRefKeys(name: AskCardOperation): string[] {
  return Object.keys(OPERATION_IO[name].input.shape).filter((k) => k in ASK_REFS && !filled.has(k));
}

/** The keys of a card operation's input that are records keyed by refs. */
export function askRefRecordKeys(name: AskCardOperation): string[] {
  return Object.keys(OPERATION_IO[name].input.shape).filter((k) => k in ASK_REF_RECORDS && !filled.has(k));
}
