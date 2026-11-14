import type { Viewing, Words } from '@app/core';

import type { JohnSheetContext } from './body';

/** What the sheet's words need to know about who's looking, and when, and on which clock. */
export function viewingOf(context: JohnSheetContext, words: Words): Viewing {
  return { people: context.members, viewerId: context.userId, rules: context.rules, now: context.now, zone: context.zone, words };
}
