import { REPORT_FACETS, REPORT_WHEN, reportAge, reportGist, type ListAsk, type Words } from '@app/core';
import { router, useLocalSearchParams } from 'expo-router';
import { InboxIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { inboxCount, inboxFilter, inboxPage, type InboxCursor, type InboxRow } from '@/api/reports';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Avatar } from '@/components/avatar';
import { Row } from '@/components/row';
import { ReportChip } from '@/components/report/report-parts';
import { INBOX_KEY, ReportPanel } from '@/components/admin/report-panel';
import { Columns, Screen, useColumns } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** The Inbox's columns on a laptop. */
const inboxTable = (words: Words): readonly ListColumn[] => [
  { key: 'from', label: words('common.report.from'), width: 132 },
  { key: 'what', label: words('common.report.what'), flex: 1 },
  { key: 'kind', label: words('common.report.kindColumn'), width: 84 },
  { key: 'by', label: words('common.report.byColumn'), width: 64 },
  { key: 'state', label: words('common.report.stateColumn'), width: 104 },
  { key: 'when', label: words('common.report.when'), width: 64, end: true },
];

/**
 * Problems, ideas and questions people sent from the app, newest first,
 * opening on what's waiting for an answer. On a laptop the chosen one opens
 * beside the list; on a phone it's a page of its own.
 */
export default function InboxPage() {
  const words = useWords();
  const busy = useBusyList({
    key: INBOX_KEY,
    facets: REPORT_FACETS,
    when: REPORT_WHEN,
    rows: (cursor: InboxCursor | null, ask: ListAsk) => inboxPage(cursor, inboxFilter(ask)),
    count: (ask) => inboxCount(inboxFilter(ask)),
  });
  return (
    <Screen spreads bar={<TitleBar title={words('common.report.inbox')} />} onNearEnd={busy.onNearEnd} testID="admin-inbox">
      <Inbox busy={busy} />
    </Screen>
  );
}

function Inbox({ busy }: { busy: BusyList<InboxRow> }) {
  const words = useWords();
  const two = useColumns();
  // A link in (the Overview's Needs you, a pushed page opened on a laptop) names the one to open with ?open=.
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [chosenId, setChosen] = useState<string | null>(open ?? null);
  const shownId = chosenId ?? busy.items[0]?.id ?? null;
  const now = new Date();
  const list = (
    <BusyListView
      busy={busy}
      name="inbox"
      placeholder={words('common.report.searchPlaceholder')}
      noun={(count: string) => words('common.report.count', { count })}
      columns={inboxTable(words)}
      tableRow={(report) => (
        <ListTableRow
          key={report.id}
          columns={inboxTable(words)}
          cells={{
            from: report.name ?? words('common.report.gone'),
            what: whatOf(report, words),
            kind: words(`common.report.kind.${report.kind}` as const),
            by: words(`common.report.source.${report.source}` as const),
            state: <ReportChip state={report.state} owner />,
            when: reportAge(report.sentAt, now),
          }}
          quiet={['kind', 'by', 'when']}
          strong={['from']}
          chosen={shownId === report.id}
          onPress={() => setChosen(report.id)}
          accessibilityLabel={`${report.name ?? words('common.report.gone')}, ${reportGist(report.words)}`}
          testID={`inbox-${report.id}`}
        />
      )}
      row={(report) => (
        <Row
          key={report.id}
          leading={<Avatar name={report.name ?? words('common.report.gone')} userId={report.userId ?? report.id} />}
          title={report.name ?? words('common.report.gone')}
          meta={`${whatOf(report, words)}\n${[
            words(`common.report.kind.${report.kind}` as const),
            report.source === 'email' ? words('common.report.byEmail').toLowerCase() : null,
            report.house ?? (report.source === 'email' ? null : words('common.report.noHouse')),
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
      empty={{ icon: InboxIcon, title: words('common.report.empty'), body: words('common.report.emptyBody') }}
    />
  );
  // A report the panel leads to (the one it's the same as) may not be in this page of the list.
  if (two) return <Columns main={list} side={shownId ? <ReportPanel key={shownId} id={shownId} onOpen={setChosen} /> : <View style={styles.none} />} />;
  return list;
}

/** What they said, short, with how many more reported the same thing. */
function whatOf(report: InboxRow, words: Words): string {
  const gist = reportGist(report.subject && report.source === 'email' ? `${report.subject}: ${report.words}` : report.words);
  return report.also > 0 ? `${gist} ${words('common.report.also', { count: report.also })}` : gist;
}

const styles = StyleSheet.create({
  none: { gap: SPACE.lg },
});
