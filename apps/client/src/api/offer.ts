import { ApiError, OfferView, PassCheckoutRequest, type PassPurchase } from '@app/core';

import { getAccessToken } from './auth';
import { apiBase, ApiRequestError } from './base';
import { callV1 } from './v1';

// An offer's link (docs/specs/promotions.md): what it gives, read by anyone
// with the link, and, signed in, whether it's theirs; then Use it, which is
// the Pass's checkout with the offer's code.

/** What /offer/CODE shows: null when the code opens nothing. Signed in, also whether it's for you. */
export async function readOffer(code: string): Promise<OfferView | null> {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase()}/api/offer/${encodeURIComponent(code)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 404) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = ApiError.safeParse(payload);
    throw new ApiRequestError(refusal.success ? refusal.data.error : 'Something went wrong. Try again.', response.status);
  }
  return OfferView.parse(payload);
}

/**
 * Uses the offer on this house: a free Pass is given there and then and
 * answers the Pass page; anything else answers Stripe Checkout's URL, with
 * the offer on it.
 */
export async function takeOffer(houseId: string, plan: PassPurchase, offer: string): Promise<string> {
  const { url } = await callV1('pass_checkout', PassCheckoutRequest.parse({ houseId, plan, offer }));
  return url;
}
