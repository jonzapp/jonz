import { RECORD_COPY, recordBreakdown, shareLine, signedPoints, type BreakdownLine, type RecordSpan } from '@app/core';
import { useState } from 'react';

import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { Waiting } from '@/components/waiting';
import { RecordOutline } from '@/components/page-outlines';
import { useHouse } from '@/hooks/use-house';
import { usePull } from '@/hooks/use-refresh';
import { useRecord } from '@/hooks/use-record';
import { useTable } from '@/hooks/use-table';

/**
 * One person's track record over a span, read for their page on a phone or
 * for beside the grid on a laptop: their name ("Glyn (you)" for you), where
 * their points come from, and what the deal does about where they stand.
 */
export function usePersonRecord(houseId: string, userId: string, personId: string, span: RecordSpan) {
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
  return {
    you,
    name,
    total: you ? RECORD_COPY.totalYou : RECORD_COPY.total(nameOf(personId)),
    breakdown,
    next,
    failed: query.isError || rows.isError,
    retry: () => void Promise.all([query.refetch(), rows.refetch()]),
    refreshing,
    pull,
  };
}

export type PersonRecord = ReturnType<typeof usePersonRecord>;

/**
 * Where a person's points come from over the span, line by line in the order
 * they add up (their share off first, then each kind of John, a miss adding
 * nothing), each line opening onto its Johns, and the sum at the bottom.
 * Then what the deal does about where they stand over the weeks it
 * remembers. Beside the grid on a laptop, the first section names whose it
 * is at its right, as the grid's names "On time".
 */
export function PersonSections({ record, beside = false }: { record: PersonRecord; beside?: boolean }) {
  const { you, name, total, breakdown, next } = record;
  if (!breakdown) {
    return <Waiting ready={false} failed={record.failed} onRetry={record.retry} outline={<RecordOutline />} />;
  }
  return (
    <>
      <Section label={RECORD_COPY.whereFrom} right={beside ? name : undefined} testID="record-breakdown">
        {breakdown.lines.map((line) => (
          <LineRows key={line.key} line={line} you={you} weeks={breakdown.weeks} />
        ))}
        <Row title={total} meta={breakdown.range} trailing={signedPoints(breakdown.total)} testID="record-total" />
      </Section>
      {next ? (
        <Section label={RECORD_COPY.next} testID="record-next">
          <Row title={next.title} meta={next.meta.map((m) => m.text).join(', ')} titleLines={2} metaLines={2} />
        </Section>
      ) : null}
    </>
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
