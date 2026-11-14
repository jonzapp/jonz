// A house's John list, drafted and changed in a chat with Jonz (Claude,
// through ask_house on /v1). For a new house the admin says what the
// house is like, Jonz asks a question or two and drafts the list, and every
// message after that changes the draft; a starter list stands in whenever
// Claude can't. For a house with a list already, the draft starts as that
// list and the chat changes it (the House Pass's assistant): Johns to add,
// to change and to take off. Nothing here writes anything: a draft is only
// shown, and an admin applies what they want of it through the list's own
// grants, as if by hand.
import { z } from "zod";

import type { GroupDef, JohnDef } from "./board";
import { CATEGORIES, JOHN_WHEN, type Category } from "./domain";
import { firstName } from "./format";
import { LAST_OF_MONTH, MAX_EVERY_MONTHS, MAX_EVERY_WEEKS } from "./repeat";
import { CHAT_MOVES_MAX, ChatMove } from "./chat-moves";
import { CHAT_RESETS_MAX, ChatReset } from "./resets";
import type { JohnDraft } from "./schemas";
import { AskUsage } from "./ask-allowance";

/** The most a draft holds: a long list is a list nobody reads. */
export const DRAFT_MAX_JOHNS = 30;
export const DRAFT_MAX_GROUPS = 6;
/** How much one message in the chat can say. */
export const MESSAGE_MAX = 800;
/** The most messages of the chat that go to Claude in one turn, after the summary of anything older. */
export const CHAT_MAX_MESSAGES = 40;
/**
 * A long chat: past this many messages since the last summary, Jonz sums up
 * all but the latest CHAT_RECENT before it answers, and carries on from the
 * summary, as Claude and the coding assistants do. Each turn then costs
 * about the same, however long the chat runs.
 */
export const CHAT_SUM_AT = 30;
/** The messages Jonz always reads word for word, after the summary. */
export const CHAT_RECENT = 10;
/** The longest a chat's summary runs, in characters. */
export const SUMMARY_MAX = 4000;
/** A chat is full at this many turns (what's kept of a chat); then it carries on in a new one, with a summary. */
export const CHAT_FULL = 200;
/** From this many turns the chat says it's getting long. */
export const CHAT_LONG_AT = 170;
/** The most quick answers one question offers. */
export const CHOICES_MAX = 5;

/** One message in the setup chat, the admin's or Jonz's, as words. */
export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1, "Say something about the house.").max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** Jonz's summary of a chat's start: what it says, and how many of the chat's messages it stands for. */
export const ChatSummed = z.object({
  text: z.string().trim().min(1).max(SUMMARY_MAX),
  /** How many messages it stands for: the chat's first ones, kept as they were but no longer sent. */
  count: z.number().int().min(0),
});
export type ChatSummed = z.infer<typeof ChatSummed>;

/**
 * Where a turn's chat is cut when it's long: the messages before it are
 * summed up, the rest read word for word. 0 when it's short enough as it is.
 * The rest always starts with something the person said.
 */
export function foldPoint(messages: readonly ChatMessage[]): number {
  if (messages.length <= CHAT_SUM_AT) return 0;
  let at = messages.length - CHAT_RECENT;
  while (at < messages.length - 1 && messages[at].role !== "user") at++;
  return at;
}

/**
 * What a new chat carries on from when the last one was full: its summary,
 * then the messages since, as many of the latest as fit in SUMMARY_MAX, a
 * line each ("You: …", "Jonz: …").
 */
export function chatCarryOver(summary: string | null, since: readonly ChatMessage[], names: { you: string; jonz: string }): string {
  const head = summary?.trim() ?? "";
  const lines: string[] = [];
  let room = SUMMARY_MAX - head.length - 2;
  for (const m of [...since].reverse()) {
    const line = `${m.role === "user" ? names.you : names.jonz}: ${m.text.replace(/\s+/g, " ").trim()}`;
    if (line.length + 1 > room) break;
    lines.unshift(line);
    room -= line.length + 1;
  }
  return [head, lines.join("\n")].filter(Boolean).join("\n\n").slice(0, SUMMARY_MAX);
}

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
 * ask_house on /v1: the chat so far, ending with what the admin just
 * said, and the draft as it stands (null before there is one), which the
 * answer changes.
 */
