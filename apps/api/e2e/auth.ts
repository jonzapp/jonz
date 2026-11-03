import { randomUUID } from "node:crypto";

import { weekIndex, weekWindow } from "@app/core";
import type { BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { dealWeek, loadHouse } from "../lib/engine/tick";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
/** The Expo app's web build, served from its static export (playwright.config.ts). */
export const CLIENT_URL = "http://localhost:8205";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "E2E needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
      "SUPABASE_SERVICE_ROLE_KEY in apps/api/.env.local (run `supabase start`).",
  );
}

/** Local-only, and never a real credential: these users exist for one run. */
const PASSWORD = "e2e-not-a-secret-password";

export function admin() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Put a signed-in housemate into the Expo app's web build, which keeps its
 * session where supabase-js does in a browser: localStorage, not cookies.
 *
 * Sign-in is Google-only and a consent screen cannot be driven from CI, so
 * the session is minted out of band: a confirmed user from the admin API and
 * real tokens from a password sign-in. The tokens come from a client with the
 * app's URL and key, so the entry's name is the one the app reads back. It is written before the app's first page load and only
 * once per tab, so a test that signs out stays signed out across reloads.
 */
export async function signInToClient(context: BrowserContext, name: string): Promise<string> {
  return (await clientSession(context, name)).id;
}

/** signInToClient's session, with a supabase-js client signed in as the same person. */
async function clientSession(
  context: BrowserContext,
  name: string,
  newToTours = false,
): Promise<{ id: string; client: SupabaseClient }> {
  const { email, id } = await createHousemate(name, newToTours);

  const store = new Map<string, string>();
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;

  await context.addInitScript(
    ({ origin, entries }: { origin: string; entries: [string, string][] }) => {
      if (window.location.origin !== origin || sessionStorage.getItem("e2e-session-minted")) return;
      for (const [key, value] of entries) localStorage.setItem(key, value);
      sessionStorage.setItem("e2e-session-minted", "1");
    },
    { origin: CLIENT_URL, entries: [...store] },
  );
  return { id, client };
}

/**
 * Someone signed in to the Expo app's web build, in a house of their own
 * with this week already handed out: they create the house as the app does,
 * any `housemates` join it by its code (each signed in to their own
 * context), its Johns are added as an admin adds them, and the week is dealt
 * through the engine, as "Hand out this week’s Johns" does. Alone, every John
 * lands on them; with housemates, the deal shares them out. Every John falls
 * due on Sunday at 21:00 unless it names another time (`dueTime`), so a test
 * can say which comes first. An `onCall` John is dealt as someone on call
 * instead, with the 12-hour window.
 *
 * From Saturday evening the deal's day of grace moves every Sunday John to
 * the same moment, a day after the deal (or the week's last minute). Those
 * ties are broken here, a second apart, in the order the test gives them
 * (by `dueTime`, then as named), so Next up stays the one the test expects
 * whatever day the suite runs. `at` deals as if it were then, for checking that.
 * `{ newToTours: true }` makes them someone Today hasn't yet offered its tour
 * to; it has to be set before sign-in, as the session carries it.
 */
