import { dueInLine, prefsOf, reminderFor, remindMoverNow, REMIND_AFTER_DAYS, REMIND_UNTIL_DAYS, rulesOf, houseKind, type Words } from "@app/core";

import { must, type Db, type HouseRow, type Notify } from "./shared";

// Reminders, and the one to someone who moved out.

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

export async function sendReminders(db: Db, house: HouseRow, now: Date, notify: Notify) {
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
    const due = (w: Words) => dueInLine(new Date(a.due_at), now, zone, w);
    await notify([a.user_id], {
      title: (w) =>
        stage === PLANNED
          ? w('house.notify.plannedTitle', { john: a.name })
          : stage === 2
            ? w('house.notify.dueSoonTitle', { john: a.name })
            : w('house.notify.dueTomorrowTitle', { john: a.name }),
      body: (w) =>
        a.needs_photo
          ? w('house.notify.needsPhotoBody', { due: due(w) })
          : stage === PLANNED
            ? w('house.notify.plannedBody', { due: due(w) })
            : stage === 2
              ? w('house.notify.dueSoonBody', { due: due(w) })
              : w('house.notify.dueTomorrowBody', { due: due(w) }),
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
