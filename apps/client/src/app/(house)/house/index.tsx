import { familyHides, memberCan, monthOf, overviewFigures, hasPass, type OverviewFigure } from '@app/core';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Figures } from '@/components/figures';
import { PassLocked, PassSection } from '@/components/house-page/pass-section';
import { PocketSection } from '@/components/house-page/pocket-section';
import { SettleUpSection } from '@/components/house-page/settle-up';
import { SetupSection } from '@/components/house-page/setup-section';
import { TableSection } from '@/components/house-page/table-section';
import { WallSection } from '@/components/house-page/wall-section';
import { useHouseWorkspace } from '@/components/house/workspace';
import { Pair } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { ReadFailed } from '@/components/read-state';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { TitleBar } from '@/components/title-bar';
import { TourSpot, useTourOffer } from '@/components/tour/tour-spot';
import { useAway } from '@/hooks/use-away';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePocket } from '@/hooks/use-pocket';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { useStake } from '@/hooks/use-stake';
import { useTable } from '@/hooks/use-table';
import { Waiting } from '@/components/waiting';
import { HouseOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';
import { INSET } from '@/theme';

/** Which half of House a phone shows. */
type Shown = 'overview' | 'setup';

/**
 * House, the third tab: the house's Overview. Four figures, then settling
 * up while there's any, then the Table and the Wall's latest. On a phone a
 * switch at the top shows that, or Setup: the house's setup and the House
 * Pass. Your own settings are the You tab's. A kid's House is short enough
 * for one page: pocket money, the Table, the Wall and how the family runs
 * (to read). Each section is its own component in components/house-page. Without the Pass
 * the figures and the Table give way to a row to the
 * Pass page. The pages it pushes keep the tabs (house/_layout is a stack).
 */
export default function HouseScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <HouseFor houseId={house!.id} userId={session!.user.id} />;
}

function HouseFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const table = useTable(houseId, query.data);
  const stake = useStake(houseId, query.data);
  const away = useAway(houseId, query.data);
  const pocket = usePocket(houseId, query.data);
  // Who lives here, the rules and time away aren't sent over Realtime, so
  // read the house again each time House comes into view.
  useReadOnFocus(query.refetch);
  const { refreshing, pull } = usePull(houseId, () =>
    Promise.all([query.refetch(), table.refetch(), stake.refetch(), away.refetch(), pocket.refetch()]),
  );

  // Which half a phone shows. Kept here, so it's still the same on the way back from a setup page.
  const [shown, setShown] = useState<Shown>('overview');
  const snapshot = view?.snapshot;
  const bar = <TitleBar title={snapshot?.house.name ?? words('common.title.house')} ask={memberCan(view?.me, 'house:read')} />;

  return (
    <Screen bar={bar} fills refreshing={refreshing} onRefresh={pull} testID="house-screen">
      <PageTitle page={words('common.title.house')} />
      <Waiting ready={view != null} failed={query.isError} onRetry={() => void query.refetch()} outline={<HouseOutline />}>
        {() => (
          <HouseSections
            houseId={houseId}
            userId={userId}
            view={view!}
            table={table}
            stake={stake}
            away={away}
            pocket={pocket}
            shown={shown}
            onShow={setShown}
          />
        )}
      </Waiting>
    </Screen>
  );
}

/** What a phone's Setup half hides that a tour lights. */
const HIDDEN_BY_SETUP = ['house.table', 'house.wall'] as const;
const NONE = [] as const;

/** The page each of the Overview's figures opens. */
const FIGURE_PAGE: Record<OverviewFigure['key'], Href> = {
  money: '/house/stake',
  stake: '/house/rules',
  people: '/house/away',
  johns: '/house/johns',
};

/**
 * The Overview's sections: the house at a glance in four figures (your
 * month, the stake, the housemates and the John list, each opening its
 * page), anything from a closed month still to settle, then the Table
 * beside the Wall's latest. On a phone the Wall comes under the Table, and
 * the setup and the Pass are the switch's other half; on a laptop those are
 * in House's list beside the page. A kid has no switch: the family's
 * setup, to read, comes under the Wall.
 */
