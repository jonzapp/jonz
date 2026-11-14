import { crewByJob, earnsImmunity, isCleanWeek, monthOf, monthWindow, passOf, hasPass, rulesOf, settleMonth, standings, tableInputs, weekWinners, type Outcome } from "@app/core";

import { must, type Db, type HouseRow, type MemberRow } from "./shared";

// Closing weeks (streaks and perks) and months (the Stake).

// --- Closing weeks: streaks and perks -----------------------------------------------

/** A row of a week being closed, as the closing reads it. */
interface ClosingRow {
  id: string;
  user_id: string;
  points: number;
  outcome: string | null;
  covered_by: string | null;
  job_id: string | null;
  absent_at: string | null;
  crew: { user_id: string; helper: boolean; points: number }[];
}

/**
 * What closing a week does to each member: their streak after it, and what
 * they earn (`perks`: a House Pass extra; without it, streaks still count
 * but earn nothing).
 */
function closing(
  week: { skipped_at: string | null },
  rows: readonly ClosingRow[],
  { members, streaks, perks }: { members: readonly MemberRow[]; streaks: ReadonlyMap<string, number>; perks: boolean },
) {
  // A John ticked by roll call shares its points among everyone on it (crew.ts).
  const crews = crewByJob(rows);
  const { rows: places, jobs } = tableInputs(
    rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      userId: r.user_id,
      points: r.points,
      status: r.outcome as Outcome,
      coveredBy: r.covered_by,
      absentAt: r.absent_at ? new Date(r.absent_at) : null,
      crew: crews.get(r.job_id ?? r.id) ?? null,
    })),
  );
  const table = standings(places, members.map((m) => m.user_id), jobs);
  // A skipped week tops nobody and leaves streaks as they were.
  const winners = new Set(week.skipped_at ? [] : weekWinners(table));

  return members.map((m) => {
    const outcomes = rows.filter((r) => r.user_id === m.user_id).map((r) => r.outcome as Outcome);
    const before = streaks.get(m.user_id) ?? 0;
    const clean = week.skipped_at ? null : isCleanWeek(outcomes);
    const after = clean === null ? before : clean ? before + 1 : 0;
    const earn: string[] = [];
    if (perks && earnsImmunity(before, after)) earn.push("immunity");
    if (perks && winners.has(m.user_id)) earn.push("swap");
    return { user_id: m.user_id, streak: after, earn };
  });
}

export async function closeWeeks(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date) {
  const due = must(
    await db
      .from("weeks")
      .select("id, starts_on, skipped_at")
      .eq("house_id", house.id)
      .is("closed_at", null)
      .lte("ends_at", now.toISOString())
      .order("starts_on"),
    "weeks to close",
  );
  const streaks = new Map(members.map((m) => [m.user_id, m.streak]));
  // Perks are a House Pass extra: without it, streaks still count but earn nothing.
  const perks = hasPass(passOf(house), now);
  let closed = 0;

  for (const week of due) {
    const rows = must(
      await db
        .from("assignments")
        .select("id, user_id, points, outcome, covered_by, job_id, absent_at, crew:crew_members(user_id, helper, points)")
        .eq("week_id", week.id),
      "week assignments",
    );
    // Weeks close in order, so a streak always counts the week before it.
    if (rows.some((r) => r.outcome === null)) break;

    const payload = closing(week, rows, { members, streaks, perks });

    const applied = must(await db.rpc("close_week", { p_week: week.id, p_members: payload }), "close_week");
    if (!applied) break;
    for (const p of payload) streaks.set(p.user_id, p.streak);
    closed += 1;
  }
  return closed;
}

// --- Closing months: the Stake ----------------------------------------------------------

export async function closeMonths(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date) {
  const rules = rulesOf(house);
  const current = monthOf(now, rules.timezone);
  const forfeitRows = must(
    await db
      .from("ledger_entries")
      .select("user_id, amount_minor, month, counterparty_user_id, doers, kind")
      .eq("house_id", house.id)
      // A month with only an admin's corrections in it closes too, so they count.
      .in("kind", ["forfeit", "correction"])
      .lt("month", current),
    "forfeits",
  );
  if (forfeitRows.length === 0) return [];
  const done = new Set(
    must(await db.from("month_closes").select("month").eq("house_id", house.id), "month closes").map(
      (m) => m.month,
    ),
  );
  const months = [...new Set(forfeitRows.map((r) => r.month))].filter((m) => !done.has(m)).sort();

  const closed: string[] = [];
  for (const month of months) {
    // A month closes once nothing due in it can still change.
    const window = monthWindow(month, rules.timezone);
    const { count, error } = await db
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("house_id", house.id)
      .is("outcome", null)
      .lt("due_at", window.endsAt.toISOString());
    if (error) throw new Error(`unsettled: ${error.message}`);
    if ((count ?? 0) > 0) break;

    const settlement = settleMonth(
      members.map((m) => m.user_id),
      rules.stakeMinor,
      forfeitRows
        .filter((r) => r.month === month && r.kind === "forfeit")
        .map((r) => ({ userId: r.user_id, amount: -r.amount_minor, to: r.counterparty_user_id ?? r.doers })),
      month,
    );
    const applied = must(
      await db.rpc("close_month", {
        p_house: house.id,
        p_month: month,
        p_entries: settlement.entries.map((e) => ({ user_id: e.userId, kind: e.kind, amount: e.amount })),
      }),
      "close_month",
    );
    if (applied) closed.push(month);
  }
  return closed;
}
