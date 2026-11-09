import { z } from "zod";

import { MESSAGE_LIMITS } from "./owner-messages";
import { NOTICE_COPY, NOTICE_KINDS } from "./notices";
import { PromotionRequest } from "./promotions";
import { REPORT_LIMITS } from "./reports";

// Who can do what on the owner's admin pages, and how the owner's Ask Jonz
// does each of it: the same shape as a house's (permissions.ts and
// ask-coverage.ts). The database holds the same list (permissions with
// scope app, and app_role_permissions) and every admin function asks
// can_app(permission): an app role in app_owners, with their code this session. This
// list says which moves there are, which role has each, and how Jonz handles
// each one, so a move added to the admin pages without a way through Jonz
// doesn't compile.

/**
 * An app role, as `app_owners.role` holds it: an owner may do everything on
 * the admin pages; support may read them and answer the Inbox.
 */
export const OWNER_ROLES = ["owner", "support"] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

/** Every app-scope permission on the admin pages, in plain words (Jonz reads these). */
export const OWNER_PERMISSIONS = {
  "admin:read": "See every admin page: Overview, Inbox, Houses, Messages, Notices, Promotions, Deletions and the audit log",
  "reports:write": "Reply to a report (its sender gets a push and an email), mark it fixed or open it again, and fold it into one that says the same thing",
  "notices:write": "Put up a notice, change one, or end one",
  "messages:write": "Send a message to a person, a house or everyone, by push, the Wall or email",
  "promotions:write": "Make a promotion, stop one, email the people it names, or try its Stripe set-up again",
  "deletions:write": "Delete an account now, stop a deletion, or start one for someone who asked by email",
  "houses:write": "Delete a whole house: everyone in it is told, its Pass stops renewing, and it can't be undone",
} as const;
export type OwnerPermission = keyof typeof OWNER_PERMISSIONS;
export const OWNER_PERMISSION_NAMES = Object.keys(OWNER_PERMISSIONS) as OwnerPermission[];

/** What each owner role may do. */
export const OWNER_ROLE_PERMISSIONS: Record<OwnerRole, readonly OwnerPermission[]> = {
  owner: OWNER_PERMISSION_NAMES,
  support: ["admin:read", "reports:write"],
};

