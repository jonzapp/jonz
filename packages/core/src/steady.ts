/**
 * Steady weeks: the deal with a points budget, in Smart or Classic mode.
 *
 * Pure and deterministic, one week at a time. The engine (apps/api
 * lib/engine/deal-week.ts) hands it every John on the list, who shares each one
 * and who can do it this week, each housemate's balance, preferences and the
 * days they're home, Classic's orders of turns from last week and which Johns
 * are waiting; it hands back who gets what, on which day, which Johns wait,
 * and the orders of turns for next week. Same inputs, same week, on any
 * machine. steady-run.ts runs it week after week for the tests and for the
 * budget sheet's "how often each John comes round".
 *
 * The rules (docs/specs/steady-weeks.md has them with the reasons):
 *
 * Shared by both modes:
 *   - Order. Missed Johns coming back go first, then Johns that keep their day
 *     or are done together, then Johns that have waited FRONT_WEEKS (longest
 *     first), then the rest by how late they are for their own schedule:
 *     weeks since their last turn ÷ how often they come round. With no limit
 *     everything due goes out, so the rest go biggest first, as fairShares
 *     always has.
 *   - The budget. Everyone home is owed one John of their own, even one
 *     bigger than their budget. After that a John goes to someone only if it
 *     fits. Johns that keep their day, and Johns done together, always go out
 *     and count toward the budget, but don't use up anyone's one John; a
 *     missed John coming back does.
 *   - Waiting. A John that doesn't fit waits for next week. It merges with
 *     its next turn, so it never doubles up, and it's never skipped.
 *   - Days. A John that keeps its day stays on it, on call is all week, and
 *     the rest go to the nearest free day that suits the person, then the
 *     nearest free day, and only then a day that already has one.
 *
 * Smart:
 *   - A target each: the budget, plus up to half again for someone behind
 *     the house's average balance, or minus up to half for someone ahead.
 *     More than a week's budget ahead is a week off.
 *   - Pools. A group's Johns are balanced within the group, and the whole
 *     house's Johns across everyone: who gets a John goes by how far behind
 *     they are in its own pool, so a group's Johns never move anyone's share
 *     of the rest (members' `pools`). The target is still the whole load.
 *   - One each first. The most overdue Johns go out, one for each person
 *     still owed one; whoever is furthest behind chooses first and takes the
 *     biggest ("rather do" counts a point bigger, "rather not" a point
 *     smaller). A group's John that nobody still to choose could do goes to
 *     the one choosing.
 *   - Never twice running, unless they'd rather do it, they're half the
 *     budget or more behind, or it has waited two weeks.
 *   - The rest, most overdue first, to whoever has the most target left and
 *     room for it. After a week waiting a John may go half the budget over
 *     someone's target; after two, back to whoever did it last time.
 *   - With no limit, today's deal (deal.ts fairSharesExplained): furthest
 *     behind, 1.5 against doing it last time, nobody past half as much again
 *     as their share while someone else could take it, except that
 *     someone's first John always gets past that cap.
 *
 * Classic:
 *   - Each John has its own order of turns, planned when the house picks
 *     Classic (or the John is added) so each week's points split evenly.
 *     Someone new joins the back of every order they share.
 *   - The John goes to the next person in its order who is home, even if it
 *     takes them up to half the budget over. Away, or fuller than that, the
 *     next person in line with room does it, and they stay first.
 */
import { stableHash, weekShares } from "./deal";
import { placeDays } from "./steady-days";
import { planTurns } from "./steady-turns";
import { FRONT_WEEKS, pinnedOf, togetherOf, type SteadyBy, type SteadyInput, type SteadyJohn, type SteadyMember, type SteadyPlace, type SteadyResult, type SteadyWeighed, type SteadyWhy } from "./steady-types";

/** Today's deal, with no limit: the cost of doing the same John twice running, and the catch-up cap. */
const REPEAT_COST = 1.5;
const CATCH_UP = 1.5;
const EPS = 1e-9;

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Row {
  pid: string;
  room: number;
  fits: boolean;
  lastTime: boolean;
  pref: number;
  score: number;
  standing: number;
  roomy: boolean;
}

