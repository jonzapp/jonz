/**
 * Fair shares: who gets which John this week.
 *
 * Pure and deterministic. The engine hands it the week's Johns (who shares
 * each one, and which of them are home on the day it is due), each
 * housemate's balance from every week so far, and their share of this week; it
 * hands back assignments. Same inputs, same deal, on any machine, which is
 * what lets a test pin it.
 *
 * What a share is (weekShares):
 *   - A John is split equally among the people who share it: the whole house,
 *     or the group it belongs to. Three on the upstairs bathroom owe a third
 *     each; two on the downstairs one owe half each.
 *   - Someone away on the day it is due is never handed it, but still owes
 *     their part, times the house's make-up rate (in full, half or none). The
 *     rest is split among the sharers who are home.
 *   - If nobody who shares it is home, it is skipped this week.
 *
 * A balance is the work someone did minus their share, over every week
 * they have lived there (carryOver). It never forgets a week: a balance that
 * dropped old weeks would drop a debt just as it was being paid back, and
 * the weeks spent catching up would then make the person look ahead. A John counts for whoever did it: done or late, for its
 * holder; covered, for whoever covered it. A John skipped with immunity or
 * excused counts as neither owed nor done: it comes out of the week, so
 * everyone's share of that week shrinks by its part, and nobody is credited
 * with it (keptOfWeek). A missed John
 * counts for nobody, so it comes back to whoever missed it in the next
 * deals, and covering for someone means you're dealt less later. Away is not
 * a holiday from your share: it shows up as a balance below zero, and the
 * weeks after hand you a little more until it evens out.
 *
 * Who gets what (fairShares), in order of what matters:
 *   1. Balances even out. Each John goes to whoever, of those home to do it,
 *      would be furthest behind: their balance, plus this week's Johns so far,
 *      minus their share of this week.
 *   2. Catching up is gradual. Nobody is handed more than half as much again
 *      as their share while someone else could take the John (CATCH_UP_PACE).
 *   3. Variety. Doing the same John as last time costs a small penalty, so
 *      the bathroom moves around when balances are close.
 *   4. Spread: ties go to whoever has fewer Johns this week. Then a seeded
 *      shuffle, so ties do not always fall the same way.
 */

export interface DealJohn {
  johnId: string;
  points: number;
  /** Who did this John the last time it was handed out. */
  lastUserId: string | null;
  /** For a John done together: everyone who had a place in it last time, each nudged on like `lastUserId`. */
  lastUserIds?: readonly string[];
  /** One place of a John done together (togetherPlaces): nobody is dealt two places in one job. */
  jobId?: string;
  /** Everyone who shares it: the house, or its group. */
  sharers: readonly string[];
  /** The sharers who are home on the day it is due. */
  home: readonly string[];
}

export interface DealMember {
  userId: string;
  /** Every week so far: the work they did minus their share. Below zero means behind. */
  balance: number;
  /** Their share of this week. */
  share: number;
}

export interface DealAssignment {
  johnId: string;
  userId: string;
}

/** The cost, in points, of giving someone the same John twice running. */
export const REPEAT_PENALTY = 1.5;

/** The most extra one week hands someone catching up, as a fraction of their share. */
export const CATCH_UP_PACE = 0.5;

/** How many recent weeks a usual week's share is the average of (recentBalances). */
export const USUAL_WEEKS = 12;

/** What time away still owes, by the house's setting (houses.away_makeup). */
export const MAKEUP_LABEL: Record<number, string> = {
  100: "In full",
  50: "Half",
  0: "Not at all",
};

/** A small, stable string hash (FNV-1a), for tie-breaking only. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Whether anyone who shares a John is home to do it. A John nobody can do is skipped. */
export function canDeal(john: Pick<DealJohn, "sharers" | "home">): boolean {
  return john.home.some((id) => john.sharers.includes(id));
}

