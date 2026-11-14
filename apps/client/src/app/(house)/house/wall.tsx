import { dayLabel, undoForPost, wallDays, wallFeedRow, type WallFeedRow } from '@app/core';
import { MegaphoneIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Fold } from '@/components/fold';
import { useJohnSheet } from '@/components/john-sheet';
import { ListFoot, nearEnd, type ListMore } from '@/components/list-foot';
import { PageTitle } from '@/components/page-title';
import { ReadFailed } from '@/components/read-state';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { WallEventSheet } from '@/components/wall/event-sheet';
import { WallEventRow, WallPhoto, wallScene } from '@/components/wall/wall-row';
import { useUndoable } from '@/hooks/use-undoable';
import { UndoMove } from '@/components/undo-move';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull } from '@/hooks/use-refresh';
import { useReact, useWallFeed, wallPages } from '@/hooks/use-wall';
import { Waiting } from '@/components/waiting';
import { WallOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';
import { useShownZone } from '@/hooks/use-shown-zone';

/**
 * The whole Wall, pushed from House: what the house did, a day at a time,
 * latest first, with a day's ticks made on time folded into one row at its
 * foot, several misses or late ticks by one person in a row folded into one,
 * photo receipts under their ticks, and older days on request. A row about
 * this week's John opens it in the John sheet; any other opens the event in
 * full, with Undo while the move it records can still be undone (History's
 * job, once a list of its own). Holding a row down shows it with all four
 * reactions. Older days load as you scroll, under the foot every long list has.
 */
export default function WallScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <WallFor houseId={house!.id} userId={session!.user.id} />;
}

function WallFor({ houseId, userId }: { houseId: string; userId: string }) {
  const { query, view } = useHouse(houseId, userId);
  const words = useWords(view?.snapshot.house.kind);
  const feed = useWallFeed(houseId, userId);
  const johnSheet = useJohnSheet();
  const { react, problem, problemAt, clear } = useReact(houseId, userId);
  const undoable = useUndoable(houseId);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([feed.refetch(), undoable.refetch()]));
  const [open, setOpen] = useState<string | null>(null);

  const { events, photos } = wallPages(feed.data?.pages ?? []);
  // Times and days on your own clock.
  const zone = useShownZone();
  const scene = view ? wallScene(view, { userId, events, words, zone, clock: true }) : null;
  const rows = scene ? events.map((e) => wallFeedRow(e, scene, words)) : [];
  const openRow = open ? rows.find((r) => r.id === open) : undefined;
  if (open && feed.data && scene && !openRow) setOpen(null);
  const more: ListMore = {
    has: feed.hasNextPage,
    busy: feed.isFetchingNextPage,
    failed: feed.isFetchNextPageError,
    load: () => void feed.fetchNextPage(),
  };
  const oldest = events[events.length - 1];
  const openPost = openRow ? events.find((e) => e.id === openRow.id) : undefined;
  const openUndo = openPost && undoable.data ? undoForPost(openPost, undoable.data) : null;

  function show(eventId: string) {
    // Another event's refusal stays with that event's row, not in this sheet.
    if (problemAt !== eventId) clear();
    setOpen(eventId);
  }

  const rowOf = (row: WallFeedRow) => (
    <View key={row.id}>
      <WallEventRow
        row={row}
        problem={problemAt === row.id && open !== row.id ? problem : null}
        onPress={() =>
          row.board ? johnSheet.open(row.board.assignmentId, row.board.vote ? 'vote' : undefined, row.reactable ? row.id : undefined) : show(row.id)
        }
        onReactions={() => show(row.id)}
      />
      {row.photoPath && photos[row.photoPath] ? <WallPhoto uri={photos[row.photoPath]} john={row.john} /> : null}
    </View>
  );

  let body;
  if (!feed.data || !view || !scene) {
    // The Wall's rows need the house too (who lives here, this week's board): either read failing says so.
    body =
      feed.isError || query.isError ? (
        <ReadFailed
          message={words('wall.feed.unreadable')}
          onRetry={() => {
            if (feed.isError) void feed.refetch();
            if (query.isError) void query.refetch();
          }}
        />
      ) : (
        <Waiting ready={false} label={words('wall.feed.reading')} outline={<WallOutline />} />
      );
  } else if (rows.length === 0) {
    body = <EmptyState icon={MegaphoneIcon} title={words('wall.feed.emptyTitle')} body={words('wall.page.empty')} testID="wall-empty" />;
  } else {
    const days = wallDays(rows, scene.zone, scene.now, words);
    body = (
      <>
        {days.map((day) => (
          <Section key={day.date} label={day.label} right={day.sub ?? undefined} testID="wall-day">
            {day.items.map((item) =>
              'fold' in item ? (
                <Fold
                  key={item.fold.id}
                  label={item.fold.label}
                  // A run by one person says when it ended; the day's on-time ticks say who.
                  meta={item.fold.detail ? undefined : <Meta>{item.fold.rows[0].when}</Meta>}
                  detail={item.fold.detail}
                  testID="wall-fold"
                >
                  {item.fold.rows.map(rowOf)}
                </Fold>
              ) : (
                rowOf(item.row)
              ),
            )}
          </Section>
        ))}
        <ListFoot more={more} shown={oldest && scene ? words('common.list.backTo', { day: dayLabel(oldest.createdAt, scene.zone, words) }) : null} testID="wall-foot" />
      </>
    );
  }

  return (
    <Screen
      bar={<TitleBar title={words('wall.page.title')} back="/house" backLabel={words('common.section.house')} />}
      refreshing={refreshing}
      onRefresh={pull}
      onNearEnd={nearEnd(more)}
      fills
      testID="wall-screen"
    >
      <PageTitle page={words('wall.page.title')} />
      {body}
      <WallEventSheet
        row={openRow ?? null}
        problem={openRow && problemAt === openRow.id ? problem : null}
        onReact={(kind, on) => openRow && react(openRow.id, kind, on)}
        onClose={() => setOpen(null)}
        undo={
          openUndo && view ? (
            <UndoMove
              key={openUndo.id}
              item={openUndo}
              scene={{ houseId, me: userId, currency: view.snapshot.rules.currency, nameOf: (id) => view.snapshot.members.find((m) => m.userId === id)?.name ?? words('wall.history.someone') }}
            />
          ) : undefined
        }
      />
    </Screen>
  );
}
