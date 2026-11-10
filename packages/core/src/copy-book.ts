import {
  ADMINS_COPY,
  HOUSE_LOWER_COPY,
  HOUSE_PAGE_COPY,
  NEXT_UP_COPY,
  NOTIFY_COPY,
  ON_CALL_COPY,
  PERSON_COPY,
  RECORD_COPY,
  RULES_COPY,
  SETUP_COPY,
  SHARE_COPY,
  SHELL_COPY,
  WALL_FEED_COPY,
} from "./copy";
import type { HouseKind } from "./domain";
import { HISTORY_COPY } from "./history";

/**
 * The copy book: every section of the app's words whose lines change with
 * the kind of house. The housemates' book is the copy as written in
 * copy.ts; the family book (FAMILY_BOOK) holds only the lines a family
 * reads differently, each a whole sentence of its own, and `copyFor(kind)`
 * lays one over the other.
 *
 * The rule (docs/style/words.md, "Families"): a line that names housemates
 * or admins either says it so it suits both kinds of house ("someone who
 * left", "someone else can cover it"), or lives in a section here with a
 * family line beside it. Screens read those lines through `copyFor(kind)`
 * (the client's `useCopy()`), never straight from the section;
 * family-words.test.ts checks both halves.
 */
export const HOUSEMATES_BOOK = {
  NEXT_UP: NEXT_UP_COPY,
  SHELL: SHELL_COPY,
  HOUSE_PAGE: HOUSE_PAGE_COPY,
  ADMINS: ADMINS_COPY,
  PERSON: PERSON_COPY,
  HOUSE_LOWER: HOUSE_LOWER_COPY,
  SETUP: SETUP_COPY,
  ON_CALL: ON_CALL_COPY,
  RULES: RULES_COPY,
  RECORD: RECORD_COPY,
  WALL_FEED: WALL_FEED_COPY,
  NOTIFY: NOTIFY_COPY,
  HISTORY: HISTORY_COPY,
  SHARE: SHARE_COPY,
};

/** Which copy.ts (or history.ts) constant each section of the book is, for the checks. */
export const BOOK_SOURCES: Record<keyof typeof HOUSEMATES_BOOK, string> = {
  NEXT_UP: "NEXT_UP_COPY",
  SHELL: "SHELL_COPY",
  HOUSE_PAGE: "HOUSE_PAGE_COPY",
  ADMINS: "ADMINS_COPY",
  PERSON: "PERSON_COPY",
  HOUSE_LOWER: "HOUSE_LOWER_COPY",
  SETUP: "SETUP_COPY",
  ON_CALL: "ON_CALL_COPY",
  RULES: "RULES_COPY",
  RECORD: "RECORD_COPY",
  WALL_FEED: "WALL_FEED_COPY",
  NOTIFY: "NOTIFY_COPY",
  HISTORY: "HISTORY_COPY",
  SHARE: "SHARE_COPY",
};

/** A line as any book may say it: the same shape, any words. */
type Loose<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Loose<R>
    : T extends readonly unknown[]
      ? T
      : T extends object
        ? { [K in keyof T]: Loose<T[K]> }
        : T;

/** Some lines of a section, each in the section's own shape (a nested group may give only some of its lines too). */
type Some<T> = { [K in keyof T]?: T[K] extends string | ((...args: never[]) => unknown) | readonly unknown[] ? T[K] : Some<T[K]> };

export type CopyBook = { [S in keyof typeof HOUSEMATES_BOOK]: Loose<(typeof HOUSEMATES_BOOK)[S]> };
type FamilyLines = { [S in keyof CopyBook]?: Some<CopyBook[S]> };

const parentOrParents = (n: number) => (n === 1 ? "parent" : "parents");

/** What a family reads differently. Only these lines: everything else is the housemates' line. */
export const FAMILY_BOOK = {
  NEXT_UP: {
    invite: "Invite your family",
    housemates: (count: number) => (count <= 1 ? "Just you so far" : `${count} in the family so far`),
    anAdmin: "A parent",
  },
  SHELL: {
    housemates: (count: number) => `${count} in the family`,
  },
  HOUSE_PAGE: {
    invite: "Invite your family",
    housemates: () => "in the family",
  },
  ADMINS: {
    title: "Parents",
    note: "Parents change the list, the rules and who’s in, and fix mistakes. What they change is posted on the Wall.",
    add: "Add a parent",
    addTitle: "Add a parent",
    addBody: "They can change the list and the rules, and fix anyone’s mistakes.",
    everyoneIs: "Everyone here is a parent already.",
    make: (name: string) => `Make ${name} a parent`,
    removeLabel: (name: string) => `Remove ${name} as a parent`,
    onlyAdmin: "The only parent can’t step down. Leaving hands the family over.",
  },
  PERSON: {
    sub: (admin: boolean, you: boolean) => (you ? `You, ${admin ? "parent" : "kid"}` : admin ? "Parent" : "Kid"),
    admin: "Parent",
    makeAdmin: "Make a parent",
    makeAdminMeta: "Can change the rules and the Johns",
    makeHousemate: "Make a kid",
    makeHousemateMeta: "Stops being a parent",
  },
  HOUSE_LOWER: {
    youIn: (house: string, admin: boolean) => `${house}, ${admin ? "parent" : "kid"}`,
    lastAdmin: "You’re the only parent. Pick who looks after the family when you go.",
    handOver: (name: string) => `Make ${name} a parent and leave`,
  },
  SETUP: {
    johnsComingAdmin: "A parent will add the Johns.",
    canChange: (names: string, count: number) => `${names} (${parentOrParents(count)}) can change these.`,
    adminsNobody: "Only parents can change these.",
  },
  ON_CALL: {
    onlyRaiser: (name: string) => `${name} raised this flag, so only ${name} or a parent can take it down.`,
    onlyAdmin: "Jonz opened this again after a miss, so only a parent can take it down.",
  },
  RULES: {
    adminsOnly: "Only parents can change the house rules.",
  },
  RECORD: {
    changed: "Changed by a parent",
  },
  WALL_FEED: {
    joined: (who: string) => `${who} joined the family`,
    newHousemate: "New in the family",
    adminFix: "A parent’s fix",
  },
  NOTIFY: {
    kinds: { checks: "Ticks to OK" },
    kindHints: { checks: "A kid’s tick waiting for your OK, or the answer to yours." },
  },
  HISTORY: {
    madeAdmin: (name: string) => `${name} is a parent now.`,
    madeHousemate: (name: string) => `${name} is a kid now.`,
  },
  SHARE: {
    housemates: (n: number) => `${n} in the family`,
    joinPlate: () => "Join the family on Jonz.",
  },
} satisfies FamilyLines;

function isGroup(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function over<T>(base: T, top: unknown): T {
  if (!isGroup(base) || !isGroup(top)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(top)) out[k] = isGroup(v) && isGroup(out[k]) ? over(out[k], v) : v;
  return out as T;
}

const BOOKS: Record<HouseKind, CopyBook> = {
  housemates: HOUSEMATES_BOOK,
  family: Object.fromEntries(
    Object.entries(HOUSEMATES_BOOK).map(([s, lines]) => [s, over(lines, (FAMILY_BOOK as FamilyLines)[s as keyof CopyBook])]),
  ) as CopyBook,
};

/** The words for this kind of house: the housemates' book, or the family's lines laid over it. */
export function copyFor(kind: HouseKind): CopyBook {
  return BOOKS[kind];
}