/**
 * Each housemate's share of a week. `makeup` is how much of their part an
 * away sharer still owes: 1 in full, 0.5 half, 0 none.
 */
export function weekShares(
  johns: readonly DealJohn[],
  memberIds: readonly string[],
  makeup: number,
): Map<string, number> {
  const share = new Map(memberIds.map((id) => [id, 0]));
  for (const john of johns) {
    const sharers = john.sharers.filter((id) => share.has(id));
    const home = john.home.filter((id) => sharers.includes(id));
    if (home.length === 0) continue;
    const part = john.points / sharers.length;
    const away = sharers.filter((id) => !home.includes(id));
    const owedAway = part * makeup;
    for (const id of away) share.set(id, share.get(id)! + owedAway);
    const homePart = (john.points - owedAway * away.length) / home.length;
    for (const id of home) share.set(id, share.get(id)! + homePart);
  }
  return share;
}

/**
 * Why a John went where it did, as the deal weighed it: kept with the
 * assignment (assignments.dealt), so its sheet can say why without replaying
 * the deal. A type, not an interface, so it goes into the deal's JSON as it is.
 */
export type DealWhy = {
  /** Who it was dealt to. */
  to: string;
  /**
   * What decided it. Fair shares (before Steady weeks): the only sharer home
   * that day; furthest behind; level with someone, but with fewer Johns this
   * week; or level in every way, so the seeded shuffle. Steady weeks
   * (steady.ts SteadyBy): a miss coming back, their one John this week, the
   * most budget left, furthest behind (no limit), Classic's turn, or next in
   * line.
   */
  by: "only" | "behind" | "fewer" | "draw" | "back" | "oneEach" | "mostRoom" | "turn" | "nextInLine";
  /**
   * Each sharer home that day, as the deal weighed them, furthest behind
   * first: their balance plus this week's Johns dealt before this one, minus
   * their share of this week (to a tenth of a point); in Steady weeks with a
   * budget, against the house's average balance. `last` did it last time;
   * `full` had already been handed as much extra as a week catches up;
   * `room` is budget left before this John; `place` is Classic's place in line.
   */
  weighed: { userId: string; standing: number; last?: true; full?: true; room?: number; place?: number }[];
  /** The sharers away the day it's due. */
  away: string[];
  /** Steady weeks: the mode and budget it was dealt under (0 for no limit). */
  mode?: "smart" | "classic";
  budget?: number;
  /** Weeks it waited before this. */
  waited?: number;
  /** It went a little over their budget, having waited a week. */
  stretched?: true;
  /** It went back to whoever did it last time, having waited two weeks. */
  again?: true;
  /** It's on another day than its own, and why. */
  moved?: "taken" | "suits" | "away" | "gone";
};

export function fairShares(
  johns: readonly DealJohn[],
  members: readonly DealMember[],
  seed: string,
): DealAssignment[] {
  return fairSharesExplained(johns, members, seed).map(({ johnId, userId }) => ({ johnId, userId }));
}

