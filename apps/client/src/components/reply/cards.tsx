import { FOCUS_SHELL_COPY, pointsLabel, REPLY_COPY, scheduleLine, weekWho, type BoardItem, type JohnDef } from '@app/core';
import type { Href } from 'expo-router';

import { Avatar } from '@/components/avatar';
import { Group } from '@/components/group';
import { JohnRow, type JohnRowContext } from '@/components/john-row';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { useWords } from '@/hooks/use-words';

/**
 * The cards a reply can hold (::week, ::shares, ::johns). Each is the app's
 * own section, drawn from data the app read itself, never numbers from the
 * reply's words.
 */

/** ::week: this week's Johns as the Week page's rows, live (tick, open the sheet). */
export function WeekCard({ items, context, who, open }: { items: BoardItem[]; context: JohnRowContext; who: string | null; open: boolean }) {
  return (
    <Section label={REPLY_COPY.weekLabel(who, open)} count={open ? items.length : undefined}>
      {items.length > 0 ? (
        <Group>
          {items.map((item) => (
            <JohnRow key={item.id} item={item} context={context} testID="reply-week-row" />
          ))}
        </Group>
      ) : (
        <Meta>{REPLY_COPY.weekEmpty(open)}</Meta>
      )}
    </Section>
  );
}

/** ::shares: everyone's balance against their fair share, as the Week page's sheet shows it. */
export function SharesCard({
  rows,
  viewerId,
  nameOf,
  keyLine,
  href,
}: {
  rows: { userId: string; balance: string }[];
  viewerId: string;
  nameOf: (userId: string) => string | null;
  keyLine?: string;
  href?: Href;
}) {
  const words = useWords();
  return (
    <Section label={REPLY_COPY.shares}>
      <Group>
        {rows.map((row) => (
          <Row
            key={row.userId}
            leading={<Avatar name={nameOf(row.userId) ?? FOCUS_SHELL_COPY.formerHousemate} userId={row.userId} me={row.userId === viewerId} />}
            title={weekWho(row.userId, viewerId, nameOf, words)}
            trailing={row.balance}
            href={href}
            testID="reply-share"
          />
        ))}
      </Group>
      {keyLine ? <Meta>{keyLine}</Meta> : null}
    </Section>
  );
}

/** ::johns: Johns from the list, as the John list page writes them. */
export function JohnsCard({ johns, groupOf, href }: { johns: JohnDef[]; groupOf: (groupId: string | null) => string | null; href?: Href }) {
  const words = useWords();
  return (
    <Section label={REPLY_COPY.johns} count={johns.length || undefined}>
      {johns.length > 0 ? (
        <Group>
          {johns.map((j) => (
            <Row
              key={j.id}
              title={j.name}
              titleLines={2}
              lid={j.category}
              meta={[scheduleLine(j, words, groupOf(j.groupId)), pointsLabel(j.points)].join(', ')}
              metaLines={2}
              href={href}
              chevron={href !== undefined}
              testID="reply-john"
            />
          ))}
        </Group>
      ) : (
        <Meta>{REPLY_COPY.johnsEmpty}</Meta>
      )}
    </Section>
  );
}