export const ChatRequest = z.object({
  houseId: z.uuid(),
  /** Jonz's summary of the chat before `messages`, when it's been summed up (ChatResponse's `summed`). */
  summary: z.string().trim().max(SUMMARY_MAX).nullable().optional(),
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
  /** The chat was long, so Jonz summed up its start: the summary (with the one sent, if any) and how many of `messages` it now stands for. */
  summed: ChatSummed.optional(),
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

export const key = (name: string) => name.toLocaleLowerCase();

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

/** The draft's groups, tidied: each name once, its members matched to housemates or waited for. */
function tidyGroups(raw: RawDraft, people: readonly Person[], me: string): DraftedGroup[] {
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
  return groups;
}

/**
 * The group a drafted John names, as the draft has it, or null for the whole
 * house. A group the house already has keeps its Johns, whether or not
 * Claude listed it again: it joins the draft's `groups` while there's room.
 */
function groupFor(groupName: string, groups: DraftedGroup[], houseGroups: readonly DraftedGroup[]): string | null {
  const drafted = groups.find((g) => key(g.name) === key(groupName))?.name ?? null;
  if (drafted) return drafted;
  const there = houseGroups.find((g) => key(g.name) === key(groupName));
  if (!there || groups.length >= DRAFT_MAX_GROUPS) return null;
  groups.push({ name: there.name, memberIds: [...there.memberIds], waitingFor: [...there.waitingFor] });
  return there.name;
}

/** A drafted John's answers, each within what the list allows, but for its name and which John it is. */
function tidyJohn(j: NonNullable<RawDraft["johns"]>[number], group: string | null): Omit<DraftedJohn, "id" | "name"> {
  // Monthly and longer: every N months on a weekday of the month. An on-call John has no period.
  const onCall = j.onCall === true;
  const everyMonths = onCall ? null : wholeOrNull(j.everyMonths, 1, MAX_EVERY_MONTHS);
  return {
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
  };
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
  const groups = tidyGroups(raw, people, me);
  const johns: DraftedJohn[] = [];
  for (const j of raw.johns ?? []) {
    const name = text(j.name, 60);
    // A ref names a John on the list, once; anything else is a John to add.
    const ref = text(j.ref, 40);
    const matches = ref ? list.johnIds.filter((id) => id.startsWith(ref)) : [];
    const id = matches.length === 1 && !johns.some((k) => k.id === matches[0]) ? matches[0] : undefined;
    // The same new John twice is kept once; a list may already have two of a name (one per group), and keeps both.
    if (!name || (!id && johns.some((k) => key(k.name) === key(name)))) continue;
    johns.push({ ...(id ? { id } : {}), name, ...tidyJohn(j, groupFor(text(j.group, 40), groups, list.groups)) });
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

const JOHN_BASICS = ["name", "category", "points", "everyWeeks", "everyMonths", "weekOfMonth", "dueDow", "dueTime", "needsPhoto", "when", "respondHours", "perWeek", "crew"] as const;
type JohnBasic = (typeof JOHN_BASICS)[number];

/** What a John on the list and a John in a draft both say: what it is, how often, when it's due and who it takes. */
function johnBasics<T extends Record<JohnBasic, unknown>>(john: T): Pick<T, JohnBasic> {
  return Object.fromEntries(JOHN_BASICS.map((key) => [key, john[key]])) as Pick<T, JohnBasic>;
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
      ...johnBasics(j),
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
      ...johnBasics(j),
      group: groups.find((g) => g.id === j.groupId)?.name ?? null,
      why: "",
    })),
    groups: groups.map((g) => ({ name: g.name, memberIds: [...g.memberIds], waitingFor: [] })),
    note: null,
  };
}

