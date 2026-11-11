import { BEING_CHECKED, LANGUAGES, languageOf, TEST_LANGUAGE, type Language } from '@app/core';

import { ON_STAGING } from './staging';
import { callV1 } from './v1';

// The language you read Jonz in: profiles.language, the same on every
// device. Null until the app has saved one, which it does from your phone's
// language the first time you sign in.

/** Your language, or null before one has been saved. */
export async function myLanguage(): Promise<Language | null> {
  const saved: unknown = await callV1('my_language', {});
  return typeof saved === 'string' ? languageOf(saved) : null;
}

/** Read Jonz in this language from now on, on every device. */
export async function setMyLanguage(language: Language): Promise<void> {
  await callV1('set_my_language', { language });
}

/**
 * The languages You offers: every one Jonz has, and the test language and
 * any still being checked only where Jonz is being tried out (locally and
 * on staging). With one to offer, You shows no Language row.
 */
export const LANGUAGES_OFFERED: readonly Language[] = LANGUAGES.filter(
  (l) => (l !== TEST_LANGUAGE && !BEING_CHECKED.includes(l)) || __DEV__ || ON_STAGING,
);
