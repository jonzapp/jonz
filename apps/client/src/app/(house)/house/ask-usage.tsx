import { ASK_USAGE_COPY, SECTION_LABEL } from '@app/core';

import { UsageDetail } from '@/components/chat/ask-usage';
import { PageTitle } from '@/components/page-title';
import { Reading, ReadFailed } from '@/components/read-state';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { useAskUsage } from '@/hooks/use-ask-usage';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull } from '@/hooks/use-refresh';

/**
 * Ask Jonz usage, pushed from the chat's warning and notice and from House's
 * setup: this week's pool for the house and you, who used it, and when it
 * comes back. Anyone in the house can see it.
 */
export default function AskUsageScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <AskUsageFor houseId={house!.id} userId={session!.user.id} />;
}

function AskUsageFor({ houseId, userId }: { houseId: string; userId: string }) {
  const { query, view } = useHouse(houseId, userId);
  const usage = useAskUsage(houseId);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), usage.refetch()]));
  const members = view?.snapshot.members ?? [];
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? '';

  return (
    <Screen
      bar={<TitleBar title={ASK_USAGE_COPY.title} back="/house" backLabel={SECTION_LABEL.house} />}
      refreshing={refreshing}
      onRefresh={pull}
      fills
      testID="ask-usage-screen"
    >
      <PageTitle page={ASK_USAGE_COPY.title} />
      {usage.data && view ? (
        <UsageDetail usage={usage.data} zone={view.snapshot.rules.timezone} me={userId} nameOf={nameOf} />
      ) : usage.isError || query.isError ? (
        <ReadFailed onRetry={() => void Promise.all([query.refetch(), usage.refetch()])} />
      ) : (
        <Reading />
      )}
    </Screen>
  );
}
