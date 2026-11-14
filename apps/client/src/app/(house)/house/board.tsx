import { boardColumns, firstName, johnRow, memberCan, monthWord, pocketMoney, type BoardColumn, type BoardItem, type Currency } from '@app/core';
import { UsersIcon } from 'lucide-react-native';

import { boardTick } from '@/api/johns';
import { Alert } from '@/components/alert';
import { EmptyState } from '@/components/empty-state';
import { Group, GroupItem } from '@/components/group';
import { HousePage } from '@/components/house/house-page';
import { useJohnSheet } from '@/components/john-sheet';
import { Flow } from '@/components/page-columns';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { TickBox } from '@/components/tick-box';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { useMove } from '@/hooks/use-move';
import { usePocket } from '@/hooks/use-pocket';
import { usePull } from '@/hooks/use-refresh';
import { ListPageOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * The board (docs/specs/family-houses.md, "The board"): a family's shared
 * screen, opened by a parent on the kitchen tablet. Each kid has a column of
 * what's theirs today. A kid taps the box to tick their own; that tick
 * waits for a parent's OK. Tapping a John opens its sheet, where a parent
 * says OK or Not yet.
 */
export default function BoardScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <BoardFor houseId={house!.id} userId={session!.user.id} />;
}

function BoardFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const pocket = usePocket(houseId, query.data);
  const { refreshing, pull } = usePull(houseId, () => Promise.all([query.refetch(), pocket.refetch()]));
  return (
    <HousePage
      title={words('today.board.title')}
      testID="board-screen" outline={<ListPageOutline sections={[4]} />}
      ready={view !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      refreshing={refreshing}
      onRefresh={pull}
      fills
    >
      {() => {
        const { snapshot, board, now } = view!;
        const { rules, members, house } = snapshot;
        if (house.kind !== 'family' || !memberCan(view!.me, 'ticks:write')) {
          return <EmptyState icon={UsersIcon} title={words('today.board.title')} body={words('today.board.parentsOnly')} />;
        }
        const kids = members.filter((m) => m.role !== 'admin').map((m) => ({ userId: m.userId, name: firstName(m.name) }));
        if (kids.length === 0) return <EmptyState icon={UsersIcon} title={words('today.board.title')} body={words('today.board.noKids')} />;
        const columns = boardColumns(board.items, kids, now, rules.timezone);
        const month = pocket.data ? monthWord(pocket.data.month, words) : null;
        return (
          <>
            <Meta>{words('today.board.intro')}</Meta>
            <Flow
              testID="board"
              items={columns.map((column) => ({
                key: column.userId,
                weight: Math.max(1, column.items.length) + 1,
                node: (
                  <KidColumn
                    houseId={houseId}
                    column={column}
                    earned={
                      pocket.data && month
                        ? words('today.board.earned', { money: pocketMoney(pocket.data.earned[column.userId] ?? 0, rules.currency, words), month })
                        : undefined
                    }
                    now={now}
                    zone={rules.timezone}
                    currency={rules.currency}
                  />
                ),
              }))}
            />
            <Meta>{words('today.board.note')}</Meta>
          </>
        );
      }}
    </HousePage>
  );
}

function KidColumn({
  houseId,
  column,
  earned,
  now,
  zone,
  currency,
}: {
  houseId: string;
  column: BoardColumn;
  earned?: string;
  now: Date;
  zone: string;
  currency: Currency;
}) {
  const words = useWords();
  return (
    <Section label={column.name} right={earned} testID="board-kid">
      <Group>
        {column.items.length === 0 ? (
          <Row title={words('today.board.nothing')} testID="board-nothing" />
        ) : (
          column.items.map((item) => (
            <BoardRow key={item.id} houseId={houseId} item={item} kid={column.name} now={now} zone={zone} currency={currency} />
          ))
        )}
      </Group>
    </Section>
  );
}

/** One of a kid's Johns: the box ticks it as theirs (it waits for an OK), the row opens its sheet. */
function BoardRow({
  houseId,
  item,
  kid,
  now,
  zone,
  currency,
}: {
  houseId: string;
  item: BoardItem;
  kid: string;
  now: Date;
  zone: string;
  currency: Currency;
}) {
  const words = useWords();
  const sheet = useJohnSheet();
  const move = useMove(houseId);
  // Planned as the kid sees it: whether it's still to do, and its line.
  const plan = johnRow(item, { viewerId: item.userId, now, zone, nameOf: () => kid, words });
  const waits = item.awaitsOk === true && item.doneAt !== null;
  const meta = waits ? words('today.board.waits') : item.needsPhoto && plan.ticks ? words('today.board.photo') : plan.meta;
  const leading =
    plan.ticks && !item.needsPhoto ? (
      <TickBox
        state={move.pending ? 'busy' : 'open'}
        label={words('today.board.tick', { kid, john: item.name })}
        onPress={() => void move.run(() => boardTick(item.id))}
      />
    ) : (
      <TickBox state={waits ? 'checking' : plan.tick === 'excused' ? 'open' : plan.tick} label={plan.tickLabel} />
    );
  return (
    <>
      <Row
        title={item.name}
        titleLines={2}
        meta={meta}
        metaLines={2}
        lid={plan.lid ? item.category : undefined}
        leading={leading}
        trailing={item.payMinor ? pocketMoney(item.payMinor, currency, words) : undefined}
        hazardEdge={plan.hazardEdge}
        onPress={() => sheet.open(item.id)}
        testID="board-john"
      />
      {move.problem ? (
        <GroupItem>
          <Alert message={move.problem} />
        </GroupItem>
      ) : null}
    </>
  );
}
