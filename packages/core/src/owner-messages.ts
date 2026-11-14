import type { Words } from "./words-for";
import { z } from "zod";

import type { ListFacet, ListWhen } from "./admin-list";

// Messages from the owner (docs/specs/owner-admin.md, "Messages"): one
// message to a person, a house or everyone, as a push, a post on the Wall
// and an email. The database decides who it reaches and refuses what isn't
// allowed (supabase/migrations/20270112090000_baseline.sql); these are
// the words, the checks in sentences, and what crosses the API.

export const MESSAGE_AUDIENCES = ["person", "house", "everyone"] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];
/** What a sent message was for: one of the three, or the owner's own test. */
export type SentAudience = MessageAudience | "test";

export const MESSAGE_LIMITS = { subject: 80, body: 500 } as const;

/** The three ways it can go. */
export interface MessageWays {
  push: boolean;
  wall: boolean;
  email: boolean;
}

/** owner_send_message on /v1: a message to send, or `test` to send it to yourself. */
export const OwnerMessageRequest = z.object({
  audience: z.enum(["person", "house", "everyone", "test"]),
  personId: z.uuid().nullable().default(null),
  houseId: z.uuid().nullable().default(null),
  subject: z.string().trim().min(1).max(MESSAGE_LIMITS.subject),
  body: z.string().trim().min(1).max(MESSAGE_LIMITS.body),
  push: z.boolean(),
  wall: z.boolean(),
  email: z.boolean(),
});
export type OwnerMessageRequest = z.infer<typeof OwnerMessageRequest>;

export const OwnerMessageResponse = z.object({
  ok: z.literal(true),
  id: z.string(),
  /** How many people it's for, and how many Walls it went on. */
  people: z.number(),
  walls: z.number(),
  /** How many of the people were pushed or emailed before the answer; the clock sends the rest. */
  sent: z.number(),
});
export type OwnerMessageResponse = z.infer<typeof OwnerMessageResponse>;

/** How far a message reaches, before it's sent. */
export interface MessageReach {
  people: number;
  push: number;
  email: number;
  houses: number;
}

/**
 * The ways a message can go to this audience: never on the Wall for one
 * person (a Wall is the whole house's), and never for a test.
 */
export function messageWays(audience: SentAudience, ways: MessageWays): MessageWays {
  return { ...ways, wall: ways.wall && (audience === "house" || audience === "everyone") };
}

/**
 * A test goes to you the ways the message would, less the Wall; a message
 * only for the Wall is tested as a push, so you still see it on your phone.
 */
export function testWays(ways: MessageWays): MessageWays {
  if (!ways.push && !ways.email) return { push: true, wall: false, email: false };
  return { ...ways, wall: false };
}

export interface MessageDraft {
  audience: MessageAudience;
  personId: string | null;
  houseId: string | null;
  subject: string;
  body: string;
  ways: MessageWays;
}

/** What's wrong with a draft, in sentences, keyed by the field. Empty when it can go. */
export function messageProblems(draft: MessageDraft, words: Words): Partial<Record<"who" | "subject" | "body" | "ways", string>> {
  const problems: Partial<Record<"who" | "subject" | "body" | "ways", string>> = {};
  if (draft.audience === "person" && !draft.personId) problems.who = words('admin.messages.pickPerson');
  if (draft.audience === "house" && !draft.houseId) problems.who = words('admin.messages.pickHouse');
  const subject = draft.subject.trim().length;
  if (subject < 1 || subject > MESSAGE_LIMITS.subject) problems.subject = words('admin.messages.subjectProblem', { max: MESSAGE_LIMITS.subject });
  const body = draft.body.trim().length;
  if (body < 1 || body > MESSAGE_LIMITS.body) problems.body = words('admin.messages.bodyProblem', { max: MESSAGE_LIMITS.body });
  const ways = messageWays(draft.audience, draft.ways);
  if (!ways.push && !ways.wall && !ways.email) problems.ways = words('admin.messages.wayProblem');
  return problems;
}

