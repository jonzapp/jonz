import { PromotionEmailed } from "@app/core";

import { requireUser } from "@/lib/auth";
import { emailPromotion } from "@/lib/moves/promotions";
import { json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/admin/promotions/[id]/email: Email them. The owner sends a named
 * promotion to the people on it who haven't been sent it or used it, each
 * once however often it's pressed (owner_promotion_emails, audited).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const result = await emailPromotion({ db: auth.supabase, userId: auth.user.id }, id);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, PromotionEmailed.parse({ ok: true, sent: result.sent }));
}

export const OPTIONS = preflight;

// Long enough to email the 500 people a promotion can name.
export const maxDuration = 60;
