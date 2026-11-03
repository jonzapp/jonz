import { HOUSE_PAGE_COPY, localDate, monthOf, monthWord, tableLines, type TableLine } from '@app/core';
import type { UseQueryResult } from '@tanstack/react-query';
import { InfoIcon, UserPlusIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { AwayView } from '@/api/away';
import type { StakeRead } from '@/api/stake';
import type { TableSnapshot } from '@/api/table';
import { Avatar } from '@/components/avatar';
import { GroupItem } from '@/components/group';
import { InviteSheet } from '@/components/house-page/invite-sheet';
import { MetaLine, Money } from '@/components/house-page/money';
import { RulesSheet } from '@/components/house-page/rules-sheet';
import { PickMenu } from '@/components/pick-menu';
import { Reading, ReadFailed } from '@/components/read-state';
import { Row, RowIcon } from '@/components/row';
import { useContentWidth } from '@/components/screen';
import { Section } from '@/components/section';
import type { HouseView } from '@/hooks/use-house';
import { TourSpot } from '@/components/tour/tour-spot';

type Span = 'week' | 'month';

/**
 * The Table: one row per housemate, most points first, with this week's or
 * the month's points (chosen from the menu in its header), what matters
 * about them in the meta line and the month's money trailing; your own row
 * tinted. Each row opens that housemate's page. Then inviting housemates and
 * how it all works, each a sheet.
 */
export function TableSection({
  userId,
  view,
  table,
  stake,
  away,
}: {
  userId: string;
  view: HouseView;
  table: UseQueryResult<TableSnapshot>;
  stake: UseQueryResult<StakeRead>;
  away: UseQueryResult<AwayView>;
}) {
  const [span, setSpan] = useState<Span>('week');
  const [sheet, setSheet] = useState<'invite' | 'rules' | null>(null);
  const column = Math.min(useWindowDimensions().width, useContentWidth());
  const { snapshot, board, now } = view;
  const zone = snapshot.rules.timezone;
  const month = table.data?.month ?? monthOf(now, zone);
  const rows = span === 'week' ? board.table : table.data?.monthTable;
  const lines = rows
    ? tableLines({
        rows,
        members: snapshot.members,
        me: userId,
        month,
        monthRows: table.data?.monthTable ?? null,
        projection: stake.data?.projection ?? null,
        currency: snapshot.rules.currency,
        away: away.data?.periods ?? null,
        today: away.data?.today ?? localDate(now, zone),
        column,
      })
    : null;

  return (
    <View>
      <TourSpot id="house.table">
        <Section
          label={HOUSE_PAGE_COPY.table}
          right={
            <PickMenu
              options={[
                { value: 'week', label: HOUSE_PAGE_COPY.week },
                { value: 'month', label: monthWord(month) },
              ]}
              value={span}
              onChange={setSpan}
              label={HOUSE_PAGE_COPY.show}
              testID="table-span"
            />
          }
          testID="house-table"
        >
          {lines ? (
            lines.map((line) => <Standing key={line.userId} line={line} />)
          ) : (
            <GroupItem>
              {table.isError ? (
                <ReadFailed message={HOUSE_PAGE_COPY.tableUnreadable} onRetry={() => void table.refetch()} />
              ) : (
                <Reading label={HOUSE_PAGE_COPY.readingTable} />
              )}
            </GroupItem>
          )}
          <Row
            leading={<RowIcon icon={UserPlusIcon} />}
            title={HOUSE_PAGE_COPY.invite}
            onPress={() => setSheet('invite')}
            chevron
            testID="invite"
          />
          <Row
            leading={<RowIcon icon={InfoIcon} />}
            title={HOUSE_PAGE_COPY.rules}
            // Whole on the narrowest phone, rather than cut at "How points and the…".
            titleLines={2}
            onPress={() => setSheet('rules')}
            chevron
            testID="how-it-works"
          />
        </Section>
      </TourSpot>
      <InviteSheet
        visible={sheet === 'invite'}
        onClose={() => setSheet(null)}
        code={snapshot.house.joinCode}
        houseName={snapshot.house.name}
        resetFor={snapshot.members.find((m) => m.userId === userId)?.role === 'admin' ? snapshot.house.id : undefined}
      />
      <RulesSheet
        visible={sheet === 'rules'}
        onClose={() => setSheet(null)}
        rules={snapshot.rules}
        awayMakeup={snapshot.house.awayMakeup}
      />
    </View>
  );
}

/**
 * A housemate on the Table, a way to their page. A row carries one hazard
 * mark: before late and missed when it says them, otherwise on money lost.
 * Your row is tinted, so its hazard words and money are ink, by their marks.
 */
function Standing({ line }: { line: TableLine }) {
  const saysLateOrMissed = line.meta.some((part) => part.hazard);
  return (
    <Row
      leading={<Avatar name={line.name} userId={line.userId} me={line.me} />}
      title={line.title}
      meta={<MetaLine parts={line.meta} tinted={line.me} />}
      trailing={
        line.money != null ? <Money value={line.money} losing={line.losing} marked={!saysLateOrMissed} tinted={line.me} /> : undefined
      }
      tint={line.me}
      href={`/house/people/${line.userId}`}
      testID="standing"
    />
  );
}
