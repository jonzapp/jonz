import { listTime, MESSAGE_COPY, MESSAGE_FACETS, MESSAGE_WHEN, reportAge, sentMeta, sentTo, sentWays, type ListAsk } from '@app/core';
import { useRouter } from 'expo-router';
import { MessageSquareIcon, PlusIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { sentCount, sentFilter, sentPage, type SentCursor, type SentRow } from '@/api/messages';
import { AdminSwitch } from '@/components/admin/admin-shell';
import { ownerZone } from '@/components/admin/audit-entry';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { MessageForm, SENT_KEY } from '@/components/admin/message-form';
import { MessagePreview } from '@/components/admin/message-parts';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { Body, Lead, Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { SPACE } from '@/theme';

/** Every sent message's columns on a laptop. */
const SENT_TABLE: readonly ListColumn[] = [
  { key: 'subject', label: MESSAGE_COPY.columns.subject, flex: 1 },
  { key: 'to', label: MESSAGE_COPY.columns.to, width: 160 },
  { key: 'ways', label: MESSAGE_COPY.columns.ways, width: 168 },
  { key: 'when', label: MESSAGE_COPY.columns.when, width: 64, end: true },
];

/**
 * Messages, list first, as Notices is: everything the owner has sent, tests
 * included, newest first, as a busy list (the one search box finds a
 * subject, the words, a person or a house, and filters by who it was for,
 * which way it went and when), with New message over it. On a laptop the
 * new message is written in the side panel, and a sent one opens there in
 * its place; on a phone New message is a page of its own and a sent one
 * opens as a sheet. Someone whose app role can't send (support) gets the
 * list alone.
 */
export default function MessagesPage() {
  const busy = useBusyList({
    key: [...SENT_KEY, 'all'],
    facets: MESSAGE_FACETS,
    when: MESSAGE_WHEN,
    rows: (cursor: SentCursor | null, ask: ListAsk) => sentPage(cursor, sentFilter(ask)),
    count: (ask) => sentCount(sentFilter(ask)),
  });
  return (
    <Screen spreads bar={<TitleBar title={MESSAGE_COPY.page} />} onNearEnd={busy.onNearEnd} testID="admin-messages">
      <AdminSwitch page="messages" />
      <Messages busy={busy} />
    </Screen>
  );
}

function Messages({ busy }: { busy: BusyList<SentRow> }) {
  const two = useColumns();
  const may = useOwnerMay('messages:write');
  const router = useRouter();
  const [open, setOpen] = useState<SentRow | null>(null);
  const now = new Date();
  // The side panel holds the new message, or a sent one in its place.
  const beside = two && may;

  const list = (
    <>
      {may ? (
        <ButtonRow atEdge>
          <Button
            label={MESSAGE_COPY.newMessage}
            icon={PlusIcon}
            // On a laptop the form's own Send is the page's one amber button.
            variant={beside ? 'outline' : 'primary'}
            onPress={() => (beside ? setOpen(null) : router.push('/admin/messages/new' as never))}
            testID="message-new"
          />
        </ButtonRow>
      ) : null}
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
            chosen={beside && open?.id === m.id}
            onPress={() => setOpen(m)}
            accessibilityLabel={`${m.subject}, ${sentMeta(m)}`}
            testID={`sent-${m.id}`}
          />
        )}
        row={(m) => (
          <Row key={m.id} title={m.subject} meta={`${sentMeta(m)}, ${reportAge(m.sentAt, now)}`} metaLines={2} chevron onPress={() => setOpen(m)} testID={`sent-${m.id}`} />
        )}
        empty={{ icon: MessageSquareIcon, title: MESSAGE_COPY.nothingSent, body: MESSAGE_COPY.nothingSentBody }}
      />
    </>
  );
  const sent = open ? (
    <>
      <Meta>{`${sentMeta(open)}, ${listTime(open.sentAt, now, ownerZone(), false)}`}</Meta>
      <Body>{open.body}</Body>
    </>
  ) : null;

  return (
    <>
      {beside ? (
        <Columns
          main={list}
          side={
            <View style={styles.side} testID="message-side">
              {open ? (
                <>
                  <Lead header>{open.subject}</Lead>
                  {sent}
                  <MessagePreview subject={open.subject} body={open.body} push={open.push || !open.wall} wall={open.wall} />
                </>
              ) : null}
              {/* The new message keeps its words while a sent one is read in its place. */}
              <View style={[styles.side, open ? styles.away : null]}>
                <Lead header>{MESSAGE_COPY.newMessage}</Lead>
                <MessageForm beside />
              </View>
            </View>
          }
        />
      ) : (
        <>
          {list}
          <Sheet visible={open !== null} title={open?.subject} onClose={() => setOpen(null)} testID="sent-sheet">
            {sent}
          </Sheet>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  side: { gap: SPACE.lg },
  away: { display: 'none' },
});
