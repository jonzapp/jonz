import { Platform } from 'react-native';

// A page left open across a deploy. The web build splits each screen into
// its own bundle, named by its contents, and fetches it the first time the
// screen opens. Each deploy replaces them all, so a page opened before one
// (an iPhone keeps Jonz open for days) asks for a screen's bundle that's
// gone: "Loading module … failed", and the screen can't draw (Week, 12 Nov
// 2026). Loading the page again gets the new build, which has them all.

/** Whether this error is a screen's bundle that's gone, as each browser and loader says so. */
export function isNewBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return [
    /^Loading module .* failed/, // Expo's own loader (Metro on the web)
    /^Loading chunk .* failed/,
    /Failed to fetch dynamically imported module/, // Chrome
    /Importing a module script failed/, // Safari
    /error loading dynamically imported module/, // Firefox
  ].some((said) => said.test(error.message));
}

const KEY = 'jonz.reloadedForBuild';
/** A reload this soon after the last one didn't help: show the error screen rather than reload for ever. */
const ONCE_WITHIN = 60_000;

interface Page {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  reload: () => void;
  now: number;
}

function thisPage(): Page | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  let storage: Page['storage'] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // A browser that keeps nothing: still reload, at worst once more than needed.
  }
  return { storage, reload: () => window.location.reload(), now: Date.now() };
}

/**
 * Reloads the page onto the new build if the error says a screen's bundle is
 * gone, once: if the fresh page fails the same way straight after, it
 * doesn't again, and the error screen shows. True if it reloaded. Only on
 * the web: a phone app carries every screen with it.
 */
export function reloadOntoNewBuild(error: unknown, page: Page | null = thisPage()): boolean {
  if (!page || !isNewBuildError(error)) return false;
  let last = Number.NaN;
  try {
    last = Number(page.storage?.getItem(KEY));
  } catch {
    // Unreadable: as if it never reloaded.
  }
  if (Number.isFinite(last) && last > 0 && page.now - last < ONCE_WITHIN) return false;
  try {
    page.storage?.setItem(KEY, String(page.now));
  } catch {
    // Unkept: it reloads anyway.
  }
  page.reload();
  return true;
}
