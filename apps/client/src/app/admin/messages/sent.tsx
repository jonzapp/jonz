import { listTime, MESSAGE_COPY, MESSAGE_FACETS, MESSAGE_WHEN, reportAge, sentMeta, sentTo, sentWays, type ListAsk } from '@app/core';
import { MessageSquareIcon } from 'lucide-react-native';
import { useState } from 'react';

import { sentCount, sentFilter, sentPage, type SentCursor, type SentRow } from '@/api/messages';
import { BusyListView, useBusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Row } from '@/components/row';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { Body, Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';

/** Every sent message's columns on a laptop. */
const SENT_TABLE: readonly ListColumn[] = [
  { key: 'subject', label: MESSAGE_COPY.columns.subject, flex: 1 },
  { key: 'to', label: MESSAGE_COPY.columns.to, width: 160 },
  { key: 'ways', label: MESSAGE_COPY.columns.ways, width: 168 },
  { key: 'when', label: MESSAGE_COPY.columns.when, width: 64, end: true },
];

/**
 * Everything the owner has sent, tests included, newest first, as a busy
 * list: the one search box finds a subject, the words, a person or a house,
 * and filters by who it was for, which way it went and when.
 */
export default function SentPage() {
  const busy = useBusyList({
    key: ['owner-sent', 'all'],
    facets: MESSAGE_FACETS,
    when: MESSAGE_WHEN,
    rows: (cursor: SentCursor | null, ask: ListAsk) => sentPage(cursor, sentFilter(ask)),
    count: (ask) => sentCount(sentFilter(ask)),
  });
  const [open, setOpen] = useState<SentRow | null>(null);
  const now = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Screen spreads bar={<TitleBar title={MESSAGE_COPY.allSent} back={'/admin/messages' as never} backLabel={MESSAGE_COPY.page} />} onNearEnd={busy.onNearEnd} testID="admin-sent">
      <BusyListView
        busy={busy}
        name="sent"
        placeholder={MESSAGE_COPY.searchPlaceholder}
        noun={MESSAGE_COPY.sentCount}
        columns={SENT_TABLE}
        tableRow={(m) => (
          <ListTableRow
            key={m.id}
            columns={SENT_TABLE}
            cells={{ subject: m.subject, to: sentTo(m), ways: sentWays(m), when: reportAge(m.sentAt, now) }}
            quiet={['ways', 'when']}
            strong={['subject']}
            onPress={() => setOpen(m)}
            accessibilityLabel={`${m.subject}, ${sentMeta(m)}`}
            testID={`sent-${m.id}`}
          />
        )}
        row={(m) => (
          <Row key={m.id} title={m.subject} meta={`${sentMeta(m)}, ${reportAge(m.sentAt, now)}`} metaLines={2} onPress={() => setOpen(m)} testID={`sent-${m.id}`} />
        )}
        empty={{ icon: MessageSquareIcon, title: MESSAGE_COPY.nothingSent, body: MESSAGE_COPY.nothingSentBody }}
      />
      <Sheet visible={open !== null} title={open?.subject} onClose={() => setOpen(null)} testID="sent-sheet">
        {open ? (
          <>
            <Meta>{`${sentMeta(open)}, ${listTime(open.sentAt, now, zone, false)}`}</Meta>
            <Body>{open.body}</Body>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
