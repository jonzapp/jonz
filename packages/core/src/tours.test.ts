import { describe, expect, it } from "vitest";

import {
  markTourSeen,
  placeTourCard,
  offersTour,
  readToursSaved,
  stepCount,
  TOUR_BODY_MAX,
  TOUR_IDS,
  TOUR_MAX_STEPS,
  TOUR_SPOTS,
  TOUR_TITLE_MAX,
  tourForPage,
  tourLength,
  TOURS,
  toursFor,
  tourSteps,
  type Tour,
  type TourFacts,
} from "./tours";

const everyone: TourFacts = { admin: false, wide: false, toCheck: false, hasJohns: true };
const all: TourFacts[] = [false, true].flatMap((admin) =>
  [false, true].flatMap((wide) =>
    [false, true].flatMap((toCheck) => [false, true].map((hasJohns) => ({ admin, wide, toCheck, hasJohns }))),
  ),
);

// A fixed pretend clock: these never read the real time.
const NOW = new Date("2027-02-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe("every tour", () => {
  for (const id of TOUR_IDS) {
    const tour: Tour = TOURS[id];
    it(`${id}: short, and only real spots`, () => {
      expect(tour.steps.length).toBeGreaterThan(0);
      expect(tour.steps.length).toBeLessThanOrEqual(TOUR_MAX_STEPS);
      for (const step of tour.steps) {
        expect(TOUR_SPOTS).toContain(step.spot);
        expect(step.title.length).toBeLessThanOrEqual(TOUR_TITLE_MAX);
        expect(step.body.length).toBeLessThanOrEqual(TOUR_BODY_MAX);
        // Plain words: a full stop at the end, no " · " joins, no "rota".
        expect(step.body).toMatch(/[.?]$/);
        expect(step.body).not.toContain(" · ");
        expect(step.body.toLowerCase()).not.toContain("rota");
        // Sentence case: only the first letter (and names) in capitals.
        expect(step.title[0]).toBe(step.title[0].toUpperCase());
      }
    });
    it(`${id}: no spot twice in a row, and something to show whoever can take it`, () => {
      for (const facts of all) {
        const steps = tourSteps(id, facts);
        steps.slice(1).forEach((s, i) => expect(s.spot === steps[i].spot && s.page === steps[i].page).toBe(false));
        if (tour.forWhom !== "admin" || facts.admin) expect(steps.length).toBeGreaterThanOrEqual(2);
      }
    });
  }
});

describe("tourSteps", () => {
  it("leaves out the steps whose when doesn't hold, and fills in each step's page", () => {
    const quiet = tourSteps("today", { ...everyone, toCheck: false, hasJohns: false }).map((s) => s.spot);
    expect(quiet).toEqual(["today.nextUp", "shell.tabs", "shell.help"]);
    const busy = tourSteps("today", { ...everyone, toCheck: true }).map((s) => s.spot);
    expect(busy).toEqual(["today.nextUp", "today.needsYou", "today.rest", "shell.tabs", "shell.help"]);
    expect(tourSteps("today", everyone).every((s) => s.page === "/today")).toBe(true);
  });

  it("keeps House's setup step to a phone, where setup is on the page", () => {
    expect(tourSteps("house", everyone).map((s) => s.spot)).toContain("house.setup");
    expect(tourSteps("house", { ...everyone, wide: true }).map((s) => s.spot)).not.toContain("house.setup");
  });

  it("walks the admin's tour across pages", () => {
    expect(tourSteps("setUp", { ...everyone, admin: true }).map((s) => s.page)).toEqual([
      "/house/johns",
      "/house/rules",
      "/week",
      "/today",
    ]);
  });
});

describe("toursFor", () => {
  it("lists the admin's tour for admins only", () => {
    expect(toursFor(everyone)).toEqual(["today", "week", "house"]);
    expect(toursFor({ ...everyone, admin: true })).toEqual(["today", "week", "house", "setUp"]);
  });
});

describe("tourForPage", () => {
  it("finds the tab's tour, and none for a page pushed under it", () => {
    expect(tourForPage("/today")).toBe("today");
    expect(tourForPage("/")).toBe("today");
    expect(tourForPage("/week/")).toBe("week");
    expect(tourForPage("/house")).toBe("house");
    expect(tourForPage("/house/johns")).toBeNull();
  });
});

describe("words", () => {
  it("counts steps", () => {
    expect(stepCount(1, 4)).toBe("2 of 4");
    expect(tourLength(4)).toBe("4 steps, about a minute");
    expect(tourLength(1)).toBe("1 step");
  });
});

describe("what's saved", () => {
  it("reads only what it knows", () => {
    expect(readToursSaved(null)).toEqual({ seen: [], offerDone: false });
    expect(readToursSaved({ name: "Sam" })).toEqual({ seen: [], offerDone: false });
    expect(readToursSaved({ tours: { seen: ["today", "gone", 3, "today"], offerDone: true } })).toEqual({
      seen: ["today"],
      offerDone: true,
    });
  });

  it("marks a tour seen once, and the offer done", () => {
    const once = markTourSeen({ seen: [], offerDone: false }, "week");
    expect(once).toEqual({ seen: ["week"], offerDone: true });
    expect(markTourSeen(once, "week")).toEqual(once);
  });
});

describe("offersTour", () => {
  const fresh = { seen: [], offerDone: false };
  it("offers Today's tour to someone new, once", () => {
    expect(offersTour(fresh, daysAgo(0), NOW)).toBe(true);
    expect(offersTour(fresh, daysAgo(13), NOW)).toBe(true);
    expect(offersTour(fresh, daysAgo(14), NOW)).toBe(false);
    expect(offersTour({ seen: [], offerDone: true }, daysAgo(1), NOW)).toBe(false);
    expect(offersTour({ seen: ["today"], offerDone: false }, daysAgo(1), NOW)).toBe(false);
    expect(offersTour(fresh, null, NOW)).toBe(false);
  });
});

describe("placeTourCard", () => {
  const phone = { width: 390, height: 844 };
  const laptop = { width: 1440, height: 900 };
  const card = { width: 360, height: 160 };
  const opts = { gap: 12, edge: 16, wide: false };

  it("puts the card under the spot on a phone, across the window", () => {
    expect(placeTourCard({ x: 16, y: 100, width: 358, height: 200 }, phone, card, opts)).toEqual({ x: 16, y: 312, width: 358 });
  });

  it("puts it over the spot when there's no room under", () => {
    expect(placeTourCard({ x: 0, y: 760, width: 390, height: 70 }, phone, card, opts)).toEqual({ x: 16, y: 588, width: 358 });
  });

  it("sits at the foot over a spot taller than the window", () => {
    expect(placeTourCard({ x: 16, y: 40, width: 358, height: 800 }, phone, card, opts)).toEqual({ x: 16, y: 668, width: 358 });
  });

  it("goes beside the spot on a laptop, right first, then left", () => {
    const wide = { ...opts, wide: true };
    expect(placeTourCard({ x: 300, y: 120, width: 600, height: 300 }, laptop, card, wide)).toEqual({ x: 912, y: 120, width: 360 });
    expect(placeTourCard({ x: 900, y: 120, width: 500, height: 300 }, laptop, card, wide)).toEqual({ x: 528, y: 120, width: 360 });
    // Too wide for either side: under it, lined up with it.
    expect(placeTourCard({ x: 240, y: 60, width: 1190, height: 300 }, laptop, card, wide)).toEqual({ x: 240, y: 372, width: 360 });
  });
});
