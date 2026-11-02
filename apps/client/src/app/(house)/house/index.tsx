import {
  HOUSE_LOWER_COPY,
  HOUSE_PAGE_COPY,
  monthOf,
  overviewFigures,
  PAGE_TITLE,
  PASS_COPY,
  passUnlocked,
  type OverviewFigure,
} from '@app/core';
import type { Href } from 'expo-router';

import { Avatar } from '@/components/avatar';
import { Figures } from '@/components/figures';
import { PassLocked, PassSection } from '@/components/house-page/pass-section';
import { SettleUpSection } from '@/components/house-page/settle-up';
import { SetupSection } from '@/components/house-page/setup-section';
import { TableSection } from '@/components/house-page/table-section';
import { WallSection } from '@/components/house-page/wall-section';
import { useHouseWorkspace } from '@/components/house/workspace';
import { Pair } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { Reading, ReadFailed } from '@/components/read-state';
import { Row } from '@/components/row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TitleBar } from '@/components/title-bar';
import { useAway } from '@/hooks/use-away';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { useStake } from '@/hooks/use-stake';
import { useTable } from '@/hooks/use-table';

/**
 * House, the third tab: the house's Overview. Four figures, then settling
 * up while there's any, then the Table and the Wall's latest; on a phone,
 * the house's setup, the House Pass and the way to You under them. Each
 * section is its own component in components/house-page. Without the Pass
 * (once it's enforced) the figures and the Table give way to a row to the
 * Pass page. The pages it pushes keep the tabs (house/_layout is a stack).
 */
export default function HouseScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <HouseFor houseId={house!.id} userId={session!.user.id} />;
}

function HouseFor({ houseId, userId }: { houseId: string; userId: string }) {
  const { query, view } = useHouse(houseId, userId);
  const table = useTable(houseId, query.data);
  const stake = useStake(houseId, query.data);
  const away = useAway(houseId, query.data);
  // Who lives here, the rules and time away aren't sent over Realtime, so
  // read the house again each time House comes into view.
  useReadOnFocus(query.refetch);
  const { refreshing, pull } = usePull(houseId, () =>
    Promise.all([query.refetch(), table.refetch(), stake.refetch(), away.refetch()]),
  );

  const snapshot = view?.snapshot;
  const bar = <TitleBar title={snapshot?.house.name ?? PAGE_TITLE.house} ask={view?.me?.role === 'admin'} />;

  return (
    <Screen bar={bar} fills refreshing={refreshing} onRefresh={pull} testID="house-screen">
      <PageTitle page={PAGE_TITLE.house} />
      {!view ? (
        query.isError ? (
          <ReadFailed onRetry={() => void query.refetch()} />
        ) : (
          <Reading />
        )
      ) : (
        <HouseSections houseId={houseId} userId={userId} view={view} table={table} stake={stake} away={away} />
      )}
    </Screen>
  );
}

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
 * the setup, the Pass and the way to You under them; on a laptop those are
 * in House's list beside the page.
 */
function HouseSections({
  houseId,
  userId,
  view,
  table,
  stake,
  away,
}: {
  houseId: string;
  userId: string;
  view: HouseView;
  table: ReturnType<typeof useTable>;
  stake: ReturnType<typeof useStake>;
  away: ReturnType<typeof useAway>;
}) {
  const { listed } = useHouseWorkspace();
  const list = useJohnList(houseId);
  // The John list doesn't come over Realtime, and a housemate may have changed it.
  useReadOnFocus(list.refetch, { skipFirst: true });
  const { rules, members } = view.snapshot;
  const unlocked = passUnlocked(view.snapshot.house.pass, view.now);
  const figures = overviewFigures({
    stake: stake.data,
    month: monthOf(view.now, rules.timezone),
    me: userId,
    rules,
    housemates: members.length,
    johns: list.data?.johns,
  }).map((figure) => ({ ...figure, href: FIGURE_PAGE[figure.key] }));
  const me = view.me;
  return (
    <>
      {unlocked ? (
        <>
          {stake.isError ? <ReadFailed message={HOUSE_PAGE_COPY.stakeUnreadable} onRetry={() => void stake.refetch()} /> : null}
          <Figures figures={figures} label={HOUSE_PAGE_COPY.figures} testID="house-figures" />
          {stake.data ? <SettleUpSection houseId={houseId} userId={userId} view={view} stake={stake.data} /> : null}
        </>
      ) : (
        <PassLocked label={PASS_COPY.stake} feature={PASS_COPY.stake} testID="stake-locked" />
      )}
      <Pair
        testID="house-pair"
        start={
          unlocked ? (
            <TableSection userId={userId} view={view} table={table} stake={stake} away={away} />
          ) : (
            <PassLocked label={PASS_COPY.table} feature={PASS_COPY.table} testID="table-locked" />
          )
        }
        end={<WallSection houseId={houseId} userId={userId} view={view} />}
      />
      {listed ? null : <SetupSection houseId={houseId} userId={userId} view={view} />}
      {listed ? null : <PassSection view={view} />}
      {listed || !me ? null : (
        <Section label={PAGE_TITLE.you} testID="you-row">
          <Row
            leading={<Avatar name={me.name} userId={userId} me />}
            title={me.name}
            meta={HOUSE_LOWER_COPY.youMeta}
            href="/house/you"
            chevron
            testID="to-you"
          />
        </Section>
      )}
    </>
  );
}
