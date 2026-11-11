import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";
import type { Locale } from "date-fns";
import { enGB } from "date-fns/locale/en-GB";
import { fr } from "date-fns/locale/fr";

import type { HouseKind } from "./domain";
import { MESSAGES, TEST_LANGUAGE, type Language, type WordId } from "./locales";
import { pseudoMessages } from "./pseudo";

export { BEING_CHECKED, LANGUAGE_IN_ENGLISH, LANGUAGE_NAMES, LANGUAGES, languageOf, TEST_LANGUAGE, type Language, type WordId } from "./locales";

/** What a line fills its gaps with. The house's kind is filled in for you. */
export type WordValues = Record<string, string | number | boolean | Date | null | undefined>;

/**
 * The words for one person's language and their house's kind: call it with a
 * line's id (and its gaps) to get the line. `kind` goes into every line, so a
 * family reads its own words without the screen asking.
 */
export type Words = {
  (id: WordId, values?: WordValues): string;
  readonly language: Language;
  readonly kind: HouseKind;
  /** The FormatJS object underneath, for dates, numbers and lists in this language. */
  readonly intl: IntlShape<string>;
  /** Its date-fns locale: day and month names, for dates written in this language (format.ts). */
  readonly dates: Locale;
  /** Its tag for `Intl` (money, `Intl.DateTimeFormat`): English reads the British way, "en-GB". */
  readonly locale: string;
};

/**
 * Each language's day and month names. English reads them as Jonz always
 * has, the British way ("Tue 10 Nov", 21:00); so does the test language.
 */
const DATE_LOCALES: Record<Language, Locale> = { en: enGB, fr, "en-XA": enGB };
const INTL_LOCALES: Record<Language, string> = { en: "en-GB", fr: "fr-FR", "en-XA": "en-GB" };

const inProduction = () => typeof process !== "undefined" && process.env.NODE_ENV === "production";

const cache = createIntlCache();
const intls = new Map<Language, IntlShape<string>>();
const made = new Map<string, Words>();

function intlFor(language: Language): IntlShape<string> {
  let intl = intls.get(language);
  if (!intl) {
    intl = createIntl<string>(
      {
        // The test language counts, dates and plurals as English does.
        locale: language === TEST_LANGUAGE ? "en" : language,
        defaultLocale: "en",
        // A line another language hasn't got yet is read in English.
        messages: language === TEST_LANGUAGE ? pseudoMessages() : { ...MESSAGES.en, ...MESSAGES[language] },
        // A missing line or gap is a bug: loud while building, quiet (the
        // line's id or English) for people using the app.
        onError: (err) => {
          if (!inProduction()) throw err;
          console.error(err);
        },
      },
      cache,
    );
    intls.set(language, intl);
  }
  return intl;
}

/**
 * The words for this language and kind of house. The app reads them with
 * useWords(); shared code, the API, emails and push read them from here.
 */
export function wordsFor(language: Language, kind: HouseKind): Words {
  const key = `${language}:${kind}`;
  let words = made.get(key);
  if (!words) {
    const intl = intlFor(language);
    const say = (id: WordId, values?: WordValues) => intl.formatMessage({ id }, { ...values, kind });
    words = Object.assign(say, { language, kind, intl, dates: DATE_LOCALES[language], locale: INTL_LOCALES[language] });
    made.set(key, words);
  }
  return words;
}
