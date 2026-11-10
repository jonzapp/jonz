// A house's John list, drafted and changed in a chat with Jonz (Claude,
// through POST /api/setup/draft). For a new house the admin says what the
// house is like, Jonz asks a question or two and drafts the list, and every
// message after that changes the draft; a starter list stands in whenever
// Claude can't. For a house with a list already, the draft starts as that
// list and the chat changes it (the House Pass's assistant): Johns to add,
// to change and to take off. Nothing here writes anything: a draft is only
// shown, and an admin applies what they want of it through the list's own
// grants, as if by hand.
import { z } from "zod";

import { HOUSE_DRAFT_COPY } from "./copy";
import type { GroupDef, JohnDef } from "./board";
import { CATEGORIES, CATEGORY_LABEL, DOW_LABEL, JOHN_WHEN, type Category, type IsoDow } from "./domain";
import { firstName } from "./format";
import { dueWords, LAST_OF_MONTH, MAX_EVERY_MONTHS, MAX_EVERY_WEEKS, oftenWords } from "./repeat";
import { CHAT_MOVES_MAX, ChatMove } from "./chat-moves";
import { CHAT_RESETS_MAX, ChatReset } from "./resets";
import type { JohnDraft } from "./schemas";
import type { Words } from "./words-for";

/** The most a draft holds: a long list is a list nobody reads. */
export const DRAFT_MAX_JOHNS = 30;
export const DRAFT_MAX_GROUPS = 6;
/** How much one message in the chat can say. */
export const MESSAGE_MAX = 800;
/** How many messages of the chat go to Claude each time: enough for setting up a house. */
export const CHAT_MAX_MESSAGES = 24;
/**
 * A house's Ask Jonz for a week, in Claude's tokens (what it reads and
 * writes): one pool the whole house shares, bigger with the House Pass. It
 * comes back when the house's week starts. A turn is about 6,000 to 20,000
 * tokens, so the free pool is a good few dozen questions and the Pass's a
 * few hundred. Starter lists are free and unlimited.
 */
export const ASK_POOL_TOKENS = { free: 400_000, pass: 2_000_000 } as const;
/** What a turn holds against the pool while Claude answers, so turns sent together can't all slip in; its answer puts in what it used. */
export const ASK_TURN_RESERVE = 10_000;
/** The most of the pool one person can use when the house has two or more people: nobody can use it all up. */
export const ASK_SHARE_MAX = 0.5;
/**
 * Messages one person can send Claude in a day, whichever house they're in,
 * so nobody gets more by leaving a house and starting another.
 */
export const CHAT_TURNS_PER_PERSON_PER_DAY = 40;

/** How much of this week's Ask Jonz a person has left, shown under the chat. */
export const AskAllowance = z.object({
  /** What's left of what they may still use this week, 0 to 1. */
  left: z.number().min(0).max(1),
  /** Whether the house's pool (not their own share) is what runs out first. */
  house: z.boolean(),
  /** When it comes back: the start of the house's next week. */
  resetsAt: z.string(),
});
export type AskAllowance = z.infer<typeof AskAllowance>;

/** A person's cap and what's left of it, from the week's pool and how much the house and they have used. */
export function askAllowance(input: { pool: number; people: number; houseUsed: number; mineUsed: number; resetsAt: Date }): AskAllowance & { cap: number } {
  const cap = input.people >= 2 ? Math.floor(input.pool * ASK_SHARE_MAX) : input.pool;
  const mine = Math.max(0, cap - input.mineUsed);
  const house = Math.max(0, input.pool - input.houseUsed);
  const room = Math.min(mine, house);
  // On your own the house's pool is yours, so it's the house's that runs out.
  return { cap, left: cap > 0 ? Math.min(1, room / cap) : 0, house: input.people < 2 || house < mine, resetsAt: input.resetsAt.toISOString() };
}

/** Under this much left, the chat warns over the message box. */
export const ASK_LOW = 0.25;

/** The week's Ask Jonz for the usage page and the chat: what's left, what each has used, and when it's back. */
export const AskUsage = AskAllowance.extend({
  /** Whether the house has the House Pass (the bigger pool). */
  pass: z.boolean(),
  /** How many live in the house. With two or more nobody uses more than half. */
  people: z.number().int().min(1),
  /** How much of the house's pool is used, 0 to 1. */
  houseUsed: z.number().min(0).max(1),
  /** How much of what they may use (their half, or the pool on their own) is used, 0 to 1. */
  mineUsed: z.number().min(0).max(1),
  /** Each person who has used some, most first, as a share of the house's pool. */
  usedBy: z.array(z.object({ userId: z.uuid(), used: z.number().min(0).max(1) })),
});
export type AskUsage = z.infer<typeof AskUsage>;

