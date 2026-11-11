import { addDaysTo, AHEAD_WEEKS, crewByJob, dealtMembers, dueInLine, firstName, earnsImmunity, forfeitFor, isCleanWeek, localDate, monthOf, monthWindow, movingOutAway, ON_CALL_WEEKS, onCallUsual, passOf, passUnlocked, prefsOf, recentBalances, reminderFor, remindMoverNow, REMIND_AFTER_DAYS, REMIND_UNTIL_DAYS, rulesOf, houseKind, settleMonth, settleOutcome, standings, steadyAhead, steadyDeal, stillHere, tableInputs, USUAL_WEEKS, verdict, votersOn, weekStateOf, weekWindow, weekWinners, oldEnough, type AwayPeriod, type Database, type IsoDow, type Json, type Outcome, type PushKind, type SteadyDealArgs, type SteadyLastTurn, type WeekWindow, type HouseKind, type Language, type Words, wordsFor } from "@app/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { tellHouse } from "./tell";

/**
 * The engine: everything the clock does to a house.
 *
 * It decides with the pure rules in @app/core and applies each decision
 * through one service-role SQL function that refuses to apply it twice
 * (supabase/migrations/*_init.sql). So the tick is safe to run as often as
 * anyone likes, from pg_cron, from a page load (lib/engine/fresh.ts) or from
 * two of those at once.
 *
 * It takes the client and the time as arguments and imports nothing that
 * only runs on a server, which is what lets tests/db drive it directly.
 */

export type Db = SupabaseClient<Database>;
type HouseRow = Database["public"]["Tables"]["houses"]["Row"];
type MemberRow = Pick<
  Database["public"]["Tables"]["members"]["Row"],
  "user_id" | "role" | "joined_at" | "streak" | "immunity_tokens" | "swap_tokens" | "suits_days" | "rather" | "moving_out_on" | "born_year"
>;

/**
 * A line of a push: what someone wrote, as they wrote it, or Jonz's words,
 * said in each reader's own language when it's sent (lib/push.ts).
 */
export type PushLine = string | ((words: Words) => string);

export interface PushMessage {
  title: PushLine;
  body: PushLine;
  /** Whose words its lines read: a family's or housemates' (housemates when left out). */
  houseKind?: HouseKind;
  url: string;
  /** Which setting it answers to (@app/core notify.ts); `support` has none. */
  kind: PushKind | "support";
  /** The house's zone, for quiet hours saved without one. */
  zone: string;
  /** A button to answer it from the notification: tick this John, or vote on this dispute. */
  act?: { assignmentId: string } | { disputeId: string };
  /** A later push with the same tag replaces this one, rather than stacking. */
  tag?: string;
}

/** A push as one reader gets it: each line said in their language. */
export type SaidPush = Omit<PushMessage, "title" | "body"> & { title: string; body: string; language: Language };

export function pushIn(message: PushMessage, language: Language): SaidPush {
  const words = wordsFor(language, message.houseKind ?? "housemates");
  const say = (line: PushLine) => (typeof line === "string" ? line : line(words));
  return { ...message, title: say(message.title), body: say(message.body), language };
}

/** Sends a push to some housemates. Absent when nothing should be sent. */
export type Notify = (userIds: string[], message: PushMessage) => Promise<void>;

export interface TickSummary {
  dealt: string | null;
  disputes: number;
  settled: number;
  weeksClosed: number;
  monthsClosed: string[];
  reminders: number;
  /** The house became what Rules said it would on the 1st. */
  kindChanged?: boolean;
}

// The house's rules from its row live in core, beside the board both apps build.
export { rulesOf };

type Ok<R> = Extract<R, { error: null }>;

/** Unwrap a Supabase response, or throw with what was being attempted. */
export function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string,
): Ok<R>["data"] {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as Ok<R>["data"];
}

export async function loadHouse(db: Db, houseId: string) {
  const house = must(await db.from("houses").select("*").eq("id", houseId).single(), "house");
  const members = must(
    await db
      .from("members")
      .select("user_id, role, joined_at, streak, immunity_tokens, swap_tokens, suits_days, rather, moving_out_on, born_year")
      .eq("house_id", houseId)
      .order("joined_at")
      .order("user_id"),
    "members",
  );
  return { house, members };
}

