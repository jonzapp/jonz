import {
  type Words,
  listTime,
  NOTICE_FACETS,
  NOTICE_WHEN,
  noticeLine,
  noticeState,
  noticeToShow,
  noticeWindow,
  type Notice,
  type NoticeKind,
  type NoticeState,
} from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MegaphoneIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { endNotice, liveNotices, noticeFilter, noticesCount, noticesPage, saveNotice, type NoticeCursor, type SavedNotice } from '@/api/owner';
import { ownerZone } from '@/components/admin/audit-entry';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/list-table';
import { NoticeEditor } from '@/components/admin/notice-editor';
import { StartTiles } from '@/components/admin/start-tiles';
import { NoticePreview } from '@/components/notice-banner';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Chip } from '@/components/status-mark';
import { Lead, Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { useToast } from '@/components/toast';
import { useNow } from '@/hooks/use-now';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { INSET, SPACE } from '@/theme';
import { AdminSwitch } from '@/components/admin/admin-shell';
import { useWords } from '@/hooks/use-words';

/** Holds a line's height where there's nothing to say; not words. */
const BLANK = ' ';

const KIND_LABEL: Record<NoticeKind, string> = { status: 'Status', offer: 'Offer', news: 'News' };
const STATE_LABEL: Record<NoticeState, string> = { live: 'Showing', scheduled: 'Starting later', ended: 'Ended' };

/** Every notice's columns on a laptop: its title, kind, whether it's on, and when it starts. */
const NOTICE_TABLE = (words: Words): readonly ListColumn[] => [
  { key: 'title', label: words('admin.notices.title'), flex: 1 },
  { key: 'kind', label: words('admin.notices.kind'), width: 96 },
  { key: 'state', label: words('admin.notices.state'), width: 128 },
  { key: 'starts', label: words('admin.notices.starts'), width: 144 },
];

/** What's being edited: a notice, a new one of a kind, or nothing. */
type Chosen = Notice | { start: NoticeKind } | null;
const isNew = (chosen: Chosen): chosen is { start: NoticeKind } => chosen !== null && 'start' in chosen;

/**
 * The owner's notices: what people see now, exactly as they see it, the
 * tiles that start a new one, then every notice as a busy list, newest
 * start first: the one search box finds words in a title or body, and
 * filters by kind, whether it's showing, starting later or over, and when
 * it started. The editor sits in the side panel on a laptop and rises as a
 * sheet on a phone.
 */
export default function NoticesPage() {
  const [chosen, setChosen] = useState<Chosen>(null);
  const busy = useBusyList({
    key: ['owner-notices'],
    facets: NOTICE_FACETS,
    when: NOTICE_WHEN,
    rows: (cursor: NoticeCursor | null, ask) =>
      noticesPage(cursor, noticeFilter(ask)).then((page) => ({ items: page.notices, more: page.more, next: page.next })),
    count: (ask) => noticesCount(noticeFilter(ask)),
  });
  return (
    <Screen spreads bar={<TitleBar title="Notices" />} onNearEnd={busy.onNearEnd} testID="admin-notices">
      <AdminSwitch page="notices" />
      <Notices busy={busy} chosen={chosen} choose={setChosen} />
    </Screen>
  );
}

function Notices({ busy, chosen, choose }: { busy: BusyList<Notice>; chosen: Chosen; choose: (next: Chosen) => void }) {
  const words = useWords();
  const two = useColumns();
  // Someone whose app role can't write notices (support) sees the list, with nothing to open.
  const may = useOwnerMay('notices:write');
  const toast = useToast();
  const queryClient = useQueryClient();
  const done = (message: string, copied: boolean) => {
    toast.show(copied ? message : words('admin.shell.copyFailed'));
    void queryClient.invalidateQueries({ queryKey: ['owner-notices'] });
    void queryClient.invalidateQueries({ queryKey: ['notices'] });
    choose(null);
  };
  const save = useMutation({
    mutationFn: (notice: SavedNotice) => saveNotice(notice),
    onSuccess: ({ copied }) => done(words('admin.shell.saved'), copied),
    onError: (error) => toast.show(error.message),
  });
  const end = useMutation({
    mutationFn: (id: string) => endNotice(id),
    onSuccess: ({ copied }) => done(words('admin.shell.ended'), copied),
    onError: (error) => toast.show(error.message),
  });

  const editing = chosen === null || isNew(chosen) ? null : chosen;
  const kind = isNew(chosen) ? chosen.start : 'status';
  const editor = (
    <NoticeEditor
      // A fresh form for each notice chosen.
      key={editing?.id ?? `new-${kind}`}
      notice={editing}
      kind={kind}
      waiting={save.isPending ? 'save' : end.isPending ? 'end' : null}
      onSave={(notice) => save.mutate(notice)}
      onEnd={editing && noticeState(editing, new Date()) !== 'ended' ? () => end.mutate(editing.id) : undefined}
    />
  );
  const list = <NoticeList busy={busy} chosen={two ? chosen : null} choose={may ? choose : undefined} />;

  if (!may) return list;
  if (two) {
    return (
      <Columns
        main={list}
        side={
          <View style={styles.side} testID="notice-side">
            <Lead header>{editing ? words('admin.shell.editNotice') : words(`admin.shell.start.${kind}.title` as const)}</Lead>
            {editor}
          </View>
        }
      />
    );
  }
  return (
    <>
      {list}
      <Sheet
        visible={chosen !== null}
        title={editing ? words('admin.shell.editNotice') : words(`admin.shell.start.${kind}.title` as const)}
        onClose={() => choose(null)}
        testID="notice-sheet"
      >
        {editor}
      </Sheet>
    </>
  );
}

function NoticeList({ busy, chosen, choose }: { busy: BusyList<Notice>; chosen: Chosen; choose?: (next: Chosen) => void }) {
  const words = useWords();
  const now = useNow();
  // What people see comes from the notices on now, whatever the list below is narrowed to.
  const live = useQuery({ queryKey: ['owner-notices', 'live'], queryFn: () => liveNotices() });
  const showing = live.data ? noticeToShow(live.data, {}, now) : null;
  const picked = (notice: Notice) => chosen !== null && !isNew(chosen) && chosen.id === notice.id;
  return (
    <>
      <Section label={words('admin.shell.whatPeopleSee')} bare testID="what-people-see">
        {showing ? <NoticePreview notice={showing} /> : <Meta style={styles.words}>{live.data ? words('admin.shell.nothingShowing') : BLANK}</Meta>}
        <Meta style={styles.words}>{words('admin.shell.onePerScreen')}</Meta>
      </Section>
      {/* A new notice starts from what's happening, under what people see, not from a button up in the title bar. */}
      {choose ? (
        <Section label={words('admin.shell.tellEveryone')}>
          <StartTiles chosen={isNew(chosen) ? chosen.start : null} onStart={(start) => choose({ start })} />
        </Section>
      ) : null}
      <Section label={words('admin.notices.every')} bare testID="notices-every">
        <BusyListView
          busy={busy}
          name="notices"
          placeholder={words('admin.notices.searchPlaceholder')}
          noun={(count: string) => words('admin.notices.count', { count })}
          columns={NOTICE_TABLE(words)}
          tableRow={(notice) => {
            const state = noticeState(notice, now);
            const starts = listTime(notice.startsAt, now, ownerZone(), false);
            return (
              <ListTableRow
                key={notice.id}
                columns={NOTICE_TABLE(words)}
                cells={{
                  title: notice.title,
                  kind: <Chip label={KIND_LABEL[notice.kind]} tone={notice.kind === 'status' ? 'hazard' : 'quiet'} />,
                  state: STATE_LABEL[state],
                  starts,
                }}
                quiet={['state', 'starts']}
                chosen={picked(notice)}
                onPress={choose ? () => choose(notice) : undefined}
                accessibilityLabel={[notice.title, KIND_LABEL[notice.kind], STATE_LABEL[state], noticeWindow(notice, now)].join(', ')}
                testID={`notice-row-${notice.id}`}
              />
            );
          }}
          row={(notice) => (
            <Row
              key={notice.id}
              title={notice.title}
              meta={noticeLine(notice, now)}
              trailing={<Chip label={KIND_LABEL[notice.kind]} tone={notice.kind === 'status' ? 'hazard' : 'quiet'} />}
              tint={picked(notice)}
              chevron={choose !== undefined}
              onPress={choose ? () => choose(notice) : undefined}
              testID={`notice-row-${notice.id}`}
            />
          )}
          empty={{ icon: MegaphoneIcon, title: words('admin.shell.noNotices'), body: words('admin.shell.noNoticesBody') }}
          foot={(last) => words('common.list.backTo', { day: listTime(last.startsAt, now, ownerZone(), false) })}
        />
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  side: { gap: SPACE.lg },
  // Words on the page start where a card's do, as the section's label over them.
  words: { paddingHorizontal: INSET },
});
