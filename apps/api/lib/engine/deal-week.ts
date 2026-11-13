import { addDaysTo, AHEAD_WEEKS, dealtMembers, localDate, movingOutAway, ON_CALL_WEEKS, onCallUsual, recentBalances, rulesOf, houseKind, steadyAhead, steadyDeal, stillHere, USUAL_WEEKS, weekStateOf, weekWindow, oldEnough, type AwayPeriod, type IsoDow, type Json, type SteadyDealArgs, type SteadyLastTurn, type WeekWindow, type Words } from "@app/core";

import { must, type Db, type HouseRow, type MemberRow, type Notify, type PushLine } from "./shared";

// Dealing: the balances a week starts from, the deal itself, and making sure this week exists.

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
 * Each housemate's balance in each group's pool going into a week (the
 * group's Johns only: work done minus share), summed by the database
 * (house_group_balances). Server only: the deal splits balances by pool
 * with it (steady.ts), so a group's Johns never move anyone's share of the
 * whole house's. User id → group id → balance.
 */
async function loadGroupBalances(db: Db, houseId: string, beforeStartsOn: string): Promise<Map<string, Map<string, number>>> {
  const rows = must(await db.rpc("house_group_balances", { p_house: houseId, p_before: beforeStartsOn }), "group balances");
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const mine = out.get(r.user_id) ?? new Map<string, number>();
    mine.set(r.group_id, Number(r.credited) - Number(r.owed));
    out.set(r.user_id, mine);
  }
  return out;
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
    return { sharers, groupName: inGroup.length > 0 ? group!.name : null, groupId: inGroup.length > 0 ? group!.id : null };
  };
  const [{ balances }, groupBalances] = await Promise.all([
    loadBalances(db, house.id, week.startsOn, memberIds),
    loadGroupBalances(db, house.id, week.startsOn),
  ]);
  // Each balance split by pool: each group they're in now with a John on the list, and the whole house's (the
  // rest, which takes in a group they've left or a group's John they covered from outside it).
  const poolGroups = [...new Set(list.map((j) => sharersOf(j).groupId).filter((g): g is string => !!g))];
  const poolsOf = (userId: string, balance: number) => {
    const mine = poolGroups.filter((g) => groups.find((x) => x.id === g)?.group_members.some((m) => m.user_id === userId));
    const pools: Record<string, number> = Object.fromEntries(mine.map((g) => [g, groupBalances.get(userId)?.get(g) ?? 0]));
    pools[""] = balance - mine.reduce((s, g) => s + pools[g], 0);
    return pools;
  };
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
      ...(poolGroups.length ? { pools: poolsOf(m.user_id, balances.get(m.user_id) ?? 0) } : {}),
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
      groupId: sharersOf(j).groupId,
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
  if (weekId) {
    // The part of the shares that was each group's Johns, for the next deal's pools (house_group_balances).
    must(await db.from("week_group_shares").delete().eq("week_id", weekId), "clear group shares");
    const rows = [...plan.groupShares].flatMap(([groupId, shares]) =>
      [...shares]
        .filter(([, share]) => share > 0)
        .map(([userId, share]) => ({ week_id: weekId, house_id: house.id, group_id: groupId, user_id: userId, share: Math.round(share * 100) / 100 })),
    );
    if (rows.length) must(await db.from("week_group_shares").insert(rows), "group shares");
  }
  return { weekId: weekId ?? null, byUser };
}

/** A member's "rather do" and "rather not", as stored: John id → 1 or −1. */
function ratherOf(json: Json): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json).filter((e): e is [string, number] => e[1] === 1 || e[1] === -1));
}

export async function ensureCurrentWeek(
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
