import { PLAN_WEEKS, type SteadyJohn } from "./steady-types";

// Classic's orders of turns: who starts each John's.

/**
 * Plan who starts each John's order of turns, biggest first, so each of the
 * next PLAN_WEEKS weeks' points split as evenly as possible. Johns that
 * already have an order keep it, and count toward the load the new ones are
 * planned around.
 */
export function planTurns(
  johns: readonly SteadyJohn[],
  memberIds: readonly string[],
  order: Record<string, string[]>,
): Record<string, string[]> {
  const load = new Map<string, number>();
  const key = (p: string, x: number) => `${p}|${x}`;
  const L = (p: string, x: number) => load.get(key(p, x)) ?? 0;
  const project = (j: SteadyJohn, q: readonly string[], add: (p: string, x: number, v: number) => void) => {
    let k = 0;
    for (let x = 0; x < PLAN_WEEKS; x++) {
      if (!j.ahead[x]) continue;
      add(q[k % q.length], x, j.points);
      k++;
    }
  };
  for (const j of johns) {
    const q = order[j.johnId];
    if (q && q.length) project(j, q, (p, x, v) => load.set(key(p, x), L(p, x) + v));
  }
  const lands = (j: SteadyJohn) => j.ahead.slice(0, PLAN_WEEKS).filter(Boolean).length || 1;
  const todo = johns
    .filter((j) => !order[j.johnId])
    .sort((a, b) => b.points * lands(b) - a.points * lands(a) || (a.johnId < b.johnId ? -1 : a.johnId > b.johnId ? 1 : 0));
  for (const j of todo) {
    const sharers = memberIds.filter((id) => j.sharers.includes(id));
    let best: { cost: number; q: string[]; extra: Map<string, number> } | null = null;
    for (let s = 0; s < Math.max(1, sharers.length); s++) {
      const q = [...sharers.slice(s), ...sharers.slice(0, s)];
      const extra = new Map<string, number>();
      if (q.length) project(j, q, (p, x, v) => extra.set(key(p, x), (extra.get(key(p, x)) ?? 0) + v));
      let cost = 0;
      for (let x = 0; x < PLAN_WEEKS; x++) {
        const v = memberIds.map((p) => L(p, x) + (extra.get(key(p, x)) ?? 0));
        cost += Math.max(...v) - Math.min(...v);
      }
      if (!best || cost < best.cost) best = { cost, q, extra };
    }
    order[j.johnId] = best!.q;
    for (const [k, v] of best!.extra) load.set(k, (load.get(k) ?? 0) + v);
  }
  return order;
}
