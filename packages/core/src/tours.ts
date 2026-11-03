// Tours: short walks round a page that light one thing at a time and say
// what it's for in a sentence or two. A tour is data: a list of steps, each
// naming a spot on screen (a TOUR_SPOTS id the app tags with <TourSpot>).
// Adding a tour is adding one entry to TOURS and tagging any new spots; the
// app's tour player, Help sheet and tests pick it up from here.

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
  /** A few words, in sentence case: what the lit thing is. */
  title: string;
  /** One or two short sentences: what it's for, and why you'd care. */
  body: string;
  /** The page the spot is on, when it isn't the tour's own: the player goes there first. */
  page?: TourPage;
  /** Only when this is true (all of them, given several). */
  when?: TourWhen | readonly TourWhen[];
}

export interface Tour {
  /** The Help sheet's row: "Show me around Today". */
  title: string;
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
    title: "Show me around Today",
    page: "/today",
    steps: [
      {
        spot: "today.nextUp",
        title: "Your next John",
        body: "The one to do next, and when it's due. Tap Mark done once it's done.",
      },
      {
        spot: "today.needsYou",
        title: "Needs you",
        body: "Housemates' ticks and votes wait here for you. A quick look keeps it fair.",
        when: "toCheck",
      },
      {
        spot: "today.rest",
        title: "The rest of your week",
        body: "Everything else that's yours this week, soonest first. Tap one to see it in full.",
        when: "hasJohns",
      },
      {
        spot: "shell.tabs",
        title: "Week and House",
        body: "Week shows the whole house's Johns. House has the Table, the Stake and the settings.",
      },
      {
        spot: "shell.help",
        title: "Help, any time",
        body: "Tap the question mark to take a tour again, or tell us about a problem.",
      },
    ],
  },
  week: {
    title: "Show me around the week",
    page: "/week",
    steps: [
      {
        spot: "week.summary",
        title: "The week at a glance",
        body: "How many Johns are done, being checked, late or still to go. Tap a part to show only those.",
      },
      {
        spot: "week.everyone",
        title: "Everyone's Johns",
        body: "Each housemate's Johns this week, yours first. Tap any John to see it in full.",
      },
      {
        spot: "week.more",
        title: "More",
        body: "Book time away from here. Admins also change the John list and deal again.",
      },
      {
        spot: "week.fairness",
        title: "Is it fair?",
        body: "How even the deal is, in a sentence. Tap it to see everyone's fair share.",
      },
    ],
  },
  house: {
    title: "Show me around House",
    page: "/house",
    steps: [
      {
        spot: "house.table",
        title: "The Table",
        body: "Everyone's effort points this week and this month. Done on time scores, late and missed cost.",
      },
      {
        spot: "house.wall",
        title: "The Wall",
        body: "What's been happening in the house: Johns done, swaps, flags and new people.",
      },
      {
        spot: "house.setup",
        title: "House setup",
        body: "The John list, the house rules and time away. Admins change the list and the rules.",
        when: "phone",
      },
      {
        spot: "shell.help",
        title: "Help, any time",
        body: "Tours again, and a way to report a problem or send an idea. We read every one.",
      },
    ],
  },
  setUp: {
    title: "Setting up your house",
    forWhom: "admin",
    page: "/house/johns",
    steps: [
      {
        spot: "johns.list",
        title: "The John list",
        body: "Everything the house does, how often and how many points. Add, change or take out Johns here.",
      },
      {
        spot: "rules.form",
        title: "House rules",
        page: "/house/rules",
        body: "The stake, what late and missed cost, and who checks a tick. Everyone sees them.",
      },
      {
        spot: "week.more",
        title: "Deal again",
        page: "/week",
        body: "After changing the list, deal again from here so this week follows it.",
      },
      {
        spot: "shell.ask",
        title: "Ask Jonz",
        page: "/today",
        body: "Or tell Jonz in your own words what to change, and tick the changes you want.",
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

/** The steps of a tour you'll see, each with the page it's on. */
export function tourSteps(id: TourId, facts: TourFacts): (TourStep & { page: TourPage })[] {
  const tour: Tour = TOURS[id];
  return tour.steps.filter((s) => stepShows(s, facts)).map((s) => ({ ...s, page: s.page ?? tour.page }));
}

/** The tours someone can take, in the Help sheet's order: everyone's, then an admin's. */
export function toursFor(facts: TourFacts): TourId[] {
  return TOUR_IDS.filter((id) => {
    const tour: Tour = TOURS[id];
    return (tour.forWhom !== "admin" || facts.admin) && tourSteps(id, facts).length > 0;
  });
}

/** The tour for the page you're on (Today, Week or House), for the Help sheet's first button. */
export function tourForPage(path: string): TourId | null {
  const page = path.replace(/\/+$/, "") || "/";
  return page === "/today" || page === "/" ? "today" : page === "/week" ? "week" : page === "/house" ? "house" : null;
}

/** "2 of 4". */
export function stepCount(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

/** How a step count reads in the Help sheet: "4 steps, about a minute". */
export function tourLength(steps: number): string {
  return steps === 1 ? "1 step" : `${steps} steps, about a minute`;
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

/** The words around tours: the Help sheet, the offer on Today and the tour's card. */
export const TOUR_COPY = {
  help: "Help",
  /** The title bar's question mark, to a screen reader. */
  open: "Help",
  guides: "Guides",
  forAdmins: "For admins",
  somethingWrong: "Something wrong?",
  next: "Next",
  done: "Done",
  back: "Back",
  skip: "Skip",
  /** The card, to a screen reader: "Tour, step 2 of 4". */
  stepSpoken: (index: number, total: number) => `Tour, step ${index + 1} of ${total}`,
  seen: "Seen",
  offerTitle: "New to Jonz?",
  offerBody: "Take a one-minute look around Today.",
  offerYes: "Show me",
  offerNo: "Not now",
  guidesRow: "Tours and guides",
  guidesMeta: "A minute each, any time",
} as const;

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
