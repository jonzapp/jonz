import { FOCUS_SHELL_COPY, memberCan, PAGE_TITLE, SECTION_LABEL } from '@app/core';
import { useLocalSearchParams } from 'expo-router';
import { UserRoundXIcon } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { PageTitle } from '@/components/page-title';
import { PersonAdmin } from '@/components/person/person-admin';
import { PersonSections } from '@/components/person/person-sections';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { useAway } from '@/hooks/use-away';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { useStake } from '@/hooks/use-stake';
import { useTable } from '@/hooks/use-table';
import { useRoleCopy } from '@/hooks/use-kind';
import { Waiting } from '@/components/waiting';
import { PersonOutline } from '@/components/page-outlines';

/**
 * A housemate's page, pushed from a row of House's Table: their record,
 * fair share, streak and tokens, the month's money and their time away; and
 * for an admin looking at someone else, Make admin and Remove. Your own
 * page works too, without those.
 */
export default function PersonScreen() {
  const { session, house } = useMembership();
  const { userId: personId } = useLocalSearchParams<{ userId: string }>();
  // The layout's guard only shows the house's screens with a house and a session.
  return <PersonFor houseId={house!.id} userId={session!.user.id} personId={personId} />;
}

function PersonFor({ houseId, userId, personId }: { houseId: string; userId: string; personId: string }) {
  const { query, view } = useHouse(houseId, userId);
  const table = useTable(houseId, query.data);
  const stake = useStake(houseId, query.data);
  const away = useAway(houseId, query.data);
  // Who lives here and their roles don't come over Realtime: read them again on the way back here.
  useReadOnFocus(query.refetch);
  const { refreshing, pull } = usePull(houseId, () =>
    Promise.all([query.refetch(), table.refetch(), stake.refetch(), away.refetch()]),
  );
  const person = view?.snapshot.members.find((m) => m.userId === personId) ?? null;
  const roles = useRoleCopy();
  // Someone who isn't in the house any more is named as such, not as House itself.
  const title = person?.name ?? (view ? FOCUS_SHELL_COPY.formerHousemate : PAGE_TITLE.house);

  return (
    <Screen
      bar={
        <TitleBar
          title={title}
          sub={person ? roles.sub(person.role === 'admin', person.userId === userId) : undefined}
          back="/house"
          backLabel={SECTION_LABEL.house}
        />
      }
      refreshing={refreshing}
      onRefresh={pull}
      fills
      testID="person-screen"
    >
      <PageTitle page={title} />
      {!view ? (
        <Waiting ready={false} failed={query.isError} onRetry={() => void query.refetch()} outline={<PersonOutline />} />
      ) : !person ? (
        <EmptyState icon={UserRoundXIcon} title={FOCUS_SHELL_COPY.gone} />
      ) : (
        <PersonSections
          userId={userId}
          person={person}
          view={view}
          table={table}
          stake={stake}
          away={away}
          admin={
            memberCan(view.me, 'members:write') && person.userId !== userId ? (
              <PersonAdmin houseId={houseId} userId={userId} person={person} />
            ) : undefined
          }
        />
      )}
    </Screen>
  );
}