export async function tickHouse(
  db: Db,
  houseId: string,
  now: Date, notify?: Notify,
): Promise<TickSummary> {
  const { house, members } = await loadHouse(db, houseId);
  const summary: TickSummary = {
    dealt: null,
    disputes: 0,
    settled: 0,
    weeksClosed: 0,
    monthsClosed: [],
    reminders: 0,
  };

  if (house.first_dealt_at) {
    summary.dealt = await ensureCurrentWeek(db, house, members, now, notify);
  }
  summary.disputes = await decideDisputes(db, house, members, now);
  summary.settled = await settleDue(db, house, now, notify);
  if (notify && house.kind === "family") await askParents(db, house, members, now, notify);
  summary.weeksClosed = await closeWeeks(db, house, members, now);
  summary.monthsClosed = await closeMonths(db, house, members, now);
  // A switch to a family that waited for this month to be settled (Rules' Who lives here).
  if (house.next_kind) summary.kindChanged = must(await db.rpc("apply_next_kind", { p_house: house.id, p_now: now.toISOString() }), "next kind");
  if (notify) summary.reminders = await sendReminders(db, house, now, notify);
  if (notify) await tellHouse(db, house, members.map((m) => m.user_id), now, notify);

  must(await db.from("houses").update({ ticked_at: now.toISOString() }).eq("id", house.id), "ticked_at");
  return summary;
}

/**
 * Every house the clock has work in, one after another. One bad house never
 * stops the rest. Then the one reminder to anyone who moved out and hasn't
 * started or joined a house since (it belongs to no house).
 */
