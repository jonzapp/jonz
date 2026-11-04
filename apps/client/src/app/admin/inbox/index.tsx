import { REPORT_COPY, REPORT_FACETS, REPORT_WHEN, reportAge, reportGist, type ListAsk } from '@app/core';
import { router } from 'expo-router';
import { InboxIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { inboxCount, inboxFilter, inboxPage, type InboxCursor, type InboxRow } from '@/api/reports';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Avatar } from '@/components/avatar';
import { Row } from '@/components/row';
import { ReportChip } from '@/components/report/report-parts';
import { INBOX_KEY, ReportPanel } from '@/components/report/report-panel';
import { Columns, Screen, useColumns } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { SPACE } from '@/theme';


/** The Inbox's columns on a laptop. */
const INBOX_TABLE: readonly ListColumn[] = [
  { key: 'from', label: REPORT_COPY.from, width: 132 },
  { key: 'what', label: REPORT_COPY.what, flex: 1 },
  { key: 'kind', label: REPORT_COPY.kindColumn, width: 84 },
  { key: 'by', label: REPORT_COPY.byColumn, width: 64 },
  { key: 'state', label: REPORT_COPY.stateColumn, width: 104 },
  { key: 'when', label: REPORT_COPY.when, width: 64, end: true },
];

/**
 * Problems, ideas and questions people sent from the app, newest first,
 * opening on what's waiting for an answer. On a laptop the chosen one opens
 * beside the list; on a phone it's a page of its own.
 */
export default function InboxPage() {
  const busy = useBusyList({
    key: INBOX_KEY,
    facets: REPORT_FACETS,
    when: REPORT_WHEN,
    rows: (cursor: InboxCursor | null, ask: ListAsk) => inboxPage(cursor, inboxFilter(ask)),
    count: (ask) => inboxCount(inboxFilter(ask)),
    cursor: (report: InboxRow) => ({ at: report.sentAt, id: report.id }),
  });
  return (
    <Screen spreads bar={<TitleBar title={REPORT_COPY.inbox} />} onNearEnd={busy.onNearEnd} testID="admin-inbox">
      <Inbox busy={busy} />
    </Screen>
  );
}

function Inbox({ busy }: { busy: BusyList<InboxRow> }) {
  const two = useColumns();
  const [chosenId, setChosen] = useState<string | null>(null);
  const chosen = busy.items.find((r) => r.id === chosenId) ?? busy.items[0] ?? null;
  const now = new Date();
  const list = (
    <BusyListView
      busy={busy}
      name="inbox"
      placeholder={REPORT_COPY.searchPlaceholder}
      noun={REPORT_COPY.count}
      columns={INBOX_TABLE}
      tableRow={(report) => (
        <ListTableRow
          key={report.id}
          columns={INBOX_TABLE}
          cells={{
            from: report.name ?? REPORT_COPY.gone,
            what: whatOf(report),
            kind: REPORT_COPY.kind[report.kind],
            by: REPORT_COPY.source[report.source],
            state: <ReportChip state={report.state} owner />,
            when: reportAge(report.sentAt, now),
          }}
          quiet={['kind', 'by', 'when']}
          strong={['from']}
          chosen={chosen?.id === report.id}
          onPress={() => setChosen(report.id)}
          accessibilityLabel={`${report.name ?? REPORT_COPY.gone}, ${reportGist(report.words)}`}
          testID={`inbox-${report.id}`}
        />
      )}
      row={(report) => (
        <Row
          key={report.id}
          leading={<Avatar name={report.name ?? REPORT_COPY.gone} userId={report.userId ?? report.id} />}
          title={report.name ?? REPORT_COPY.gone}
          meta={`${whatOf(report)}\n${[
            REPORT_COPY.kind[report.kind],
            report.source === 'email' ? REPORT_COPY.byEmail.toLowerCase() : null,
            report.house ?? (report.source === 'email' ? null : REPORT_COPY.noHouse),
            reportAge(report.sentAt, now),
          ]
            .filter(Boolean)
            .join(', ')}`}
          metaLines={2}
          trailing={report.state === 'new' ? <ReportChip state={report.state} owner /> : undefined}
          onPress={() => router.push(`/admin/inbox/${report.id}` as never)}
          chevron
          testID={`inbox-${report.id}`}
        />
      )}
      empty={{ icon: InboxIcon, title: REPORT_COPY.empty, body: REPORT_COPY.emptyBody }}
    />
  );
  // A report the panel leads to (the one it's the same as) may not be in this page of the list.
  const side = chosenId ?? chosen?.id ?? null;
  if (two) return <Columns main={list} side={side ? <ReportPanel key={side} id={side} onOpen={setChosen} /> : <View style={styles.none} />} />;
  return list;
}

/** What they said, short, with how many more reported the same thing. */
function whatOf(report: InboxRow): string {
  const gist = reportGist(report.subject && report.source === 'email' ? `${report.subject}: ${report.words}` : report.words);
  return report.also > 0 ? `${gist} ${REPORT_COPY.also(report.also)}` : gist;
}

const styles = StyleSheet.create({
  none: { gap: SPACE.lg },
});