/** The push it sends: the subject as the title, the words as the body; it opens the Wall when it's there too. */
export function messagePush(message: { subject: string; body: string; wall: boolean }): { title: string; body: string; url: string } {
  return { title: message.subject, body: message.body, url: message.wall ? "/house/wall" : "/" };
}

const people = (n: number) => (n === 1 ? "1 person" : `${n.toLocaleString("en-GB")} people`);

/** The send button: "Send to 5 people", "Send to Ava". */
export function sendLabel(audience: MessageAudience, reach: MessageReach | null, name: string | null): string {
  if (audience === "person" && name) return `Send to ${name}`;
  if (!reach) return "Send";
  return `Send to ${people(reach.people)}`;
}

/** Under each way: how many it reaches that way. */
export function wayMeta(way: keyof MessageWays, audience: MessageAudience, reach: MessageReach | null, words: Words): string {
  if (way === "wall") {
    if (audience === "person") return words('admin.messages.wallNotPerson');
    if (!reach) return words('admin.messages.wallMeta');
    return audience === "everyone" ? `${words('admin.messages.wallMeta')}, on ${reach.houses.toLocaleString("en-GB")} Walls` : words('admin.messages.wallMeta');
  }
  if (way === "push") {
    if (!reach) return words('admin.messages.pushMeta');
    if (audience === "person") return reach.push > 0 ? words('admin.messages.pushOnOne') : words('admin.messages.pushOffOne');
    return `${reach.push.toLocaleString("en-GB")} of ${people(reach.people)} ${reach.people === 1 ? "has" : "have"} them on, silent in quiet hours`;
  }
  return words('admin.messages.emailMeta');
}

/** Who a sent message went to, for its row: "Ava", "Elm Street", "Everyone", "You, a test". */
export function sentTo(row: { audience: SentAudience; toName: string | null }, words: Words): string {
  switch (row.audience) {
    case "everyone":
      return words('admin.messages.everyone');
    case "test":
      return words('admin.messages.testRow');
    default:
      return row.toName ?? words('admin.messages.gone');
  }
}

/** The ways a sent message went, in words: "Push, Wall and email". */
export function sentWays(row: MessageWays): string {
  const ways = [row.push && "push", row.wall && "Wall", row.email && "email"].filter(Boolean) as string[];
  if (ways.length === 0) return "";
  const words = ways.length === 1 ? ways[0] : `${ways.slice(0, -1).join(", ")} and ${ways[ways.length - 1]}`;
  return words[0].toUpperCase() + words.slice(1);
}

/** A sent message's line under its subject: "Elm Street, 5 people, Push and Wall". */
export function sentMeta(row: { audience: SentAudience; toName: string | null; people: number; waiting: number } & MessageWays, words: Words): string {
  const parts = [sentTo(row, words)];
  if (row.audience === "house" || row.audience === "everyone") parts.push(people(row.people));
  parts.push(sentWays(row));
  if (row.waiting > 0) parts.push(`${row.waiting.toLocaleString("en-GB")} still sending`);
  return parts.join(", ");
}

/** The sent list's filters: who it was for, and which way it went. */
export const MESSAGE_FACETS: readonly ListFacet[] = [
  {
    key: "to",
    label: "To",
    options: [
      { value: "any", label: "Anyone" },
      { value: "person", label: "A person", words: ["person", "one"] },
      { value: "house", label: "A house", words: ["house", "home"] },
      { value: "everyone", label: "Everyone", words: ["everyone", "all", "broadcast"] },
      { value: "test", label: "Tests", words: ["test", "me", "mine"] },
    ],
  },
  {
    key: "way",
    label: "Way",
    options: [
      { value: "any", label: "Any way" },
      { value: "push", label: "Push", words: ["push", "notification"] },
      { value: "wall", label: "Wall", words: ["wall", "post"] },
      { value: "email", label: "Email", words: ["email", "mail"] },
    ],
  },
];

export const MESSAGE_WHEN: ListWhen = { label: "Sent" };