export async function tickAll(db: Db, now: Date, notify?: Notify) {
  const houses = must(await db.from("houses").select("id"), "houses");
  const results: { houseId: string; summary?: TickSummary; error?: string }[] = [];
  for (const h of houses) {
    try {
      results.push({ houseId: h.id, summary: await tickHouse(db, h.id, now, notify) });
    } catch (e) {
      results.push({ houseId: h.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (notify) {
    try {
      await remindMovers(db, now, notify);
    } catch (e) {
      results.push({ houseId: "moved_on", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

// --- Dealing ---------------------------------------------------------------

/**
 * Each housemate's balance going into a week: everything they did minus
 * everything they owed, over every week before it (@app/core deal.ts),
 * summed by the database (house_balances), and their usual share from the
 * last few weeks. Reads through whatever client it is given, so a screen can
 * show the same number the deal used.
 */
export async function loadBalances(
  db: Db,
  houseId: string,
  beforeStartsOn: string,
  memberIds: readonly string[],
): Promise<{ balances: Map<string, number>; usualShare: Map<string, number> }> {
  const [totals, pastWeeks] = await Promise.all([
    db.rpc("house_balances", { p_house: houseId, p_before: beforeStartsOn }),
    db
      .from("weeks")
      .select("id")
      .eq("house_id", houseId)
      .lt("starts_on", beforeStartsOn)
      // A skipped week counts for nothing, as house_balances counts it.
      .is("skipped_at", null)
      .order("starts_on", { ascending: false })
      .limit(USUAL_WEEKS),
  ]).then(([a, b]) => [must(a, "balances"), must(b, "past weeks")] as const);
  const ids = pastWeeks.map((w) => w.id);
  const recentShares = ids.length
    ? must(await db.from("week_shares").select("user_id, share").in("week_id", ids), "shares")
    : [];
  return recentBalances({ totals, recentShares }, memberIds);
}

/**
 * Deal a week's Johns with Steady weeks (@app/core steady-deal.ts): the
 * house's mode and points budget, everyone's preferences, Classic's orders of
 * turns and the Johns waiting from the week before. With `replace`, re-deal a
 * week nobody has ticked anything in yet (deal_week refuses otherwise).
 *
 * A John with a group goes only to that group's members (or to everyone, if
 * nobody in the group lives here any more); nobody is handed a John on a day
 * they are away; a John nobody who shares it is home for waits. Someone who
 * moved in after the week was first dealt starts the next Monday, and
 * someone moving out is dealt nothing from their moving-out day (moving.ts).
 */
export async function dealWeek(
  db: Db,
  house: HouseRow,
  members: readonly MemberRow[],
  week: WeekWindow,
  now: Date,
  replace: boolean,
): Promise<{ weekId: string | null; byUser: Map<string, PushLine[]> }> {
  const rules = rulesOf(house);
  const byUser = new Map<string, PushLine[]>();
  const [list, existing, previous] = await Promise.all([
    db.from("johns").select("*").eq("house_id", house.id).is("archived_at", null).order("created_at"),
    db.from("weeks").select("created_at").eq("house_id", house.id).eq("starts_on", week.startsOn).maybeSingle(),
    db
      .from("weeks")
      .select("turns, waiting")
      .eq("house_id", house.id)
      .lt("starts_on", week.startsOn)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]).then(([l, e, p]) => [must(l, "johns"), must(e, "this week"), must(p, "last week")] as const);
  const dealt = dealtMembers(
    stillHere(
      members.map((m) => ({ ...m, userId: m.user_id, joinedAt: new Date(m.joined_at), movingOutOn: m.moving_out_on })),
      week.startsOn,
    ),
    existing ? new Date(existing.created_at) : null,
    now,
  );
  const memberIds = dealt.map((m) => m.user_id);
  if (list.length === 0 || memberIds.length === 0) return { weekId: null, byUser };

  const lastDay = localDate(new Date(week.endsAt.getTime() - 1), rules.timezone);
  // Time away read to the end of the weeks the deal looks ahead to, for Week's whose turn next.
  const lastAhead = addDaysTo(lastDay, 7 * AHEAD_WEEKS);
  const johnIds = list.map((j) => j.id);
  const [groups, awayRows, recent, onCallRows] = await Promise.all([
    db.from("groups").select("id, name, group_members(user_id)").eq("house_id", house.id),
    db
      .from("away_periods")
      .select("id, user_id, starts_on, ends_on, note")
      .eq("house_id", house.id)
      .lte("starts_on", lastAhead)
      .gte("ends_on", week.startsOn),
    db
      .from("assignments")
      .select("john_id, user_id, due_at, outcome, job_id, flagged_at, weeks!inner(starts_on)")
      .in("john_id", johnIds)
      .is("flagged_at", null)
      .lt("weeks.starts_on", week.startsOn)
      .order("due_at", { ascending: false })
      .limit(1000),
    db
      .from("on_call_picks")
      .select("john_id, user_id, week_id, weeks!inner(starts_on)")
      .in("john_id", johnIds)
      .lt("weeks.starts_on", week.startsOn)
      // Newest first: ordered by the week itself (PostgREST orders by a many-to-one embed's column this way).
      .order("weeks(starts_on)", { ascending: false })
      .limit(200),
  ]).then(([g, a, r, o]) => [must(g, "groups"), must(a, "away"), must(r, "recent assignments"), must(o, "last on call")] as const);

  // Each John's last turn before this week: who had it (everyone with a place, for a John done together), and
  // whether its one holder missed it.
  const last = new Map<string, SteadyLastTurn>();
  for (const r of recent) {
    if (!r.john_id) continue;
    const startsOn = r.weeks!.starts_on;
    const turn = last.get(r.john_id);
    if (!turn) {
      last.set(r.john_id, {
        startsOn,
        userIds: [r.user_id],
        ...(r.outcome === "missed" && !r.job_id ? { missed: { userId: r.user_id, dueAt: new Date(r.due_at) } } : {}),
      });
    } else if (turn.startsOn === startsOn && r.job_id && !turn.userIds.includes(r.user_id)) {
      (turn.userIds as string[]).push(r.user_id);
    }
  }
  for (const r of onCallRows) if (!last.has(r.john_id)) last.set(r.john_id, { startsOn: r.weeks!.starts_on, userIds: [r.user_id] });

  // On call counts toward the budget at what it usually takes: its flags a week over its last 4 weeks on call.
  const onCall = list.filter((j) => j.kind === "on_call");
  const onCallPoints = new Map<string, number>();
  if (onCall.length > 0) {
    const weeksOf = new Map<string, string[]>();
    for (const r of onCallRows) {
      const ws = weeksOf.get(r.john_id) ?? [];
      if (ws.length < ON_CALL_WEEKS && !ws.includes(r.week_id)) weeksOf.set(r.john_id, [...ws, r.week_id]);
    }
    const flagWeeks = [...new Set([...weeksOf.values()].flat())];
    const flags = flagWeeks.length
      ? must(
          await db.from("assignments").select("john_id, week_id").in("week_id", flagWeeks).not("flagged_at", "is", null),
          "recent flags",
        )
      : [];
    for (const j of onCall) {
      const usual = onCallUsual(
        j.points,
        weeksOf.get(j.id) ?? [],
        flags.filter((f) => f.john_id === j.id && f.week_id).map((f) => f.week_id!),
      );
      if (usual !== null) onCallPoints.set(j.id, usual);
    }
  }

  const away: AwayPeriod[] = [
    ...awayRows.map((a) => ({
      id: a.id,
      userId: a.user_id,
      startsOn: a.starts_on,
      endsOn: a.ends_on,
      note: a.note,
    })),
    // From the day someone moves out, as if away for good.
    ...movingOutAway(dealt, week.startsOn, lastAhead),
  ];
  const bornYear = new Map(members.map((m) => [m.user_id, m.born_year]));
  const sharersOf = (j: (typeof list)[number]) => {
    const group = j.group_id ? groups.find((g) => g.id === j.group_id) : undefined;
    const inGroup = (group?.group_members ?? []).map((m) => m.user_id).filter((id) => memberIds.includes(id));
    const all = inGroup.length > 0 ? inGroup : memberIds;
    // In a family, a kid younger than the John's youngest age isn't dealt it (kids.ts).
    const sharers = all.filter((id) => oldEnough(bornYear.get(id), j.min_age, week.startsOn));
    return { sharers, groupName: inGroup.length > 0 ? group!.name : null };
  };
  const { balances } = await loadBalances(db, house.id, week.startsOn, memberIds);
  const args: SteadyDealArgs = {
    mode: house.deal_mode === "classic" ? "classic" : "smart",
    budget: house.deal_budget,
    week,
    zone: rules.timezone,
    weekStarts: rules.weekStarts,
    now,
    members: dealt.map((m) => ({
      userId: m.user_id,
      balance: balances.get(m.user_id) ?? 0,
      suits: m.suits_days,
      rather: ratherOf(m.rather),
    })),
    johns: list.map((j) => ({
      id: j.id,
      points: j.points,
      kind: j.kind === "on_call" ? "on_call" : "day",
      perWeek: j.per_week,
      crew: j.crew,
      keepDay: j.keep_day,
      repeat: {
        everyWeeks: j.every_weeks,
        everyMonths: j.every_months,
        weekOfMonth: j.week_of_month,
        anchorMonth: j.anchor_month,
        anchorWeek: j.anchor_week,
        dueDow: j.due_dow as IsoDow,
      },
      dueTime: j.due_time,
      sharers: sharersOf(j).sharers,
    })),
    away,
    last,
    previous: previous ? weekStateOf(previous) : null,
    onCallPoints,
    makeup: house.away_makeup / 100,
    seed: `${house.id}:${week.startsOn}`,
  };
  const plan = steadyDeal(args);

  // Done together: one job per John, so its places stay together (crew.ts).
  const jobs = new Map<string, string>();
  const johnOf = new Map(list.map((j) => [j.id, j]));
  const assignments = plan.places.flatMap((p) => {
    const j = johnOf.get(p.johnId)!;
    if (!p.dueAt) return [];
    if (p.together && !jobs.has(j.id)) jobs.set(j.id, crypto.randomUUID());
    byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), j.name]);
    return [
      {
        john_id: j.id,
        user_id: p.userId,
        name: j.name,
        category: j.category,
        points: j.points,
        needs_photo: j.needs_photo,
        due_at: p.dueAt.toISOString(),
        group_name: sharersOf(j).groupName,
        dealt: p.why as unknown as Json,
        job_id: p.together ? jobs.get(j.id)! : null,
      },
    ];
  });
  const onCallDealt = plan.places.flatMap((p) => {
    if (p.dueAt) return [];
    const j = johnOf.get(p.johnId)!;
    byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), (w: Words) => w('today.onCall.dealtAs', { john: j.name })]);
    return [{ john_id: j.id, user_id: p.userId }];
  });
  if (assignments.length === 0 && onCallDealt.length === 0 && Object.keys(plan.state.waiting).length === 0) {
    return { weekId: null, byUser };
  }

  const weekId = must(
    await db.rpc("deal_week", {
      p_house: house.id,
      p_starts_on: week.startsOn,
      p_starts_at: week.startsAt.toISOString(),
      p_ends_at: week.endsAt.toISOString(),
      p_assignments: assignments,
      p_shares: memberIds.map((id) => ({ user_id: id, share: Math.round((plan.shares.get(id) ?? 0) * 100) / 100 })),
      p_replace: replace,
      p_on_call: onCallDealt,
      p_state: { ...plan.state, ahead: steadyAhead(args, plan) } as unknown as Json,
    }),
    "deal_week",
  );
  return { weekId: weekId ?? null, byUser };
}

/** A member's "rather do" and "rather not", as stored: John id → 1 or −1. */
function ratherOf(json: Json): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json).filter((e): e is [string, number] => e[1] === 1 || e[1] === -1));
}

