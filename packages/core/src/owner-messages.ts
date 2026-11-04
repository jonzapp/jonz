import { z } from "zod";

import type { ListFacet, ListWhen } from "./admin-list";

// Messages from the owner (docs/specs/owner-admin.md, "Messages"): one
// message to a person, a house or everyone, as a push, a post on the Wall
// and an email. The database decides who it reaches and refuses what isn't
// allowed (supabase/migrations/20261113090000_owner_messages.sql); these are
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

/** POST /api/admin/messages: a message to send, or `test` to send it to yourself. */
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
export function messageProblems(draft: MessageDraft): Partial<Record<"who" | "subject" | "body" | "ways", string>> {
  const problems: Partial<Record<"who" | "subject" | "body" | "ways", string>> = {};
  if (draft.audience === "person" && !draft.personId) problems.who = MESSAGE_COPY.pickPerson;
  if (draft.audience === "house" && !draft.houseId) problems.who = MESSAGE_COPY.pickHouse;
  const subject = draft.subject.trim().length;
  if (subject < 1 || subject > MESSAGE_LIMITS.subject) problems.subject = MESSAGE_COPY.subjectProblem;
  const body = draft.body.trim().length;
  if (body < 1 || body > MESSAGE_LIMITS.body) problems.body = MESSAGE_COPY.bodyProblem;
  const ways = messageWays(draft.audience, draft.ways);
  if (!ways.push && !ways.wall && !ways.email) problems.ways = MESSAGE_COPY.wayProblem;
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
export function wayMeta(way: keyof MessageWays, audience: MessageAudience, reach: MessageReach | null): string {
  if (way === "wall") {
    if (audience === "person") return MESSAGE_COPY.wallNotPerson;
    if (!reach) return MESSAGE_COPY.wallMeta;
    return audience === "everyone" ? `${MESSAGE_COPY.wallMeta}, on ${reach.houses.toLocaleString("en-GB")} Walls` : MESSAGE_COPY.wallMeta;
  }
  if (way === "push") {
    if (!reach) return MESSAGE_COPY.pushMeta;
    if (audience === "person") return reach.push > 0 ? MESSAGE_COPY.pushOnOne : MESSAGE_COPY.pushOffOne;
    return `${reach.push.toLocaleString("en-GB")} of ${people(reach.people)} ${reach.people === 1 ? "has" : "have"} them on, silent in quiet hours`;
  }
  return MESSAGE_COPY.emailMeta;
}

/** Who a sent message went to, for its row: "Ava", "Elm Street", "Everyone", "You, a test". */
export function sentTo(row: { audience: SentAudience; toName: string | null }): string {
  switch (row.audience) {
    case "everyone":
      return MESSAGE_COPY.everyone;
    case "test":
      return MESSAGE_COPY.testRow;
    default:
      return row.toName ?? MESSAGE_COPY.gone;
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
export function sentMeta(row: { audience: SentAudience; toName: string | null; people: number; waiting: number } & MessageWays): string {
  const parts = [sentTo(row)];
  if (row.audience === "house" || row.audience === "everyone") parts.push(people(row.people));
  parts.push(sentWays(row));
  if (row.waiting > 0) parts.push(`${row.waiting.toLocaleString("en-GB")} still sending`);
  return parts.join(", ");
}

export const MESSAGE_COPY = {
  page: "Messages",
  to: "To",
  audience: { person: "A person", house: "A house", everyone: "Everyone" } satisfies Record<MessageAudience, string>,
  whichPerson: "Which person",
  whichHouse: "Which house",
  findPerson: "Name or email",
  findHouse: "House name or join code",
  noneFound: "Nobody found by that.",
  noHouseFound: "No house found by that.",
  change: "Change",
  noHouse: "No house",
  subject: "Subject",
  body: "Message",
  sendAs: "Send it as",
  wall: "A post on their Wall",
  wallMeta: "Shows as From Jonz",
  wallNotPerson: "Only for a house or everyone: the whole house reads its Wall",
  push: "A push",
  pushMeta: "To every phone and browser they turned them on",
  pushOnOne: "They have them on, silent in quiet hours",
  pushOffOne: "They haven’t turned them on, so it won’t arrive",
  email: "An email",
  emailMeta: "For news they need to keep",
  sendTest: "Send me a test",
  preview: "Preview",
  howItLooks: "How it looks",
  previewPush: "Push",
  previewWall: "Wall",
  fromJonz: "From Jonz",
  sent: "Sent",
  allSent: "All sent",
  nothingSent: "Nothing sent yet",
  nothingSentBody: "Messages you send, tests included, are listed here.",
  everyone: "Everyone",
  testRow: "You, a test",
  gone: "Someone who left",
  pickPerson: "Pick who it goes to.",
  pickHouse: "Pick the house it goes to.",
  subjectProblem: `Write a subject, in up to ${MESSAGE_LIMITS.subject} letters.`,
  bodyProblem: `Write the message, in up to ${MESSAGE_LIMITS.body} letters.`,
  wayProblem: "Pick at least one way to send it.",
  count: (n: number, max: number) => `${n} of ${max}`,
  confirmEveryone: (n: number) => `Send to all ${people(n)}?`,
  confirmEveryoneBody: "Everyone with an account gets it, the ways you picked. It can’t be taken back.",
  confirmSend: (n: number) => `Yes, send to ${people(n)}`,
  sentToast: (n: number) => `Sent to ${people(n)}`,
  testToast: "Test sent to you",
  testNoPush: "You haven’t turned on pushes on any device, so only the email will arrive.",
  auditNote: "Every message, tests included, goes in the audit log.",
  // The busy list of everything sent.
  searchPlaceholder: "Search subjects, words, people or houses",
  sentCount: (count: string) => (count === "1" ? "1 message" : `${count} messages`),
  columns: { subject: "Subject", to: "To", ways: "Sent as", when: "When" },
} as const;

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
