// Tours: short walks round a page that light one thing at a time and say
// what it's for in a sentence or two. A tour is data: a list of steps, each
// naming a spot on screen (a TOUR_SPOTS id the app tags with <TourSpot>).
// Adding a tour is adding one entry to TOURS and tagging any new spots; the
// app's tour player, Help sheet and tests pick it up from here.

import type { WordId, Words } from "./words-for";

/**
 * Every spot a tour can light, one id per piece of the app. The app tags
 * each with `<TourSpot id>`; a tour naming anything else doesn't compile.
 * Name them `place.thing`.
 */
export const TOUR_SPOTS = [
  "today.nextUp",
  "today.needsYou",
  "today.rest",
  "shell.tabs",
  "shell.help",
  "shell.ask",
  "week.summary",
  "week.everyone",
  "week.more",
  "week.fairness",
  "house.table",
  "house.wall",
  "house.setup",
  "johns.list",
  "rules.form",
] as const;
export type TourSpotId = (typeof TOUR_SPOTS)[number];

/** Where a page lives, for a tour or a step that starts on it. */
export type TourPage = "/today" | "/week" | "/house" | "/house/johns" | "/house/rules";

/**
 * What a step can depend on, read when the tour starts: a step whose `when`
 * isn't true is left out, so "2 of 4" counts only the steps you'll see.
 * `wide` is a laptop's layout (the rail, and House's pages listed beside it).
 */
export interface TourFacts {
  admin: boolean;
  wide: boolean;
  /** Something waits for you under Needs you (a tick to check, a vote). */
  toCheck: boolean;
  /** You have Johns this week, so Today lists the rest of them. */
  hasJohns: boolean;
}
export type TourWhen = "admin" | "phone" | "laptop" | "toCheck" | "hasJohns";

export interface TourStep {
  spot: TourSpotId;
  /** The page the spot is on, when it isn't the tour's own: the player goes there first. */
  page?: TourPage;
  /** Only when this is true (all of them, given several). */
  when?: TourWhen | readonly TourWhen[];
}

/**
 * A tour's words are in door.json: door.tour.<tour>.name (the Help sheet's
 * row under Show me around, "Today"), .title (in full, "Show me around
 * Today"), and per step door.tour.<tour>.<spot>.title (a few words, in
 * sentence case: what the lit thing is) and .body (one or two short
 * sentences: what it's for, and why you'd care).
 */
export interface Tour {
  /** Who it's for, when not everyone: an admin's tour is listed for admins only. */
  forWhom?: "admin";
  /** Where it starts. */
  page: TourPage;
  steps: readonly TourStep[];
}

/** No tour is longer than this: past four or five steps, most people stop reading. */
export const TOUR_MAX_STEPS = 5;
/** A step's title and body stay short enough to read at a glance. */
export const TOUR_TITLE_MAX = 32;
export const TOUR_BODY_MAX = 140;

export const TOURS = {
  today: {
    page: "/today",
    steps: [
      {
        spot: "today.nextUp",
      },
      {
        spot: "today.needsYou",
        when: "toCheck",
      },
      {
        spot: "today.rest",
        when: "hasJohns",
      },
      {
        spot: "shell.tabs",
      },
      {
        spot: "shell.help",
      },
    ],
  },
  week: {
    page: "/week",
    steps: [
      {
        spot: "week.summary",
      },
      {
        spot: "week.everyone",
      },
      {
        spot: "week.more",
      },
      {
        spot: "week.fairness",
      },
    ],
  },
  house: {
    page: "/house",
    steps: [
      {
        spot: "house.table",
      },
      {
        spot: "house.wall",
      },
      {
        spot: "house.setup",
        when: "phone",
      },
      {
        spot: "shell.help",
      },
    ],
  },
  setUp: {
    forWhom: "admin",
    page: "/house/johns",
    steps: [
      {
        spot: "johns.list",
      },
      {
        spot: "rules.form",
        page: "/house/rules",
      },
      {
        spot: "week.more",
        page: "/week",
      },
      {
        spot: "shell.ask",
        page: "/today",
      },
    ],
  },
} as const satisfies Record<string, Tour>;

export type TourId = keyof typeof TOURS;
export const TOUR_IDS = Object.keys(TOURS) as TourId[];

/** Whether a step's `when` holds for these facts. */
export function stepShows(step: TourStep, facts: TourFacts): boolean {
  const when = step.when;
  const whens: readonly TourWhen[] = when === undefined ? [] : typeof when === "string" ? [when] : when;
  return whens.every((w) =>
    w === "admin" ? facts.admin : w === "phone" ? !facts.wide : w === "laptop" ? facts.wide : w === "toCheck" ? facts.toCheck : facts.hasJohns,
  );
}

/** A step as it reads: the page it's on, and its title and body from the words. */
export interface TourStepSaid extends TourStep {
  page: TourPage;
  title: string;
  body: string;
}

