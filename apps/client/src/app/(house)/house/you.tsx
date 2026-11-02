import { HOUSE_LOWER_COPY, PAGE_TITLE } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { HousePage } from '@/components/house/house-page';
import { LeaveSection } from '@/components/house-page/leave-section';
import { YouSection } from '@/components/house-page/you-section';
import { Pair } from '@/components/page-columns';
import { Lead, Meta } from '@/components/text';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { INSET, SPACE } from '@/theme';

/** How big your picture is at the top of the page. */
const PHOTO = 64;

/**
 * You, pushed from House (on a laptop, the last page in House's list):
 * your name and picture at the top, then your own settings (name,
 * reminders, look, password, sign out), help, and leaving (moving out,
 * deleting your account, leaving the house). On a laptop your settings sit
 * beside help and leaving; on a phone it's one column, as it was at the
 * foot of House.
 */
export default function YouScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <YouFor houseId={house!.id} userId={session!.user.id} />;
}

function YouFor({ houseId, userId }: { houseId: string; userId: string }) {
  const { query, view } = useHouse(houseId, userId);
  // Your name or role may have changed from another device.
  useReadOnFocus(query.refetch, { skipFirst: true });
  const { refreshing, pull } = usePull(houseId, () => query.refetch());
  return (
    <HousePage
      title={PAGE_TITLE.you}
      testID="you-screen"
      fills
      ready={!!view?.me}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      refreshing={refreshing}
      onRefresh={pull}
    >
      {/* Whole values only: the React Compiler can hoist a field read out of this callback, before it's ready. */}
      {() => <YouBody houseId={houseId} userId={userId} view={view!} />}
    </HousePage>
  );
}

function YouBody({ houseId, userId, view }: { houseId: string; userId: string; view: HouseView }) {
  const me = view.me!;
  return (
    <>
      <View style={styles.head} testID="you-head">
        <Avatar name={me.name} userId={userId} me size={PHOTO} />
        <View style={styles.words}>
          <Lead>{me.name}</Lead>
          <Meta>{HOUSE_LOWER_COPY.youIn(view.snapshot.house.name, me.role === 'admin')}</Meta>
        </View>
      </View>
      <Pair
        testID="you-pair"
        start={<YouSection houseId={houseId} userId={userId} view={view} part="account" />}
        end={
          <>
            <YouSection houseId={houseId} userId={userId} view={view} part="rest" />
            <LeaveSection houseId={houseId} userId={userId} view={view} />
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingHorizontal: INSET,
  },
  words: { gap: SPACE.xs, flexShrink: 1 },
});
