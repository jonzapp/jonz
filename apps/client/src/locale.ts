import { BEING_CHECKED, currencyForCountry, languageOf, TEST_LANGUAGE, type Currency, type Language } from '@app/core';
import { getCalendars, getLocales } from 'expo-localization';

// Where this phone is, for a new house's defaults, as the web uses Vercel's
// geo headers. The house can change both later.

/** The phone's time zone, or London when it won't say. */
export function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? 'Europe/London';
}

/** The currency for the phone's region: pounds anywhere the app doesn't know. */
export function deviceCurrency(): Currency {
  return currencyForCountry(getLocales()[0]?.regionCode);
}

/**
 * The phone's language, as one Jonz has: English where it hasn't got the
 * phone's, or the phone won't say. The test language is only ever picked on
 * You, never taken from a phone set to Android's own test language; a
 * language still being checked (BEING_CHECKED) isn't taken from a phone either.
 */
export function deviceLanguage(): Language {
  try {
    const language = languageOf(getLocales()[0]?.languageTag);
    return language === TEST_LANGUAGE || BEING_CHECKED.includes(language) ? 'en' : language;
  } catch {
    return 'en';
  }
}
