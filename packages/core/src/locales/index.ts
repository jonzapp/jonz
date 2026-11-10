import common from "./en/common.json";
import email from "./en/email.json";
import house from "./en/house.json";
import john from "./en/john.json";
import people from "./en/people.json";
import today from "./en/today.json";
import wall from "./en/wall.json";
import week from "./en/week.json";

/**
 * The app's words in English, one file per part of the app (locales/en/),
 * each line an ICU message: `{kind, select, family {…} other {…}}` gives a
 * family its own whole sentence, `{count, plural, one {…} other {…}}` counts.
 * Every id starts with its file's name. Another language is a folder beside
 * en/ with the same ids; a line it hasn't got yet is read in English.
 */
export const EN_FILES = { common, email, house, john, people, today, wall, week };

export const EN = Object.assign({}, ...Object.values(EN_FILES)) as typeof common &
  typeof email &
  typeof house &
  typeof john &
  typeof people &
  typeof today &
  typeof wall &
  typeof week;

/** One line of the app's words, by its id. */
export type WordId = keyof typeof EN;

/** The languages Jonz speaks. */
export const LANGUAGES = ["en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MESSAGES: Record<Language, Record<WordId, string>> = { en: EN };
