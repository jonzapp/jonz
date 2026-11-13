import { pinnedOf, type SteadyJohn, type SteadyMember, type SteadyPlace } from "./steady-types";

// Which day each dealt John lands on.

/** The days nearest a John's own day first, ties to the earlier day (index 0 for on call). */
const BY_DIST: number[][] = Array.from({ length: 8 }, (_, h) =>
  [1, 2, 3, 4, 5, 6, 7].sort((a, b) => Math.abs(a - h) - Math.abs(b - h) || a - b),
);

/**
 * Each place's day, once everyone's Johns are known: a John that keeps its day
 * (or is done together) stays on it, on call is all week (0), and the rest go
 * to the nearest free day that suits the person, then the nearest free day,
 * and only then a day that already has one. Only days they're home and still
 * to come count; with none (a John coming back to someone away), its own day.
 * Sets each place's `day` and `why.moved`, from scratch, so it can run again
 * after a swap.
 */
export function placeDays(places: SteadyPlace[], johns: readonly SteadyJohn[], members: readonly SteadyMember[]): void {
  const johnOf = new Map(johns.map((j) => [j.johnId, j]));
  for (const m of members) {
    const mine = places.filter((p) => p.userId === m.userId);
    const taken = new Map<number, number>();
    for (const p of mine) {
      const j = johnOf.get(p.johnId)!;
      delete p.why.moved;
      if (j.onCall) p.day = 0;
      else if (pinnedOf(j)) {
        p.day = j.day;
        taken.set(p.day, (taken.get(p.day) ?? 0) + 1);
      }
    }
    const open = (d: number) => m.homeDays.includes(d);
    const suits = (d: number) => !m.suits.length || m.suits.includes(d);
    for (const p of mine) {
      const j = johnOf.get(p.johnId)!;
      if (j.onCall || pinnedOf(j)) continue;
      const days = BY_DIST[j.day].filter(open);
      const free = (d: number) => !taken.get(d);
      const d =
        days.find((x) => free(x) && suits(x)) ??
        days.find(free) ??
        [...days].sort((a, b) => (taken.get(a) ?? 0) - (taken.get(b) ?? 0))[0] ??
        j.day;
      p.day = d;
      if (d !== j.day) p.why.moved = !open(j.day) ? "away" : taken.get(j.day) ? "taken" : "suits";
      taken.set(d, (taken.get(d) ?? 0) + 1);
    }
  }
}