/** One week's deal. */
export function steadyWeek(input: SteadyInput): SteadyResult {
  const { mode, makeup, seed } = input;
  const B = input.budget;
  const members = input.members;
  const ids = members.map((m) => m.userId);
  const byId = new Map(members.map((m) => [m.userId, m]));
  const homeSet = new Set(members.filter((m) => m.homeDays.length > 0).map((m) => m.userId));
  const active = input.johns;

  // Classic's orders of turns: kept from last week, leavers taken off, new Johns planned, newcomers at the back.
  let order: Record<string, string[]> | null = null;
  if (mode === "classic") {
    order = {};
    if (input.turns) {
      for (const j of active) {
        const q = input.turns[j.johnId];
        if (q) order[j.johnId] = q.filter((id) => ids.includes(id));
      }
    }
    if (active.some((j) => !order![j.johnId])) planTurns(active, ids, order);
    for (const j of active) for (const id of ids) if (j.sharers.includes(id) && !order[j.johnId].includes(id)) order[j.johnId].push(id);
  }

  // Behind or ahead is against the house's average balance.
  const rel = new Map<string, number>();
  const target = new Map<string, number>();
  const dealt = new Map<string, number>();
  const count = new Map<string, number>();
  const own = new Map<string, number>();
  const pinnedDays = new Map<string, Set<number>>();
  // Each pool is balanced on its own: a group's Johns among the group, the rest among everyone. Someone's standing
  // in a pool is their balance there against the average of everyone in it, and it decides who gets that pool's
  // Johns; behind or ahead overall still sets how much they're handed in all (their target, a week off).
  const usePools = members.some((m) => m.pools);
  const poolsOf = (m: SteadyMember): Readonly<Record<string, number>> => m.pools ?? { "": m.balance };
  const poolAvg = new Map<string, number>();
  {
    const sum = new Map<string, [number, number]>();
    for (const m of members)
      for (const [k, v] of Object.entries(poolsOf(m))) {
        const [a, n] = sum.get(k) ?? [0, 0];
        sum.set(k, [a + v, n + 1]);
      }
    for (const [k, [a, n]] of sum) poolAvg.set(k, a / n);
  }
  const poolRel = (pid: string, pool: string) => {
    const v = poolsOf(byId.get(pid)!)[pool];
    return v === undefined ? 0 : v - poolAvg.get(pool)!;
  };
  const poolKey = (j: SteadyJohn) => (usePools ? (j.pool ?? "") : "");
  const avg = members.length ? members.reduce((s, m) => s + m.balance, 0) / members.length : 0;
  for (const m of members) {
    const r = m.balance - avg;
    rel.set(m.userId, r);
    const nudge = mode === "smart" && B ? Math.max(-B / 2, Math.min(B / 2, -r)) : 0;
    target.set(m.userId, B ? B + nudge : Infinity);
    dealt.set(m.userId, 0);
    count.set(m.userId, 0);
    own.set(m.userId, 0);
    pinnedDays.set(m.userId, new Set());
  }

  const due = active.filter((j) => j.due || j.waited > 0 || j.back);
  const late = (j: SteadyJohn) => j.since / j.period;
  const front = (j: SteadyJohn) => (j.waited >= FRONT_WEEKS ? 1e3 + j.waited : 0);
  const rank = (j: SteadyJohn) =>
    (j.back ? 3e3 : pinnedOf(j) ? 2e3 : front(j)) + (B || mode === "classic" ? late(j) : j.points * 10 + late(j) / 100);
  const rk = new Map(due.map((j) => [j, rank(j)]));
  const ordered = [...due].sort(
    (a, b) => rk.get(b)! - rk.get(a)! || b.points - a.points || (a.johnId < b.johnId ? -1 : 1),
  );
  const homeOf = (j: SteadyJohn) => j.home.filter((id) => homeSet.has(id) && byId.has(id));
  const placesOf = (j: SteadyJohn, n: number) => (togetherOf(j) ? (j.crew === 0 ? n : Math.min(j.crew, n)) : 1);

  // With no limit, Smart weighs each person against their share of everything due (deal.ts).
  // Each pool's share is weighed on its own, so a group's Johns never move anyone's share of the rest.
  let shareEst: Map<string, number> | null = null;
  const poolShare = new Map<string, Map<string, number>>();
  const poolDealt = new Map<string, number>();
  if (mode === "smart" && !B) {
    const items = due.flatMap((j) =>
      Array.from({ length: placesOf(j, homeOf(j).length) }, () => ({ points: j.points, sharers: j.sharers, home: homeOf(j), pool: poolKey(j) })),
    );
    const sharesOf = (xs: typeof items) => weekShares(xs.map((x) => ({ johnId: "", lastUserId: null, ...x })), ids, makeup);
    shareEst = sharesOf(items);
    for (const P of new Set(items.map((x) => x.pool))) poolShare.set(P, sharesOf(items.filter((x) => x.pool === P)));
  }

  /**
   * With a budget, how much less room someone has for a John in its own pool than overall: their target is
   * nudged by how far behind or ahead they are in that pool, not overall. 0 with one pool.
   */
  const nudgeFor = (r: number) => Math.max(-B / 2, Math.min(B / 2, -r));
  const lead = (j: SteadyJohn, pid: string) => (usePools && B ? nudgeFor(rel.get(pid)!) - nudgeFor(poolRel(pid, poolKey(j))) : 0);

  const weekOff = (id: string) => mode === "smart" && B > 0 && rel.get(id)! > B + EPS;
  const owed = (id: string) => own.get(id)! === 0 && !weekOff(id);
  const places: SteadyPlace[] = [];
  const nextWaited: Record<string, number> = {};
  const decided = new Set<SteadyJohn>();
  const tie = (j: SteadyJohn, a: string, b: string) => stableHash(`${seed}:${j.johnId}:${a}`) - stableHash(`${seed}:${j.johnId}:${b}`);
  const awayOf = (j: SteadyJohn) => j.sharers.filter((id) => byId.has(id) && !homeSet.has(id));
  const placeNo = new Map<SteadyJohn, number>();

  const weigh = (j: SteadyJohn, pid: string): Row => {
    const room = target.get(pid)! - dealt.get(pid)!;
    const lastTime = j.lastBy.includes(pid);
    const pref = byId.get(pid)!.rather[j.johnId] ?? 0;
    const r: Row = { pid, room, fits: owed(pid) || j.points <= room + EPS, lastTime, pref, score: 0, standing: 0, roomy: true };
    if (B) {
      const ahead = lead(j, pid);
      r.score = -room - pref + ahead + (j.keepDay && pinnedDays.get(pid)!.has(j.day) ? 3 : 0);
      r.standing = usePools ? poolRel(pid, poolKey(j)) : rel.get(pid)!;
    } else {
      const P = poolKey(j);
      r.standing = (poolsOf(byId.get(pid)!)[P] ?? 0) + (poolDealt.get(`${P}|${pid}`) ?? 0) - (poolShare.get(P)?.get(pid) ?? 0);
      r.score = r.standing + (lastTime ? REPEAT_COST : 0) - pref;
      // Today's cap never stops someone's first John: with it, someone with a small share could be passed over every week.
      r.roomy = own.get(pid)! === 0 || dealt.get(pid)! + j.points <= (shareEst?.get(pid) ?? 0) * CATCH_UP + EPS;
    }
    return r;
  };
  const best = (j: SteadyJohn, pool: Row[]) =>
    pool.sort((a, b) => a.score - b.score || count.get(a.pid)! - count.get(b.pid)! || tie(j, a.pid, b.pid));
  /** Why Smart chose the first of `sorted` (best's order, before it's dealt): with a budget the most room, with no limit as today. */
  const smartBy = (cands: readonly string[], sorted: readonly Row[]): SteadyBy => {
    if (cands.length === 1) return "only";
    if (B) return "mostRoom";
    const [a, b] = sorted;
    if (!b || a.score < b.score - EPS) return "behind";
    return count.get(a.pid)! < count.get(b.pid)! ? "fewer" : "draw";
  };
  const weighed = (rows: readonly Row[]): SteadyWeighed[] =>
    rows
      .map((r) => ({
        userId: r.pid,
        standing: round1(r.standing),
        ...(B ? { room: round1(r.room) } : {}),
        ...(r.lastTime ? { last: true as const } : {}),
      }))
      .sort((a, b) => a.standing - b.standing || (a.userId < b.userId ? -1 : 1));

  const give = (pid: string, j: SteadyJohn, why: Omit<SteadyWhy, "to" | "mode" | "budget" | "away">, back = false) => {
    dealt.set(pid, dealt.get(pid)! + j.points);
    poolDealt.set(`${poolKey(j)}|${pid}`, (poolDealt.get(`${poolKey(j)}|${pid}`) ?? 0) + j.points);
    count.set(pid, count.get(pid)! + 1);
    if (pinnedOf(j)) pinnedDays.get(pid)!.add(j.day);
    else own.set(pid, own.get(pid)! + 1);
    const place = (placeNo.get(j) ?? 0) + 1;
    placeNo.set(j, place);
    places.push({
      johnId: j.johnId,
      userId: pid,
      day: 0,
      place,
      points: j.points,
      ...(back ? { back: true as const } : {}),
      why: {
        to: pid,
        mode,
        budget: B,
        away: awayOf(j),
        ...(j.waited ? { waited: j.waited } : {}),
        ...why,
      },
    });
  };
  const wait = (j: SteadyJohn) => {
    nextWaited[j.johnId] = j.waited + 1;
  };

  // 1. Johns that have to go out: a missed John coming back to whoever missed it, then Johns that keep their day
  //    or are done together. (On call can wait like any other: its flags then go to whoever at home has been
  //    handed least that week, as open_flag does when whoever is on call is away.)
  for (const j of ordered) {
    if (j.back) {
      const owner = j.back;
      if (homeSet.has(owner) && j.sharers.includes(owner) && j.home.includes(owner)) {
        decided.add(j);
        give(owner, j, { by: "back", weighed: [] }, true);
        continue;
      }
    }
    if (!pinnedOf(j)) continue;
    decided.add(j);
    const cands = homeOf(j);
    if (!cands.length) {
      wait(j);
      continue;
    }
    const n = placesOf(j, cands.length);
    if (mode === "classic") {
      const q = order![j.johnId];
      const pick = q.filter((id) => cands.includes(id)).slice(0, n);
      pick.forEach((id) => {
        q.splice(q.indexOf(id), 1);
        q.push(id);
      });
      const line = q.filter((id) => cands.includes(id));
      for (const id of pick) {
        give(id, j, {
          by: cands.length === 1 ? "only" : "turn",
          weighed: line.map((uid, k) => ({ userId: uid, standing: round1(rel.get(uid)!), place: k + 1 })),
        });
      }
    } else {
      const rows = cands.map((id) => weigh(j, id));
      // It goes out whatever happens, so whoever has the most target left (with a budget) or is furthest behind
      // (with no limit). Doing it last time costs 1.5, as today, unless they'd rather do it.
      if (B) rows.forEach((r) => (r.score += r.lastTime && !togetherOf(j) && r.pref <= 0 ? REPEAT_COST : 0));
      let pool = rows.filter((r) => B || togetherOf(j) || r.roomy);
      if (!pool.length) pool = rows;
      const sorted = best(j, pool);
      const by = smartBy(cands, sorted);
      const pick = sorted.slice(0, n).map((r) => r.pid);
      const w = weighed(rows);
      for (const id of pick) give(id, j, { by, weighed: w });
    }
  }

  // 2. Smart with a budget: everyone home gets one John of their own before anyone gets a second.
  if (mode === "smart" && B) {
    const roomNow = (id: string) => target.get(id)! - dealt.get(id)!;
    const needers = ids
      .filter((id) => homeSet.has(id) && owed(id))
      .sort((a, b) => rel.get(a)! - rel.get(b)! || roomNow(b) - roomNow(a) || (a < b ? -1 : 1));
    const pool = ordered.filter((j) => !decided.has(j) && homeOf(j).some((id) => needers.includes(id))).slice(0, needers.length);
    // Doing it last time only counts against someone if someone else home could do it, not if they'd rather do it,
    // not for someone half the budget or more behind, and not once it has waited two weeks.
    const lastBy = (j: SteadyJohn, id: string) =>
      j.lastBy.includes(id) &&
      !((byId.get(id)!.rather[j.johnId] ?? 0) > 0) &&
      homeOf(j).length > 1 &&
      rel.get(id)! > -B / 2 + EPS &&
      j.waited < 2;
    const can = (j: SteadyJohn, id: string) => homeOf(j).includes(id) && !lastBy(j, id);
    // A John in a pool they're behind in counts as bigger for them, one they're ahead in as smaller.
    const size = (j: SteadyJohn, id: string) => j.points + (byId.get(id)!.rather[j.johnId] ?? 0) - lead(j, id);
    const biggest = (js: SteadyJohn[], id: string) => js.sort((x, y) => size(y, id) - size(x, id) || rk.get(y)! - rk.get(x)!)[0];
    const match = new Map<string, SteadyJohn>();
    const held = new Map<SteadyJohn, string>();
    const fewHands = (j: SteadyJohn) => homeOf(j).length < homeSet.size;
    needers.forEach((id, k) => {
      // A group's John that nobody still to choose could do goes to the person choosing, the most overdue first.
      const later = needers.slice(k + 1);
      const only = pool.filter((x) => !held.has(x) && fewHands(x) && can(x, id) && !later.some((o) => can(x, o)));
      const j = only.length ? only.sort((x, y) => rk.get(y)! - rk.get(x)!)[0] : biggest(pool.filter((x) => !held.has(x) && can(x, id)), id);
      if (j) {
        match.set(id, j);
        held.set(j, id);
      }
    });
    for (const id of needers) {
      let j = match.get(id);
      if (!j) {
        // Nothing in the overdue set is left for them: the next most overdue they can do, the biggest for someone
        // behind, the smallest for someone ahead.
        const next = ordered
          .filter((x) => !decided.has(x) && !held.has(x) && !pool.includes(x) && can(x, id))
          .slice(0, needers.length);
        j = rel.get(id)! < 0 ? biggest(next, id) : next.sort((x, y) => size(x, id) - size(y, id) || rk.get(y)! - rk.get(x)!)[0];
      }
      if (!j && rel.get(id)! < 0) j = biggest(pool.filter((x) => !held.has(x) && homeOf(x).includes(id)), id);
      if (!j) continue;
      held.set(j, id);
      const rows = homeOf(j)
        .filter((x) => needers.includes(x) && owed(x))
        .map((x) => weigh(j!, x));
      decided.add(j);
      give(id, j, { by: homeOf(j).length === 1 ? "only" : "oneEach", weighed: weighed(rows) });
    }
  }

  // 3. The rest, most overdue first.
  for (const j of ordered) {
    if (decided.has(j)) continue;
    decided.add(j);
    const cands = homeOf(j);
    if (!cands.length) {
      wait(j);
      continue;
    }
    const wt = j.waited;
    if (mode === "smart") {
      const rows = cands.map((id) => weigh(j, id));
      let pool: Row[];
      let stretched = false;
      let again = false;
      if (B) {
        // Who can take it, best first: 1) it fits, and they didn't do it last time (or they'd rather do it, or it's
        // their only John); 2) once it has waited a week, half the budget over; 3) once it has waited two weeks, or
        // only one person can do it, whoever did it last time.
        const other = (pid: string) =>
          ordered.some((x) => x !== j && !decided.has(x) && homeOf(x).includes(pid) && !x.lastBy.includes(pid));
        const freshTo = (r: Row) => !r.lastTime || r.pref > 0 || (owed(r.pid) && !other(r.pid));
        pool = rows.filter((r) => r.fits && freshTo(r));
        if (!pool.length && wt >= 1) {
          pool = rows.filter((r) => freshTo(r) && (r.fits || j.points <= r.room + B / 2 + EPS));
          stretched = pool.length > 0;
        }
        if (!pool.length && (wt >= 2 || cands.length === 1)) {
          pool = rows.filter((r) => r.fits);
          again = pool.length > 0 && cands.length > 1;
        }
      } else {
        pool = rows.filter((r) => r.roomy);
        if (!pool.length) pool = rows;
      }
      if (!pool.length) {
        wait(j);
        continue;
      }
      const sorted = best(j, pool);
      const win = sorted[0];
      give(win.pid, j, {
        by: smartBy(cands, sorted),
        weighed: weighed(rows),
        ...(stretched && win.room < j.points - EPS ? { stretched: true as const } : {}),
        ...(again && win.lastTime ? { again: true as const } : {}),
      });
    } else {
      // Classic: the next person in its order of turns who is home. Away or full, the next in line with room does
      // it, and they stay first in line.
      const q = order![j.johnId];
      const inLine = q.filter((id) => cands.includes(id));
      const first = inLine[0];
      const fitsFor = (id: string) => own.get(id)! === 0 || j.points <= target.get(id)! - dealt.get(id)! + EPS;
      // Whoever's turn it is may go half the budget over before it passes on, as Smart lets a John that waited:
      // otherwise someone with a group's John on top would pass their turns on week after week, and never get them back.
      const stretches = (id: string) => j.points <= target.get(id)! - dealt.get(id)! + B / 2 + EPS;
      const to = fitsFor(first) || stretches(first) ? first : inLine.slice(1).find(fitsFor);
      if (!to) {
        wait(j);
        continue;
      }
      const skipped = q.slice(0, q.indexOf(to)).length > 0;
      q.splice(q.indexOf(to), 1);
      q.push(to);
      give(to, j, {
        by: cands.length === 1 ? "only" : skipped ? "nextInLine" : "turn",
        weighed: inLine.map((uid, k) => ({
          userId: uid,
          standing: round1(rel.get(uid)!),
          ...(B ? { room: round1(target.get(uid)! - dealt.get(uid)!) } : {}),
          place: k + 1,
        })),
      });
    }
  }

  placeDays(places, active, members);

  return {
    places,
    waiting: nextWaited,
    turns: order,
    people: members.map((m) => ({
      userId: m.userId,
      rel: rel.get(m.userId)!,
      target: target.get(m.userId)!,
      dealt: dealt.get(m.userId)!,
      weekOff: homeSet.has(m.userId) && weekOff(m.userId),
    })),
    order: ordered.map((j) => j.johnId),
  };
}
