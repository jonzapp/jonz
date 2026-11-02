import { canRedeal, GROUPS_COPY, johnsComing, PAGE_TITLE } from '@app/core';

import type { JohnList as List } from '@/api/settings';
import { GroupsList } from '@/components/house/groups-list';
import { HousePage } from '@/components/house/house-page';
import { JohnList } from '@/components/house/john-list';
import { useFilled } from '@/components/screen';
import { Section } from '@/components/section';
import { DealFoot } from '@/components/setup/deal-foot';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';

/**
 * The John list, pushed from House: every John by kind, how often and how
 * much, and the groups that share some of them (Groups was a page of its
 * own). Tapping one opens it, to edit for an admin and to read for everyone
 * else. An admin adds Johns (over the list on a laptop, at its foot on a
 * phone), and hands out the week under them (or deals it again, while
 * nothing in it is ticked).
 */
export default function JohnListScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <JohnListFor houseId={house!.id} userId={session!.user.id} />;
}

function JohnListFor({ houseId, userId }: { houseId: string; userId: string }) {
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
      title={PAGE_TITLE.johnList}
      testID="johns-screen"
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
  const isAdmin = view.me?.role === 'admin';
  // Groups show to an admin, who makes them, and to everyone once there's one.
  const groups =
    isAdmin || list.groups.length > 0 ? (
      <Section label={GROUPS_COPY.title} bare testID="johns-groups">
        <GroupsList houseId={houseId} groups={list.groups} people={view.snapshot.members} me={userId} editable={isAdmin} />
      </Section>
    ) : null;
  // On a laptop they sit among the kinds; on a phone (or before there are Johns), at the foot.
  const amongKinds = useFilled() !== null && list.johns.length > 0;
  return (
    <>
      <JohnList
        houseId={houseId}
        rules={view.snapshot.rules}
        johns={list.johns}
        groups={list.groups}
        editable={isAdmin}
        whoAdds={johnsComing(view.snapshot.members, userId)}
        // Until the first deal, the deal at the foot is the page's one amber button.
        quietAdd={!view.snapshot.house.everDealt}
        // A group's row is about two lines, with Add a group and the note under them.
        more={amongKinds && groups ? [{ key: 'groups', weight: list.groups.length + 3, node: groups }] : undefined}
      />
      {isAdmin && list.johns.length > 0 ? (
        <DealFoot houseId={houseId} started={view.snapshot.house.everDealt} canRedeal={canRedeal(view.board)} />
      ) : null}
      {amongKinds ? null : groups}
    </>
  );
}
