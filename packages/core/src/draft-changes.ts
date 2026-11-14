import { CATEGORY_LABEL } from "./domain";
import { pointsLabel, weekdayName } from "./format";
import { dueWords, oftenWords } from "./repeat";
import type { Words } from "./words-for";
import { DraftedGroup, DraftedJohn, HouseDraft, key } from "./house-draft";

// What a draft would change on the house's list: each John added, changed
// or taken off, each group's people, and one line saying what changed.

/** The fields a change can touch, in the order a change line names them, but for its kind (sameKind). */
const CHANGEABLE = ["name", "points", "everyWeeks", "everyMonths", "weekOfMonth", "dueDow", "dueTime", "needsPhoto", "when", "respondHours", "perWeek", "crew", "group"] as const;

/** Whether two Johns have the same kind: by name in any capitals when both say it, else by their categories. */
function sameKind(a: DraftedJohn, b: DraftedJohn): boolean {
  if (a.kind === undefined || b.kind === undefined) return a.category === b.category;
  return a.kind === null || b.kind === null ? a.kind === b.kind : key(a.kind) === key(b.kind);
}

/** A John's kind in words: its name, No kind, or (not read) the starting kind its category is. */
const kindWords = (j: DraftedJohn, words: Words) => (j.kind === undefined ? CATEGORY_LABEL[j.category] : (j.kind ?? words('house.kinds.none')));

/** One thing a draft does to the list: a John to add (its place in the draft), one to change, or one to take off. */
export type DraftChange =
  | { kind: "add"; key: string; at: number; john: DraftedJohn }
  | { kind: "change"; key: string; at: number; john: DraftedJohn; before: DraftedJohn }
  | { kind: "remove"; key: string; before: DraftedJohn };

/**
 * What a draft does to the list it was made from: Johns without an id are
 * added, Johns whose fields differ are changed, and Johns on the list the
 * draft left out are taken off. With no list (a new house), every John is
 * an add. Each change has a `key` to tick it by.
 */
export function draftChanges(base: HouseDraft | null, next: HouseDraft): DraftChange[] {
  const was = new Map((base?.johns ?? []).filter((j) => j.id).map((j) => [j.id!, j]));
  const changes: DraftChange[] = [];
  next.johns.forEach((john, at) => {
    const before = john.id ? was.get(john.id) : undefined;
    if (!before) changes.push({ kind: "add", key: `add:${at}`, at, john });
    else if (CHANGEABLE.some((f) => before[f] !== john[f]) || !sameKind(before, john)) changes.push({ kind: "change", key: `change:${john.id}`, at, john, before });
  });
  const kept = new Set(next.johns.map((j) => j.id).filter(Boolean));
  for (const before of base?.johns ?? []) {
    if (before.id && !kept.has(before.id)) changes.push({ kind: "remove", key: `remove:${before.id}`, before });
  }
  return changes;
}

/** A group the house already has, with different people in it: who's in it before and after. */
export interface GroupChange {
  kind: "group";
  key: string;
  group: DraftedGroup;
  before: DraftedGroup;
}

/**
 * Groups the house has whose people a draft changes. A group the draft
 * leaves out stays as it is (taking one off is the House page's), and a
 * new group is made with the Johns that need it (draftPlan).
 */
export function groupChanges(base: HouseDraft | null, next: HouseDraft): GroupChange[] {
  if (!base) return [];
  return next.groups.flatMap((group) => {
    const before = base.groups.find((g) => key(g.name) === key(group.name));
    if (!before || group.memberIds.length === 0) return [];
    const same = before.memberIds.length === group.memberIds.length && before.memberIds.every((id) => group.memberIds.includes(id));
    return same ? [] : [{ kind: "group" as const, key: `group:${before.name}`, group: { ...group, name: before.name }, before }];
  });
}

/**
 * What changed on a John, before → after, for under its (new) name on the
 * card: "Every week → every 2 weeks, Sun 21:00 → Sat 21:00, 3 → 4 pts". A new
 * name says what it was called.
 */
export function changedLine(before: DraftedJohn, after: DraftedJohn, words: Words): string {
  const parts: string[] = [];
  const lower = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1);
  const arrow = (was: string, now: string) => `${was} → ${lower(now)}`;
  if (before.name !== after.name) parts.push(`was “${before.name}”`);
  // How often and when, each only if it moved: "Every week → every 2 weeks", "Sat 18:00 → Sun 10:00".
  const often = (j: DraftedJohn) => (j.when === "on_call" ? "On call" : oftenWords(j, words));
  const due = (j: DraftedJohn) => dueWords(j, j.dueTime, weekdayName(j.dueDow, words, "short"), words);
  if (often(before) !== often(after)) parts.push(arrow(often(before), often(after)));
  if (before.when !== "on_call" && after.when !== "on_call" && due(before) !== due(after)) parts.push(`${due(before)} → ${due(after)}`);
  if (before.points !== after.points) parts.push(arrow(String(before.points), pointsLabel(after.points, words)));
  if (before.crew !== after.crew) parts.push(arrow(words('john.crew.choice', { crew: before.crew }), words('john.crew.choice', { crew: after.crew })));
  if (before.group !== after.group) parts.push(arrow(before.group ?? "Everyone’s", after.group ?? "everyone’s"));
  // A kind is a name the house gave it, so it keeps its capitals.
  if (!sameKind(before, after)) parts.push(`${kindWords(before, words)} → ${kindWords(after, words)}`);
  return parts.join(", ");
}

// --- Starter lists ------------------------------------------------------------
