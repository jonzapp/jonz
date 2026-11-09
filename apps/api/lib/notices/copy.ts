import { Notice, noticeFromRow, noticeState, type Database, type Notice as NoticeT } from "@app/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// The copy of the notices kept outside Supabase, in Vercel Global Config
// (Edge Config), so a status notice still shows while the database is down.
// Reading it needs GLOBAL_CONFIG (EDGE_CONFIG before Vercel's rename), the
// store's connection string, which Vercel adds to the project when the store
// is connected. Writing it needs the store's id and a Vercel token:
// EDGE_CONFIG_ID and VERCEL_API_TOKEN, plus VERCEL_TEAM_ID for a team's store.
// Without them there is no copy, and GET /api/notices only reads the database.

const KEY = "notices";
const Copy = z.object({ notices: z.array(Notice), savedAt: z.string() });

/** The copy's read address from the connection string, or null when there is no store. */
function readUrl(): string | null {
  const connection = process.env.GLOBAL_CONFIG ?? process.env.EDGE_CONFIG;
  if (!connection) return null;
  try {
    const url = new URL(connection);
    const token = url.searchParams.get("token");
    if (!token) return null;
    return `${url.origin}${url.pathname}/item/${KEY}?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

/** The notices last copied out, or null when there is no copy or it can't be read. */
export async function readCopy(): Promise<NoticeT[] | null> {
  const url = readUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const copy = Copy.safeParse(await response.json());
    return copy.success ? copy.data.notices : null;
  } catch {
    return null;
  }
}

export function canWriteCopy(): boolean {
  return Boolean(process.env.EDGE_CONFIG_ID && process.env.VERCEL_API_TOKEN);
}

/** Replaces the copy. Throws when Vercel refuses, so the owner's page can say it didn't save. */
export async function writeCopy(notices: NoticeT[], now: Date): Promise<void> {
  const id = process.env.EDGE_CONFIG_ID;
  const token = process.env.VERCEL_API_TOKEN;
  if (!id || !token) return;
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const response = await fetch(`https://api.vercel.com/v1/global-config/${encodeURIComponent(id)}/items${team}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ operation: "upsert", key: KEY, value: { notices, savedAt: now.toISOString() } }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Global Config refused the notices copy (${response.status})`);
}

/**
 * Brings the copy up to date from the database, read as the owner (who reads
 * every notice): the ones on now or starting later, newest first. "closed"
 * when there is no store to write to; throws when it can't be read or saved.
 */
export async function copyNotices(db: SupabaseClient<Database>, now: Date): Promise<"copied" | "closed"> {
  if (!canWriteCopy()) return "closed";
  const { data, error } = await db
    .from("notices")
    .select("id, kind, title, body, link_label, link_url, starts_at, ends_at")
    .order("starts_at", { ascending: false })
    .limit(50);
  if (error || !data) throw new Error("The notices couldn't be read. Try again.");
  const notices = data
    .map(noticeFromRow)
    .filter((notice): notice is NoticeT => notice !== null && noticeState(notice, now) !== "ended")
    .slice(0, 20);
  await writeCopy(notices, now);
  return "copied";
}
