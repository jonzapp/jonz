import { myTrips, type MyPrefs } from '@app/core';

import type { AwayView } from '@/api/away';
import type { JohnList } from '@/api/settings';
import { HousePage } from '@/components/house/house-page';
import { PrefsForm } from '@/components/house/prefs-form';
import { AwayMonth, MyTrips } from '@/components/house/time-away';
import { Pair } from '@/components/page-columns';
import { Section } from '@/components/section';
import { useAway } from '@/hooks/use-away';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { RecordOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * Days and time away, pushed from House: your days, best time and the
 * Johns you'd rather or rather not (what the deal goes by each Monday),
 * beside the house's time away: your own trips (cancel one, or say you're
 * back), and who in the house is away on which days of the month, with
 * booking a trip in a sheet from under it. On a phone the time away comes
 * first, as Today's and Week's links here are about it.
 */
export default function AwayScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <AwayFor houseId={house!.id} userId={session!.user.id} />;
}

function AwayFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const away = useAway(houseId, query.data);
  const list = useJohnList(houseId);
  // Neither time away nor the John list comes over Realtime: read them again on the way back here.
  useReadOnFocus(away.refetch, { skipFirst: true });
  useReadOnFocus(list.refetch, { skipFirst: true });
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), away.refetch(), list.refetch()]));
  // Read here, not in the callback below: the React Compiler can hoist a field read out of it, before it's ready.
  const prefs = view?.snapshot.members.find((m) => m.userId === userId)?.prefs ?? null;

  return (
    <HousePage
      title={words('common.title.away')}
      testID="away-screen" outline={<RecordOutline />}
      fills
      ready={view !== null && away.data !== undefined && prefs !== null && list.data !== undefined}
      failed={query.isError || away.isError || list.isError}
      onRetry={() => void Promise.all([query.refetch(), away.refetch(), list.refetch()])}
      refreshing={refreshing}
      onRefresh={pull}
    >
      {() => <AwayPage houseId={houseId} userId={userId} view={view!} away={away.data!} prefs={prefs!} list={list.data!} />}
    </HousePage>
  );
}

function AwayPage({
  houseId,
  userId,
  view,
  away,
  prefs,
  list,
}: {
  houseId: string;
  userId: string;
  view: HouseView;
  away: AwayView;
  prefs: MyPrefs;
  list: JohnList;
}) {
  const words = useWords();
  const { snapshot } = view;
  const { periods, today } = away;
  const mine = myTrips(periods, userId, today);
  return (
    <Pair
      testID="away-pair"
      endFirst
      start={<PrefsForm houseId={houseId} saved={prefs} list={list} />}
      end={
        <>
          {mine.length > 0 ? (
            <Section label={words('house.away.yours')} testID="my-trips">
              <MyTrips houseId={houseId} periods={mine} today={today} />
            </Section>
          ) : null}
          <Section label={words('house.setup.whosAway')} testID="away-panel">
            <AwayMonth houseId={houseId} periods={periods} people={snapshot.members} me={userId} today={today} weekStarts={snapshot.rules.weekStarts} clock={{ zone: snapshot.rules.timezone, now: view.now }} />
          </Section>
        </>
      }
    />
  );
}
