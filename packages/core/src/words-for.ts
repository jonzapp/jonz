import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";

import type { HouseKind } from "./domain";
import { MESSAGES, type Language, type WordId } from "./locales";

export { LANGUAGES, type Language, type WordId } from "./locales";

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
};

const inProduction = () => typeof process !== "undefined" && process.env.NODE_ENV === "production";

const cache = createIntlCache();
const intls = new Map<Language, IntlShape<string>>();
const made = new Map<string, Words>();

function intlFor(language: Language): IntlShape<string> {
  let intl = intls.get(language);
  if (!intl) {
    intl = createIntl<string>(
      {
        locale: language,
        defaultLocale: "en",
        // A line another language hasn't got yet is read in English.
        messages: { ...MESSAGES.en, ...MESSAGES[language] },
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
    words = Object.assign(say, { language, kind, intl });
    made.set(key, words);
  }
  return words;
}
