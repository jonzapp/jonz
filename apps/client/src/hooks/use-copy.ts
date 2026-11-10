import { copyFor, type CopyBook, type HouseKind } from '@app/core';
import { createContext, useContext } from 'react';

/**
 * Your house's kind for the words, set by MembershipProvider once the house
 * is read. Its own small context, so a component that only needs words
 * (and its test) doesn't pull in the sign-in machinery.
 */
export const HouseKindContext = createContext<HouseKind>('housemates');

/**
 * The words for your house's kind (the copy book, packages/core copy-book.ts):
 * read any line that names housemates or admins from here, never from its
 * copy section, so a family reads its own line.
 */
export function useCopy(): CopyBook {
  return copyFor(useContext(HouseKindContext));
}
