import { noticeFromRow, NoticesResponse, type Database, type Notice } from "@app/core";
import { createClient } from "@supabase/supabase-js";

import { visitorDbFromPool } from "@/lib/db/scope";
import { env } from "@/lib/env";
import { readCopy } from "@/lib/notices/copy";
import { json, preflight } from "@/lib/respond";

/**
 * GET /api/notices: the notices that are on, for the banner at the top of
 * the app (packages/core/src/notices.ts decides which one shows). Anyone may
 * ask, signed in or not. When the database doesn't answer, the copy kept in
 * Vercel Global Config answers instead, so a status notice about the outage
 * still shows; when neither does, the app shows its own "We can't reach
 * Jonz" banner.
 */
export async function GET(request: Request) {
  const fromDatabase = await readDatabase();
  const notices = fromDatabase ?? (await readCopy()) ?? [];
  const response = json(request, NoticesResponse.parse({ notices }));
  // A minute at the edge at most: a new status notice shows quickly, and a
  // burst of app opens during an outage doesn't all reach the database.
  response.headers.set("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
  return response;
}

async function readDatabase(): Promise<Notice[] | null> {
  try {
    // As a visitor: RLS shows everyone the notices that are on, and nothing else.
    const services = () =>
      createClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }) },
      });
    const db = visitorDbFromPool(services) ?? services();
    const read = db
      .from("notices")
      .select("id, kind, title, body, link_label, link_url, starts_at, ends_at")
      .order("starts_at", { ascending: false })
      .limit(20);
    // Three seconds at most, then the kept copy answers instead.
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([read, late]);
    if (!result || result.error || !result.data) return null;
    return result.data.map(noticeFromRow).filter((notice): notice is Notice => notice !== null);
  } catch {
    return null;
  }
}

export const OPTIONS = preflight;
