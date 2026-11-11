import { ReportRequest, ReportResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { sendReport } from "@/lib/moves/reports";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/reports `{ kind, words, details, shots }`: report a problem, send
 * an idea or ask a question, with screenshots already uploaded to the
 * sender's own folder. The owner gets a push (lib/moves/reports.ts).
 * Answers the report's id.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = ReportRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayWhatHappened"));

  const result = await sendReport({ db: auth.supabase, userId: auth.user.id }, body.data);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, ReportResponse.parse({ ok: true, id: result.id }));
}

export const OPTIONS = preflight;
