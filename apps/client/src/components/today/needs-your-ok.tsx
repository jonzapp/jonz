import { FOCUS_SHELL_COPY, okMeta, okTitle, tickerOf, type BoardItem } from '@app/core';

import type { Housemate } from '@/api/board';
import { Avatar } from '@/components/avatar';
import { useJohnSheet } from '@/components/john-sheet';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { useWords } from '@/hooks/use-words';

/**
 * Needs your OK, on a parent's Today in a family: one row per kid's tick
 * waiting for a parent ("Leo did Feed the fish", "Ticked 2h ago"), the kid
 * in the leading slot, opening the John sheet at OK it and Not yet. Nothing
 * when nothing waits.
 */
export function NeedsYourOk({ items, members, now }: { items: BoardItem[]; members: Housemate[]; now: Date }) {
  const words = useWords();
  const sheet = useJohnSheet();
  if (items.length === 0) return null;
  return (
    <Section label={words('today.parentOk.needsYourOk')} count={items.length} testID="needs-your-ok">
      {items.map((item) => {
        const kid = tickerOf(item);
        return (
          <Row
            key={item.id}
            leading={<Avatar name={members.find((m) => m.userId === kid)?.name ?? FOCUS_SHELL_COPY.formerHousemate} userId={kid} />}
            title={okTitle(item, members, words)}
            // The John's name is never cut short.
            titleLines={2}
            meta={okMeta(item, now, words)}
            chevron
            onPress={() => sheet.open(item.id)}
            testID="ok-row"
          />
        );
      })}
    </Section>
  );
}