async function ensureCurrentWeek(
  db: Db,
  house: HouseRow,
  members: readonly MemberRow[],
  now: Date, notify?: Notify,
): Promise<string | null> {
  const rules = rulesOf(house);
  const week = weekWindow(now, rules.timezone, rules.weekStarts);
  const existing = must(
    await db.from("weeks").select("id").eq("house_id", house.id).eq("starts_on", week.startsOn).maybeSingle(),
    "current week",
  );
  if (existing) return null;
  const { weekId, byUser } = await dealWeek(db, house, members, week, now, false);
  if (weekId && notify) {
    for (const [userId, names] of byUser) {
      await notify([userId], {
        title: (w) => w('house.notify.dealTitle'),
        body: (w) => names.map((n) => (typeof n === "string" ? n : n(w))).reduce((first, second) => w('common.join.comma', { first, second })),
        houseKind: houseKind(house.kind),
        url: "/today",
        kind: "deal",
        zone: rules.timezone,
        tag: `deal:${weekId}`,
      });
    }
  }
  return weekId;
}

// --- Disputes ----------------------------------------------------------------

async function decideDisputes(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date) {
  const open = must(
    await db
      .from("disputes")
      .select("id, closes_at, assignments(user_id, covered_by)")
      .eq("house_id", house.id)
      .is("resolution", null),
    "open disputes",
  );
  if (open.length === 0) return 0;
  const votes = must(
    await db.from("dispute_votes").select("dispute_id, user_id, uphold").in("dispute_id", open.map((d) => d.id)),
    "votes",
  );
  let decided = 0;
  for (const d of open) {
    // Whose tick it is (the coverer's, for a cover) and, on a cover, whose John it was: neither votes on it.
    const voters = d.assignments
      ? votersOn(members.map((m) => m.user_id), { userId: d.assignments.user_id, coveredBy: d.assignments.covered_by })
      : members.map((m) => m.user_id);
    const eligible = voters.length;
    const mine = votes.filter((v) => v.dispute_id === d.id && voters.includes(v.user_id));
    const result = verdict(
      {
        eligible,
        uphold: mine.filter((v) => v.uphold).length,
        reject: mine.filter((v) => !v.uphold).length,
        closesAt: new Date(d.closes_at),
      },
      now,
    );
    if (!result) continue;
    const applied = must(await db.rpc("resolve_dispute", { p_dispute: d.id, p_resolution: result }), "resolve");
    if (applied) decided += 1;
  }
  return decided;
}

