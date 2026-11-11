import admin from "./en/admin.json";
import ask from "./en/ask.json";
import common from "./en/common.json";
import door from "./en/door.json";
import email from "./en/email.json";
import errors from "./en/errors.json";
import house from "./en/house.json";
import john from "./en/john.json";
import people from "./en/people.json";
import today from "./en/today.json";
import wall from "./en/wall.json";
import week from "./en/week.json";
import frAsk from "./fr/ask.json";
import frCommon from "./fr/common.json";
import frDoor from "./fr/door.json";
import frEmail from "./fr/email.json";
import frErrors from "./fr/errors.json";
import frHouse from "./fr/house.json";
import frJohn from "./fr/john.json";
import frPeople from "./fr/people.json";
import frToday from "./fr/today.json";
import frWall from "./fr/wall.json";
import frWeek from "./fr/week.json";

/**
 * The app's words in English, one file per part of the app (locales/en/),
 * each line an ICU message: `{kind, select, family {…} other {…}}` gives a
 * family its own whole sentence, `{count, plural, one {…} other {…}}` counts.
 * Every id starts with its file's name. Another language is a folder beside
 * en/ with the same ids; a line it hasn't got yet is read in English.
 */
export const EN_FILES = { admin, ask, common, door, email, errors, house, john, people, today, wall, week };

export const EN = Object.assign({}, ...Object.values(EN_FILES)) as typeof admin &
  typeof ask &
  typeof common &
  typeof door &
  typeof email &
  typeof errors &
  typeof house &
  typeof john &
  typeof people &
  typeof today &
  typeof wall &
  typeof week;

/** One line of the app's words, by its id. */
export type WordId = keyof typeof EN;

/**
 * The languages a person can read Jonz in (profiles.language). en-XA is the
 * test language: English made strange (pseudo.ts), so a line that never
 * moved to the words files stands out. Another language adds its folder
 * here, and to the database's profiles_language_check.
 */
export const LANGUAGES = ["en", "fr", "en-XA"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The test language, offered only where Jonz is being tried out (locally and on staging). */
export const TEST_LANGUAGE = "en-XA" satisfies Language;

/**
 * Languages drafted but not yet read through by someone who speaks them:
 * offered only where Jonz is being tried out, like the test language, and
 * never taken from a phone. A language leaves this list once it's been read.
 */
export const BEING_CHECKED: readonly Language[] = ["fr"];

/** Each language by its own name, as the picker lists it: a person finds theirs without reading another. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "Français", "en-XA": "[Ţëšţ Ëñĝļîšĥ]" };

/** Each language by its English name, for telling Ask Jonz which to answer in. */
export const LANGUAGE_IN_ENGLISH: Record<Language, string> = { en: "English", fr: "French", "en-XA": "English" };

/**
 * French, file by file, with the same ids as English's. The owner's pages
 * (admin) stay in English for now, so French has none of their lines.
 */
export const FR_FILES = {
  admin: {},
  ask: frAsk,
  common: frCommon,
  door: frDoor,
  email: frEmail,
  errors: frErrors,
  house: frHouse,
  john: frJohn,
  people: frPeople,
  today: frToday,
  wall: frWall,
  week: frWeek,
} satisfies Record<keyof typeof EN_FILES, Partial<Record<WordId, string>>>;

export const MESSAGES: Partial<Record<Language, Partial<Record<WordId, string>>>> = {
  en: EN,
  fr: Object.assign({}, ...Object.values(FR_FILES)) as Partial<Record<WordId, string>>,
};

/**
 * The language for a saved choice or a phone's language tag ("en-GB",
 * "fr"): the language itself when Jonz has it, else its base language
 * ("en-GB" reads English), else English. Nothing reads English too.
 */
export function languageOf(tag: string | null | undefined): Language {
  if (!tag) return "en";
  const exact = LANGUAGES.find((l) => l.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const base = tag.split(/[-_]/)[0].toLowerCase();
  return LANGUAGES.find((l) => l === base) ?? "en";
}
