import {
  firstName,
  PAGES,
  REPLY_COPY,
  weekShareRows,
  type BoardItem,
  type GroupDef,
  type JohnDef,
  type PageName,
  type ReplyCard,
} from '@app/core';
import type { Href } from 'expo-router';

import type { JohnRowContext } from '@/components/john-row';
import type { ChipTarget, ReplyPieces } from '@/components/reply/reply';

import { JohnsCard, SharesCard, WeekCard } from './cards';

/** Everything a reply's chips and cards are looked up in: what the app has already read. */
export interface ReplyData {
  viewerId: string;
  /** Everyone in the house, in the order they joined. */
  people: { userId: string; name: string }[];
  johns: readonly JohnDef[];
  groups: readonly GroupDef[];
  /** This week's board, or null before it's read (no ::week then). */
  items: readonly BoardItem[] | null;
  /** For a ::week card's rows; null where Johns can't be drawn live. */
  rowContext: JohnRowContext | null;
  /** Fair shares' balances, or null before they're read (no ::shares then). */
  balances: readonly { userId: string; balance: number }[] | null;
  awayMakeup: number;
  /** Opens a John's sheet, where there is one (the house's pages). */
  openJohn?: (itemId: string) => void;
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** Someone by what Claude called them: "me" (or "you") is the person asking, else a first or full name. */
export function findPerson(data: ReplyData, ref: string): ReplyData['people'][number] | null {
  const r = ref.trim();
  if (same(r, 'me') || same(r, 'you')) return data.people.find((p) => p.userId === data.viewerId) ?? null;
  return data.people.find((p) => same(firstName(p.name), r)) ?? data.people.find((p) => same(p.name, r)) ?? null;
}

/** A John by its ref (the start of its id, as list_johns gives it) or, failing that, its name. */
export function findJohn(data: ReplyData, ref: string): JohnDef | null {
  const r = ref.trim().toLowerCase();
  if (/^[0-9a-f]{4,}/.test(r)) {
    const byRef = data.johns.find((j) => j.id.toLowerCase().startsWith(r));
    if (byRef) return byRef;
  }
  return data.johns.find((j) => same(j.name, ref.trim())) ?? null;
}

/**
 * The pieces for a reply in this house: chips that open a John's sheet (or
 * the John list), a person's page or a page of the app; cards drawn from the
 * board, the fair shares and the list. A chip or card for something not
 * found is left as words, or out.
 */
export function replyPieces(data: ReplyData): ReplyPieces {
  const nameOf = (id: string) => data.people.find((p) => p.userId === id)?.name ?? null;
  const groupOf = (id: string | null) => (id ? (data.groups.find((g) => g.id === id)?.name ?? null) : null);
  const johnList: Href = '/house/johns';

  return {
    john(ref): ChipTarget | null {
      const john = findJohn(data, ref);
      if (!john) return null;
      // This week's: its sheet, yours first.
      const item =
        data.items?.find((i) => i.johnId === john.id && i.userId === data.viewerId) ?? data.items?.find((i) => i.johnId === john.id);
      const lead = { kind: 'lid' as const, category: john.category };
      const spoken = REPLY_COPY.spokenJohn(john.name);
      return item && data.openJohn ? { lead, spoken, onPress: () => data.openJohn!(item.id) } : { lead, spoken, href: johnList };
    },
    person(ref) {
      const p = findPerson(data, ref);
      if (!p) return null;
      return {
        lead: { kind: 'person', name: p.name, userId: p.userId, me: p.userId === data.viewerId },
        spoken: p.name,
        href: `/house/people/${p.userId}` as Href,
      };
    },
    page(ref) {
      const page = PAGES[ref as PageName];
      return page ? { lead: { kind: 'page' }, spoken: REPLY_COPY.spokenPage(page.label), href: page.href as Href } : null;
    },
    card(card: ReplyCard) {
      switch (card.card) {
        case 'week': {
          if (!data.items || !data.rowContext) return null;
          const person = card.who === null ? null : findPerson(data, card.who);
          if (card.who !== null && !person) return null;
          const items = data.items
            .filter((i) => person === null || i.userId === person.userId)
            .filter((i) => !card.open || (i.doneAt === null && i.outcome === null))
            .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
          const who = person === null ? null : person.userId === data.viewerId ? 'You' : firstName(person.name);
          return <WeekCard items={items} context={data.rowContext} who={who} open={card.open} />;
        }
        case 'shares': {
          if (!data.balances) return null;
          const shares = weekShareRows(data.balances, data.people.map((p) => p.userId), data.viewerId, data.awayMakeup);
          return <SharesCard rows={shares.rows} viewerId={data.viewerId} nameOf={nameOf} keyLine={shares.key} href={PAGES.shares.href as Href} />;
        }
        case 'johns': {
          const johns = card.refs.length === 0 ? [...data.johns] : card.refs.map((r) => findJohn(data, r)).filter((j): j is JohnDef => j !== null);
          return <JohnsCard johns={[...new Set(johns)]} groupOf={groupOf} href={johnList} />;
        }
      }
    },
  };
}