/** The deal (fairShares), with why each John went where it did. */
export function fairSharesExplained(
  johns: readonly DealJohn[],
  members: readonly DealMember[],
  seed: string,
): (DealAssignment & { why: DealWhy })[] {
  const byId = new Map(members.map((m) => [m.userId, m]));
  const state = new Map(members.map((m) => [m.userId, { assigned: 0, count: 0 }]));

  const ordered = [...johns].sort((a, b) => b.points - a.points || a.johnId.localeCompare(b.johnId));
  const jobOf = new Map(johns.flatMap((j) => (j.jobId ? [[j.johnId, j.jobId] as const] : [])));

  const out: (DealAssignment & { why: DealWhy })[] = [];
  for (const john of ordered) {
    const placed = john.jobId ? out.filter((o) => jobOf.get(o.johnId) === john.jobId).map((o) => o.userId) : [];
    const candidates = john.home.filter((id) => byId.has(id) && john.sharers.includes(id) && !placed.includes(id));
    if (candidates.length === 0) continue;
    const last = john.lastUserIds ?? (john.lastUserId ? [john.lastUserId] : []);
    // Shares are sums of fractions (a third of a point, six times over), so
    // the cap allows for rounding rather than refuse a John by 1e-15.
    const roomy = candidates.filter(
      (id) => state.get(id)!.assigned + john.points <= byId.get(id)!.share * (1 + CATCH_UP_PACE) + 1e-9,
    );
    const pool = roomy.length > 0 ? roomy : candidates;

    const keyed = pool
      .map((id) => {
        const m = byId.get(id)!;
        const s = state.get(id)!;
        const behind = m.balance + s.assigned - m.share + (last.includes(id) ? REPEAT_PENALTY : 0);
        const key: [number, number, number] = [behind, s.count, stableHash(`${seed}:${john.johnId}:${id}`)];
        return { userId: id, key };
      })
      .sort((a, b) => (lessThan(a.key, b.key) ? -1 : lessThan(b.key, a.key) ? 1 : 0));
    const best = keyed[0];
    const next = keyed[1];
    const by: DealWhy["by"] =
      candidates.length === 1 ? "only" : !next || best.key[0] < next.key[0] ? "behind" : best.key[1] < next.key[1] ? "fewer" : "draw";

    const weighed = candidates
      .map((id) => {
        const m = byId.get(id)!;
        const standing = Math.round((m.balance + state.get(id)!.assigned - m.share) * 10) / 10;
        return {
          userId: id,
          standing,
          ...(last.includes(id) ? { last: true as const } : {}),
          ...(pool.includes(id) ? {} : { full: true as const }),
        };
      })
      .sort((a, b) => a.standing - b.standing || a.userId.localeCompare(b.userId));
    const away = john.sharers.filter((id) => byId.has(id) && !john.home.includes(id));

    const chosen = state.get(best.userId)!;
    chosen.assigned += john.points;
    chosen.count += 1;
    out.push({ johnId: john.johnId, userId: best.userId, why: { to: best.userId, by, weighed, away } });
  }
  return out;
}

/**
 * A John done together as the deal hands it out: one place per person, each
 * worth its points, `crew` of them (0: one for each sharer home), never more
 * than are home. Each place's johnId is the John's with its number
 * ("<id>#2"), and they share `jobId`. A John done by one is itself.
 */
export function togetherPlaces(john: DealJohn, crew: number, jobId: string): DealJohn[] {
  if (crew === 1) return [john];
  const home = john.home.filter((id) => john.sharers.includes(id)).length;
  const n = crew === 0 ? home : Math.min(crew, home);
  return Array.from({ length: n }, (_, i) => ({ ...john, johnId: `${john.johnId}#${i + 1}`, jobId }));
}

