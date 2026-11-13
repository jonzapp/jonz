import type { ReportDetails } from '@app/core';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// "Send the details that help": what a report carries when its sender
// leaves the box ticked. Nothing here leaves the phone until they press
// Send, and each line is short and readable, shown to them first: the last
// pages they were on, the app or browser, their house, and the last thing
// that went wrong. No ids, no tokens, nothing from other people.

const TRAIL = 3;
let trail: string[] = [];
let lastError: string | null = null;

/** A path as a page's name: "/house/history" is "House › History"; ids are left out. */
export function pageName(path: string): string {
  const parts = path
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    // An id or a join code says nothing to a reader and is nobody else's business.
    .filter((part) => !/^[0-9a-f-]{16,}$/i.test(part) && !/^[A-Z0-9]{8}$/.test(part) && !part.startsWith('['));
  if (parts.length === 0) return 'Front door';
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ')).join(' › ');
}

/** The root layout tells this each page as it's shown. */
export function notePage(path: string) {
  const name = pageName(path);
  if (trail[trail.length - 1] === name) return;
  trail = [...trail, name].slice(-TRAIL);
}

/** Whatever last went wrong, in the words the app showed. */
export function noteError(message: string) {
  lastError = message.slice(0, 200);
}

/** "Today, then House": the pages before this one, oldest first. */
export function pagesLine(pages: readonly string[] = trail): string | undefined {
  if (pages.length === 0) return undefined;
  return pages.slice(-2).join(', then ');
}

/** "Jonz on the web, Safari 18, iPhone", or "Jonz 1.2.0 for iPhone, iOS 26.1". */
function appLine(): string {
  if (Platform.OS === 'web') return webAppLine(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const version = Constants.expoConfig?.version;
  const device = Platform.OS === 'ios' ? 'iPhone' : 'Android';
  const system = Platform.OS === 'ios' ? `iOS ${Platform.Version}` : `Android ${Platform.Version}`;
  return `Jonz${version ? ` ${version}` : ''} for ${device}, ${system}`;
}

/** The web's line, from the browser's own description of itself. */
export function webAppLine(ua: string): string {
  const major = (re: RegExp) => ua.match(re)?.[1];
  const browser =
    (major(/Edg(?:A|iOS)?\/(\d+)/) && `Edge ${major(/Edg(?:A|iOS)?\/(\d+)/)}`) ||
    (major(/(?:Firefox|FxiOS)\/(\d+)/) && `Firefox ${major(/(?:Firefox|FxiOS)\/(\d+)/)}`) ||
    (major(/(?:Chrome|CriOS)\/(\d+)/) && `Chrome ${major(/(?:Chrome|CriOS)\/(\d+)/)}`) ||
    (major(/Version\/(\d+).*Safari/) && `Safari ${major(/Version\/(\d+).*Safari/)}`) ||
    'a browser';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return ['Jonz on the web', browser, device].filter(Boolean).join(', ');
}

/** What a report would carry now, for the sender to read before they send it. */
export function reportDetails(house: string | null): ReportDetails {
  return {
    pages: pagesLine(),
    app: appLine(),
    ...(house ? { house } : {}),
    ...(lastError ? { error: lastError } : {}),
  };
}

/** For tests: forget the pages and the error. */
export function forgetDetails() {
  trail = [];
  lastError = null;
}