export async function dealtHouseInClient(
  context: BrowserContext,
  name: string,
  houseName: string,
  johns: { name: string; category?: string; needsPhoto?: boolean; dueTime?: string; onCall?: boolean }[],
  housemates: { context: BrowserContext; name: string }[] = [],
  given?: Date | { at?: Date; newToTours?: boolean },
): Promise<{ userId: string; houseId: string; housemateIds: string[]; weekId: string }> {
  const { at, newToTours } = given instanceof Date ? { at: given, newToTours: false } : (given ?? {});
  const { id, client } = await clientSession(context, name, newToTours);
  const { data: houseId, error } = await client.rpc("create_house", {
    p_name: houseName,
    p_timezone: "Europe/London",
    p_currency: "GBP",
    p_week_starts: 1,
  });
  if (error) throw error;

  const db = admin();
  const { data: codeRow } = await db.from("houses").select("join_code").eq("id", houseId).single();
  const housemateIds: string[] = [];
  for (const mate of housemates) {
    const joiner = await clientSession(mate.context, mate.name);
    const { error: joinError } = await joiner.client.rpc("join_house", { p_code: codeRow!.join_code });
    if (joinError) throw joinError;
    housemateIds.push(joiner.id);
  }

  // Taken after everyone has joined: the deal leaves out anyone who joins after its "now".
  const now = at ?? new Date();
  const week = weekWindow(now, "Europe/London", 1);
  const { error: johnsError } = await db.from("johns").insert(
    johns.map((j) => ({
      house_id: houseId,
      name: j.name,
      category: j.category ?? "other",
      points: 2,
      // Sunday night: anything already due when the week is dealt gets a day's grace. Each keeps its day, so
      // the deal's one a day doesn't move any of them off Sunday, and the order a test names them in holds.
      // An on-call John has no day to keep (johns_keep_day_on_call).
      due_dow: 7,
      keep_day: !j.onCall,
      due_time: j.dueTime ?? "21:00",
      every_weeks: 1,
      anchor_week: weekIndex(week.startsOn),
      needs_photo: j.needsPhoto ?? false,
      kind: j.onCall ? "on_call" : "day",
    })),
  );
  if (johnsError) throw johnsError;
  const { house, members } = await loadHouse(db, houseId);
  const { weekId } = await dealWeek(db, house, members, week, now, false);
  if (!weekId) throw new Error("Nothing was dealt");
  await keepNamedOrder(db, weekId, johns);
  return { userId: id, houseId, housemateIds, weekId };
}

/**
 * Johns due at one shared moment (the grace's, or plain Sunday 21:00), a
 * second apart in the test's order: by `dueTime` (default 21:00), then as
 * named. The first keeps the moment; the rest stay inside the same minute,
 * and inside the week, which the grace leaves a minute of.
 */
async function keepNamedOrder(db: SupabaseClient, weekId: string, johns: { name: string; dueTime?: string }[]) {
  const { data, error } = await db.from("assignments").select("id, name, due_at").eq("week_id", weekId);
  if (error) throw error;
  const rank = (name: string) => {
    const i = johns.findIndex((j) => j.name === name);
    return { time: johns[i]?.dueTime ?? "21:00", i };
  };
  const byMoment = new Map<number, { id: string; name: string }[]>();
  for (const a of data ?? []) {
    if (!a.due_at) continue;
    const t = new Date(a.due_at).getTime();
    byMoment.set(t, [...(byMoment.get(t) ?? []), a]);
  }
  for (const [moment, rows] of byMoment) {
    // One John shared by several housemates is one job: its rows move together.
    const tied = [...new Set(rows.map((a) => a.name))];
    if (tied.length < 2) continue;
    tied.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra.time.localeCompare(rb.time) || ra.i - rb.i;
    });
    for (const [k, name] of tied.entries()) {
      const due = new Date(moment + k * 1000).toISOString();
      const ids = rows.filter((a) => a.name === name).map((a) => a.id);
      const { error: moveError } = await db.from("assignments").update({ due_at: due }).in("id", ids);
      if (moveError) throw moveError;
    }
  }
}

/**
 * A house set up by someone else, the way the app does it (create_house as
 * them), for a test to join by its code. Their id goes to `cleanUp` with the
 * test's own users, which takes the house with it.
 */
export async function houseOf(owner: string, houseName: string): Promise<{ ownerId: string; code: string }> {
  const { email, id } = await createHousemate(owner);
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: houseId, error } = await client.rpc("create_house", {
    p_name: houseName,
    p_timezone: "Europe/London",
    p_currency: "GBP",
    p_week_starts: 1,
  });
  if (error) throw error;
  const { data } = await admin().from("houses").select("join_code").eq("id", houseId).single();
  return { ownerId: id, code: data!.join_code };
}

/** A confirmed user with a password, named as housemates will see them. */
async function createHousemate(name: string, newToTours = false): Promise<{ email: string; id: string }> {
  const email = `e2e-${randomUUID()}@test.local`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    // Everyone here is new, so Today would offer its tour: these tests say they've had the offer, unless
    // client-tours.spec.ts asks for someone who hasn't (newToTours).
    user_metadata: { display_name: name, tours: { seen: [], offerDone: !newToTours } },
  });
  if (error) throw error;
  return { email, id: data.user.id };
}

/** Scoped teardown: the houses these users made, then the users. */
export async function cleanUp(userIds: string[]) {
  const db = admin();
  await db.from("houses").delete().in("created_by", userIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
}
