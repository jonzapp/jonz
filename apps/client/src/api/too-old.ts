import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

// The version gate's other half (docs/specs/api.md, C6). The API answers 426
// to a phone build older than its platform's minimum; the first such answer
// turns the whole app to "Update Jonz" until it's updated. The web always
// runs the latest build, so it never sees this.

let tooOld = false;
const listeners = new Set<() => void>();

/** The API said this build is too old: every screen gives way to Update Jonz. */
export function markTooOld(): void {
  if (tooOld) return;
  tooOld = true;
  for (const listener of listeners) listener();
}

/** Whether the API has said this build is too old. */
export function isTooOld(): boolean {
  return tooOld;
}

/** For tests: back to a build nobody has refused. */
export function resetTooOld(): void {
  tooOld = false;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether to show Update Jonz instead of the app. */
export function useTooOld(): boolean {
  return useSyncExternalStore(subscribe, isTooOld, isTooOld);
}

/**
 * Where this phone gets the new build: Google Play by the app's package, the
 * App Store by its id once it has one (`extra.appStoreId` in app.json). Null
 * where there's no store to send you to.
 */
export function storeUrl(): string | null {
  const config = Constants.expoConfig;
  if (Platform.OS === 'android') {
    const id = config?.android?.package;
    return id ? `https://play.google.com/store/apps/details?id=${id}` : null;
  }
  if (Platform.OS === 'ios') {
    const id = (config?.extra as { appStoreId?: unknown } | undefined)?.appStoreId;
    return typeof id === 'string' && /^\d+$/.test(id) ? `https://apps.apple.com/app/id${id}` : null;
  }
  return null;
}
