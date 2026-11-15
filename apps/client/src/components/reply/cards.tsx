import { weekLabel, pointsLabel, scheduleLine, type BoardItem, type JohnDef } from '@app/core';
import type { Href } from 'expo-router';

import { Group, GroupItem } from '@/components/group';
import { JohnRow, type JohnRowContext } from '@/components/john-row';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { SharesChart } from '@/components/week/fair-shares';
import { useWords } from '@/hooks/use-words';

/**
 * The cards a reply can hold (::week, ::shares, ::johns). Each is the app's
 * own section, drawn from data the app read itself, never numbers from the
 * reply's words.
 */

/** ::week: this week's Johns as the Week page's rows, live (tick, open the sheet). */
export function WeekCard({ items, context, who, open }: { items: BoardItem[]; context: JohnRowContext; who: string | null; open: boolean }) {
  const words = useWords();
  return (
    <Section label={weekLabel(who, open, words)} count={open ? items.length : undefined}>
      {items.length > 0 ? (
        <Group>
          {items.map((item) => (
            <JohnRow key={item.id} item={item} context={context} testID="reply-week-row" />
          ))}
        </Group>
      ) : (
        <Meta>{words('ask.reply.weekEmpty', { open })}</Meta>
      )}
    </Section>
  );
}

/**
 * ::shares: everyone's balance against their fair share, as the Week page's
 * popover shows it (a BarChart, behind to the left), with the Track record
 * at the section's end.
 */
export function SharesCard({
  rows,
  viewerId,
  nameOf,
  keyLine,
  href,
}: {
  rows: { userId: string; balance: string; points: number }[];
  viewerId: string;
  nameOf: (userId: string) => string | null;
  keyLine?: string;
  href?: Href;
}) {
  const words = useWords();
  return (
    <Section
      label={words('ask.reply.shares')}
      right={href ? <TextButton label={words('week.record.open')} href={href} chevron align="end" testID="reply-shares-open" /> : undefined}
    >
      <Group>
        <GroupItem>
          <SharesChart rows={rows} viewerId={viewerId} nameOf={nameOf} testID="reply-shares" />
        </GroupItem>
      </Group>
      {keyLine ? <Meta>{keyLine}</Meta> : null}
    </Section>
  );
}

/** ::johns: Johns from the list, as the John list page writes them. */
export function JohnsCard({
  johns,
  groupOf,
  lidOf,
  href,
}: {
  johns: JohnDef[];
  groupOf: (groupId: string | null) => string | null;
  /** Its kind's lid colour. */
  lidOf: (john: JohnDef) => string;
  href?: Href;
}) {
  const words = useWords();
  return (
    <Section label={words('ask.reply.johns')} count={johns.length || undefined}>
      {johns.length > 0 ? (
        <Group>
          {johns.map((j) => (
            <Row
              key={j.id}
              title={j.name}
              titleLines={2}
              lid={lidOf(j)}
              meta={[scheduleLine(j, words, groupOf(j.groupId)), pointsLabel(j.points, words)].join(', ')}
              metaLines={2}
              href={href}
              chevron={href !== undefined}
              testID="reply-john"
            />
          ))}
        </Group>
      ) : (
        <Meta>{words('ask.reply.johnsEmpty')}</Meta>
      )}
    </Section>
  );
}
