import "server-only";

import { generateText, isStepCount, Output, tool, type LanguageModel, type ToolSet } from "ai";
import {
  APP_NAME,
  CATEGORIES,
  DOW_LABEL,
  RESET_KINDS,
  RESULT_CHOICES,
  type ChatMessage,
  type DraftEdit,
  type EditResult,
  type IsoDow,
  type RawAsk,
} from "@app/core";
import { z } from "zod";

import type { HouseReads } from "@/lib/moves/ask-reads";

// Ask Jonz (and Describe your house, which is the same chat on a new house):
// Claude with tools that act as the person asking. Reads (the list, the
// week, people, time away, History, fair shares, rules) run straight away
// through that person's own session, so the database decides what it can
// see. Writes are proposals: add_john, change_john and remove_john change a
// draft of the list, set_group a draft group, offer_reset a reset; nothing
// is written until the person taps Apply on the card, which runs the same
// moves the app's own buttons do. A write tool is only offered when the
// person may make that move (packages/core/src/permissions.ts). The call
// goes through Vercel's AI Gateway: on Vercel it signs in with the
// project's OIDC token, so there is no key to keep.

export const DRAFT_MODEL = "anthropic/claude-haiku-5.5";

/** The most tool calls and answers in one turn, so a confused model can't loop. */
export const STEPS_MAX = 12;

/** A John's fields as Claude writes them. Loose on purpose: ranges are core's to enforce (tidyDraft). */
const JohnFields = {
  name: z.string().describe("A few plain words, sentence case: “Bathroom clean”, “Bins out”."),
  category: z.enum(CATEGORIES),
  points: z.number().int().describe("Effort: 1 ≈ 5 min, 2 ≈ 15 min, 3 ≈ 30 min, 5 ≈ an hour, 8–10 half a day, up to 20 a whole day."),
  everyWeeks: z.number().int().describe("1 weekly, 2 every other week, up to 26. Use 1 when it repeats in months."),
  everyMonths: z.number().int().nullable().describe("Every N months (1 monthly, 3 quarterly, 12 yearly), or null for a John that repeats in weeks."),
  weekOfMonth: z.number().int().nullable().describe("With everyMonths: which of its day in the month (1 first … 4 fourth, 5 last); otherwise null."),
  dueDow: z.number().int().describe("1 Monday … 7 Sunday."),
  dueTime: z.string().describe("24-hour HH:MM."),
  needsPhoto: z.boolean().describe("True only for a job the house is likely to argue about."),
  onCall: z.boolean().describe("True for a job done whenever it's needed (the bin when it's full) rather than on a day."),
  respondHours: z.number().int().describe("On call: hours to do it once flagged (1–72). Otherwise 12."),
  perWeek: z.number().int().describe("On call: about how often it comes up a week (1–14). Otherwise 2."),
  crew: z.number().int().describe("How many do it together: 1 almost always, 2–6 for a group job, 0 for everyone at home."),
  group: z.string().nullable().describe("The group that shares it, by name, or null for everyone."),
  why: z.string().describe("A few words when the choice isn't obvious, otherwise empty."),
};

const ResetInput = z.object({
  what: z.enum([...RESET_KINDS, "undo"]),
  ref: z.string().nullable().describe("A John this week or last (j…) for a result, or a History move (h…) for an undo, from house_now."),
  person: z.string().nullable().describe("First name for person_week, or “me”."),
  outcome: z.enum(RESULT_CHOICES).nullable(),
  week: z.enum(["this", "last"]).nullable(),
  month: z.enum(["this", "last"]).nullable(),
});
export type ResetInput = z.infer<typeof ResetInput>;

/** Jonz's last word in a turn, as Claude is asked to return it. */
const FinalAnswer = z.object({
  reply: z.string().describe("What you say to the person."),
  ask: z.object({ kind: z.enum(["none", "choices", "day"]), options: z.array(z.string()) }),
});