function HouseSections({
  houseId,
  userId,
  view,
  table,
  stake,
  away,
  pocket,
  shown,
  onShow,
}: {
  houseId: string;
  userId: string;
  view: HouseView;
  table: ReturnType<typeof useTable>;
  stake: ReturnType<typeof useStake>;
  away: ReturnType<typeof useAway>;
  pocket: ReturnType<typeof usePocket>;
  shown: Shown;
  onShow: (shown: Shown) => void;
}) {
  const { listed } = useHouseWorkspace();
  const words = useWords(view.snapshot.house.kind);
  const list = useJohnList(houseId);
  // The John list doesn't come over Realtime, and a housemate may have changed it.
  useReadOnFocus(list.refetch, { skipFirst: true });
  const { rules, members } = view.snapshot;
  const unlocked = hasPass(view.snapshot.house.pass, view.now);
  const figures = overviewFigures({
    stake: stake.data,
    month: monthOf(view.now, rules.timezone),
    me: userId,
    rules,
    housemates: members.length,
    words,
    johns: list.data?.johns,
  }, words).map((figure) => ({ ...figure, href: FIGURE_PAGE[figure.key] }));
  const me = view.me;
  // A family has no Stake: no money figures, no settling up (familyHides). Pocket money in their place.
  const noStake = familyHides(view.snapshot.house.kind).stake;
  // A kid in a family: their parents run it, so its setup is theirs to read and the Pass isn't theirs to buy.
  const kid = view.snapshot.house.kind === 'family' && me?.role !== 'admin';
  // On a phone the page is two halves under a switch; a kid's is short enough to be one.
  const halves = !listed && !kid;
  // With Setup showing, a tour's Table and Wall steps turn the switch back to Overview.
  const toOverview = useCallback(() => onShow('overview'), [onShow]);
  useTourOffer(halves && shown === 'setup' ? HIDDEN_BY_SETUP : NONE, toOverview);
  const overview = (
    <>
      {noStake ? (
        <PocketSection houseId={houseId} userId={userId} view={view} pocket={pocket} />
      ) : unlocked ? (
        <>
          {stake.isError ? <ReadFailed message={words('house.page.stakeUnreadable')} onRetry={() => void stake.refetch()} /> : null}
          <Figures figures={figures} label={words('house.page.figures')} testID="house-figures" />
          {stake.data ? <SettleUpSection houseId={houseId} userId={userId} view={view} stake={stake.data} /> : null}
        </>
      ) : (
        <PassLocked label={words('house.pass.stake')} feature={words('house.pass.stake')} testID="stake-locked" />
      )}
      <Pair
        testID="house-pair"
        start={
          unlocked ? (
            <TableSection userId={userId} view={view} table={table} stake={stake} away={away} pocket={pocket} />
          ) : (
            // Locked, the tour still lights where the Table would be.
            <TourSpot id="house.table">
              <PassLocked label={words('house.pass.table')} feature={words('house.pass.table')} testID="table-locked" />
            </TourSpot>
          )
        }
        end={<WallSection houseId={houseId} userId={userId} view={view} />}
      />
      {/* On a laptop the setup half is House's list beside the page, so Free and House Pass comes under the Table and the Wall. */}
      {listed && !kid ? <PassSection view={view} /> : null}
    </>
  );
  const setup = (
    <>
      <SetupSection houseId={houseId} userId={userId} view={view} kid={kid} spot={!halves} />
      {kid ? null : <PassSection view={view} />}
    </>
  );
  if (!halves) {
    return (
      <>
        {overview}
        {listed ? null : setup}
      </>
    );
  }
  return (
    <>
      {/* The tour's "House setup" lights the switch, whichever half is showing. */}
      <TourSpot id="house.setup">
        <View style={styles.pick}>
          <Segmented
            options={[
              { value: 'overview', label: words('house.shows.overview') },
              { value: 'setup', label: words('house.shows.setup') },
            ]}
            value={shown}
            onChange={onShow}
            label={words('house.shows.label')}
            testID="house-shows"
          />
        </View>
      </TourSpot>
      {shown === 'overview' ? overview : setup}
    </>
  );
}

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start.
  pick: { paddingHorizontal: INSET, alignItems: 'flex-start' },
});
