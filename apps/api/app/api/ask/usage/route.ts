import { z } from "zod";

import { AskUsage } from "@app/core";

import { requireUser } from "@/lib/auth";
import { houseUsage } from "@/lib/moves/ask-usage";
import { error, json, preflight, refused } from "@/lib/respond";

const Body = z.object({ houseId: z.uuid() });

/**
 * POST /api/ask/usage `{ houseId }`: the week's Ask Jonz for anyone in the
 * house: what's left of theirs, the house's and each person's use, and
 * when it comes back (lib/moves/ask-usage.ts). The chat warns from it and
 * the usage page draws it.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, "Which house?");

  const result = await houseUsage({ db: auth.supabase, userId: auth.user.id }, body.data.houseId, new Date());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, AskUsage.parse(result));
}

export const OPTIONS = preflight;