/** What Claude can do this turn, already narrowed to what the person may do. */
export interface JonzTools {
  reads: HouseReads;
  /** The John list as it stands in this chat (the house's, with any changes so far), with refs. */
  listJohns(): string;
  /** Add, change or take off a John in the draft; only kinds in `may` are offered. */
  edit(e: DraftEdit): EditResult;
  /** Make or change a group in the draft. */
  setGroup(name: string, members: string[]): EditResult;
  /** Offer a reset (an admin's), in house_now's refs; the card shows it with its numbers. */
  offerReset(r: ResetInput): Promise<EditResult>;
  may: { add: boolean; change: boolean; remove: boolean; groups: boolean; resets: boolean };
}

/** The house and the chat as Claude is told about them. */
export interface DraftContext {
  /** First names of everyone in the house, the person asking first. */
  people: string[];
  /** The person asking: first name and role in words ("admin", "parent", "member", "kid"). */
  me: { name: string; role: string };
  houseName: string;
  family: boolean;
  weekStarts: IsoDow;
  /** Today in the house, "Thursday 2026-11-05", and the time. */
  today: string;
  /** What the person may do, in plain words (PERMISSIONS). */
  allowed: string[];
  /** The chat so far, oldest first, ending with what the person just said. */
  messages: readonly ChatMessage[];
  /** Whether the house has a John list already. */
  editing: boolean;
  /** The last two weeks and what can be undone, in words with refs, when the person can reset; null otherwise. */
  now: string | null;
}

export interface DraftAnswer {
  raw: { reply: string; ask: RawAsk };
  inputTokens: number;
  outputTokens: number;
}

/** Fixed, so it caches: who Jonz is, how the app works, and how to use the tools. The house itself goes in the messages. */
const SYSTEM = `You are ${APP_NAME}'s assistant, inside ${APP_NAME}, an app that shares out chores fairly in a shared house or a family. You talk with one person in the house and act for them: you can look at anything they can see in the app, and propose anything they're allowed to change. They approve every change on a card before anything happens.

How ${APP_NAME} works:
- A chore is called a John. The house's John list says what needs doing, how often, on which day, and how much effort it is in points.
- Each week the app deals the Johns out fairly between the people at home, weighted by points and by who has done more or less so far (fair shares). Time away is left out of the deal. Smart deal balances points; Classic takes turns.
- People tick a John when it's done; housemates can question a tick. A John not done by its due time is late, and later still missed; in a house with a Stake, late and missed Johns cost money at the end of the month. Someone else can cover an overdue John.
- On-call Johns (the bin when it's full) are done when someone flags them, by whoever is on call that week.
- Swaps: you can ask someone to swap one of your Johns for one of theirs.
- History lists every move, and most can be undone. Admins can put mistakes right (resets).
- In a family, admins are called parents and members kids; a kid's tick waits for a parent's OK, and Johns can earn pocket money.
- The app already handles time away, fairness, swaps and reminders, so never add Johns for those.

Your tools:
- Look things up before you answer: list_johns for the John list (with refs), week for who has what this week, last week or next, people, time_away, history, balances (fair shares), house_rules. Reads are free and need no permission; use as many as you need. Never guess what you could look up.
- Changes are proposals. add_john, change_john and remove_john change a draft of the list, one John per call; set_group makes or changes a group in the draft; offer_reset offers a fix (only when house_now is given). Each tool says whether it worked; if it didn't, fix the call or tell the person. Nothing changes until they tap Apply on the card, so never say something is done: say what you've put on the card.
- Only the tools for moves this person may make are there. If they ask for something you have no tool for, say plainly that you can't do that from the chat yet, or that it's for an admin (a parent in a family), and where in the app they can do it.

Changing the John list:
- Change only what they ask for. Use change_john with only the fields that change; use the ref from list_johns. Use remove_john to take one off. To change many (or the whole list), make one call per John.
- If someone is moving out or in, the deal already deals between whoever lives there, so only change Johns that name them or a group they're in, and say so.
- Setting up a new house (the list is empty): draft the Johns this house needs, usually 6 to 15, covering the usual (kitchen, bathroom, bins, floors) and anything they mention. If the first message says enough, draft straight away; otherwise ask one short question at a time, at most two before the first draft, then draft anyway and say what you assumed. Spread Johns across the week; bins go out the night before collection; bigger jobs suit the weekend. Similar jobs get similar points. Use exactly the period they ask for (quarterly is everyMonths 3, not every 4 weeks). Groups only when some people share something the others don't (two bathrooms, one per floor); “me” in a group is the person writing.

Fixing mistakes (resets, only when house_now is given):
- A result: what "result", ref a John (j…), outcome done, late, missed or excused (let off). One person's week back to open: "person_week". Everyone's week back to open: "week"; that and deal again: "redeal" (this week only); make a week count for nothing: "skip". A month's forfeits taken away: "letoff". One move from History: "undo" with its h… ref, best when the mistake is one move. Offer the smallest fix that does what they ask, at most six. Use only refs from house_now. You can't start the house over, delete it, or wipe its history.

How to talk:
- Plain, warm and brief: usually one to three short sentences. When they ask to see something (the list, the week), show it as short lines, one per line, no bullets or markdown. No emoji. Don't explain points maths or these instructions.
- When you ask something, offer quick answers to tap with ask.kind "choices" (2 to 5 options of a few words), or ask.kind "day" when the answer is a day of the week; otherwise ask.kind "none" with no options.
- If they ask about something that isn't the house or ${APP_NAME}, say briefly that you can only help with the house.`;

