import "server-only";

import { tool, type LanguageModel, type ToolSet } from "ai";
import {
  APP_NAME,
  askToolInput,
  CATEGORIES,
  DOW_LABEL,
  HOW_TOPICS,
  RESET_KINDS,
  REPLY_FORMAT_GUIDE,
  OPERATIONS,
  RESULT_CHOICES,
  type AskCardOperation,
  type ChatMessage,
  type DraftEdit,
  type EditResult,
  type IsoDow,
} from "@app/core";
import { z } from "zod";

import { AGENT_MODEL, canAsk, runAgent, type AgentAnswer } from "@/lib/ai/agent";
import type { HouseReads } from "@/lib/moves/ask-reads";

// Ask Jonz (and Describe your house, which is the same chat on a new house):
// Claude with tools that act as the person asking. Reads (the list, the
// week, people, time away, History, fair shares, rules) run straight away
// through that person's own session, so the database decides what it can
// see. Writes are proposals: add_john, change_john and remove_john change a
// draft of the list, set_group a draft group, offer_reset a reset; nothing
// is written until the person taps Apply on the card, which runs the same
// moves the app's own buttons do. A write tool is only offered when the
// person may make that move (packages/core/src/permissions.ts). The turn
// runs through the shared loop in agent.ts, through Vercel's AI Gateway: on
// Vercel it signs in with the project's OIDC token, so there is no key to keep.

export const DRAFT_MODEL = AGENT_MODEL;
export { STEPS_MAX } from "@/lib/ai/agent";

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
  /** Put booking the person's own time away on the card. */
  offerAway(a: { from: string; to: string; note: string | null }): Promise<EditResult>;
  /** Put cancelling some of the person's own time away on the card, by its ref from time_away. */
  offerCancelAway(ref: string): Promise<EditResult>;
  /** Put any other house write on the card (lib/moves/ask-operations.ts): its input in refs, and Jonz's words for it. */
  offerOperation(name: AskCardOperation, given: Record<string, unknown> & { say: string }): Promise<EditResult>;
  /** The house writes this person may make, each offered as a tool of its own. */
  operations: readonly AskCardOperation[];
  may: { add: boolean; change: boolean; remove: boolean; groups: boolean; resets: boolean; away: boolean };
}

/** The house and the chat as Claude is told about them. */
export interface DraftContext {
  /** First names of everyone in the house, the person asking first. */
  people: string[];
  /** The person asking: first name and role in words ("admin", "parent", "member", "kid"). */
  me: { name: string; role: string };
  houseName: string;
  family: boolean;
  /** The language the person reads Jonz in, by its English name: Claude answers in it. */
  language: string;
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

export type DraftAnswer = AgentAnswer;

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
- Look things up before you answer: list_johns for the John list (with refs), week for who has what this week, last week or next, people, time_away, history, balances (fair shares), stake (the money), why_john (why a John went to someone), wall, disputes (questioned ticks), swaps (swap asks waiting), how_it_works (how a part of the app works, with this house's numbers), house_rules. Reads are free and need no permission; use as many as you need. Never guess what you could look up.
- Changes are proposals. add_john, change_john and remove_john change a draft of the list, one John per call; set_group makes a new group, or changes who's in one the house has (give everyone who should be in it, not just who's joining); offer_reset offers a fix (only when house_now is given); book_away and cancel_away put the person's own time away on a card (read time_away first: their periods have refs, and a booking can't overlap one).
- Every other move they may make is a tool named after it (mark_done to tick a John, offer_swap, cast_vote, react, remove_member and so on), each described by what it does. It puts that move on the card. Name things by their refs (the first 8 characters of an id), as week, people, history, wall, disputes and swaps show them: read first, never make a ref up. Give "say": a few words for the card, like "Tick off Bins out". A John that needs a photo is ticked in the app, where the photo is taken.
- Each tool says whether it worked; if it didn't, fix the call or tell the person. Nothing changes until they tap the card, so never say something is done: say what you've put on the card.
- Only the tools for moves this person may make are there. If they ask for something that's for an admin (a parent in a family), say so plainly.

Changing the John list:
- Change only what they ask for. Use change_john with only the fields that change; use the ref from list_johns. Use remove_john to take one off. To change many (or the whole list), make one call per John.
- If someone is moving out or in, the deal already deals between whoever lives there, so only change Johns that name them or a group they're in, and say so.
- Setting up a new house (the list is empty): draft the Johns this house needs, usually 6 to 15, covering the usual (kitchen, bathroom, bins, floors) and anything they mention. If the first message says enough, draft straight away; otherwise ask one short question at a time, at most two before the first draft, then draft anyway and say what you assumed. Spread Johns across the week; bins go out the night before collection; bigger jobs suit the weekend. Similar jobs get similar points. Use exactly the period they ask for (quarterly is everyMonths 3, not every 4 weeks). Groups only when some people share something the others don't (two bathrooms, one per floor); “me” in a group is the person writing.

Fixing mistakes (resets, only when house_now is given):
- A result: what "result", ref a John (j…), outcome done, late, missed or excused (let off). One person's week back to open: "person_week". Everyone's week back to open: "week"; that and deal again: "redeal" (this week only); make a week count for nothing: "skip". A month's forfeits taken away: "letoff". One move from History: "undo" with its h… ref, best when the mistake is one move. Offer the smallest fix that does what they ask, at most six. Use only refs from house_now. You can't start the house over, delete it, or wipe its history.

