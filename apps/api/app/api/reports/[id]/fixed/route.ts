import { humanError, ReportFixRequest, ReportFixResponse } from "@app/core";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { fixReport } from "@/lib/moves/reports";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/reports/:id/fixed `{ note, tell }`: the owner, signed in with
 * their code, marks a report fixed with every report folded into it. With
 * `tell`, each sender gets the note in the app and by email. It goes in the
 * audit log.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return error(request, 404, humanError({ message: "not_found" }));
  const body = ReportFixRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, "Say what changed, in up to 2,000 letters.");

  const result = await fixReport({ db: auth.supabase, userId: auth.user.id }, id.data, body.data);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, ReportFixResponse.parse({ ok: true, ...result }));
}

export const OPTIONS = preflight;
