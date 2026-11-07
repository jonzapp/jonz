import { HOUSE_FACETS, HOUSE_WHEN, HOUSES_COPY, houseAgo, houseMeta, passLabel, passNow, percentOf, type HouseRow, type ListAsk } from '@app/core';
import { router, useLocalSearchParams } from 'expo-router';
import { HouseIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { houseFilter, housesCount, housesPage, type HouseCursor } from '@/api/houses';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { HOUSES_KEY, HousePanel } from '@/components/admin/house-panel';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Row, RowIcon } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Chip } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { SPACE } from '@/theme';

/** Every house's columns on a laptop. */
const HOUSE_TABLE: readonly ListColumn[] = [
  { key: 'house', label: HOUSES_COPY.columns.house, flex: 1 },
  { key: 'people', label: HOUSES_COPY.columns.people, width: 64, end: true },
  { key: 'pass', label: HOUSES_COPY.columns.pass, width: 112 },
  { key: 'active', label: HOUSES_COPY.columns.active, width: 112 },
  { key: 'onTime', label: HOUSES_COPY.columns.onTime, width: 72, end: true },
  { key: 'started', label: HOUSES_COPY.columns.started, width: 72, end: true },
];

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const started = (iso: string) => `${new Date(iso).getDate()} ${MONTH[new Date(iso).getMonth()]}`;

/**
 * Every house, most recently active first, as a busy list: the one search
 * box finds a house, a join code, or someone in it by name or email, and
 * filters by Pass, how lately it was used and when it started. On a laptop
 * the chosen house opens beside the list; on a phone it's a page of its own.
 * Read only: nothing here changes a house.
 */
export default function HousesPage() {
  const busy = useBusyList({
    key: HOUSES_KEY,
    facets: HOUSE_FACETS,
    when: HOUSE_WHEN,
    rows: (cursor: HouseCursor | null, ask: ListAsk) => housesPage(cursor, houseFilter(ask)),
    count: (ask) => housesCount(houseFilter(ask)),
    cursor: (house: HouseRow) => ({ at: house.sortAt, id: house.id }),
  });
  return (
    <Screen spreads bar={<TitleBar title={HOUSES_COPY.page} />} onNearEnd={busy.onNearEnd} testID="admin-houses">
      <Houses busy={busy} />
    </Screen>
  );
}

function PassCell({ house, now }: { house: HouseRow; now: Date }) {
  const state = passNow(house.passPlan, house.passUntil, now);
  const label = passLabel(house.passPlan, house.passUntil, now);
  if (state === 'none') return <Meta>{label}</Meta>;
  return <Chip label={label} />;
}

function Houses({ busy }: { busy: BusyList<HouseRow> }) {
  const two = useColumns();
  // A link in (the Overview's Needs you, a pushed page opened on a laptop) names the one to open with ?open=.
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [chosenId, setChosen] = useState<string | null>(open ?? null);
  const shownId = chosenId ?? busy.items[0]?.id ?? null;
  const now = new Date();
  const list = (
    <BusyListView
      busy={busy}
      name="houses"
      placeholder={HOUSES_COPY.searchPlaceholder}
      noun={HOUSES_COPY.count}
      columns={HOUSE_TABLE}
      tableRow={(house) => (
        <ListTableRow
          key={house.id}
          columns={HOUSE_TABLE}
          cells={{
            house: house.name,
            people: String(house.people),
            pass: <PassCell house={house} now={now} />,
            active: house.lastActive ? houseAgo(house.lastActive, now) : HOUSES_COPY.neverActive,
            onTime: percentOf(house.onTime, house.settled) ?? HOUSES_COPY.noneDue,
            started: started(house.createdAt),
          }}
          quiet={['started']}
          strong={['house']}
          chosen={shownId === house.id}
          onPress={() => setChosen(house.id)}
          accessibilityLabel={`${house.name}, ${houseMeta(house, now)}`}
          testID={`house-${house.id}`}
        />
      )}
      row={(house) => (
        <Row
          key={house.id}
          leading={<RowIcon icon={HouseIcon} />}
          title={house.name}
          meta={houseMeta(house, now)}
          metaLines={2}
          onPress={() => router.push(`/admin/houses/${house.id}` as never)}
          chevron
          testID={`house-${house.id}`}
        />
      )}
      empty={{ icon: HouseIcon, title: HOUSES_COPY.empty, body: HOUSES_COPY.emptyBody }}
    />
  );
  if (two) return <Columns main={list} side={shownId ? <HousePanel key={shownId} id={shownId} /> : <View style={styles.none} />} />;
  return list;
}

const styles = StyleSheet.create({
  none: { gap: SPACE.lg },
});