// --- A parent's OK ---------------------------------------------------------------

/**
 * In a family, tell the parents once about each kid's tick that waits for
 * their OK ("Leo did Feed the fish"). A Together John's places share one
 * tick, so it is said once. Marked as asked whether or not a push went.
 */
async function askParents(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date, notify: Notify) {
  const waiting = must(
    await db
      .from("assignments")
      .select("id, job_id, user_id, covered_by, name")
      .eq("house_id", house.id)
      .eq("awaits_ok", true)
      .is("ok_asked_at", null)
      .is("outcome", null),
    "awaiting an OK",
  );
  if (waiting.length === 0) return;
  const parents = members.filter((m) => m.role === "admin").map((m) => m.user_id);
  const kids = [...new Set(waiting.map((a) => a.covered_by ?? a.user_id))];
  const names = new Map(
    must(await db.from("profiles").select("id, display_name").in("id", kids), "kids").map((p) => [p.id, firstName(p.display_name)]),
  );
  const told = new Set<string>();
  for (const a of waiting) {
    const job = a.job_id ?? a.id;
    if (told.has(job)) continue;
    told.add(job);
    const kid = a.covered_by ?? a.user_id;
    await notify(
      parents.filter((p) => p !== kid),
      {
        title: (w) => w('today.parentOk.askTitle', { kid: names.get(kid) ?? w('common.shell.formerHousemate'), john: a.name }),
        body: (w) => w('today.parentOk.askBody'),
        houseKind: houseKind(house.kind),
        url: "/today",
        kind: "checks",
        zone: house.timezone,
        tag: `ok:${job}`,
      },
    );
  }
  must(
    await db
      .from("assignments")
      .update({ ok_asked_at: now.toISOString() })
      .in("id", waiting.map((a) => a.id)),
    "asked",
  );
}

