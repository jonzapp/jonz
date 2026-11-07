import { AddKid, AddKidResponse, bornYearOk, KIDS_COPY } from "@app/core";

import { requireUser } from "@/lib/auth";
import { addKid } from "@/lib/moves/kids";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/kids `{ name, bornYear }`: a parent adds a child who doesn't
 * sign in (lib/moves/kids.ts). Answers the child's id.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = AddKid.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, body.error.issues[0]?.message ?? KIDS_COPY.problems.name);
  if (!bornYearOk(body.data.bornYear, new Date().getUTCFullYear())) return error(request, 400, KIDS_COPY.problems.born);

  const added = await addKid({ db: auth.supabase, userId: auth.user.id }, body.data);
  if (!("userId" in added)) return refused(request, added);
  return json(request, AddKidResponse.parse(added));
}

export const OPTIONS = preflight;
