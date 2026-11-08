import { humanError, SupportDraftResponse } from "@app/core";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { supportDraft } from "@/lib/moves/support-draft";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/reports/:id/draft: the support agent's suggestion on a report
 * waiting for the owner, written now or kept from before; `{ draft: null }`
 * when there's none to give. Only the owner, signed in with their code; it
 * reads as them and changes nothing but its own record
 * (lib/moves/support-draft.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return error(request, 404, humanError({ message: "not_found" }));

  const result = await supportDraft({ db: auth.supabase, userId: auth.user.id }, id.data, new Date());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, SupportDraftResponse.parse(result));
}

export const OPTIONS = preflight;

// Long enough for Claude to read a few lists before it suggests.
export const maxDuration = 60;