// --- Settling outcomes -----------------------------------------------------------

async function settleDue(db: Db, house: HouseRow, now: Date, notify?: Notify) {
  const rules = rulesOf(house);
  // The Stake is a House Pass extra: without it, a late or missed John costs nothing.
  const staked = passUnlocked(passOf(house), now);
  const open = must(
    await db
      .from("assignments")
      .select("id, john_id, job_id, due_at, done_at, absent_at, excused, flagged_at, closes_at, covered_by, awaits_ok, weeks(ends_at)")
      .eq("house_id", house.id)
      .is("outcome", null),
    "open assignments",
  );
  if (open.length === 0) return 0;
  const disputed = new Set(
    must(
      await db.from("disputes").select("assignment_id").eq("house_id", house.id).is("resolution", null),
      "disputed",
    ).map((d) => d.assignment_id),
  );
  // A job has one check: a dispute on any of its places holds them all.
  const disputedJobs = new Set(open.filter((a) => a.job_id && disputed.has(a.id)).map((a) => a.job_id!));

  const items: { id: string; outcome: Outcome; forfeit: number; month: string }[] = [];
  for (const a of open) {
    const outcome = settleOutcome(
      {
        dueAt: new Date(a.due_at),
        doneAt: a.done_at ? new Date(a.done_at) : null,
        excused: a.excused,
        disputeOpen: disputed.has(a.id) || (a.job_id !== null && disputedJobs.has(a.job_id)),
        awaitsOk: a.awaits_ok,
        weekEndsAt: new Date(a.weeks!.ends_at),
        flaggedAt: a.flagged_at ? new Date(a.flagged_at) : null,
        closesAt: a.closes_at ? new Date(a.closes_at) : null,
        coveredBy: a.covered_by,
        absentAt: a.absent_at ? new Date(a.absent_at) : null,
      },
      now,
      rules.disputeHours,
    );
    if (!outcome) continue;
    items.push({
      id: a.id,
      outcome,
      forfeit: staked ? forfeitFor(outcome, rules) : 0,
      month: monthOf(new Date(a.due_at), rules.timezone),
    });
  }
  if (items.length === 0) return 0;
  const settled = must(await db.rpc("settle_assignments", { p_items: items }), "settle");

  // A missed flag still needs doing: it opens again for whoever is on call
  // now. The miss stays with whoever had it. open_flag hands back a flag
  // that's already open, so two ticks racing open one.
  const missedFlags = new Set(
    open.filter((a) => a.flagged_at && a.john_id && items.some((i) => i.id === a.id && i.outcome === "missed")).map((a) => a.john_id!),
  );
  for (const johnId of missedFlags) await reopenFlag(db, house, johnId, now, notify);
  return settled;
}

