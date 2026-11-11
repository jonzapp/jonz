import { noticeFromRow, noticeState, type Notice } from "@app/core";

import { requireUser } from "@/lib/auth";
import { canWriteCopy, writeCopy } from "@/lib/notices/copy";
import { error, json, preflight, wordsOf } from "@/lib/respond";

/**
 * POST /api/notices/copy: after the owner saves or ends a notice, the admin
 * page asks for the copy outside the database to be brought up to date: the
 * notices that are on or start later. Only the owner, with their code, may
 * ask; the database says who that is, through their own session.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const { data: owner } = await auth.supabase.rpc("is_owner");
  if (owner !== true) return error(request, 403, wordsOf(request)("errors.api.ownerOnly"));
  if (!canWriteCopy()) return json(request, { copied: false });

  // The owner reads every notice; keep the ones that aren't over.
  const { data, error: readError } = await auth.supabase
    .from("notices")
    .select("id, kind, title, body, link_label, link_url, starts_at, ends_at")
    .order("starts_at", { ascending: false })
    .limit(50);
  if (readError || !data) return error(request, 500, wordsOf(request)("errors.api.noticesUnread"));

  const now = new Date();
  const notices = data
    .map(noticeFromRow)
    .filter((notice): notice is Notice => notice !== null && noticeState(notice, now) !== "ended")
    .slice(0, 20);
  try {
    await writeCopy(notices, now);
  } catch {
    return error(request, 502, wordsOf(request)("errors.api.noticeCopyFailed"));
  }
  return json(request, { copied: true });
}

export const OPTIONS = preflight;
