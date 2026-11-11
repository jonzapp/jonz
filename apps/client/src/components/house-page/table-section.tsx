import { localDate, monthOf, monthWord, pocketMoney, tableLines, type PocketView, type TableLine } from '@app/core';
import type { UseQueryResult } from '@tanstack/react-query';
import { InfoIcon, UserRoundPlusIcon, UserPlusIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { AwayView } from '@/api/away';
import type { StakeRead } from '@/api/stake';
import type { TableSnapshot } from '@/api/table';
import { Avatar } from '@/components/avatar';
import { AddKidSheet } from '@/components/house-page/add-kid-sheet';
import { GroupItem } from '@/components/group';
import { InviteSheet } from '@/components/house-page/invite-sheet';
import { MetaLine, Money } from '@/components/house-page/money';
import { RulesSheet } from '@/components/house-page/rules-sheet';
import { PickMenu } from '@/components/pick-menu';
import { ReadFailed } from '@/components/read-state';
import { Row, RowIcon } from '@/components/row';
import { useContentWidth } from '@/components/screen';
import { Section } from '@/components/section';
import type { HouseView } from '@/hooks/use-house';
import { TourSpot } from '@/components/tour/tour-spot';
import { Waiting } from '@/components/waiting';
import { OutlineRows } from '@/components/outline';
import { useWords } from '@/hooks/use-words';

type Span = 'week' | 'month';

/**
 * The Table: one row per housemate, most points first, with this week's or
 * the month's points (chosen from the menu in its header), what matters
 * about them in the meta line and the month's money trailing; your own row
 * tinted. Each row opens that housemate's page. Then inviting housemates and
 * how it all works, each a sheet. A family's Table lists only the kids,
 * with what each has earned this month trailing, a parent's Add a child
 * for a kid who won't sign in, and its sheet is how pocket money works.
 */
export function TableSection({
  userId,
  view,
  table,
  stake,
  away,
  pocket,
}: {
  userId: string;
  view: HouseView;
  table: UseQueryResult<TableSnapshot>;
  stake: UseQueryResult<StakeRead>;
  away: UseQueryResult<AwayView>;
  /** In a family: what each kid has earned, for the Table's money. */
  pocket?: UseQueryResult<PocketView>;
}) {
  const words = useWords(view.snapshot.house.kind);
  const [span, setSpan] = useState<Span>('week');
  const [sheet, setSheet] = useState<'invite' | 'rules' | 'kid' | null>(null);
  const column = Math.min(useWindowDimensions().width, useContentWidth());
  const { snapshot, board, now } = view;
  const zone = snapshot.rules.timezone;
  const month = table.data?.month ?? monthOf(now, zone);
  const family = snapshot.house.kind === 'family';
  const kids = new Set(snapshot.members.filter((m) => m.role !== 'admin').map((m) => m.userId));
  const all = span === 'week' ? board.table : table.data?.monthTable;
  // A family's Table is the kids'.
  const rows = family ? all?.filter((row) => kids.has(row.userId)) : all;
  const earned = pocket?.data?.earned;
  const parent = snapshot.members.find((m) => m.userId === userId)?.role === 'admin';
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
      }, words).map((line) =>
        family
          ? { ...line, money: earned ? pocketMoney(earned[line.userId] ?? 0, snapshot.rules.currency, words) : null, losing: false }
          : line,
      )
    : null;

  return (
    <View>
      <TourSpot id="house.table">
        <Section
          label={words('house.page.table')}
          right={
            <PickMenu
              options={[
                { value: 'week', label: words('house.page.week') },
                { value: 'month', label: monthWord(month, words) },
              ]}
              value={span}
              onChange={setSpan}
              label={words('house.page.show')}
              testID="table-span"
            />
          }
          testID="house-table"
        >
          {lines ? (
            lines.map((line) => <Standing key={line.userId} line={line} />)
          ) : (
            table.isError ? (
              <GroupItem>
                <ReadFailed message={words('house.page.tableUnreadable')} onRetry={() => void table.refetch()} />
              </GroupItem>
            ) : (
              // A row for each housemate, in outline, so nothing below moves when the Table arrives.
              <Waiting ready={false} label={words('house.page.readingTable')} outline={<OutlineRows count={snapshot.members.length} end />} />
            )
          )}
          {family && parent ? (
            <Row
              leading={<RowIcon icon={UserRoundPlusIcon} />}
              title={words('people.kids.add')}
              onPress={() => setSheet('kid')}
              chevron
              testID="add-a-child"
            />
          ) : null}
          {/* Who joins a family is its parents' to decide: a kid has no invite to send. */}
          {family && !parent ? null : (
            <Row
              leading={<RowIcon icon={UserPlusIcon} />}
              title={words('house.page.invite')}
              onPress={() => setSheet('invite')}
              chevron
              testID="invite"
            />
          )}
          <Row
            leading={<RowIcon icon={InfoIcon} />}
            title={family ? words('house.pocket.howItWorks') : words('house.page.rules')}
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
        resetFor={parent ? snapshot.house.id : undefined}
      />
      {family && parent ? <AddKidSheet houseId={snapshot.house.id} visible={sheet === 'kid'} onClose={() => setSheet(null)} /> : null}
      <RulesSheet
        visible={sheet === 'rules'}
        onClose={() => setSheet(null)}
        rules={snapshot.rules}
        awayMakeup={snapshot.house.awayMakeup}
        pocketCapMinor={family ? (snapshot.house.pocketCapMinor ?? 0) : undefined}
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