/** Flag an on-call John again after a miss, and tell whoever it went to. Nobody home, or no week dealt, leaves it. */
async function reopenFlag(db: Db, house: HouseRow, johnId: string, now: Date, notify?: Notify) {
  const { data: flagId, error } = await db.rpc("open_flag", { p_john: johnId, p_at: now.toISOString() });
  if (error || !flagId) return;
  const flag = must(
    await db.from("assignments").select("user_id, name, due_at, needs_photo, flagged_by, flagged_at").eq("id", flagId).single(),
    "reopened flag",
  );
  // An older flag already open, from a housemate, was told about when it was raised.
  if (!notify || flag.flagged_by !== null || !flag.flagged_at || Date.parse(flag.flagged_at) !== now.getTime()) return;
  await notify([flag.user_id], {
    title: (w) => w('today.onCall.pushTitle', { john: flag.name }),
    body: (w) => w('today.onCall.pushAgainBody', { due: dueInLine(new Date(flag.due_at), now, rulesOf(house).timezone) }),
    houseKind: houseKind(house.kind),
    url: "/today",
    kind: "flags",
    zone: rulesOf(house).timezone,
    ...(flag.needs_photo ? {} : { act: { assignmentId: flagId } }),
    tag: `john:${flagId}`,
  });
}

// --- Closing weeks: streaks and perks -----------------------------------------------

async function closeWeeks(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date) {
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
  const perks = passUnlocked(passOf(house), now);
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

    const payload = members.map((m) => {
      const outcomes = rows.filter((r) => r.user_id === m.user_id).map((r) => r.outcome as Outcome);
      const before = streaks.get(m.user_id) ?? 0;
      const clean = week.skipped_at ? null : isCleanWeek(outcomes);
      const after = clean === null ? before : clean ? before + 1 : 0;
      const earn: string[] = [];
      if (perks && earnsImmunity(before, after)) earn.push("immunity");
      if (perks && winners.has(m.user_id)) earn.push("swap");
      return { user_id: m.user_id, streak: after, earn };
    });

    const applied = must(await db.rpc("close_week", { p_week: week.id, p_members: payload }), "close_week");
    if (!applied) break;
    for (const p of payload) streaks.set(p.user_id, p.streak);
    closed += 1;
  }
  return closed;
}

// --- Closing months: the Stake ----------------------------------------------------------

