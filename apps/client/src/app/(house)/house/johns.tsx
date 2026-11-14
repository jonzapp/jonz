import { canRedeal, johnsComing, memberCan } from '@app/core';

import type { JohnList as List } from '@/api/settings';
import { useWords } from '@/hooks/use-words';
import { GroupsList } from '@/components/house/groups-list';
import { HousePage } from '@/components/house/house-page';
import { JohnList } from '@/components/house/john-list';
import { KindsList } from '@/components/house/kinds-list';
import { Pair } from '@/components/page-columns';
import { useFilled } from '@/components/screen';
import { Section } from '@/components/section';
import { DealFoot } from '@/components/setup/deal-foot';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { ListPageOutline } from '@/components/page-outlines';

/**
 * The John list, pushed from House: every John by kind, how often and how
 * much, then for an admin the house's kinds (to add, rename, recolour,
 * order and delete), and the groups that share some of them (Groups was a
 * page of its own), beside the deal on a laptop. Tapping one opens it, to
 * edit for an admin and to read for everyone else. An admin adds Johns
 * (over the list), and hands out the week under them (or deals it again,
 * while nothing in it is ticked).
 */
export default function JohnListScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <JohnListFor houseId={house!.id} userId={session!.user.id} />;
}

function JohnListFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const list = useJohnList(houseId);
  // Neither the list nor the rules come over Realtime: read them again on
  // the way back to this page. (The list's first read is its own, just now.)
  useReadOnFocus(query.refetch);
  useReadOnFocus(list.refetch, { skipFirst: true });
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), list.refetch()]));
  const retry = () => void Promise.all([query.refetch(), list.refetch()]);

  // What was read goes down whole, and the page reads its parts once it's
  // there: React's compiler reads what a callback uses before calling it.
  return (
    <HousePage
      title={words('common.title.johnList')}
      testID="johns-screen" outline={<ListPageOutline />}
      fills
      ready={view !== null && list.data !== undefined}
      failed={query.isError || list.isError}
      onRetry={retry}
      refreshing={refreshing}
      onRefresh={pull}
    >
      {() => <JohnListPage houseId={houseId} userId={userId} view={view!} list={list.data!} />}
    </HousePage>
  );
}

function JohnListPage({ houseId, userId, view, list }: { houseId: string; userId: string; view: HouseView; list: List }) {
  const isAdmin = memberCan(view.me, 'johns:write');
  const words = useWords(view.snapshot.house.kind);
  // Groups show to an admin, who makes them, and to everyone once there's one.
  const groups =
    isAdmin || list.groups.length > 0 ? (
      <Section label={words('house.groups.title')} bare testID="johns-groups">
        <GroupsList houseId={houseId} groups={list.groups} people={view.snapshot.members} me={userId} editable={isAdmin} />
      </Section>
    ) : null;
  // DealFoot shows nothing once something this week is ticked: then there's nothing to sit beside.
  const started = view.snapshot.house.everDealt;
  const deal =
    isAdmin && list.johns.length > 0 && (!started || canRedeal(view.board)) ? (
      <DealFoot houseId={houseId} started={started} canRedeal={canRedeal(view.board)} />
    ) : null;
  // On a laptop, under the kinds, the groups beside the deal; on a phone (or before there are Johns), one under the other.
  const beside = useFilled() !== null && list.johns.length > 0 && groups !== null && deal !== null;
  return (
    <>
      <JohnList
        houseId={houseId}
        rules={view.snapshot.rules}
        johns={list.johns}
        kinds={list.kinds}
        groups={list.groups}
        editable={isAdmin}
        family={view.snapshot.house.kind === 'family'}
        whoAdds={johnsComing(view.snapshot.members, userId, words, words)}
        // Until the first deal, the deal at the foot is the page's one amber button.
        quietAdd={!view.snapshot.house.everDealt}
      />
      {isAdmin ? (
        <Section label={words('house.kinds.title')} bare testID="johns-kinds">
          <KindsList houseId={houseId} kinds={list.kinds} johns={list.johns} />
        </Section>
      ) : null}
      {beside ? (
        <Pair start={groups} end={deal} testID="johns-foot" />
      ) : (
        <>
          {deal}
          {groups}
        </>
      )}
    </>
  );
}
