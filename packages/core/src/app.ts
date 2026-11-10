import type { Words } from "./words-for";

/**
 * The app's name, its tagline, its sections and its looks: the few things
 * every screen shares that aren't words to translate. The words themselves
 * live in locales/en/*.json.
 */
export const APP_NAME = "Jonz";
export const TAGLINE = "Fair shares of the housework, and a house that keeps score.";

/** A page's title in the browser tab: "Today · Jonz", or just the name on the front door. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

export type SignInProvider = "Google" | "Apple" | "Microsoft";

/** A house's screens, in the order the tabs and the sidebar show them. */
export const SECTIONS = ["today", "week", "wall", "table", "stake", "house"] as const;
export type Section = (typeof SECTIONS)[number];

/** The look: day, night, or whatever this device is set to. */
export const LOOKS = ["light", "dark", "system"] as const;
export type Look = (typeof LOOKS)[number];

/** A look as it was saved on a device, or "system" for anything else (nothing saved, an old value). */
export function lookOf(saved: string | null | undefined): Look {
  return (LOOKS as readonly string[]).includes(saved ?? "") ? (saved as Look) : "system";
}

/** A share, 0 to 1, as a whole percent, never rounded up to 100 or down to 0. */
export function wholePercent(share: number): number {
  const n = Math.round(share * 100);
  return share > 0 && n === 0 ? 1 : share < 1 && n === 100 ? 99 : n;
}

/**
 * What Jonz is doing while it answers, one after another on a timer (the
 * answer comes back whole, so these are what every turn does, never live).
 * The second says "your list" once there is one to look at.
 */
export function thinkingSteps(list: boolean, words: Words): string[] {
  return [
    words("ask.draft.thinkingSteps.read"),
    words("ask.draft.thinkingSteps.look", { list }),
    words("ask.draft.thinkingSteps.weigh"),
    words("ask.draft.thinkingSteps.write"),
  ];
}

/** The change card's line: the house's points a week before and after. */
export function changesMeta(words: Words, before: number, after: number): string {
  return before === after ? words("ask.draft.changesMeta.same", { after }) : words("ask.draft.changesMeta.changed", { before, after });
}

/** Three questions to tap, to show what Jonz can answer. Each is sent as written. */
export function askExamples(words: Words): string[] {
  return [words("ask.draft.examples.who"), words("ask.draft.examples.away"), words("ask.draft.examples.fair")];
}