/** Whether an owner with this role (or no role: not an owner, or no code this session) may do it. */
export function ownerCan(role: OwnerRole | null | undefined, permission: OwnerPermission): boolean {
  return role != null && OWNER_ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * How the owner's Ask Jonz handles each move: it reads it, or it puts it on
 * a card with these tools for the owner to tap. A Record over every
 * permission, as ASK_COVERAGE is, and every one is in the chat: none is
 * left for the owner to go and do on a page.
 */
export type OwnerAskCoverage = { by: "reads" } | { by: "card"; tools: readonly string[] };

export const OWNER_ASK_COVERAGE: Record<OwnerPermission, OwnerAskCoverage> = {
  "admin:read": { by: "reads" },
  "reports:write": { by: "card", tools: ["reply_to_report", "mark_report_fixed", "reopen_report", "set_same_as"] },
  "notices:write": { by: "card", tools: ["save_notice", "end_notice"] },
  "messages:write": { by: "card", tools: ["send_message"] },
  "promotions:write": { by: "card", tools: ["make_promotion", "stop_promotion", "email_promotion", "retry_promotion"] },
  "deletions:write": { by: "card", tools: ["delete_account_now", "stop_deletion", "start_deletion"] },
  "houses:write": { by: "card", tools: ["delete_house"] },
};

/** The owner's write tools, from OWNER_ASK_COVERAGE. */
export const OWNER_WRITE_TOOLS: readonly string[] = [
  ...new Set(Object.values(OWNER_ASK_COVERAGE).flatMap((c) => (c.by === "card" ? c.tools : []))),
];

const Reason = z.string().trim().max(500);
/** Who or what a move is about, as the admin pages name it: the card's words, never something Jonz is told to do. */
const Label = z.string().trim().min(1).max(120);

/**
 * A move Jonz puts on the owner's card. Each is done, when the owner taps,
 * through the same call the admin page's own button makes, as the owner, so
 * the database checks it the same way and the audit log keeps it.
 */
export const OwnerMove = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report_reply"), reportId: z.uuid(), who: Label, body: z.string().trim().min(1).max(REPORT_LIMITS.words) }),
  z.object({ kind: z.literal("report_fixed"), reportId: z.uuid(), who: Label, note: z.string().trim().max(REPORT_LIMITS.words), tell: z.boolean() }),
  z.object({ kind: z.literal("report_open"), reportId: z.uuid(), who: Label }),
  z.object({ kind: z.literal("report_same_as"), reportId: z.uuid(), who: Label, mainId: z.uuid().nullable(), main: Label.nullable() }),
  z.object({
    kind: z.literal("notice_save"),
    id: z.uuid().nullable(),
    notice: z.enum(NOTICE_KINDS),
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().max(240),
    linkLabel: z.string().trim().min(1).max(30).nullable(),
    linkUrl: z
      .string()
      .trim()
      .max(300)
      .regex(/^(\/[^/\\]|\/$|https:\/\/)/)
      .nullable(),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  z.object({ kind: z.literal("notice_end"), id: z.uuid(), title: Label }),
  z.object({
    kind: z.literal("message_send"),
    audience: z.enum(["person", "house", "everyone"]),
    personId: z.uuid().nullable(),
    houseId: z.uuid().nullable(),
    to: Label,
    subject: z.string().trim().min(1).max(MESSAGE_LIMITS.subject),
    body: z.string().trim().min(1).max(MESSAGE_LIMITS.body),
    push: z.boolean(),
    wall: z.boolean(),
    email: z.boolean(),
  }),
  z.object({ kind: z.literal("promotion_make"), promotion: PromotionRequest }),
  z.object({ kind: z.literal("promotion_stop"), id: z.uuid(), code: Label }),
  z.object({ kind: z.literal("promotion_email"), id: z.uuid(), code: Label }),
  z.object({ kind: z.literal("promotion_retry"), id: z.uuid(), code: Label }),
  z.object({ kind: z.literal("deletion_now"), userId: z.uuid(), who: Label, reason: Reason }),
  z.object({ kind: z.literal("deletion_stop"), userId: z.uuid(), who: Label, reason: Reason }),
  z.object({ kind: z.literal("deletion_start"), email: z.email(), reason: Reason }),
  z.object({ kind: z.literal("house_delete"), houseId: z.uuid(), name: Label, people: z.number().int().min(0), reason: Reason, tell: z.boolean() }),
]);
export type OwnerMove = z.infer<typeof OwnerMove>;
export type OwnerMoveKind = OwnerMove["kind"];

/** The most moves one answer puts on the owner's card. */
export const OWNER_MOVES_MAX = 6;

/** Which permission each move needs: the card's moves, checked against the owner's role. */
export const OWNER_MOVE_PERMISSION: Record<OwnerMoveKind, OwnerPermission> = {
  report_reply: "reports:write",
  report_fixed: "reports:write",
  report_open: "reports:write",
  report_same_as: "reports:write",
  notice_save: "notices:write",
  notice_end: "notices:write",
  message_send: "messages:write",
  promotion_make: "promotions:write",
  promotion_stop: "promotions:write",
  promotion_email: "promotions:write",
  promotion_retry: "promotions:write",
  deletion_now: "deletions:write",
  deletion_stop: "deletions:write",
  deletion_start: "deletions:write",
  house_delete: "houses:write",
};

/** Moves that can’t be taken back: the card says so under each. */
export const OWNER_MOVES_FINAL: readonly OwnerMoveKind[] = ["deletion_now", "message_send", "promotion_email", "report_reply", "promotion_stop", "house_delete"];

const ways = (m: { push: boolean; wall: boolean; email: boolean }) =>
  [m.push && "push", m.wall && "the Wall", m.email && "email"].filter(Boolean).join(", ");
const quoted = (s: string) => `“${s}”`;
const words = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const OWNER_MOVES_COPY = {
  card: "To do",
  cardMeta: "Ticked ones happen when you tap",
  final: "Can’t be undone",
  title: (m: OwnerMove): string => {
    switch (m.kind) {
      case "report_reply":
        return `Reply to ${m.who}`;
      case "report_fixed":
        return m.tell ? `Mark ${m.who}’s report fixed and tell them` : `Mark ${m.who}’s report fixed`;
      case "report_open":
        return `Open ${m.who}’s report again`;
      case "report_same_as":
        return m.main ? `Fold ${m.who}’s report into ${m.main}` : `Take ${m.who}’s report back out`;
      case "notice_save":
        return m.id ? `Change the notice ${quoted(m.title)}` : `Put up a notice: ${quoted(m.title)}`;
      case "notice_end":
        return `End the notice ${quoted(m.title)}`;
      case "message_send":
        return `Send ${quoted(m.subject)} to ${m.to}`;
      case "promotion_make":
        return `Make the promotion ${m.promotion.code}`;
      case "promotion_stop":
        return `Stop the promotion ${m.code}`;
      case "promotion_email":
        return `Email the people ${m.code} names`;
      case "promotion_retry":
        return `Set ${m.code} up in Stripe again`;
      case "deletion_now":
        return `Delete ${m.who}’s account now`;
      case "deletion_stop":
        return `Stop deleting ${m.who}’s account`;
      case "deletion_start":
        return `Start deleting ${m.email}’s account`;
      case "house_delete":
        return `Delete the house ${m.name}`;
    }
  },
  meta: (m: OwnerMove): string => {
    switch (m.kind) {
      case "report_reply":
        return words(m.body);
      case "report_fixed":
        return m.note ? words(m.note) : m.tell ? "They’re told it’s fixed." : "Nobody’s told.";
      case "report_open":
        return "It goes back to waiting.";
      case "report_same_as":
        return m.main ? "Fixing that one fixes this one too." : "It stands on its own again.";
      case "notice_save":
        return words([NOTICE_COPY.kinds[m.notice], m.body].filter(Boolean).join(": "));
      case "notice_end":
        return "It stops showing now.";
      case "message_send":
        return `By ${ways(m)}. ${words(m.body, 100)}`;
      case "promotion_make":
        return words([m.promotion.name, m.promotion.audience === "named" ? `for ${m.promotion.people.length} people` : "for anyone with the code"].join(", "));
      case "promotion_stop":
        return "Nobody new can use it.";
      case "promotion_email":
        return "Each person it names gets its link.";
      case "promotion_retry":
        return "Tries Stripe again so it can go live.";
      case "deletion_now":
        return `Gone within ten minutes, for good.${m.reason ? ` ${words(m.reason, 80)}` : ""}`;
      case "deletion_stop":
        return `As if they’d tapped Keep my account.${m.reason ? ` ${words(m.reason, 80)}` : ""}`;
      case "deletion_start":
        return `They have 30 days to change their mind.${m.reason ? ` ${words(m.reason, 80)}` : ""}`;
      case "house_delete":
        return `${DELETE_HOUSE_COPY.gone(m.people, m.tell)}${m.reason ? ` ${words(m.reason, 80)}` : ""}`;
    }
  },
  apply: (n: number) => (n === 0 ? "Pick at least one" : n === 1 ? "Do 1 thing" : `Do ${n} things`),
  applying: "Doing it…",
  done: (n: number) => (n === 1 ? "Done." : `All ${n} done.`),
} as const;

/** Deleting a whole house (houses:write): the Houses page's sheet, the card's lines, and what its people are told. */
export const DELETE_HOUSE_COPY = {
  button: "Delete house",
  title: (name: string) => `Delete ${name}?`,
  body: "Its Johns, weeks, Wall, history and Stake go for good. Everyone in it keeps their account, in no house. A House Pass it pays for stops renewing; any refund is yours to give in Stripe.",
  reason: "Why (for the audit log)",
  tell: "Tell everyone in it, by push and email",
  confirm: "Type the house’s name to delete it",
  delete: "Delete for good",
  deleting: "Deleting…",
  gone: (people: number, tell: boolean) =>
    `Gone for good, with everything in it. ${people === 1 ? "The 1 person" : `The ${people} people`} in it keep their accounts${tell ? " and are told" : ""}; any House Pass stops renewing.`,
  done: (name: string) => `${name} is deleted.`,
  passNotStopped: "Its House Pass couldn’t be stopped in Stripe: stop it there so it doesn’t renew.",
  /** What everyone in it gets, by push and email. */
  subject: (name: string) => `${name} has been closed`,
  message: (name: string) =>
    `We've closed ${name} on Jonz, so its Johns and history are gone. Your account is still here: start a new house or join one any time. Questions? Reply to this email.`,
} as const;

/** POST /api/admin/houses/[id]/delete: why, and whether to tell everyone in it. */
export const DeleteHouseRequest = z.object({
  reason: Reason.default(""),
  tell: z.boolean(),
});
export type DeleteHouseRequest = z.infer<typeof DeleteHouseRequest>;

/** What deleting it did: how many lived there, how many were told, and whether its Pass was stopped (null: it had none). */
export const DeleteHouseResponse = z.object({
  ok: z.literal(true),
  name: z.string(),
  people: z.number(),
  told: z.number(),
  passStopped: z.boolean().nullable(),
});
export type DeleteHouseResponse = z.infer<typeof DeleteHouseResponse>;
