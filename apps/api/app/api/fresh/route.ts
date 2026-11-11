import { FreshRequest, FreshResponse, humanError } from "@app/core";

import { requireUser } from "@/lib/auth";
import { ensureFresh } from "@/lib/engine/fresh";
import { error, json, preflight, wordsOf } from "@/lib/respond";

/**
 * POST /api/fresh `{ houseId }`: catch a house up before the app shows it,
 * as a page load does on the web. At most once a minute per house, and no
 * pushes: those are the cron tick's.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = FreshRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayHouseToCatchUp"));

  // Read through the caller's own session: RLS shows a house to its members
  // only, so someone else's (or no) house reads as nothing. Only then does
  // the tick run, as the service role, for this one house.
  const { data: house } = await auth.supabase
    .from("houses")
    .select("id, ticked_at")
    .eq("id", body.data.houseId)
    .maybeSingle();
  if (!house) return error(request, 404, humanError({ message: "not_in_house" }, wordsOf(request)));

  const ticked = await ensureFresh(house.id, house.ticked_at, new Date());
  return json(request, FreshResponse.parse({ ticked }));
}

export const OPTIONS = preflight;
