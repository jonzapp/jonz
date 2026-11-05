// Ask Jonz's edits to the John list (Ask Jonz step 2). Claude no longer sends
// the whole list back to change one John: it calls add_john, change_john and
// remove_john, one John at a time, and each call is applied here to the draft
// as Claude sees it (draftForModel's words, refs and all). tidyDraft then
// checks every value on the way back, as before. Pure, so the API's tools and
// the tests run the same code.

import type { RawDraft } from "./house-draft";

type RawJohn = NonNullable<RawDraft["johns"]>[number];

/** The fields of a John Claude may set, in draftForModel's words. */
export const JOHN_FIELDS = [
  "name",
  "category",
  "points",
  "everyWeeks",
  "everyMonths",
  "weekOfMonth",
  "dueDow",
  "dueTime",
  "needsPhoto",
  "onCall",
  "respondHours",
  "perWeek",
  "crew",
  "group",
  "why",
] as const;

/** One edit, as a tool call brings it: loose, because a model's values can be anything. */
export type DraftEdit =
  | { kind: "add"; john: Partial<Record<(typeof JOHN_FIELDS)[number], unknown>> }
  | { kind: "change"; ref: string; set: Partial<Record<(typeof JOHN_FIELDS)[number], unknown>> }
  | { kind: "remove"; ref: string };

/** What an edit did, in words for Claude: done, or why not. */
export interface EditResult {
  ok: boolean;
  said: string;
}

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLocaleLowerCase() : "");

/**
 * The John a ref points at: a John on the list by the start of its ref, or
 * one drafted in this chat (or on the list) by its name. Null when it's none,
 * or more than one.
 */
export function findJohn(raw: RawDraft, ref: string): number | null {
  const johns = raw.johns ?? [];
  const r = lower(ref);
  if (!r) return null;
  const byRef = johns.flatMap((j, i) => (typeof j.ref === "string" && lower(j.ref).startsWith(r) ? [i] : []));
  if (byRef.length === 1) return byRef[0];
  const byName = johns.flatMap((j, i) => (lower(j.name) === r ? [i] : []));
  return byName.length === 1 ? byName[0] : null;
}

/** Only the fields a John has, so a tool call can't smuggle a ref or an id in. */
function fields(from: Partial<Record<string, unknown>>): Partial<RawJohn> {
  const out: Record<string, unknown> = {};
  for (const f of JOHN_FIELDS) if (from[f] !== undefined && from[f] !== null) out[f] = from[f];
  // A John moved off a group is everyone's: null is a value for `group`.
  if (from.group === null) out.group = null;
  return out;
}

/** The draft with one edit applied, and what to tell Claude. The draft passed in is never changed. */
export function editDraft(raw: RawDraft, edit: DraftEdit): { raw: RawDraft; result: EditResult } {
  const johns = [...(raw.johns ?? [])];
  if (edit.kind === "add") {
    const john = fields(edit.john);
    const name = typeof john.name === "string" ? john.name.trim() : "";
    if (!name) return { raw, result: { ok: false, said: "A new John needs a name." } };
    if (johns.some((j) => lower(j.name) === lower(name) && j.group === (john.group ?? null))) {
      return { raw, result: { ok: false, said: `There's already a John called "${name}". Change that one instead.` } };
    }
    johns.push({ ...john, ref: null });
    return { raw: { ...raw, johns }, result: { ok: true, said: `Added "${name}".` } };
  }
  const at = findJohn(raw, edit.ref);
  if (at === null) return { raw, result: { ok: false, said: `No John matches "${edit.ref}". Use a ref from list_johns.` } };
  const was = johns[at];
  if (edit.kind === "remove") {
    johns.splice(at, 1);
    return { raw: { ...raw, johns }, result: { ok: true, said: `Taking off "${String(was.name)}".` } };
  }
  const set = fields(edit.set);
  if (Object.keys(set).length === 0) return { raw, result: { ok: false, said: "Nothing to change: say which fields." } };
  // Moving to a period in weeks clears the months, and the other way round.
  const next: RawJohn = { ...was, ...set };
  if (set.everyWeeks !== undefined && set.everyMonths === undefined && was.everyMonths) Object.assign(next, { everyMonths: null, weekOfMonth: null });
  if (set.onCall === true) Object.assign(next, { everyWeeks: 1, everyMonths: null, weekOfMonth: null, crew: 1 });
  johns[at] = next;
  return { raw: { ...raw, johns }, result: { ok: true, said: `Changed "${String(next.name)}".` } };
}
