import {
  dayLabel,
  HISTORY_COPY,
  LIST_COPY,
  SECTION_LABEL,
  WALL_COPY,
  WALL_FEED_COPY,
  wallDays,
  wallFeedRow,
  type WallFeedRow,
} from '@app/core';
import { useLocalSearchParams } from 'expo-router';
import { MegaphoneIcon } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Fold } from '@/components/fold';
import { HistoryList, type HistoryScene } from '@/components/house/history-list';
import { useJohnSheet } from '@/components/john-sheet';
import { ListFoot, nearEnd, type ListMore } from '@/components/list-foot';
import { Pair, useSideBySide } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { ReadFailed } from '@/components/read-state';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { WallEventSheet } from '@/components/wall/event-sheet';
import { WallEventRow, WallPhoto, wallScene } from '@/components/wall/wall-row';
import { useHistory } from '@/hooks/use-history';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull } from '@/hooks/use-refresh';
import { useReact, useWallFeed, wallPages } from '@/hooks/use-wall';
import { INSET } from '@/theme';
import { Waiting } from '@/components/waiting';
import { WallOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

type Shown = 'wall' | 'history';

/**
 * The whole Wall, pushed from House: what the house did, a day at a time,
 * latest first, with a day's ticks made on time folded into one row at its
 * foot, several misses or late ticks by one person in a row folded into one,
 * photo receipts under their ticks, and older days on request. A row about
 * this week's John opens it in the John sheet; any other opens the event in
 * full. Holding a row down shows it with all four reactions. Older days
 * load as you scroll, under the foot every long list has.
 *
 * History (once a page of its own) sits beside it on a laptop: every move,
 * with Undo while it still reaches. On a phone a switch at the top shows
 * one or the other; `?view=history` opens on History.
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
  const history = useHistory(houseId);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([feed.refetch(), history.refetch()]));
  const [open, setOpen] = useState<string | null>(null);
  const asked = useLocalSearchParams<{ view?: string }>().view;
  const [shown, setShown] = useState<Shown>(asked === 'history' ? 'history' : 'wall');
  // Whether the two sit side by side, as the page lays them out, so scrolling to the end reads more of each.
  const [beside, setBeside] = useState(false);

  const { events, photos } = wallPages(feed.data?.pages ?? []);
  const scene = view ? wallScene(view, userId, events, words, true) : null;
  const rows = scene ? events.map((e) => wallFeedRow(e, scene)) : [];
  const openRow = open ? rows.find((r) => r.id === open) : undefined;
  if (open && feed.data && scene && !openRow) setOpen(null);
  const more: ListMore = {
    has: feed.hasNextPage,
    busy: feed.isFetchingNextPage,
    failed: feed.isFetchNextPageError,
    load: () => void feed.fetchNextPage(),
  };
  const oldest = events[events.length - 1];
  const historyMore: ListMore = {
    has: history.hasNextPage,
    busy: history.isFetchingNextPage,
    failed: history.isFetchNextPageError,
    load: () => void history.fetchNextPage(),
  };

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
        onReact={(kind, on) => react(row.id, kind, on)}
        onPress={() =>
          row.board ? johnSheet.open(row.board.assignmentId, row.board.vote ? 'vote' : undefined) : show(row.id)
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
          message={WALL_FEED_COPY.unreadable}
          onRetry={() => {
            if (feed.isError) void feed.refetch();
            if (query.isError) void query.refetch();
          }}
        />
      ) : (
        <Waiting ready={false} label={WALL_FEED_COPY.reading} outline={<WallOutline />} />
      );
  } else if (rows.length === 0) {
    body = <EmptyState icon={MegaphoneIcon} title={WALL_FEED_COPY.emptyTitle} body={WALL_COPY.empty} testID="wall-empty" />;
  } else {
    const days = wallDays(rows, scene.zone, scene.now);
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
        <ListFoot more={more} shown={oldest && scene ? LIST_COPY.backTo(dayLabel(oldest.createdAt, scene.zone)) : null} testID="wall-foot" />
      </>
    );
  }

  let historyBody;
  if (!history.data || !view) {
    historyBody =
      history.isError || query.isError ? (
        <ReadFailed
          message={HISTORY_COPY.unreadable}
          onRetry={() => {
            if (history.isError) void history.refetch();
            if (query.isError) void query.refetch();
          }}
        />
      ) : (
        <Waiting ready={false} label={HISTORY_COPY.reading} outline={<WallOutline />} />
      );
  } else {
    const names = new Map(view.snapshot.members.map((m) => [m.userId, m.name]));
    const historyScene: HistoryScene = {
      houseId,
      me: userId,
      zone: view.snapshot.rules.timezone,
      currency: view.snapshot.rules.currency,
      kind: view.snapshot.house.kind,
      now: view.now,
      nameOf: (id) => (id === userId ? 'You' : ((id && names.get(id)) ?? HISTORY_COPY.someone)),
      fullName: (id) => (id && names.get(id)) ?? HISTORY_COPY.someone,
    };
    historyBody = <HistoryList items={history.data.pages.flat()} scene={historyScene} more={historyMore} />;
  }

  const wallNear = nearEnd(more);
  const historyNear = nearEnd(historyMore);
  return (
    <Screen
      bar={<TitleBar title={WALL_COPY.title} back="/house" backLabel={SECTION_LABEL.house} />}
      refreshing={refreshing}
      onRefresh={pull}
      onNearEnd={() => {
        if (beside || shown === 'wall') wallNear();
        if (beside || shown === 'history') historyNear();
      }}
      fills
      testID="wall-screen"
    >
      <PageTitle page={WALL_COPY.title} />
      <WallAndHistory wall={body} history={historyBody} shown={shown} onShow={setShown} onBeside={setBeside} />
      <WallEventSheet
        row={openRow ?? null}
        problem={openRow && problemAt === openRow.id ? problem : null}
        onReact={(kind, on) => openRow && react(openRow.id, kind, on)}
        onClose={() => setOpen(null)}
      />
    </Screen>
  );
}

/**
 * The Wall and History: side by side on a laptop, History under its name
 * and what it's for; on a phone, a switch at the top and whichever is
 * picked. Tells the page which way it went (`onBeside`).
 */
function WallAndHistory({
  wall,
  history,
  shown,
  onShow,
  onBeside,
}: {
  wall: ReactNode;
  history: ReactNode;
  shown: Shown;
  onShow: (shown: Shown) => void;
  onBeside: (beside: boolean) => void;
}) {
  const beside = useSideBySide();
  useEffect(() => onBeside(beside), [beside, onBeside]);
  if (beside) {
    return (
      <Pair
        testID="wall-pair"
        ratio={1.25}
        start={wall}
        end={
          <Section label={HISTORY_COPY.title} right={HISTORY_COPY.meta} bare testID="history-section">
            {history}
          </Section>
        }
      />
    );
  }
  return (
    <>
      <View style={styles.pick}>
        <Segmented
          options={[
            { value: 'wall', label: WALL_COPY.title },
            { value: 'history', label: HISTORY_COPY.title },
          ]}
          value={shown}
          onChange={onShow}
          label={HISTORY_COPY.show}
          testID="wall-shows"
        />
      </View>
      {shown === 'wall' ? wall : history}
    </>
  );
}

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start.
  pick: { paddingHorizontal: INSET, alignItems: 'flex-start' },
});