/** The steps of a tour you'll see, each with the page it's on and its words. */
export function tourSteps(id: TourId, facts: TourFacts, words: Words): TourStepSaid[] {
  const tour: Tour = TOURS[id];
  return tour.steps
    .filter((s) => stepShows(s, facts))
    .map((s) => ({ ...s, page: s.page ?? tour.page, ...tourStepWords(id, s, words) }));
}

/** A step's title and body. */
export function tourStepWords(id: TourId, step: TourStep, words: Words): { title: string; body: string } {
  return {
    title: words(`door.tour.${id}.${step.spot}.title` as WordId),
    body: words(`door.tour.${id}.${step.spot}.body` as WordId),
  };
}

/** What a tour shows you round, in a few words ("Today"). */
export function tourName(id: TourId, words: Words): string {
  return words(`door.tour.${id}.name`);
}

/** The tours someone can take, in the Help sheet's order: everyone's, then an admin's. */
export function toursFor(facts: TourFacts): TourId[] {
  return TOUR_IDS.filter((id) => {
    const tour: Tour = TOURS[id];
    return (tour.forWhom !== "admin" || facts.admin) && tour.steps.some((s) => stepShows(s, facts));
  });
}

/** The tour for the page you're on (Today, Week or House), for the Help sheet's first button. */
export function tourForPage(path: string): TourId | null {
  const page = path.replace(/\/+$/, "") || "/";
  return page === "/today" || page === "/" ? "today" : page === "/week" ? "week" : page === "/house" ? "house" : null;
}

/** "2 of 4". */
export function stepCount(index: number, total: number, words: Words): string {
  return words("door.tour.stepCount", { step: index + 1, total });
}

/** How a step count reads in the Help sheet: "4 steps, about a minute". */
export function tourLength(steps: number, words: Words): string {
  return words("door.tour.length", { steps });
}

/**
 * What's saved on your account about tours, under `tours` in its metadata:
 * the tours you've finished or skipped (`seen`), and whether you've turned
 * down the first offer (`offerDone`).
 */
export interface ToursSaved {
  seen: TourId[];
  offerDone: boolean;
}

/** Reads what's saved, ignoring anything it doesn't know (an old app, a tour since taken out). */
export function readToursSaved(meta: unknown): ToursSaved {
  const tours = meta && typeof meta === "object" ? (meta as { tours?: unknown }).tours : undefined;
  const saved = tours && typeof tours === "object" ? (tours as { seen?: unknown; offerDone?: unknown }) : {};
  const seen = Array.isArray(saved.seen) ? saved.seen.filter((s): s is TourId => typeof s === "string" && s in TOURS) : [];
  return { seen: [...new Set(seen)], offerDone: saved.offerDone === true };
}

/** What's saved once a tour is finished or skipped: it's marked seen, and the first offer is done with. */
export function markTourSeen(saved: ToursSaved, id: TourId): ToursSaved {
  return { seen: saved.seen.includes(id) ? saved.seen : [...saved.seen, id], offerDone: true };
}

/** For this many days from signing up, Today offers its tour once. */
export const TOUR_OFFER_DAYS = 14;

/**
 * Whether Today offers its tour: once, to someone new (signed up in the last
 * TOUR_OFFER_DAYS), who hasn't taken it or said Not now. It never starts by
 * itself.
 */
export function offersTour(saved: ToursSaved, signedUpAt: Date | null, now: Date): boolean {
  if (saved.offerDone || saved.seen.includes("today") || !signedUpAt) return false;
  return now.getTime() - signedUpAt.getTime() < TOUR_OFFER_DAYS * 24 * 60 * 60 * 1000;
}

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the tour's card goes, in window points: beside the lit spot on a
 * laptop when there's room to its right or left, otherwise under it, or over
 * it when there's no room under, never covering it if it can help it. On a
 * phone the card spans the window inside the gutters. `card` is the card's
 * height as last drawn (a first guess before it has been).
 */
export function placeTourCard(
  spot: TourRect,
  window: { width: number; height: number },
  card: { width: number; height: number },
  opts: { gap: number; edge: number; wide: boolean },
): { x: number; y: number; width: number } {
  const { gap, edge, wide } = opts;
  const width = Math.min(card.width, window.width - 2 * edge);
  const clampY = (y: number) => Math.max(edge, Math.min(y, window.height - card.height - edge));
  const clampX = (x: number) => Math.max(edge, Math.min(x, window.width - width - edge));
  if (wide) {
    const right = spot.x + spot.width + gap;
    if (right + width <= window.width - edge) return { x: right, y: clampY(spot.y), width };
    const left = spot.x - gap - width;
    if (left >= edge) return { x: left, y: clampY(spot.y), width };
  }
  const x = wide ? clampX(spot.x) : edge;
  const below = spot.y + spot.height + gap;
  if (below + card.height <= window.height - edge) return { x, y: below, width };
  const above = spot.y - gap - card.height;
  if (above >= edge) return { x, y: above, width };
  // A spot taller than the room: the card sits at the window's foot, over its end.
  return { x, y: window.height - card.height - edge, width };
}
