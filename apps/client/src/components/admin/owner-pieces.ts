import { ADMIN_PAGES, OWNER_ASK_COPY } from '@app/core';
import type { Href } from 'expo-router';

import { NO_PIECES, type ReplyPieces } from '@/components/reply/reply';

/**
 * The owner's reply pieces: chips that open a report in the Inbox, an entry
 * of the audit log, everything the log holds on an account, or an admin
 * page. No house's chips or cards: the owner's Ask Jonz isn't in a house.
 */
export function ownerPieces(): ReplyPieces {
  return {
    ...NO_PIECES,
    owner(kind, ref, label) {
      switch (kind) {
        case 'report':
          return { lead: { kind: 'page' }, spoken: OWNER_ASK_COPY.spoken.report(label), href: `/admin/inbox/${ref}` as Href };
        case 'audit':
          return { lead: { kind: 'page' }, spoken: OWNER_ASK_COPY.spoken.audit(label), href: `/admin/audit/${ref}` as Href };
        case 'account':
          return { lead: { kind: 'page' }, spoken: OWNER_ASK_COPY.spoken.account(label), href: `/admin/audit?q=${encodeURIComponent(ref)}` as Href };
        case 'admin': {
          const page = ADMIN_PAGES.find((p) => p.key === ref);
          return page ? { lead: { kind: 'page' }, spoken: OWNER_ASK_COPY.spoken.admin(page.label), href: page.path as Href } : null;
        }
      }
    },
  };
}
