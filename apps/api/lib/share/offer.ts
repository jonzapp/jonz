import "server-only";

import { offerCode, type OfferCard } from "@app/core";

import { readOffer } from "@/lib/moves/promotions";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The promotion an offer link opens, as its card shows it: what it gives,
 * read as anyone with the link reads it (GET /api/offer/[code] signed out),
 * never who it's for. Null for a code that can't be one; `offer: null` for
 * one that opens nothing. Never throws: a card has to be drawn even when the
 * database can't be reached, or the chat shows a broken preview.
 */
export async function offerFor(raw: string): Promise<{ code: string; offer: OfferCard | null } | null> {
  const code = offerCode(raw);
  if (!code) return null;
  try {
    const view = await readOffer(createAdminClient(), code, null, new Date());
    if (!view) return { code, offer: null };
    return {
      code,
      offer: { live: view.state === "live", legend: view.legend, plate: view.plate, title: view.title, sentence: view.sentence },
    };
  } catch {
    return { code, offer: null };
  }
}
