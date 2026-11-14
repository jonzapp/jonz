import { DELETE_PATH } from "./account-deletion";
import { APPROVE_PATH, CONSENT_PATH_WITH_ID } from "./approvals";
import { safeNext, signInPath, signInReason } from "./auth-paths";
import { CURRENCIES, type Currency, DEFAULT_RULES, FAMILY_POCKET_CAP, type HouseKind, type IsoDow } from "./domain";
import { moneyInput } from "./money";
import { normaliseJoinCode } from "./schemas";
import type { Words } from "./words-for";
import { zonePlace } from "./zones";
import { weekdayName } from "./format";

// Before you have a house: where the front door's choice leads after
// sign-in, reading an invite link or code, and the new house's defaults line.

/** Where the front door's two buttons land once you've signed in. */
export const DOOR = { start: "/house/new", startFamily: "/house/new?kind=family", invite: "/welcome" } as const;

/** A join link's path as it was given; the join page itself says when its code is bad. */
const JOIN_PATH = /^\/join\/[^/?#]+$/;

/**
 * Where signing in leads, when sign-in was carrying somewhere (`next`): for
 * someone with no house yet, the front door's choice (naming the house, or
 * pasting the invite) or a join link; for anyone, jonz.app/delete or a
 * connected app's request to approve or its sign-in to allow. Undefined
 * for anything else, safe or not, so the root layout's own rule decides and
 * no `next` can send anyone round in circles.
 */
export function afterSignIn(next: string | null | undefined): string | undefined {
  const target = safeNext(next);
  if (target === DOOR.start || target === DOOR.startFamily || target === DOOR.invite || target === DELETE_PATH || JOIN_PATH.test(target) || APPROVE_PATH.test(target) || CONSENT_PATH_WITH_ID.test(target)) return target;
  return undefined;
}

/**
 * Where the root layout's guard sends someone signed out who opened a
 * screen for the signed in: sign-in, carrying that screen when sign-in may
 * lead on to it (starting a house, or the invite), so a link opened cold
 * keeps its choice as the front door's buttons do. Anything else is plain
 * sign-in.
 */
export function signedOutTo(pathname: string): string {
  return signInPath(afterSignIn(pathname));
}

/**
 * Where Google sends the web back to. A join link, a request to approve, or
 * a connected app's sign-in comes back to itself: it's open to anyone, so the link survives. Anything else comes back to sign-in,
 * still carrying where it leads, so a refusal is said where sign-in was tried
 * and the front door's choice isn't lost on the way.
 */
export function googleReturn(next: string | null | undefined): string {
  const target = afterSignIn(next);
  return target !== undefined && (JOIN_PATH.test(target) || APPROVE_PATH.test(target) || CONSENT_PATH_WITH_ID.test(target)) ? target : signInPath(target);
}

/**
 * The line under "Sign in": with Apple on offer, that the house stays with
 * the account you choose (Hide My Email makes a new one); otherwise the front
 * door's choice when it came with one, or what the door is shut on.
 */
export function signInLine(next: string | null | undefined, words: Words, apple = false): string {
  if (apple) return words('door.signIn.eitherAccount');
  const target = afterSignIn(next);
  if (target === DOOR.start || target === DOOR.startFamily) return words('door.welcome.startReason');
  if (target === DOOR.invite) return words('door.welcome.inviteReason');
  return signInReason(next);
}

/**
 * The join code in whatever was pasted: a whole invite link (or the message
 * it came in, punctuation and all), or the code on its own however it's
 * spelt. Null when there is none, including a link whose code can't be one.
 */
export function inviteCode(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  // A code is letters, figures and the dashes people type; whatever follows ends it.
  const link = /join\/([a-z0-9-]*)/i.exec(text);
  return normaliseJoinCode(link ? link[1] : text.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""));
}

/**
 * A new house's defaults, before anything is changed, as the parts of one
 * Meta line: "GBP 20 a month each", "weeks start Monday", "Europe/London".
 * The stake is the database's default, in the currency's code so a dollar is
 * never mistaken for another; the most worth seeing comes first, as the line
 * truncates from its end.
 */
export function houseDefaults({
  currency,
  weekStarts,
  timezone,
  stakeMinor = DEFAULT_RULES.stakeMinor,
  kind = "housemates",
  words,
}: {
  currency: Currency;
  weekStarts: IsoDow;
  timezone: string;
  stakeMinor?: number;
  /** A family has no stake: its line starts with pocket money instead. */
  kind?: HouseKind;
  words: Words;
}): string[] {
  return [
    kind === "family"
      ? words('house.pocket.defaults', { cap: `${currency} ${moneyInput(FAMILY_POCKET_CAP)}` })
      : words('door.welcome.stakeEach', { amount: `${currency} ${moneyInput(stakeMinor)}` }),
    words('door.welcome.weekStarts', { day: weekdayName(weekStarts, words) }),
    zonePlace(timezone, words),
  ];
}

/** What Change offers for the currency: each code alone, as the defaults line says it. */
export const CURRENCY_CHOICES: readonly { value: Currency; label: string }[] = CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

/** What Change offers for the first day of the week: the short name to see, the whole day to hear. */
export function dayChoices(words: Words): { value: IsoDow; label: string; spoken: string }[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((day) => ({ value: day, label: weekdayName(day, words, "short"), spoken: weekdayName(day, words) }));
}