function lessThan(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

export interface PastJohn {
  /** Whose John it was. */
  userId: string;
  points: number;
  /** How it ended; null (or absent) while it can still change. */
  outcome?: string | null;
  /** Who covered it, if a housemate did. */
  coveredBy?: string | null;
  /** Skipped with immunity, or excused (time away with nobody home). */
  excused?: boolean;
}

export interface PastWeek {
  /** Each housemate's share of the week, as stored when it was dealt. */
  shares: readonly { userId: string; share: number }[];
  assignments: readonly PastJohn[];
}

/** A John taken out of its week: skipped or excused, and not covered. */
export function excusedJohn(a: Pick<PastJohn, "outcome" | "coveredBy" | "excused">): boolean {
  return !a.coveredBy && (a.excused === true || a.outcome === "excused");
}

/**
 * Who a past John counts for: whoever covered it, nobody if it was missed or
 * excused, otherwise its holder (done, late, or not settled yet, which counts
 * as theirs until it is).
 */
export function creditedTo(a: PastJohn): string | null {
  if (a.coveredBy) return a.coveredBy;
  if (a.outcome === "missed" || excusedJohn(a)) return null;
  return a.userId;
}

/**
 * What's left of each share of a week once its excused Johns come out of it:
 * every share is multiplied by this (house_balances does the same). 1 when
 * nothing was excused.
 */
export function keptOfWeek(totalShares: number, excusedPoints: number): number {
  return totalShares > 0 ? Math.max(0, 1 - excusedPoints / totalShares) : 1;
}

/**
 * Each current housemate's balance: the work they did in the weeks given
 * (creditedTo) minus their share of those weeks, less any excused Johns'
 * part (keptOfWeek). Someone who joins part-way
 * starts at zero, since they had no share of the weeks before them.
 */
export function carryOver(weeks: readonly PastWeek[], currentMemberIds: readonly string[]): Map<string, number> {
  const balance = new Map(currentMemberIds.map((id) => [id, 0]));
  for (const week of weeks) {
    const kept = keptOfWeek(
      week.shares.reduce((sum, s) => sum + s.share, 0),
      week.assignments.filter(excusedJohn).reduce((sum, a) => sum + a.points, 0),
    );
    for (const s of week.shares) {
      if (balance.has(s.userId)) balance.set(s.userId, balance.get(s.userId)! - s.share * kept);
    }
    for (const a of week.assignments) {
      const who = creditedTo(a);
      if (who && balance.has(who)) balance.set(who, balance.get(who)! + a.points);
    }
  }
  return balance;
}

/**
 * The past as read: everything each person ever owed and did, summed by the
 * database over every week before this one (house_balances, counted as
 * creditedTo counts), and the shares of the last USUAL_WEEKS weeks.
 */
export interface PastRows {
  totals: readonly { user_id: string; owed: number | string; credited: number | string }[];
  recentShares: readonly { user_id: string; share: number | string }[];
}

/**
 * Each current housemate's balance over every week so far (what carryOver
 * gives for all of them), and their usual week's share: the average of the
 * recent weeks they had one, for saying how long catching up takes.
 */
export function recentBalances(
  rows: PastRows,
  memberIds: readonly string[],
): { balances: Map<string, number>; usualShare: Map<string, number> } {
  const balances = new Map(memberIds.map((id) => [id, 0]));
  for (const t of rows.totals) {
    if (balances.has(t.user_id)) balances.set(t.user_id, Number(t.credited) - Number(t.owed));
  }
  const usualShare = new Map<string, number>();
  for (const id of memberIds) {
    const theirs = rows.recentShares.filter((s) => s.user_id === id && Number(s.share) > 0).map((s) => Number(s.share));
    usualShare.set(id, theirs.length ? theirs.reduce((a, b) => a + b, 0) / theirs.length : 0);
  }
  return { balances, usualShare };
}

export interface BalanceRow {
  userId: string;
  /** Work done minus share over every week so far, going into this week. Below zero is behind. */
  balance: number;
  /** About how many weeks of catching up are left at the catch-up pace. */
  weeksToEven: number;
}

/** Everyone's balance against their share, furthest behind first. */
export function balanceRows(
  balances: ReadonlyMap<string, number>,
  usualShare: ReadonlyMap<string, number>,
  memberIds: readonly string[],
): BalanceRow[] {
  return memberIds
    .map((id) => {
      const balance = balances.get(id) ?? 0;
      return { userId: id, balance, weeksToEven: catchUpWeeks(balance, usualShare.get(id) ?? 0) };
    })
    .sort((a, b) => a.balance - b.balance);
}

/**
 * Roughly how many weeks someone behind will take to even out at the
 * catch-up pace, given what a usual week's share is for them. Zero when they
 * are level or ahead.
 */
export function catchUpWeeks(balance: number, usualShare: number): number {
  if (balance > -0.5 || usualShare <= 0) return 0;
  return Math.ceil(-balance / (usualShare * CATCH_UP_PACE));
}
