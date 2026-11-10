import { pocketHistory } from '@app/core';
import { CoinsIcon } from 'lucide-react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { HousePage } from '@/components/house/house-page';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePocket } from '@/hooks/use-pocket';
import { usePull } from '@/hooks/use-refresh';
import { ListPageOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * Pocket money history, pushed from a family's month card: each month,
 * newest first, what each kid earned and whether a parent has paid it.
 */
export default function PocketScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <PocketFor houseId={house!.id} userId={session!.user.id} />;
}

function PocketFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const pocket = usePocket(houseId, query.data);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), pocket.refetch()]));
  return (
    <HousePage
      title={words('house.pocket.history')}
      testID="pocket-screen" outline={<ListPageOutline sections={[3, 3]} lead="none" />}
      ready={view !== null && pocket.data !== undefined}
      failed={query.isError || pocket.isError}
      onRetry={() => void Promise.all([query.refetch(), pocket.refetch()])}
      refreshing={refreshing}
      onRefresh={pull}
    >
      {() => {
        const { rules, members } = view!.snapshot;
        const months = pocketHistory({ view: pocket.data!, members, currency: rules.currency, zone: rules.timezone }, words);
        if (months.length === 0) return <EmptyState icon={CoinsIcon} title={words('house.pocket.history')} body={words('house.pocket.historyEmpty')} />;
        return months.map((m) => (
          <Section key={m.month} label={m.label} testID="pocket-month">
            {m.lines.map((line) => (
              <Row
                key={line.key}
                leading={<Avatar name={line.name} userId={line.userId} me={line.userId === userId} />}
                title={line.name}
                meta={line.meta}
                trailing={line.value}
                testID="pocket-line"
              />
            ))}
          </Section>
        ));
      }}
    </HousePage>
  );
}
