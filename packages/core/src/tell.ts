import { APP_NAME } from "./app";
import type { Currency } from "./domain";
import { formatMoney } from "./money";
import type { PushKind } from "./notify";
import { REDO_HOURS } from "./dispute";
import type { Words } from "./words-for";

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
export const TOLD_KINDS = ["covered", "swap_used", "upheld", "rejected", "rules", "started_over"] as const;

/** One push to send: who to, and what it says. */
export interface Telling {
  to: string[];
  title: string;
  body: string;
  url: string;
  kind: PushKind;
  tag?: string;
}

const RULE_IDS = {
  stake_minor: "wall.tell.rule.stake",
  late_forfeit_minor: "wall.tell.rule.lateFine",
  missed_forfeit_minor: "wall.tell.rule.missedFine",
  dispute_hours: "wall.tell.rule.checkHours",
  late_hours: "wall.tell.rule.lateHours",
  cover_grace_hours: "wall.tell.rule.coverWait",
} as const;
const MONEY_RULES: readonly string[] = ["stake_minor", "late_forfeit_minor", "missed_forfeit_minor"];

/** A rule post's changes as one phrase: "the stake from £20 to £10 a month and the late forfeit from £1 to £2". */
export function ruleChanges(data: Record<string, unknown>, currency: Currency, words: Words): string {
  const changes = (data.changes ?? {}) as Record<string, [number, number]>;
  const said = Object.entries(changes).flatMap(([rule, [from, to]]) => {
    if (!(rule in RULE_IDS)) return [];
    const say = (n: number) => (MONEY_RULES.includes(rule) ? formatMoney(n, currency, words) : Number(n));
    return [words(RULE_IDS[rule as keyof typeof RULE_IDS], { from: say(Number(from)), to: say(Number(to)) })];
  });
  if (said.length <= 1) return said[0] ?? words("wall.tell.rule.none");
  return words("wall.feed.namesAnd", { first: said.slice(0, -1).join(", "), last: said[said.length - 1] });
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
  words: Words,
): Telling | null {
  const john = String(e.data.name ?? words("wall.feed.aJohn"));
  const here = (ids: (string | null | undefined)[]) =>
    ids.filter((id): id is string => typeof id === "string" && id !== e.userId && members.includes(id));
  const tag = e.assignmentId ? `john:${e.assignmentId}` : undefined;
  switch (e.kind) {
    case "covered": {
      const to = here(Array.isArray(e.data.for_all) ? (e.data.for_all as string[]) : [e.data.for as string]);
      return to.length
        ? { to, title: words('wall.tell.coveredTitle', { john }), body: words('wall.tell.coveredBody', { who: nameOf(e.userId) }), url: "/today", kind: "checks", tag }
        : null;
    }
    case "swap_used": {
      const to = here([e.data.with as string]);
      const gave = String(e.data.gave ?? words("wall.feed.aJohn"));
      const took = String(e.data.took ?? words("wall.feed.aJohn"));
      return to.length
        ? { to, title: words('wall.tell.swappedTitle', { took }), body: words('wall.tell.swappedBody', { who: nameOf(e.userId), gave, took }), url: "/today", kind: "deal", tag }
        : null;
    }
    case "upheld":
    case "rejected": {
      const to = here([e.data.against as string]);
      if (!to.length) return null;
      return e.kind === "upheld"
        ? { to, title: words('wall.tell.struckTitle', { john }), body: words("wall.tell.struckBody", { hours: REDO_HOURS }), url: "/today", kind: "checks", tag }
        : { to, title: words('wall.tell.stoodTitle', { john }), body: words('wall.tell.stoodBody'), url: "/today", kind: "checks", tag };
    }
    case "rules": {
      const to = here([...members]);
      return to.length
        ? { to, title: words('wall.tell.rulesTitle'), body: words('wall.tell.rulesBody', { who: nameOf(e.userId), changes: ruleChanges(e.data, currency, words) }), url: "/house/rules", kind: "deal" }
        : null;
    }
    case "started_over": {
      const to = here([...members]);
      const everything = e.data.everything === true;
      return to.length
        ? { to, title: words('wall.tell.resetTitle', { everything }), body: words('wall.tell.resetBody', { who: e.userId ? nameOf(e.userId) : APP_NAME, everything }), url: "/today", kind: "deal" }
        : null;
    }
    default:
      return null;
  }
}
