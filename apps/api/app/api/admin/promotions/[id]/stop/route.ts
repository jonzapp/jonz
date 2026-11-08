import { requireUser } from "@/lib/auth";
import { stopPromotion } from "@/lib/moves/promotions";
import { offerStripe } from "@/lib/pass/stripe";
import { json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/admin/promotions/[id]/stop: the owner stops a promotion working
 * from now (audited), and its Stripe code is turned off. Houses that used it
 * keep what they got. Stopping one already stopped is fine.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const refusal = await stopPromotion({ db: auth.supabase, userId: auth.user.id }, offerStripe(), id);
  if (refusal) return refused(request, refusal);
  return json(request, { ok: true });
}

export const OPTIONS = preflight;
