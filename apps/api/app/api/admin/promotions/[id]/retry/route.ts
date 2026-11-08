import { requireUser } from "@/lib/auth";
import { retryPromotion } from "@/lib/moves/promotions";
import { offerStripe } from "@/lib/pass/stripe";
import { json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/admin/promotions/[id]/retry: Try again, for a promotion saved
 * while Stripe couldn't be reached. Only the owner. Answers whether it's
 * live now.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const result = await retryPromotion({ db: auth.supabase, userId: auth.user.id }, offerStripe(), id);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, { ok: true, ready: result.ready });
}

export const OPTIONS = preflight;
