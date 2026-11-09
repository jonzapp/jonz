import { PASS_ENFORCED, PassCheckoutRequest, PassManageRequest, type PassPurchase } from '@app/core';
import { Platform } from 'react-native';

import { callV1 } from './v1';

// Buying the House Pass on the web: apps/api opens Stripe Checkout or the
// billing page, and the browser goes there. Stripe's webhook gives the house
// the Pass; the page reads it back when the buyer returns. The phones buy
// through the stores, later, and never link out to the web price.

/** Whether this build sells the Pass: the web, with EXPO_PUBLIC_PASS_CHECKOUT=on. */
export function passCheckoutOpen(): boolean {
  return Platform.OS === 'web' && process.env.EXPO_PUBLIC_PASS_CHECKOUT === 'on';
}

/**
 * Whether this build sells the Pass now: checkout is on and the extras are
 * locked. During the beta (PASS_ENFORCED off) everyone has them, so
 * nothing is for sale; a buyer can still manage a plan they hold.
 */
export function passSelling(): boolean {
  return passCheckoutOpen() && PASS_ENFORCED;
}

/** Leaves the app for a Stripe page. */
export function leaveFor(url: string): void {
  window.location.assign(url);
}

/** Stripe Checkout's URL for this plan, for this house. */
export async function passCheckoutUrl(houseId: string, plan: PassPurchase): Promise<string> {
  const { url } = await callV1('pass_checkout', PassCheckoutRequest.parse({ houseId, plan }));
  return url;
}

/** Stripe's billing page, for the housemate who bought the Pass. */
export async function passBillingUrl(houseId: string): Promise<string> {
  const { url } = await callV1('pass_billing', PassManageRequest.parse({ houseId }));
  return url;
}
