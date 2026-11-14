import { type Category, type IsoDow } from "./domain";
import { key, type ChatMessage, type ChatResponse, type DraftedJohn, type DraftKind, type HouseDraft } from "./house-draft";
import type { Words } from "./words-for";

// The starter John lists a new house can begin from, by the kind of house.

export const STARTER_KINDS = ["flat_share", "couple", "family"] as const;
export type StarterKind = (typeof STARTER_KINDS)[number];

type Starter = [name: string, preset: Category, points: number, everyWeeks: number, dueDow: IsoDow, dueTime: string, extra?: Partial<DraftedJohn>];

/** A starter John: a drafted John with the starting kind it goes in (the house's kind that began as it). */
type StarterJohn = Omit<DraftedJohn, "kind"> & { preset: Category };

function starter(rows: readonly Starter[]): StarterJohn[] {
  return rows.map(([name, preset, points, everyWeeks, dueDow, dueTime, extra]) => ({
    name,
    preset,
    points,
    everyWeeks,
    dueDow,
    everyMonths: null,
    weekOfMonth: null,
    dueTime,
    needsPhoto: false,
    when: "day",
    respondHours: 12,
    perWeek: 2,
    crew: 1,
    group: null,
    why: "",
    ...extra,
  }));
}

/** The kitchen bin as an on-call John: whoever is on call takes it out when someone flags it. */
const BIN_ON_CALL: Partial<DraftedJohn> = { when: "on_call", respondHours: 12, perWeek: 3 };

/**
 * Ready-made lists for when Claude can't be reached, or for an admin who'd
 * rather start from one. Points follow the John list's hint: 1 for taking
 * the bins out, 5 for a deep clean. Due days are spread over the week.
 */
export const STARTER_LISTS: Record<StarterKind, StarterJohn[]> = {
  flat_share: starter([
    ["Kitchen wipe-down", "kitchen", 2, 1, 3, "21:00"],
    ["Kitchen deep clean", "kitchen", 5, 2, 7, "18:00"],
    ["Fridge clear-out", "kitchen", 2, 2, 5, "21:00"],
    ["Bathroom clean", "bathroom", 4, 1, 6, "18:00"],
    ["Kitchen bin", "bins", 1, 1, 7, "21:00", BIN_ON_CALL],
    ["Bins and recycling out", "bins", 1, 1, 2, "21:00"],
    ["Hoover and mop", "floors", 3, 1, 7, "18:00"],
    ["Loo roll and cleaning stuff", "errands", 1, 2, 4, "21:00"],
  ]),
  couple: starter([
    ["Kitchen clean", "kitchen", 3, 1, 3, "21:00"],
    ["Bathroom clean", "bathroom", 4, 1, 6, "18:00"],
    ["Bins and recycling out", "bins", 1, 1, 2, "21:00"],
    ["Hoover and mop", "floors", 3, 1, 7, "18:00"],
    ["Laundry", "other", 3, 1, 4, "21:00"],
    ["Change the sheets", "other", 2, 2, 7, "21:00"],
    ["Food shop", "errands", 3, 1, 6, "13:00"],
  ]),
  family: starter([
    ["Kitchen clean", "kitchen", 3, 1, 3, "20:00"],
    ["Empty the dishwasher", "kitchen", 1, 1, 7, "20:00", { when: "on_call", respondHours: 6, perWeek: 5 }],
    ["Bathroom clean", "bathroom", 4, 1, 6, "18:00"],
    ["Bins and recycling out", "bins", 1, 1, 2, "20:00"],
    ["Hoover downstairs", "floors", 2, 1, 7, "18:00"],
    ["Tidy your bedroom", "other", 2, 1, 7, "19:00"],
    ["Laundry", "other", 3, 1, 4, "20:00"],
    ["Food shop", "errands", 3, 1, 6, "13:00"],
  ]),
};

/**
 * A starter list as a draft, the same shape Claude's comes in: each John in
 * the house's kind that began as its starting kind, or none when the house
 * has no such kind.
 */
export function starterDraft(kind: StarterKind, kinds: readonly DraftKind[]): HouseDraft {
  const johns = STARTER_LISTS[kind].map(({ preset, ...j }) => ({ ...j, kind: kinds.find((k) => k.preset === preset)?.name ?? null }));
  return { johns, groups: [], note: null };
}

/** Which starter list fits a description best, for when Claude can't draft from it: a family, a couple, or else a flat share. */
export function guessStarter(description: string): StarterKind {
  const d = description.toLocaleLowerCase();
  if (/\b(kids?|children|child|son|daughter|family|toddler|teenagers?|mum|dad)\b/.test(d)) return "family";
  if (/\b(partner|girlfriend|boyfriend|wife|husband|fianc[eé]e?|couple|two of us|me and my|my other half)\b/.test(d)) return "couple";
  return "flat_share";
}

/**
 * Jonz's answer when Claude can't give one (not set up here, down, or a
 * reply it couldn't use). Before there's a draft, a starter list fits what
 * the admin said (or the one they named); after, the draft stays as it is
 * and the admin is told to change it by hand.
 */
export function offlineTurn(messages: readonly ChatMessage[], draft: HouseDraft | null, at: { words: Words; kinds: readonly DraftKind[] }): ChatResponse {
  const { words } = at;
  if (draft) return { reply: words('ask.draft.offlineChange'), ask: null, draft: null, source: "starter" };
  const said = messages.filter((m) => m.role === "user").map((m) => m.text);
  const named = STARTER_KINDS.find((k) => said.some((t) => key(t.trim()) === key(words(`ask.draft.starter.${k}.title` as const))));
  const kind = named ?? guessStarter(said.join(" "));
  return { reply: named ? words('ask.draft.fromStarter') : words('ask.draft.offline'), ask: null, draft: starterDraft(kind, at.kinds), source: "starter" };
}
