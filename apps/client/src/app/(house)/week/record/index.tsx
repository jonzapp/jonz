import {
  readSpan,
  RECORD_COPY,
  RECORD_SPANS,
  SECTION_LABEL,
  trackRecord,
  type RecordMark,
  type RecordSpan,
  type TrackRecord,
} from '@app/core';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Pair, useSideBySide } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { PersonSections, usePersonRecord } from '@/components/week/person-record';
import { RecordGrid, RecordKey } from '@/components/week/track-record';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull } from '@/hooks/use-refresh';
import { useRecord } from '@/hooks/use-record';
import { CONTENT_MAX, INSET, SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { RecordOutline } from '@/components/page-outlines';

/** The key's marks, in the order they read. */
const KEY: readonly RecordMark[] = ['clean', 'late', 'missed', 'covered', 'skipped', 'away', 'open'];

/**
 * The track record, pushed from Week: Week, Month, Year or All, then one
 * row per person, best on time first, with a square per week (on Week, per
 * John) coloured by the worst thing in it, and the key under them. A row
 * opens that person's breakdown, for the same span: on a phone as a page of
 * its own, on a laptop beside the grid (you, to start; ?open= names who).
 */
export default function RecordScreen() {
  const { session, house } = useMembership();
  const { span, open } = useLocalSearchParams<{ span?: string; open?: string }>();
  // The layout's guard only shows the house's screens with a house and a session.
  return <RecordFor houseId={house!.id} userId={session!.user.id} span={readSpan(span)} open={open ?? null} />;
}

function RecordFor({ houseId, userId, span, open }: { houseId: string; userId: string; span: RecordSpan; open: string | null }) {
  const { query, view } = useHouse(houseId, userId);
  const rows = useRecord(houseId);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), rows.refetch()]));

  const members = view?.snapshot.members ?? [];
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? RECORD_COPY.someoneGone;
  const record =
    view && rows.data
      ? trackRecord(
          { ...rows.data, memberIds: members.map((m) => m.userId), now: view.now, zone: view.snapshot.rules.timezone },
          span,
        )
      : null;
  const shown = record ? KEY.filter((mark) => record.rows.some((r) => r.cells.some((c) => c.mark === mark))) : [];

  return (
    <Screen
      bar={<TitleBar title={RECORD_COPY.title} back="/week" backLabel={SECTION_LABEL.week} />}
      refreshing={refreshing}
      onRefresh={pull}
      testID="record-screen"
      fills
    >
      <PageTitle page={RECORD_COPY.title} />
      <View style={styles.top}>
        <Meta>{span === 'week' ? RECORD_COPY.introWeek : RECORD_COPY.intro}</Meta>
        <Segmented
          options={RECORD_SPANS.map((value) => ({ value, label: RECORD_COPY.spans[value] }))}
          value={span}
          onChange={(value) => router.setParams({ span: value })}
          label={RECORD_COPY.span}
          equal
          testID="record-span"
        />
      </View>
      {record ? (
        <RecordBody houseId={houseId} userId={userId} span={span} open={open} record={record} shown={shown} nameOf={nameOf} />
      ) : (
        <Waiting
          ready={false}
          failed={query.isError || rows.isError}
          onRetry={() => void Promise.all([query.refetch(), rows.refetch()])}
          outline={<RecordOutline />}
        />
      )}
    </Screen>
  );
}

/**
 * The grid and its key; on a laptop, with the chosen person's breakdown
 * beside them, sharing a top edge, so you can click down the housemates
 * without going back and forth.
 */
function RecordBody({
  houseId,
  userId,
  span,
  open,
  record,
  shown,
  nameOf,
}: {
  houseId: string;
  userId: string;
  span: RecordSpan;
  open: string | null;
  record: TrackRecord;
  shown: readonly RecordMark[];
  nameOf: (id: string) => string;
}) {
  const beside = useSideBySide();
  // Someone who has left has no row to open: you, then.
  const chosen = open !== null && record.rows.some((r) => r.userId === open) ? open : userId;
  const grid = (
    <Section label={record.range} right={RECORD_COPY.onTime} testID="record-section">
      <RecordGrid
        rows={record.rows}
        viewerId={userId}
        nameOf={nameOf}
        chosenId={beside ? chosen : null}
        onOpen={(id) =>
          beside ? router.setParams({ open: id }) : router.push({ pathname: '/week/record/[userId]', params: { userId: id, span } })
        }
      />
    </Section>
  );
  const key = shown.length > 0 ? <RecordKey marks={shown} changed={record.rows.some((r) => r.cells.some((c) => c.changed))} /> : null;
  if (!beside) {
    return (
      <>
        {grid}
        {key}
      </>
    );
  }
  return (
    <Pair
      testID="record-pair"
      start={
        <>
          {grid}
          {key}
        </>
      }
      end={<PersonBeside key={chosen} houseId={houseId} userId={userId} personId={chosen} span={span} />}
    />
  );
}

/** The chosen person's breakdown beside the grid, on a laptop. */
function PersonBeside({ houseId, userId, personId, span }: { houseId: string; userId: string; personId: string; span: RecordSpan }) {
  const record = usePersonRecord(houseId, userId, personId, span);
  return <PersonSections record={record} beside />;
}

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start; a phone's width over the columns on a laptop.
  top: { paddingHorizontal: INSET, gap: SPACE.md, maxWidth: CONTENT_MAX },
});