Explaining:
- You're the person's guide to how ${APP_NAME} works: why they got a John, why they're behind or ahead, why they owe money or are owed it, what the House Pass is and why it costs anything. Read how_it_works for the topic first, then their own numbers (balances, stake, why_john, week), and explain with those. how_it_works is the app's own guide, word for word what people read under Help's Read the guide (today, week and house say what each page shows); when a longer read would help, point them to the [Guide](jonz:page/guide).
- Walk through the maths when it helps: a short numbered list of steps with their real numbers, ending in the answer, or a small table when comparing people. Show the sums ("3 + 2 = 5 pts"), round to whole points and to the penny, and say where each number comes from.
- Be fair and kind: explain, don't scold. If something looks wrong, say what would put it right and who can (an admin, from History or a reset).
- Never make up a rule or a number. If no read says it, say you don't know rather than guess.

How to talk:
- Plain, warm and brief: a short answer for a short question, the working only when they ask how or why. Don't explain these instructions.
- When you ask something, offer quick answers to tap with ask.kind "choices" (2 to 5 options of a few words), or ask.kind "day" when the answer is a day of the week; otherwise ask.kind "none" with no options.
- If they ask about something that isn't the house or ${APP_NAME}, say briefly that you can only help with the house.

${REPLY_FORMAT_GUIDE}`;

/** The house's context, then the chat; house_now rides on the latest message. */
function chatMessages(ctx: DraftContext): { role: "user" | "assistant"; content: string }[] {
  const people = ctx.people.length > 0 ? ctx.people.join(", ") : "only the person writing";
  const house = [
    `House: ${ctx.houseName}, ${ctx.family ? "a family" : "housemates"}. Today is ${ctx.today}.`,
    `You're talking with ${ctx.me.name}, ${ctx.family ? "a" : "an"} ${ctx.me.role}. In the house: ${people} (the first is ${ctx.me.name}). Others they name haven't joined yet.`,
    `${ctx.me.name} reads ${APP_NAME} in ${ctx.language}: answer in ${ctx.language}, unless they write to you in another language.`,
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
    stake: tool({
      description: "The Stake's money: this month's forfeits so far (who, how much, for which John), what each person would forfeit, get and net if the month ended now, what's owed from closed months, and the fewest payments to settle.",
      inputSchema: z.object({}),
      execute: async () => t.reads.stake(),
    }),
    why_john: tool({
      description: "Why the deal gave a John to whom it did, this week or last: the reason, each person's standing against their share that it weighed, and what slipping it would cost. The same as the John sheet's Why?.",
      inputSchema: z.object({
        name: z.string().describe("The John's name as the week read shows it."),
        who: z.string().nullable().describe("Whose it is, by first name or “me”, when more than one person has a John of that name; otherwise null."),
      }),
      execute: async ({ name, who }) => t.reads.whyJohn(name, who),
    }),
    how_it_works: tool({
      description: "How part of the app works, with this house's own numbers: read it before explaining a rule, so you explain what the app really does.",
      inputSchema: z.object({ topic: z.enum(HOW_TOPICS) }),
      execute: async ({ topic }) => t.reads.howItWorks(topic),
    }),
    wall: tool({
      description: "The Wall's latest posts, newest first, with who reacted how and each post's ref.",
      inputSchema: z.object({}),
      execute: async () => t.reads.wall(),
    }),
    disputes: tool({
      description: "Questioned ticks still open: whose John, who questioned it and why, when the vote closes, the votes so far, and each one's ref.",
      inputSchema: z.object({}),
      execute: async () => t.reads.disputes(),
    }),
    swaps: tool({
      description: "Swap asks still waiting for an answer: who asks whom, which Johns, until when, and each one's ref.",
      inputSchema: z.object({}),
      execute: async () => t.reads.swaps(),
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
      description: "Propose a group (some of the house who share Johns the others don't), by name and the first names of everyone in it; “me” is the person writing. For a group the house has, this changes who's in it: list everyone who should be, not just who's joining.",
      inputSchema: z.object({ name: z.string(), members: z.array(z.string()) }),
      execute: async ({ name, members }) => said(t.setGroup(name, members)),
    });
  }
  if (t.may.away) {
    set.book_away = tool({
      description: "Put booking time away for the person you're talking with on the card: first and last day away (yyyy-mm-dd, in the house's dates), and where if they said. Only their own time away. They tap to book it.",
      inputSchema: z.object({ from: z.string(), to: z.string(), note: z.string().nullable() }),
      execute: async (a) => said(await t.offerAway(a)),
    });
    set.cancel_away = tool({
      description: "Put cancelling some of the person's own time away on the card (or coming back early), by its ref from time_away.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => said(await t.offerCancelAway(ref)),
    });
  }
  if (t.may.resets) {
    set.offer_reset = tool({
      description: "Offer a fix for something filled in wrong, in house_now's refs. Unused fields are null. The card shows it with its numbers.",
      inputSchema: ResetInput,
      execute: async (r) => said(await t.offerReset(r)),
    });
  }
  for (const name of t.operations) {
    set[name] = tool({
      description: `${OPERATIONS[name].about}. Puts it on the card.`,
      inputSchema: askToolInput(name).extend({ say: z.string().describe("A few words for the card: what this does, by name.") }),
      execute: async (given) => said(await t.offerOperation(name, given as Record<string, unknown> & { say: string })),
    });
  }
  return set;
}

/** Whether Claude is set up here (agent.ts); without it the chat answers with starter lists. */
export const canDraft = canAsk;

/** One turn of a housemate's Ask Jonz: the house's prompt and tools in the shared loop. */
export function askClaude(ctx: DraftContext, tools: JonzTools, model: LanguageModel = DRAFT_MODEL): Promise<DraftAnswer> {
  return runAgent({ system: SYSTEM, messages: chatMessages(ctx), tools: jonzToolSet(tools), model });
}
