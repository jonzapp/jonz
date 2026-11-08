import type { LiveStatus } from "./outcome";

/**
 * The Table: effort points earned, not points handed out.
 *
 * A John done on time earns its points, a late one earns half (rounded up),
 * and a missed or excused one earns nothing. A tick still inside its dispute
 * window counts as done, provisionally, so the live table moves when you
 * tick rather than a day later.
 */
export function pointsEarned(status: LiveStatus, points: number): number {
  switch (status) {
    case "done":
    case "checking":
    case "disputed":
      return points;
    case "late":
      return Math.ceil(points / 2);
    default:
      return 0;
  }
}

export interface TableRow {
  userId: string;
  /** To a hundredth: a John done together shares its points (4 ÷ 3 is 1.33). */
  points: number;
  done: number;
  late: number;
  missed: number;
  /** Housemates' Johns this person covered. */
  covered: number;
  /** Johns they helped with, on nobody's place of theirs (crew.ts). */
  helped: number;
  rank: number;
}

export interface TableInput {
  userId: string;
  points: number;
  status: LiveStatus;
  /** Who covered it, if a housemate did. */
  coveredBy?: string | null;
  /**
   * Ticked by a roll call its holder was on, or left them off: it counts as
   * done, late or missed for them, and its points go to the roll call's crew
   * instead (a SharedJob).
   */
  shared?: boolean;
}

/** A John ticked by roll call: its points, shared evenly by everyone on it (crew.ts tableInputs). */
export interface SharedJob {
  /** How the tick stands (the place it was ticked from): late halves the job, as it would one John. */
  status: LiveStatus;
  /** The points of every place it settled. */
  points: number;
  crew: readonly { userId: string; helper: boolean }[];
}

/**
 * Standings, highest first. Ties share a rank (1, 2, 2, 4); within one,
 * fewer missed, then fewer late, come first.
 *
 * A cover counts for the coverer, full points, from the moment it's made
 * (like a tick being checked); once it stands, the assignee has a miss.
 *
 * A John ticked by roll call (`jobs`) earns what one John of all its places'
 * points would, split evenly by everyone on it. A helper's share is points
 * and a "helped", never a done or a late: helping doesn't touch a streak.
 */
export function standings(
  rows: readonly TableInput[],
  memberIds: readonly string[],
  jobs: readonly SharedJob[] = [],
): TableRow[] {
  const by = new Map<string, TableRow>(
    memberIds.map((id) => [id, { userId: id, points: 0, done: 0, late: 0, missed: 0, covered: 0, helped: 0, rank: 0 }]),
  );
  for (const r of rows) {
    if (r.coveredBy && (r.status === "covered" || r.status === "disputed")) {
      const coverer = by.get(r.coveredBy);
      if (coverer) {
        coverer.points += r.points;
        coverer.covered += 1;
      }
      if (r.status === "covered") {
        const assignee = by.get(r.userId);
        if (assignee) assignee.missed += 1;
      }
      continue;
    }
    const row = by.get(r.userId);
    if (!row) continue;
    if (!r.shared) row.points += pointsEarned(r.status, r.points);
    if (r.status === "done" || r.status === "checking" || r.status === "disputed") row.done += 1;
    if (r.status === "late") row.late += 1;
    if (r.status === "missed") row.missed += 1;
  }
  for (const job of jobs) {
    if (job.crew.length === 0) continue;
    const each = pointsEarned(job.status, job.points) / job.crew.length;
    for (const c of job.crew) {
      const row = by.get(c.userId);
      if (!row) continue;
      row.points += each;
      if (c.helper) row.helped += 1;
    }
  }
  for (const row of by.values()) row.points = Math.round(row.points * 100) / 100;
  const sorted = [...by.values()].sort(
    (a, b) => b.points - a.points || a.missed - b.missed || a.late - b.late || a.userId.localeCompare(b.userId),
  );
  sorted.forEach((row, i) => {
    row.rank = i > 0 && sorted[i - 1].points === row.points ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}

/**
 * Who topped a closed week: everyone tied for the most points, as long as
 * somebody scored. They each earn a swap token (see streak.ts).
 */
export function weekWinners(rows: readonly TableRow[]): string[] {
  const top = rows.reduce((max, r) => Math.max(max, r.points), 0);
  if (top === 0) return [];
  return rows.filter((r) => r.points === top).map((r) => r.userId);
}