async function closeMonths(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date) {
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

// --- Reminders -----------------------------------------------------------------------------

const HOUR = 3_600_000;

/**
 * The day before a John is due, and again a few hours before, its owner hears
 * what's due and when, with a Done button unless it needs a photo. Each stage
 * is sent once (`assignments.reminded`). Someone who turned reminders off is
 * passed over for good; someone in quiet hours is passed over until a tick
 * after they end, while there's still time.
 */
/** A planned John's reminder: sent once at its planned time (Plan it), in place of the usual two. */
const PLANNED = 3;

async function sendReminders(db: Db, house: HouseRow, now: Date, notify: Notify) {
  const zone = rulesOf(house).timezone;
  const [dueSoon, planned] = await Promise.all([
    db
      .from("assignments")
      .select("id, user_id, name, due_at, needs_photo, reminded, job_id, planned_at")
      .eq("house_id", house.id)
      .is("outcome", null)
      .is("done_at", null)
      .is("absent_at", null)
      .is("planned_at", null)
      .lt("reminded", 2)
      .gt("due_at", now.toISOString())
      .lte("due_at", new Date(now.getTime() + 24 * HOUR).toISOString()),
    // A plan's reminder comes at its time, and up to two hours after if the clock was away.
    db
      .from("assignments")
      .select("id, user_id, name, due_at, needs_photo, reminded, job_id, planned_at")
      .eq("house_id", house.id)
      .is("outcome", null)
      .is("done_at", null)
      .is("absent_at", null)
      .lt("reminded", PLANNED)
      .lte("planned_at", now.toISOString())
      .gt("planned_at", new Date(now.getTime() - 2 * HOUR).toISOString()),
  ]).then(([a, b]) => [must(a, "reminders"), must(b, "planned reminders")] as const);
  const soon = [...dueSoon, ...planned];
  if (soon.length === 0) return 0;
  const prefs = must(
    await db
      .from("notification_prefs")
      .select("user_id, reminders, checks, flags, deal, quiet_from, quiet_until, timezone")
      .in("user_id", [...new Set(soon.map((a) => a.user_id))]),
    "notification settings",
  );
  let sent = 0;
  for (const a of soon) {
    const left = new Date(a.due_at).getTime() - now.getTime();
    const stage = a.planned_at ? PLANNED : left <= 3 * HOUR ? 2 : 1;
    if (a.reminded >= stage) continue;
    const when = reminderFor(prefsOf(prefs.find((p) => p.user_id === a.user_id)), now, zone);
    if (when === "wait") continue;
    // Claim the reminder before sending it, so two ticks never both send.
    const claimed = must(
      await db
        .from("assignments")
        .update({ reminded: stage })
        .eq("id", a.id)
        .lt("reminded", stage)
        .select("id"),
      "claim reminder",
    );
    if (claimed.length === 0 || when === "skip") continue;
    const due = dueInLine(new Date(a.due_at), now, zone);
    await notify([a.user_id], {
      title: (w) =>
        stage === PLANNED
          ? w('house.notify.plannedTitle', { john: a.name })
          : stage === 2
            ? w('house.notify.dueSoonTitle', { john: a.name })
            : w('house.notify.dueTomorrowTitle', { john: a.name }),
      body: (w) =>
        a.needs_photo
          ? w('house.notify.needsPhotoBody', { due })
          : stage === PLANNED
            ? w('house.notify.plannedBody', { due })
            : stage === 2
              ? w('house.notify.dueSoonBody', { due })
              : w('house.notify.dueTomorrowBody', { due }),
      houseKind: houseKind(house.kind),
      url: "/today",
      kind: "reminders",
      zone,
      // A John done together is ticked with who did it, in the app.
      ...(a.needs_photo || a.job_id ? {} : { act: { assignmentId: a.id } }),
      tag: `john:${a.id}`,
    });
    sent += 1;
  }
  return sent;
}

// --- Moving on -------------------------------------------------------------------------------

/**
 * Two weeks after someone leaves a house, if they haven't started or joined
 * another, one push: "Settled into your new place? Bring Jonz with you."
 * Only one, ever, per move (`moved_on.reminded_at`); it answers to the
 * reminders switch and waits out quiet hours, in the zone of the house they
 * left when their settings don't name one. Past 30 days it's no longer sent.
 */
export async function remindMovers(db: Db, now: Date, notify: Notify) {
  const day = 86_400_000;
  const moves = must(
    await db
      .from("moves")
      .select("id, user_id, left_at, houses!moves_from_house_id_fkey(timezone)")
      .is("how", null)
      .is("reminded_at", null)
      .lte("left_at", new Date(now.getTime() - REMIND_AFTER_DAYS * day).toISOString())
      .gt("left_at", new Date(now.getTime() - REMIND_UNTIL_DAYS * day).toISOString()),
    "moves to remind",
  );
  const due = moves.filter((m) => remindMoverNow(new Date(m.left_at), now));
  if (due.length === 0) return 0;
  const userIds = [...new Set(due.map((m) => m.user_id))];
  const [housed, prefs] = await Promise.all([
    db.from("members").select("user_id").in("user_id", userIds),
    db
      .from("notification_prefs")
      .select("user_id, reminders, checks, flags, deal, quiet_from, quiet_until, timezone")
      .in("user_id", userIds),
  ]).then(([h, p]) => [must(h, "members"), must(p, "notification settings")] as const);
  let sent = 0;
  for (const m of due) {
    // In a house again some other way (an old house's undo, say): nothing to remind them of.
    if (housed.some((h) => h.user_id === m.user_id)) continue;
    const zone = m.houses?.timezone ?? "UTC";
    const when = reminderFor(prefsOf(prefs.find((p) => p.user_id === m.user_id)), now, zone);
    if (when === "wait") continue;
    // Claim it before sending, so two ticks never both send.
    const claimed = must(
      await db
        .from("moves")
        .update({ reminded_at: now.toISOString() })
        .eq("id", m.id)
        .is("reminded_at", null)
        .select("id"),
      "claim move reminder",
    );
    if (claimed.length === 0 || when === "skip") continue;
    await notify([m.user_id], {
      title: (w) => w('house.moving.reminderTitle'),
      body: (w) => w('house.moving.reminderBody'),
      url: "/welcome",
      kind: "reminders",
      zone,
      tag: `moved-on:${m.id}`,
    });
    sent += 1;
  }
  return sent;
}
