import {
  readSpan,
  RECORD_COPY,
  RECORD_SPANS,
  recordBreakdown,
  shareLine,
  signedPoints,
  type BreakdownLine,
  type RecordSpan,
} from '@app/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PageTitle } from '@/components/page-title';
import { Row } from '@/components/row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull } from '@/hooks/use-refresh';
import { useRecord } from '@/hooks/use-record';
import { useTable } from '@/hooks/use-table';
import { INSET, SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { RecordOutline } from '@/components/page-outlines';

/**
 * One person's track record, pushed from a row of it: where their points
 * come from over the span, line by line in the order they add up (their
 * share off first, then each kind of John, a miss adding nothing), each line
 * opening onto its Johns, and the sum at the bottom. Then what the deal does
 * about where they stand over the weeks it remembers.
 */
export default function RecordPersonScreen() {
  const { session, house } = useMembership();
  const { userId: personId, span } = useLocalSearchParams<{ userId: string; span?: string }>();
  // The layout's guard only shows the house's screens with a house and a session.
  return <PersonRecord houseId={house!.id} userId={session!.user.id} personId={personId} span={readSpan(span)} />;
}

function PersonRecord({ houseId, userId, personId, span }: { houseId: string; userId: string; personId: string; span: RecordSpan }) {
  const { query, view } = useHouse(houseId, userId);
  const rows = useRecord(houseId);
  const table = useTable(houseId, query.data);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), rows.refetch(), table.refetch()]));

  const members = view?.snapshot.members ?? [];
  const you = personId === userId;
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? RECORD_COPY.someoneGone;
  const name = you ? RECORD_COPY.you(nameOf(personId)) : nameOf(personId);
  const breakdown =
    view && rows.data
      ? recordBreakdown(
          { ...rows.data, memberIds: members.map((m) => m.userId), now: view.now, zone: view.snapshot.rules.timezone },
          span,
          personId,
          (id) => (id === userId ? RECORD_COPY.you(nameOf(id)) : nameOf(id)),
        )
      : null;
  const balance = table.data?.balances.find((b) => b.userId === personId) ?? null;
  const next = table.data ? shareLine(balance, you) : null;

  return (
    <Screen
      bar={<TitleBar title={name} sub={breakdown?.range} back={{ pathname: '/week/record', params: { span } }} backLabel={RECORD_COPY.title} />}
      refreshing={refreshing}
      onRefresh={pull}
      testID="record-person-screen"
    >
      <PageTitle page={name} />
      <View style={styles.top}>
        <Segmented
          options={RECORD_SPANS.map((value) => ({ value, label: RECORD_COPY.spans[value] }))}
          value={span}
          onChange={(value) => router.setParams({ span: value })}
          label={RECORD_COPY.span}
          equal
          testID="record-span"
        />
      </View>
      {breakdown ? (
        <>
          <Section label={RECORD_COPY.whereFrom} testID="record-breakdown">
            {breakdown.lines.map((line) => (
              <LineRows key={line.key} line={line} you={you} weeks={breakdown.weeks} />
            ))}
            <Row
              title={you ? RECORD_COPY.totalYou : RECORD_COPY.total(nameOf(personId))}
              meta={breakdown.range}
              trailing={signedPoints(breakdown.total)}
              testID="record-total"
            />
          </Section>
          {next ? (
            <Section label={RECORD_COPY.next} testID="record-next">
              <Row title={next.title} meta={next.meta.map((m) => m.text).join(', ')} titleLines={2} metaLines={2} />
            </Section>
          ) : null}
        </>
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

/** A line of the breakdown, which opens onto its Johns (the share has none). */
function LineRows({ line, you, weeks }: { line: BreakdownLine; you: boolean; weeks: number }) {
  const [open, setOpen] = useState(false);
  const title = line.key === 'share' && you ? RECORD_COPY.yourShare : RECORD_COPY.lines[line.key];
  const meta =
    line.key === 'share'
      ? RECORD_COPY.shareMeta(weeks)
      : line.key === 'missed'
        ? `${RECORD_COPY.lineMeta(line.johns.length)}, ${RECORD_COPY.missedMeta}`
        : line.key === 'open'
          ? `${RECORD_COPY.lineMeta(line.johns.length)}, ${RECORD_COPY.openMeta}`
          : RECORD_COPY.lineMeta(line.johns.length);
  return (
    <>
      <Row
        title={title}
        meta={meta}
        trailing={signedPoints(line.points)}
        onPress={line.johns.length > 0 ? () => setOpen((was) => !was) : undefined}
        testID={`record-line-${line.key}`}
      />
      {open
        ? line.johns.map((j) => (
            <Row
              key={j.id}
              title={j.name}
              meta={[j.day, j.note].filter(Boolean).join(', ')}
              trailing={<Meta>{String(j.points)}</Meta>}
              testID="record-john"
            />
          ))
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start.
  top: { paddingHorizontal: INSET, gap: SPACE.md },
});
