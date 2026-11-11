import { wordsFor, type HouseKind, type Language, type Words } from '@app/core';
import { createContext, useContext } from 'react';

/**
 * Your house's kind for the words, set by MembershipProvider once the house
 * is read. Its own small context, so a component that only needs words
 * (and its test) doesn't pull in the sign-in machinery.
 */
export const HouseKindContext = createContext<HouseKind>('housemates');

/** The language you read Jonz in, and the way to change it. */
export interface YourLanguage {
  language: Language;
  /** Read Jonz in another language: here at once, and on every device once it's saved. Throws if it can't be. */
  change: (language: Language) => Promise<void>;
}

/**
 * Your language, set by MembershipProvider: the one you picked on You, or
 * your phone's before you've signed in. Its own small context, as the
 * house's kind is.
 */
export const LanguageContext = createContext<YourLanguage>({ language: 'en', change: async () => undefined });

/** The language you read Jonz in, and the way to change it (You's Language row). */
export function useLanguage(): YourLanguage {
  return useContext(LanguageContext);
}

/**
 * The app's words for you, in your language (packages/core locales/): call
 * the result with a line's id, `words('today.nextUp.invite')`, and its gaps.
 * Your house's kind goes into every line, so a family reads its own
 * sentence. A screen that has the house it shows passes its kind, which wins
 * over your house's.
 */
export function useWords(kind?: HouseKind): Words {
  const yours = useContext(HouseKindContext);
  const { language } = useContext(LanguageContext);
  return wordsFor(language, kind ?? yours);
}
