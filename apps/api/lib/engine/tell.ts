import { closesAt, coverOpensAt, firstName, houseKind, rulesOf, TOLD_KINDS, tellOf, wordsFor, type Currency, type Database, type Words } from "@app/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Notify } from "./shared";


// Telling people, once each, on the clock (docs/specs/tell-people.md): the
// Wall posts nobody has been told about yet (events.told_at), pushed to
// whoever each is about, and an owner's overdue John once covering opens on
// it (assignments.cover_told_at). What each says is @app/core tell.ts.

type Db = SupabaseClient<Database>;
type HouseRow = Database["public"]["Tables"]["houses"]["Row"];

const DAY = 24 * 3_600_000;

function ok<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** What a telling is handed: the house, who lives there, and how to push. */
interface Telling {
  db: Db;
  house: HouseRow;
  memberIds: readonly string[];
  now: Date;
  notify: Notify;
}

/** Tells whoever each new Wall post is about. Answers how many pushes it sent. */
async function tellPosts({ db, house, memberIds, now, notify }: Telling): Promise<number> {
  // Each push is said in its reader's language when it's sent; who it goes to is the same in any.
  const kind = houseKind(house.kind);
  const zone = rulesOf(house).timezone;
  const profiles = ok(await db.from("profiles").select("id, display_name").in("id", [...memberIds]), "profiles");
  const nameOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p ? firstName(p.display_name) : "Someone";
  };
  let sent = 0;

  // Posts: everything untold up to now is told now; only a day's worth is pushed.
  const untold = ok(
    await db
      .from("events")
      .select("id, kind, user_id, assignment_id, data, created_at")
      .eq("house_id", house.id)
      .is("told_at", null)
      .lte("created_at", now.toISOString()),
    "untold",
  );
  for (const e of untold) {
    if (!(TOLD_KINDS as readonly string[]).includes(e.kind) || Date.parse(e.created_at) < now.getTime() - DAY) continue;
    const post = { kind: e.kind, userId: e.user_id, assignmentId: e.assignment_id, data: (e.data ?? {}) as Record<string, unknown> };
    const tellIn = (words: Words) => tellOf(post, nameOf, memberIds, house.currency as Currency, words)!;
    const told = tellOf(post, nameOf, memberIds, house.currency as Currency, wordsFor("en", kind));
    if (!told) continue;
    await notify(told.to, {
      title: (w) => tellIn(w).title,
      body: (w) => tellIn(w).body,
      houseKind: kind,
      url: told.url,
      kind: told.kind,
      zone,
      tag: told.tag,
    });
    sent += 1;
  }
  if (untold.length) {
    ok(
      await db
        .from("events")
        .update({ told_at: now.toISOString() })
        .in(
          "id",
          untold.map((e) => e.id),
        ),
      "told",
    );
  }
  return sent;
}

/** Tells an owner their overdue John can now be covered. Answers how many pushes it sent. */
async function tellCoverOpen({ db, house, memberIds, now, notify }: Telling): Promise<number> {
  const kind = houseKind(house.kind);
  const zone = rulesOf(house).timezone;
  let sent = 0;

  // Covering opens: tell the owner once, while it's still theirs to do.
  const overdue = ok(
    await db
      .from("assignments")
      .select("id, user_id, name, due_at, flagged_at, closes_at, needs_photo, weeks(ends_at)")
      .eq("house_id", house.id)
      .is("outcome", null)
      .is("done_at", null)
      .is("covered_by", null)
      .is("absent_at", null)
      .is("cover_told_at", null)
      .eq("excused", false)
      .lt("due_at", now.toISOString()),
    "overdue",
  );
  const opened: string[] = [];
  for (const a of overdue) {
    if (!a.weeks) continue;
    const dueAt = new Date(a.due_at);
    const closes = closesAt({
      dueAt,
      weekEndsAt: new Date(a.weeks.ends_at),
      flaggedAt: a.flagged_at ? new Date(a.flagged_at) : null,
      closesAt: a.closes_at ? new Date(a.closes_at) : null,
    });
    if (now < coverOpensAt(dueAt, house.cover_grace_hours, closes) || now >= closes) continue;
    opened.push(a.id);
    if (!memberIds.includes(a.user_id)) continue;
    await notify([a.user_id], {
      title: (w) => w('wall.tell.coverOpenTitle', { john: a.name }),
      body: (w) => w('wall.tell.coverOpenBody'),
      houseKind: kind,
      url: "/today",
      kind: "reminders",
      zone,
      ...(a.needs_photo ? {} : { act: { assignmentId: a.id } }),
      tag: `john:${a.id}`,
    });
    sent += 1;
  }
  if (opened.length) {
    ok(await db.from("assignments").update({ cover_told_at: now.toISOString() }).in("id", opened), "cover told");
  }
  return sent;
}

/** Push what's new since the last tick. Answers how many pushes it sent. */
export async function tellHouse(db: Db, house: HouseRow, memberIds: readonly string[], now: Date, notify: Notify): Promise<number> {
  const telling: Telling = { db, house, memberIds, now, notify };
  return (await tellPosts(telling)) + (await tellCoverOpen(telling));
}
