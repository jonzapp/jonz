import { jobPlaces, johnWhy, type BoardItem } from '@app/core';

import { Avatar } from '@/components/avatar';
import { Fold } from '@/components/fold';
import { GroupItem } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Body, Meta } from '@/components/text';

import type { JohnSheetContext } from './body';
import { SheetSection } from './parts';
import { useWords } from '@/hooks/use-words';
import { viewingOf } from './viewing';

/**
 * "Why?": why the deal gave this John to whom it did, from what the deal
 * kept, and what slipping would cost (once it's done, whose work it counts
 * as). "How it added up", folded, has each sharer home that day as the deal
 * weighed them, with who it was dealt to, who had it last time, and who had
 * been handed the most extra a week gives.
 */
export function JohnWhy({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const why = johnWhy(item, viewingOf(context, words), jobPlaces(item, context.board.items));
  return (
    <SheetSection>
      <Section label={words('john.why.label')} testID="john-why">
        <GroupItem>
          <Body testID="why-answer">{why.answer}</Body>
          {why.stakes ? <Body testID="why-stakes">{why.stakes}</Body> : null}
        </GroupItem>
        {why.rows.length > 0 ? (
          <Fold label={words('john.why.addsUp')} testID="why-adds-up">
            {why.rows.map((row) => (
              <Row
                key={row.userId}
                leading={<Avatar name={context.nameOf(row.userId)} userId={row.userId} me={row.userId === context.userId} />}
                title={row.name}
                meta={row.meta ?? undefined}
                trailing={row.value}
                testID="why-row"
              />
            ))}
            <GroupItem>
              <Meta>{why.key}</Meta>
            </GroupItem>
          </Fold>
        ) : null}
      </Section>
    </SheetSection>
  );
}
