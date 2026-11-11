import { DeleteHouseRequest, DeleteHouseResponse, humanError } from "@app/core";

import { requireUser } from "@/lib/auth";
import { deleteHouse } from "@/lib/moves/houses";
import { passStripe } from "@/lib/pass/stripe";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/admin/houses/[id]/delete: the owner deletes a whole house
 * (houses:write, with their code). The database checks it, writes the audit
 * entry and deletes it; this tells everyone who lived there (when asked) and
 * stops its House Pass renewing in Stripe.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = DeleteHouseRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, humanError({ message: "not_found" }, wordsOf(request)));

  const result = await deleteHouse({ db: auth.supabase, userId: auth.user.id }, id, body.data, passStripe());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, DeleteHouseResponse.parse({ ok: true, ...result }));
}

export const OPTIONS = preflight;

// Long enough to push and email everyone in the house before answering.
export const maxDuration = 60;
