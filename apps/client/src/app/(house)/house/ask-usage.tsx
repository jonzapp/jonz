
import { UsageDetail } from '@/components/chat/ask-usage';
import { PageTitle } from '@/components/page-title';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { useAskUsage } from '@/hooks/use-ask-usage';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull } from '@/hooks/use-refresh';
import { Waiting } from '@/components/waiting';
import { ListPageOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

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
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const usage = useAskUsage(houseId);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), usage.refetch()]));
  const members = view?.snapshot.members ?? [];
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? '';

  return (
    <Screen
      bar={<TitleBar title={words('ask.usage.title')} back="/house" backLabel={words('common.section.house')} />}
      refreshing={refreshing}
      onRefresh={pull}
      fills
      testID="ask-usage-screen"
    >
      <PageTitle page={words('ask.usage.title')} />
      {usage.data && view ? (
        <UsageDetail usage={usage.data} zone={view.snapshot.rules.timezone} me={userId} nameOf={nameOf} />
      ) : (
        <Waiting
          ready={false}
          failed={usage.isError || query.isError}
          onRetry={() => void Promise.all([query.refetch(), usage.refetch()])}
          outline={<ListPageOutline sections={[2, 4]} lead="none" />}
        />
      )}
    </Screen>
  );
}
