import { z } from "zod";

import { MESSAGE_LIMITS } from "./owner-messages";
import { NOTICE_KINDS } from "./notices";
import { PromotionRequest } from "./promotions";
import { REPORT_LIMITS } from "./reports";
import type { Words } from "./words-for";

// Who can do what on the owner's admin pages, and how the owner's Ask Jonz
// does each of it: the same shape as a house's (permissions.ts and
// ask-coverage.ts). The database holds the same list (permissions with
// scope app, and app_role_permissions) and every admin function asks
// can_app(permission): an app role in app_owners, with their code this session. This
// list says which moves there are, which role has each, and how Jonz handles
// each one (owner-ask-operations.ts, from the registry), so a move added to
// the admin pages without a way through Jonz doesn't compile.

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
  "houses:write": "Reset or delete a whole house: everyone in it is told, and it can't be undone",
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

/** How the owner's Ask Jonz handles a permission (OWNER_ASK_COVERAGE, owner-ask-operations.ts): it reads it, or puts it on a card with these tools. */
export type OwnerAskCoverage = { by: "reads" } | { by: "card"; tools: readonly string[] };

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
  z.object({ kind: z.literal("house_reset"), houseId: z.uuid(), name: Label, people: z.number().int().min(0), everything: z.boolean(), reason: Reason }),
]);
export type OwnerMove = z.infer<typeof OwnerMove>;
export type OwnerMoveKind = OwnerMove["kind"];

/** The most moves one answer puts on the owner's card. */
export const OWNER_MOVES_MAX = 6;

/** Moves that can’t be taken back: the card says so under each. */
export const OWNER_MOVES_FINAL: readonly OwnerMoveKind[] = ["deletion_now", "message_send", "promotion_email", "report_reply", "promotion_stop", "house_delete", "house_reset"];

const ways = (m: { push: boolean; wall: boolean; email: boolean }) =>
  [m.push && "push", m.wall && "the Wall", m.email && "email"].filter(Boolean).join(", ");
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** owner_delete_house on /v1: why, and whether to tell everyone in it. */
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

/** A move's title on the To do card. */
export function ownerMoveTitle(m: OwnerMove, words: Words): string {
  switch (m.kind) {
    case "report_reply":
    case "report_open":
    case "deletion_now":
    case "deletion_stop":
      return words(`admin.moves.title.${m.kind}`, { who: m.who });
    case "report_fixed":
      return words("admin.moves.title.report_fixed", { who: m.who, tell: m.tell });
    case "report_same_as":
      return words("admin.moves.title.report_same_as", { who: m.who, fold: Boolean(m.main), main: m.main ?? "" });
    case "notice_save":
      return words("admin.moves.title.notice_save", { change: Boolean(m.id), title: m.title });
    case "notice_end":
      return words("admin.moves.title.notice_end", { title: m.title });
    case "message_send":
      return words("admin.moves.title.message_send", { subject: m.subject, to: m.to });
    case "promotion_make":
      return words("admin.moves.title.promotion_make", { code: m.promotion.code });
    case "promotion_stop":
    case "promotion_email":
    case "promotion_retry":
      return words(`admin.moves.title.${m.kind}`, { code: m.code });
    case "deletion_start":
      return words("admin.moves.title.deletion_start", { email: m.email });
    case "house_delete":
      return words("admin.moves.title.house_delete", { name: m.name });
    case "house_reset":
      return words("admin.moves.title.house_reset", { name: m.name, everything: m.everything });
  }
}

/** The line under a move's title: what doing it means, and the owner's own words, clipped. */
export function ownerMoveMeta(m: OwnerMove, words: Words): string {
  const why = (reason: string | null | undefined) => (reason ? ` ${clip(reason, 80)}` : "");
  switch (m.kind) {
    case "report_reply":
      return clip(m.body);
    case "report_fixed":
      return m.note ? clip(m.note) : words("admin.moves.meta.report_fixed", { tell: m.tell });
    case "report_same_as":
      return words("admin.moves.meta.report_same_as", { fold: Boolean(m.main) });
    case "notice_save":
      return clip([words(`common.notice.kinds.${m.notice}`), m.body].filter(Boolean).join(": "));
    case "message_send":
      return words("admin.moves.meta.message_send", { ways: ways(m), body: clip(m.body, 100) });
    case "promotion_make":
      return clip([m.promotion.name, words("admin.moves.meta.promotion_for", { named: m.promotion.audience === "named", people: m.promotion.people.length })].join(", "));
    case "report_open":
    case "notice_end":
    case "promotion_stop":
    case "promotion_email":
    case "promotion_retry":
      return words(`admin.moves.meta.${m.kind}`);
    case "deletion_now":
    case "deletion_stop":
    case "deletion_start":
      return `${words(`admin.moves.meta.${m.kind}`)}${why(m.reason)}`;
    case "house_delete":
      return `${words("admin.deleteHouse.gone", { people: m.people, tell: m.tell })}${why(m.reason)}`;
    case "house_reset":
      return `${words("admin.reset.gone", { people: m.people, everything: m.everything })}${why(m.reason)}`;
  }
}