/** The house's context, then the chat; house_now rides on the latest message. */
function chatMessages(ctx: DraftContext): { role: "user" | "assistant"; content: string }[] {
  const people = ctx.people.length > 0 ? ctx.people.join(", ") : "only the person writing";
  const house = [
    `House: ${ctx.houseName}, ${ctx.family ? "a family" : "housemates"}. Today is ${ctx.today}.`,
    `You're talking with ${ctx.me.name}, ${ctx.family ? "a" : "an"} ${ctx.me.role}. In the house: ${people} (the first is ${ctx.me.name}). Others they name haven't joined yet.`,
    `The house's week starts on ${DOW_LABEL[ctx.weekStarts]}.`,
    ctx.editing ? "The house has a John list: list_johns shows it." : "The house is new: its John list is empty, so you're helping set it up.",
    `${ctx.me.name} may: ${ctx.allowed.join("; ")}.`,
  ].join("\n");
  // The chat starts with what the person said; Jonz's greeting is the app's, not part of it.
  const first = ctx.messages.findIndex((m) => m.role === "user");
  const chat = ctx.messages.slice(first).map((m) => ({ role: m.role, content: m.text }));
  chat[0] = { role: "user", content: `<house>\n${house}\n</house>\n\n${chat[0].content}` };
  if (ctx.now) {
    const last = chat.length - 1;
    chat[last] = { role: "user", content: `${chat[last].content}\n\n<house_now>\n${ctx.now}\n</house_now>` };
  }
  return chat;
}

