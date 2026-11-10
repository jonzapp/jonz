import { wordsFor, type HouseKind, type Words } from '@app/core';
import { createContext, useContext } from 'react';

/**
 * Your house's kind for the words, set by MembershipProvider once the house
 * is read. Its own small context, so a component that only needs words
 * (and its test) doesn't pull in the sign-in machinery.
 */
export const HouseKindContext = createContext<HouseKind>('housemates');

/**
 * The app's words for you (packages/core locales/en/): call the result with
 * a line's id, `words('today.nextUp.invite')`, and its gaps. Your house's kind
 * goes into every line, so a family reads its own sentence. A screen that has
 * the house it shows passes its kind, which wins over your house's.
 */
export function useWords(kind?: HouseKind): Words {
  const yours = useContext(HouseKindContext);
  return wordsFor('en', kind ?? yours);
}