/** When the week's Ask Jonz comes back, in the house's time: "Monday at 00:00". */
export function askBackOn(resetsAt: string, zone: string): string {
  const at = new Date(resetsAt);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: zone }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(at);
  return `${day} at ${time}`;
}

/** The usage page's figures, from the pool, who lives in the house, and the tokens each has used this week. */
export function askUsage(input: {
  pool: number;
  pass: boolean;
  people: readonly string[];
  me: string;
  used: ReadonlyMap<string, number>;
  resetsAt: Date;
}): AskUsage {
  const houseUsed = [...input.used.values()].reduce((a, b) => a + b, 0);
  const mineUsed = input.used.get(input.me) ?? 0;
  const { cap, ...allowance } = askAllowance({ pool: input.pool, people: input.people.length, houseUsed, mineUsed, resetsAt: input.resetsAt });
  const share = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : 1);
  return {
    ...allowance,
    pass: input.pass,
    people: Math.max(1, input.people.length),
    houseUsed: share(houseUsed, input.pool),
    mineUsed: share(mineUsed, cap),
    usedBy: input.people
      .map((userId) => ({ userId, used: share(input.used.get(userId) ?? 0, input.pool) }))
      .sort((a, b) => b.used - a.used),
  };
}
/** The most quick answers one question offers. */
export const CHOICES_MAX = 5;

/** One message in the setup chat, the admin's or Jonz's, as words. */
export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1, "Say something about the house.").max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** One drafted John: a John as the list holds it, the group that shares it by name, and why it's there. */
export const DraftedJohn = z.object({
  /** The John on the house's list this is, when the draft changes an existing list; absent for a John to add. */
  id: z.uuid().optional(),
  name: z.string().min(1).max(60),
  category: z.enum(CATEGORIES),
  points: z.number().int().min(1).max(20),
  everyWeeks: z.number().int().min(1).max(26),
  /** Every N months (12 a year) on a weekday of the month, or null for a John that repeats in weeks (repeat.ts). */
  everyMonths: z.number().int().min(1).max(60).nullable().default(null),
  /** Which of its due day in the month (5 the last); null for a John that repeats in weeks. */
  weekOfMonth: z.number().int().min(1).max(5).nullable().default(null),
  dueDow: z.number().int().min(1).max(7),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  needsPhoto: z.boolean(),
  when: z.enum(JOHN_WHEN),
  respondHours: z.number().int().min(1).max(72),
  perWeek: z.number().int().min(1).max(14),
  /** Done by: how many do it together (1 to 6), or 0 for everyone home (crew.ts). One for an on-call John. */
  crew: z.number().int().min(0).max(6).default(1),
  /** The drafted group that shares it, by name; null for everyone. */
  group: z.string().nullable(),
  /** A few words on why: "two bathrooms, so one each". Empty when it's obvious. */
  why: z.string().max(120),
});
export type DraftedJohn = z.infer<typeof DraftedJohn>;

/** A drafted group: who it's for, as housemates already in the house, and the names that haven't joined yet. */
export const DraftedGroup = z.object({
  name: z.string().min(1).max(40),
  memberIds: z.array(z.uuid()),
  /** Names from the description nobody in the house goes by yet: "Sam", until Sam joins. */
  waitingFor: z.array(z.string()),
});
export type DraftedGroup = z.infer<typeof DraftedGroup>;

export const HouseDraft = z.object({
  johns: z.array(DraftedJohn),
  groups: z.array(DraftedGroup),
  /** One or two sentences on what the draft assumed ("I put the bins on Tuesday night"), or null. */
  note: z.string().nullable(),
});
export type HouseDraft = z.infer<typeof HouseDraft>;

/** Where a draft came from: Claude, or a starter list when Claude wasn't reachable. */
export const DRAFT_SOURCES = ["ai", "starter"] as const;
export type DraftSource = (typeof DRAFT_SOURCES)[number];

/**
 * POST /api/setup/draft: the chat so far, ending with what the admin just
 * said, and the draft as it stands (null before there is one), which the
 * answer changes.
 */
