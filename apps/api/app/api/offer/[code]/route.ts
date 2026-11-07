import { humanError, OfferView } from "@app/core";

import { getBearerToken, requireUser } from "@/lib/auth";
import { readOffer } from "@/lib/moves/promotions";
import { error, json, preflight } from "@/lib/respond";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/offer/[code]: what a promotion's link shows (docs/specs/promotions.md).
 * Anyone with the link sees what it gives; signed in, also whether it's for
 * them and on which of their houses it works. Never who else it's for.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let viewer = null;
  if (getBearerToken(request.headers.get("authorization"))) {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    viewer = { db: auth.supabase, userId: auth.user.id, email: auth.user.email };
  }
  const offer = await readOffer(createAdminClient(), code, viewer, new Date());
  if (!offer) return error(request, 404, humanError({ message: "offer_unknown" }));
  return json(request, OfferView.parse(offer));
}

export const OPTIONS = preflight;