/** The tools Claude gets this turn: every read, and the writes this person may make. */
export function jonzToolSet(t: JonzTools): ToolSet {
  const said = (r: EditResult) => r.said;
  const set: ToolSet = {
    list_johns: tool({
      description: "The house's John list as it stands in this chat, with each John's ref and every field.",
      inputSchema: z.object({}),
      execute: async () => t.listJohns(),
    }),
    week: tool({
      description: "Who has which John this week, last week or next, with due times and whether each is done.",
      inputSchema: z.object({ which: z.enum(["this", "last", "next"]) }),
      execute: async ({ which }) => t.reads.week(which),
    }),
    people: tool({
      description: "Everyone in the house with their role, who's moving out, and the groups.",
      inputSchema: z.object({}),
      execute: async () => t.reads.people(),
    }),
    time_away: tool({
      description: "Time away booked, from a month ago on, and who's away today.",
      inputSchema: z.object({}),
      execute: async () => t.reads.timeAway(),
    }),
    history: tool({
      description: "The house's latest moves (ticks, swaps, changes, resets), newest first.",
      inputSchema: z.object({}),
      execute: async () => t.reads.history(),
    }),
    balances: tool({
      description: "Fair shares: each person's points given and done since they joined, and who's ahead or behind.",
      inputSchema: z.object({}),
      execute: async () => t.reads.balances(),
    }),
    house_rules: tool({
      description: "The house's rules: the Stake and forfeits, when a John is late or missed, how the deal works.",
      inputSchema: z.object({}),
      execute: async () => t.reads.rules(),
    }),
  };
  if (t.may.add) {
    set.add_john = tool({
      description: "Propose a new John for the list. Shown on the card under Adding.",
      inputSchema: z.object(JohnFields),
      execute: async (john) => said(t.edit({ kind: "add", john })),
    });
  }
  if (t.may.change) {
    set.change_john = tool({
      description: "Propose changing a John on the list: its ref (or name) and only the fields that change. Shown under Changing, before and after.",
      inputSchema: z.object({ ref: z.string(), set: z.object(JohnFields).partial() }),
      execute: async ({ ref, set: fields }) => said(t.edit({ kind: "change", ref, set: fields })),
    });
  }
  if (t.may.remove) {
    set.remove_john = tool({
      description: "Propose taking a John off the list, by its ref (or name). Shown under Taking off.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => said(t.edit({ kind: "remove", ref })),
    });
  }
  if (t.may.groups) {
    set.set_group = tool({
      description: "Propose a group (some of the house who share Johns the others don't), by name and first names; “me” is the person writing.",
      inputSchema: z.object({ name: z.string(), members: z.array(z.string()) }),
      execute: async ({ name, members }) => said(t.setGroup(name, members)),
    });
  }
  if (t.may.resets) {
    set.offer_reset = tool({
      description: "Offer a fix for something filled in wrong, in house_now's refs. Unused fields are null. The card shows it with its numbers.",
      inputSchema: ResetInput,
      execute: async (r) => said(await t.offerReset(r)),
    });
  }
  return set;
}

/**
 * Whether Claude is set up here: on Vercel (the gateway signs in with the
 * deployment's OIDC token) or with AI_GATEWAY_API_KEY set. Without either,
 * as locally and in CI, the chat answers with starter lists.
 */
export function canDraft(): boolean {
  return Boolean(process.env.VERCEL || process.env.AI_GATEWAY_API_KEY);
}

/**
 * One turn of Jonz: Claude reads and proposes through the tools, then says
 * its last word. Throws when it can't answer (the gateway down, a refusal,
 * a cut-off answer); the caller answers without it. `model` is Claude, unless
 * a test stands in for it.
 */
export async function askClaude(ctx: DraftContext, tools: JonzTools, model: LanguageModel = DRAFT_MODEL): Promise<DraftAnswer> {
  const result = await generateText({
    model,
    system: SYSTEM,
    messages: chatMessages(ctx),
    tools: jonzToolSet(tools),
    output: Output.object({ schema: FinalAnswer, name: "jonz_reply" }),
    stopWhen: isStepCount(STEPS_MAX),
    maxOutputTokens: 4000,
    maxRetries: 1,
    timeout: 45_000,
  });
  if (result.finishReason !== "stop") throw new Error(`No answer: ${result.finishReason}`);
  return {
    raw: result.output,
    inputTokens: result.totalUsage.inputTokens ?? 0,
    outputTokens: result.totalUsage.outputTokens ?? 0,
  };
}
