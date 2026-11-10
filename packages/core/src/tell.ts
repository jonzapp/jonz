import type { Currency } from "./domain";
import { formatMoney } from "./money";
import type { PushKind } from "./notify";
import { REDO_HOURS } from "./dispute";

/**
 * Telling people what happened to their Johns and their house, once each
 * (beta review S3 and S4, docs/specs/tell-people.md). The clock reads the
 * Wall posts nobody has been told about yet (events.told_at) and pushes each
 * to whoever it's about: the owner of a covered John, whoever a swap token
 * was used on, whoever's tick a question decided, and, for a rule change,
 * everyone but whoever made it. Pure: apps/api/lib/engine/tell.ts reads and
 * sends.
 */

/** The posts the clock tells someone about. */
export const TOLD_KINDS = ["covered", "swap_used", "upheld", "rejected", "rules"] as const;

/** One push to send: who to, and what it says. */
export interface Telling {
  to: string[];
  title: string;
  body: string;
  url: string;
  kind: PushKind;
  tag?: string;
}

export const TELL_COPY = {
  coveredTitle: (john: string) => `${john} was covered`,
  coveredBody: (who: string) => `${who} did it for you, so it isn’t missed. They get its points.`,
  swappedTitle: (took: string) => `${took} went in a swap`,
  swappedBody: (who: string, gave: string, took: string) => `${who} used a swap token: you have ${gave} now, and they have ${took}.`,
  struckTitle: (john: string) => `${john}: the house says not done`,
  struckBody: `Your tick was struck. You have ${REDO_HOURS} hours to do it again.`,
  stoodTitle: (john: string) => `${john}: your tick stands`,
  stoodBody: "The house checked it, and it counts.",
  rulesTitle: "The house rules changed",
  rulesBody: (who: string, changes: string) => `${who} changed ${changes}.`,
  /** Covering opens on your overdue John: the one chance to hold it off. */
  coverOpenTitle: (john: string) => `${john} is overdue`,
  coverOpenBody: "Others can cover it now and take its points. On it? Say so and covers wait 2 hours.",
} as const;

/** One rule's change in words: "the stake from £20 to £10". */
function ruleChange(rule: string, from: number, to: number, currency: Currency): string | null {
  const money = (n: number) => formatMoney(n, currency);
  const hours = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`;
  switch (rule) {
    case "stake_minor":
      return `the stake from ${money(from)} to ${money(to)} a month`;
    case "late_forfeit_minor":
      return `the late fine from ${money(from)} to ${money(to)}`;
    case "missed_forfeit_minor":
      return `the missed fine from ${money(from)} to ${money(to)}`;
    case "dispute_hours":
      return `the time to check a tick from ${hours(from)} to ${hours(to)}`;
    case "late_hours":
      return `the time to do a John late from ${hours(from)} to ${hours(to)}`;
    case "cover_grace_hours":
      return `the wait before covering from ${hours(from)} to ${hours(to)}`;
    default:
      return null;
  }
}

/** A rule post's changes as one phrase: "the stake from £20 to £10 a month and the late fine from £1 to £2". */
export function ruleChanges(data: Record<string, unknown>, currency: Currency): string {
  const changes = (data.changes ?? {}) as Record<string, [number, number]>;
  const said = Object.entries(changes)
    .map(([rule, [from, to]]) => ruleChange(rule, Number(from), Number(to), currency))
    .filter((s): s is string => Boolean(s));
  if (said.length <= 1) return said[0] ?? "the house rules";
  return `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`;
}

/**
 * The push for one post, or null when it tells nobody: who it's about, in
 * words. `nameOf` gives a first name; `members` is everyone in the house now.
 */
export function tellOf(
  e: { kind: string; userId: string | null; assignmentId: string | null; data: Record<string, unknown> },
  nameOf: (userId: string | null) => string,
  members: readonly string[],
  currency: Currency,
): Telling | null {
  const john = String(e.data.name ?? "a John");
  const here = (ids: (string | null | undefined)[]) =>
    ids.filter((id): id is string => typeof id === "string" && id !== e.userId && members.includes(id));
  const tag = e.assignmentId ? `john:${e.assignmentId}` : undefined;
  switch (e.kind) {
    case "covered": {
      const to = here(Array.isArray(e.data.for_all) ? (e.data.for_all as string[]) : [e.data.for as string]);
      return to.length
        ? { to, title: TELL_COPY.coveredTitle(john), body: TELL_COPY.coveredBody(nameOf(e.userId)), url: "/today", kind: "checks", tag }
        : null;
    }
    case "swap_used": {
      const to = here([e.data.with as string]);
      const gave = String(e.data.gave ?? "a John");
      const took = String(e.data.took ?? "a John");
      return to.length
        ? { to, title: TELL_COPY.swappedTitle(took), body: TELL_COPY.swappedBody(nameOf(e.userId), gave, took), url: "/today", kind: "deal", tag }
        : null;
    }
    case "upheld":
    case "rejected": {
      const to = here([e.data.against as string]);
      if (!to.length) return null;
      return e.kind === "upheld"
        ? { to, title: TELL_COPY.struckTitle(john), body: TELL_COPY.struckBody, url: "/today", kind: "checks", tag }
        : { to, title: TELL_COPY.stoodTitle(john), body: TELL_COPY.stoodBody, url: "/today", kind: "checks", tag };
    }
    case "rules": {
      const to = here([...members]);
      return to.length
        ? { to, title: TELL_COPY.rulesTitle, body: TELL_COPY.rulesBody(nameOf(e.userId), ruleChanges(e.data, currency)), url: "/house/rules", kind: "deal" }
        : null;
    }
    default:
      return null;
  }
}
