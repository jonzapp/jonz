import { dueInLine, firstName, forfeitFor, monthOf, passOf, hasPass, rulesOf, houseKind, settleOutcome, verdict, votersOn, type Outcome } from "@app/core";

import { must, type Db, type HouseRow, type MemberRow, type Notify } from "./shared";

// Disputes, a parent's OK, and settling what is due.

// --- Disputes ----------------------------------------------------------------

export async function decideDisputes(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date) {
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
export async function askParents(db: Db, house: HouseRow, members: readonly MemberRow[], now: Date, notify: Notify) {
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

export async function settleDue(db: Db, house: HouseRow, now: Date, notify?: Notify) {
  const rules = rulesOf(house);
  // The Stake is a House Pass extra: without it, a late or missed John costs nothing.
  const staked = hasPass(passOf(house), now);
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
    body: (w, clock) => w('today.onCall.pushAgainBody', { due: dueInLine(new Date(flag.due_at), now, clock, w) }),
    houseKind: houseKind(house.kind),
    url: "/today",
    kind: "flags",
    zone: rulesOf(house).timezone,
    ...(flag.needs_photo ? {} : { act: { assignmentId: flagId } }),
    tag: `john:${flagId}`,
  });
}
