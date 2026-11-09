
import { callV1 } from './v1';

// Reminders on this device, in a browser: a push subscription with the web's
// VAPID public key and its service worker (/sw.js, from public/), saved as
// your own row in push_subscriptions, which the tick sends to. The same key,
// path and scope as the web's, so a browser subscribed there stays so here.

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const WORKER = '/sw.js';

/** Whether reminders can be offered: not without a key, and not in a browser that can't take them. */
export function reminderSupport(): 'none' | 'unsupported' | 'ready' {
  if (!VAPID_PUBLIC_KEY) return 'none';
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ready';
}

/** A VAPID key as the Push API wants it: URL-safe base64, unpadded, as bytes. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function current(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Whether this browser is subscribed now. */
export async function remindersOn(): Promise<boolean> {
  return (await current()) !== null;
}

/**
 * Ask the browser, subscribe, and save the subscription as yours. "blocked"
 * when the person (or the browser) said no; anything else that fails throws.
 */
export async function turnRemindersOn(_userId: string): Promise<'on' | 'blocked'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'blocked';
  const registration = await navigator.serviceWorker.register(WORKER);
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
  });
  const { keys } = subscription.toJSON();
  // A browser that subscribes again keeps its endpoint: add_push_device replaces its row rather than add one.
  await callV1('add_push_device', { endpoint: subscription.endpoint, p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' });
  return 'on';
}

/** Forget this browser's subscription, here and in the database. */
export async function turnRemindersOff(): Promise<void> {
  const subscription = await current();
  if (!subscription) return;
  await callV1('remove_push_device', { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