export const ChatRequest = z.object({
  houseId: z.uuid(),
  messages: z
    .array(ChatMessage)
    .min(1)
    .max(CHAT_MAX_MESSAGES)
    .refine((m) => m.at(-1)?.role === "user", "The chat has to end with what you said."),
  draft: HouseDraft.nullable(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

/**
 * A question Jonz asks with something to tap under it: a few quick answers,
 * or the days of the week. Whatever's tapped is sent as the admin's answer.
 */
export const ChatAsk = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choices"), options: z.array(z.string().min(1).max(40)).min(1).max(CHOICES_MAX) }),
  z.object({ kind: z.literal("day") }),
]);
export type ChatAsk = z.infer<typeof ChatAsk>;

/** Jonz's answer: what it says, what it asks (if anything), and the new draft (null: as it was). */
export const ChatResponse = z.object({
  reply: z.string(),
  ask: ChatAsk.nullable(),
  draft: HouseDraft.nullable(),
  source: z.enum(DRAFT_SOURCES),
  /** Resets Jonz offers an admin, each with its numbers, for the Resets card. Nothing is reset until they tap. */
  resets: z.array(ChatReset).max(CHAT_RESETS_MAX).optional(),
  /** Other moves Jonz puts on a card (time away), for the person to tick and apply. */
  moves: z.array(ChatMove).max(CHAT_MOVES_MAX).optional(),
  /** What's left of this week's Ask Jonz for the person asking, after this turn. */
  allowance: AskUsage.optional(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

/**
 * What Claude sends back, before it's checked: every field loose, because a
 * model's numbers can be out of range and its names can be anything. `tidyDraft`
 * turns it into a HouseDraft.
 */
export interface RawDraft {
  johns?: readonly {
    /** Which John on the list this is (draftForModel's short ref), when it's one already there. */
    ref?: unknown;
    name?: unknown;
    category?: unknown;
    points?: unknown;
    everyWeeks?: unknown;
    everyMonths?: unknown;
    weekOfMonth?: unknown;
    dueDow?: unknown;
    dueTime?: unknown;
    needsPhoto?: unknown;
    onCall?: unknown;
    respondHours?: unknown;
    perWeek?: unknown;
    crew?: unknown;
    group?: unknown;
    why?: unknown;
  }[];
  groups?: readonly { name?: unknown; members?: unknown }[];
  note?: unknown;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max).trim() : "";
}

/** A whole number in range, or the fallback when it isn't a number at all. */
function whole(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** A whole number in range, or null when it's missing, zero or not a number. */
function wholeOrNull(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && Math.round(n) > 0 ? Math.min(max, Math.max(min, Math.round(n))) : null;
}

function time(value: unknown): string {
  const match = typeof value === "string" ? value.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!match) return "21:00";
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h <= 23 && m <= 59 ? `${String(h).padStart(2, "0")}:${match[2]}` : "21:00";
}

const key = (name: string) => name.toLocaleLowerCase();

type Person = { userId: string; name: string };

/** A name from the description, as one of the house: a full name or a first name, any case. Null if nobody goes by it. */
export function matchPerson(name: string, people: readonly Person[]): string | null {
  const wanted = key(name.trim());
  if (!wanted) return null;
  const exact = people.find((p) => key(p.name) === wanted);
  if (exact) return exact.userId;
  const byFirst = people.filter((p) => key(firstName(p.name)) === key(firstName(wanted)));
  return byFirst.length === 1 ? byFirst[0].userId : null;
}

/**
 * Claude's draft made safe to show: names trimmed and cut to fit, numbers put
 * in range, unknown kinds made "Other", the same John twice kept once, groups
 * matched to the people in the house (`me` stands in for "me" and "I"), and a
 * John's group dropped when no such group was drafted. At most
 * DRAFT_MAX_JOHNS Johns and DRAFT_MAX_GROUPS groups.
 */
export function tidyDraft(
  raw: RawDraft,
  people: readonly Person[],
  me: string,
  /** The house's list as it stands, when the draft changes it: its Johns (by id) and groups, which a ref or a group name may point at. */
  list: { johnIds: readonly string[]; groups: readonly DraftedGroup[] } = { johnIds: [], groups: [] },
): HouseDraft {
  const groups: DraftedGroup[] = [];
  for (const g of raw.groups ?? []) {
    const name = text(g.name, 40);
    if (!name || groups.some((h) => key(h.name) === key(name))) continue;
    const memberIds: string[] = [];
    const waitingFor: string[] = [];
    for (const member of Array.isArray(g.members) ? g.members : []) {
      const who = text(member, 60);
      if (!who) continue;
      const id = /^(me|i|myself)$/i.test(who) ? me : matchPerson(who, people);
      if (id) {
        if (!memberIds.includes(id)) memberIds.push(id);
      } else if (!waitingFor.some((w) => key(w) === key(who))) {
        waitingFor.push(who);
      }
    }
    if (memberIds.length + waitingFor.length === 0) continue;
    groups.push({ name, memberIds, waitingFor });
    if (groups.length === DRAFT_MAX_GROUPS) break;
  }

  const johns: DraftedJohn[] = [];
  for (const j of raw.johns ?? []) {
    const name = text(j.name, 60);
    // A ref names a John on the list, once; anything else is a John to add.
    const ref = text(j.ref, 40);
    const matches = ref ? list.johnIds.filter((id) => id.startsWith(ref)) : [];
    const id = matches.length === 1 && !johns.some((k) => k.id === matches[0]) ? matches[0] : undefined;
    // The same new John twice is kept once; a list may already have two of a name (one per group), and keeps both.
    if (!name || (!id && johns.some((k) => key(k.name) === key(name)))) continue;
    const groupName = text(j.group, 40);
    let group = groups.find((g) => key(g.name) === key(groupName))?.name ?? null;
    // A group the house already has keeps its Johns, whether or not Claude listed it again.
    const there = group ? null : list.groups.find((g) => key(g.name) === key(groupName));
    if (there && groups.length < DRAFT_MAX_GROUPS) {
      groups.push({ name: there.name, memberIds: [...there.memberIds], waitingFor: [...there.waitingFor] });
      group = there.name;
    }
    // Monthly and longer: every N months on a weekday of the month. An on-call John has no period.
    const onCall = j.onCall === true;
    const everyMonths = onCall ? null : wholeOrNull(j.everyMonths, 1, MAX_EVERY_MONTHS);
    johns.push({
      ...(id ? { id } : {}),
      name,
      category: (CATEGORIES as readonly string[]).includes(j.category as string) ? (j.category as Category) : "other",
      points: whole(j.points, 1, 20, 2),
      everyWeeks: everyMonths ? 1 : whole(j.everyWeeks, 1, MAX_EVERY_WEEKS, 1),
      everyMonths,
      weekOfMonth: everyMonths ? whole(j.weekOfMonth, 1, LAST_OF_MONTH, 1) : null,
      dueDow: whole(j.dueDow, 1, 7, 7),
      dueTime: time(j.dueTime),
      needsPhoto: j.needsPhoto === true,
      when: onCall ? "on_call" : "day",
      respondHours: whole(j.respondHours, 1, 72, 12),
      perWeek: whole(j.perWeek, 1, 14, 2),
      crew: onCall ? 1 : whole(j.crew, 0, 6, 1),
      group,
      why: text(j.why, 120),
    });
    // A long list already there keeps every John, with room for a few more.
    if (johns.length === Math.max(DRAFT_MAX_JOHNS, list.johnIds.length + 10)) break;
  }

  // A new group no kept John uses is noise on the review screen. One the
  // house has stays, so a change to who's in it can be shown.
  const used = groups.filter((g) => johns.some((j) => j.group === g.name) || list.groups.some((h) => key(h.name) === key(g.name)));
  const note = text(raw.note, 400);
  return { johns, groups: used, note: note || null };
}

/** What keeping some of a draft writes: the groups to make, and each John with the group it goes to. */
export interface DraftPlan {
  /** New groups, by name, with who is in them. */
  makeGroups: { name: string; members: string[] }[];
  /**
   * The Johns to add, as the John list takes them, each with its group's name
   * (made or already there), or null for everyone. Without a month to start
   * from: a new monthly John starts from its next one, and a changed one keeps
   * the month it had.
   */
  johns: { john: Omit<JohnDraft, "id" | "groupId" | "anchorMonth" | "anchorWeek">; groupName: string | null }[];
  /** Johns that go to everyone for now because nobody in their group has joined yet, by name. */
  everyoneForNow: string[];
}

/**
 * Turn the Johns an admin kept into writes. A group already in the house
 * with the same name is used as it is; a drafted group with nobody in the
 * house in it yet can't be made (a group needs someone), so its Johns go to
 * everyone until it's made by hand.
 */
export function draftPlan(draft: HouseDraft, keep: readonly number[], existingGroups: readonly { name: string }[]): DraftPlan {
  const kept = draft.johns.filter((_, i) => keep.includes(i));
  const makeGroups: DraftPlan["makeGroups"] = [];
  const everyoneForNow: string[] = [];
  const johns = kept.map((j) => {
    const john = {
      name: j.name,
      category: j.category,
      points: j.points,
      everyWeeks: j.everyWeeks,
      everyMonths: j.everyMonths,
      weekOfMonth: j.weekOfMonth,
      dueDow: j.dueDow,
      dueTime: j.dueTime,
      needsPhoto: j.needsPhoto,
      when: j.when,
      respondHours: j.respondHours,
      perWeek: j.perWeek,
      crew: j.crew,
      keepDay: false,
    };
    let groupName: string | null = null;
    if (j.group) {
      const there = existingGroups.find((g) => key(g.name) === key(j.group!));
      const drafted = draft.groups.find((g) => g.name === j.group);
      if (there) groupName = there.name;
      else if (drafted && drafted.memberIds.length > 0) {
        if (!makeGroups.some((g) => g.name === drafted.name)) makeGroups.push({ name: drafted.name, members: [...drafted.memberIds] });
        groupName = drafted.name;
      } else everyoneForNow.push(j.name);
    }
    return { john, groupName };
  });
  return { makeGroups, johns, everyoneForNow };
}

/** The most Jonz says in one turn, so a runaway reply can't fill the screen. Room for a short list in Markdown. */
export const REPLY_MAX = 2000;

/** Jonz's reply as the chat shows it: spaces tidied, line breaks and indents kept (at most one blank line), cut to fit. */
export function tidyReply(reply: string): string {
  return reply
    .split("\n")
    // A line's indent is Markdown's (a list inside a list): kept, tabs as two spaces; spaces inside it tidied.
    .map((line) => {
      const indent = (/^[ \t]*/.exec(line)?.[0] ?? "").replace(/\t/g, "  ");
      const words = line.replace(/[ \t\f\v\r]+/g, " ").trim();
      return words ? indent + words : "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REPLY_MAX)
    .trim();
}

/** What Claude asks with, before it's checked. */
export interface RawAsk {
  kind?: unknown;
  options?: unknown;
}

/** Claude's question made safe to show: quick answers trimmed, kept once each, at most CHOICES_MAX; null when there's nothing to tap. */
export function tidyAsk(raw: RawAsk | null | undefined): ChatAsk | null {
  if (raw?.kind === "day") return { kind: "day" };
  if (raw?.kind !== "choices" || !Array.isArray(raw.options)) return null;
  const options: string[] = [];
  for (const o of raw.options) {
    const option = text(o, 40);
    if (option && !options.some((p) => key(p) === key(option))) options.push(option);
    if (options.length === CHOICES_MAX) break;
  }
  return options.length > 0 ? { kind: "choices", options } : null;
}

/** A John on the list as Claude knows it: the start of its id, short enough not to waste words and still one of a kind in a house. */
const refOf = (id: string) => id.slice(0, 8);

/**
 * The draft as Claude is shown it, to change: groups by who's in them in
 * words ("me" for the person asking, first names for the rest, and names
 * still to join), and on-call Johns as `onCall`. tidyDraft reads it back.
 */
export function draftForModel(draft: HouseDraft, people: readonly Person[], me: string): RawDraft {
  const named = (id: string) => (id === me ? "me" : firstName(people.find((p) => p.userId === id)?.name ?? "")) || null;
  return {
    johns: draft.johns.map(({ when, id, ...j }) => ({ ...(id ? { ref: refOf(id) } : {}), ...j, onCall: when === "on_call" })),
    groups: draft.groups.map((g) => ({ name: g.name, members: [...g.memberIds.map(named).filter(Boolean), ...g.waitingFor] })),
    note: draft.note,
  };
}

/**
 * Jonz's answer when Claude can't give one (not set up here, down, or a
 * reply it couldn't use). Before there's a draft, a starter list fits what
 * the admin said (or the one they named); after, the draft stays as it is
 * and the admin is told to change it by hand.
 */
export function offlineTurn(messages: readonly ChatMessage[], draft: HouseDraft | null): ChatResponse {
  if (draft) return { reply: HOUSE_DRAFT_COPY.offlineChange, ask: null, draft: null, source: "starter" };
  const said = messages.filter((m) => m.role === "user").map((m) => m.text);
  const named = STARTER_KINDS.find((k) => said.some((t) => key(t.trim()) === key(HOUSE_DRAFT_COPY.starter[k].title)));
  const kind = named ?? guessStarter(said.join(" "));
  return { reply: named ? HOUSE_DRAFT_COPY.fromStarter : HOUSE_DRAFT_COPY.offline, ask: null, draft: starterDraft(kind), source: "starter" };
}

// --- Changing a list that's already there ---------------------------------------

/**
 * The house's list as a draft, for the chat to change: every John with its
 * id, and the groups they use with who's in them.
 */
export function listAsDraft(johns: readonly JohnDef[], groups: readonly GroupDef[]): HouseDraft {
  // Every group the house has, Johns or not, so a chat can change who's in any of them.
  return {
    johns: johns.map((j) => ({
      id: j.id,
      name: j.name,
      category: j.category,
      points: j.points,
      everyWeeks: j.everyWeeks,
      everyMonths: j.everyMonths,
      weekOfMonth: j.weekOfMonth,
      dueDow: j.dueDow,
      dueTime: j.dueTime,
      needsPhoto: j.needsPhoto,
      when: j.when,
      respondHours: j.respondHours,
      perWeek: j.perWeek,
      crew: j.crew,
      group: groups.find((g) => g.id === j.groupId)?.name ?? null,
      why: "",
    })),
    groups: groups.map((g) => ({ name: g.name, memberIds: [...g.memberIds], waitingFor: [] })),
    note: null,
  };
}

/** The fields a change can touch, in the order a change line names them. */
const CHANGEABLE = ["name", "category", "points", "everyWeeks", "everyMonths", "weekOfMonth", "dueDow", "dueTime", "needsPhoto", "when", "respondHours", "perWeek", "crew", "group"] as const;

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
    else if (CHANGEABLE.some((f) => before[f] !== john[f])) changes.push({ kind: "change", key: `change:${john.id}`, at, john, before });
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
  const often = (j: DraftedJohn) => (j.when === "on_call" ? "On call" : oftenWords(j));
  const due = (j: DraftedJohn) => dueWords(j, j.dueTime, DOW_LABEL[j.dueDow as IsoDow].slice(0, 3));
  if (often(before) !== often(after)) parts.push(arrow(often(before), often(after)));
  if (before.when !== "on_call" && after.when !== "on_call" && due(before) !== due(after)) parts.push(`${due(before)} → ${due(after)}`);
  if (before.points !== after.points) parts.push(`${before.points} → ${after.points} ${after.points === 1 ? "pt" : "pts"}`);
  if (before.crew !== after.crew) parts.push(arrow(words('john.crew.choice', { crew: before.crew }), words('john.crew.choice', { crew: after.crew })));
  if (before.group !== after.group) parts.push(arrow(before.group ?? "Everyone’s", after.group ?? "everyone’s"));
  if (before.category !== after.category) parts.push(arrow(CATEGORY_LABEL[before.category], CATEGORY_LABEL[after.category]));
  return parts.join(", ");
}

// --- Starter lists ------------------------------------------------------------

export const STARTER_KINDS = ["flat_share", "couple", "family"] as const;
export type StarterKind = (typeof STARTER_KINDS)[number];

type Starter = [name: string, category: Category, points: number, everyWeeks: number, dueDow: IsoDow, dueTime: string, extra?: Partial<DraftedJohn>];

function starter(rows: readonly Starter[]): DraftedJohn[] {
  return rows.map(([name, category, points, everyWeeks, dueDow, dueTime, extra]) => ({
    name,
    category,
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
export const STARTER_LISTS: Record<StarterKind, DraftedJohn[]> = {
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

/** A starter list as a draft, the same shape Claude's comes in. */
export function starterDraft(kind: StarterKind): HouseDraft {
  return { johns: STARTER_LISTS[kind].map((j) => ({ ...j })), groups: [], note: null };
}

/** Which starter list fits a description best, for when Claude can't draft from it: a family, a couple, or else a flat share. */
export function guessStarter(description: string): StarterKind {
  const d = description.toLocaleLowerCase();
  if (/\b(kids?|children|child|son|daughter|family|toddler|teenagers?|mum|dad)\b/.test(d)) return "family";
  if (/\b(partner|girlfriend|boyfriend|wife|husband|fianc[eé]e?|couple|two of us|me and my|my other half)\b/.test(d)) return "couple";
  return "flat_share";
}
