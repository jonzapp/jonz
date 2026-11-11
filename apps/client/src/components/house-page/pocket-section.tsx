import { formatMoney, memberCan, payRows, pocketCard, type PayRow, type PocketView } from '@app/core';
import type { UseQueryResult } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { payPocketMoney } from '@/api/pocket';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { GroupItem, useRowInset } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Lead, Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';
import { ReadFailed } from '@/components/read-state';
import { Waiting } from '@/components/waiting';
import { OutlineRows } from '@/components/outline';
import { useWords } from '@/hooks/use-words';

/**
 * A family's month card, on House in place of the Stake: what the kids have
 * earned so far this month and when Pay day is, then each month that's over
 * still to pay ("Pay Maya £6.50 for September" with Paid under it, the
 * first one amber), then the way to the history. A kid sees only their own
 * still to pay, with no button. Paying happens outside Jonz.
 */
export function PocketSection({
  houseId,
  userId,
  view,
  pocket,
}: {
  houseId: string;
  userId: string;
  view: HouseView;
  pocket: UseQueryResult<PocketView>;
}) {
  const words = useWords();
  const { rules, members } = view.snapshot;
  const parent = memberCan(view.me, 'pocket_money:write');
  const inset = useRowInset();
  if (!pocket.data) {
    return (
      <Section label={words('house.pocket.card')} testID="pocket">
        {pocket.isError ? (
          <GroupItem>
            <ReadFailed onRetry={() => void pocket.refetch()} />
          </GroupItem>
        ) : (
          <Waiting ready={false} outline={<OutlineRows count={2} lead="none" end />} />
        )}
      </Section>
    );
  }
  const card = pocketCard(pocket.data, rules.currency, words);
  const rows = payRows({ owed: pocket.data.owed, members, me: userId, parent, currency: rules.currency }, words);
  const parents = members.filter((m) => m.role === 'admin').length;
  const line = words('house.pocket.family', { parents, kids: members.length - parents, cap: formatMoney(view.snapshot.house.pocketCapMinor ?? 0, rules.currency, words) });
  return (
    <>
    <Meta style={{ paddingHorizontal: inset }} testID="family-line">{line}</Meta>
    <Section label={card.label} testID="pocket">
      <View style={[styles.top, { paddingHorizontal: inset }]}>
        <Lead testID="pocket-so-far">{card.title}</Lead>
        <Meta>{card.payDay}</Meta>
      </View>
      {rows.map((row) => (
        <PayDay key={row.key} houseId={houseId} row={row} fullName={members.find((m) => m.userId === row.userId)?.name ?? row.name} />
      ))}
      <Row title={words('house.pocket.history')} href="/house/pocket" chevron testID="to-pocket" />
      {parent ? <Row title={words('today.board.row')} meta={words('today.board.rowMeta')} href="/house/board" chevron testID="to-board" /> : null}
    </Section>
    </>
  );
}

/** One kid's month to pay: the row, and for a parent the button that says it's paid. */
function PayDay({ houseId, row, fullName }: { houseId: string; row: PayRow; fullName: string }) {
  const words = useWords();
  const move = useMove(houseId);
  const toasts = useToastIfAny();
  const inset = useRowInset();
  return (
    <View testID="pay-row">
      <Row leading={<Avatar name={fullName} userId={row.userId} />} title={row.title} titleLines={2} meta={row.meta} />
      {row.action ? (
        <View style={[styles.action, { paddingHorizontal: inset }]}>
          <ButtonRow>
            <Button
              variant={row.primary ? 'primary' : 'outline'}
              icon={CheckIcon}
              label={row.action}
              busy={move.pending}
              busyLabel={words('common.busy.markingPaid')}
              onPress={() =>
                void move
                  .run(() => payPocketMoney(houseId, row.userId, row.month))
                  .then((done) => {
                    if (done) toasts?.show(`${row.action}.`);
                  })
              }
              testID="paid"
            />
          </ButtonRow>
        </View>
      ) : null}
      {move.problem ? (
        <View style={[styles.problem, { paddingHorizontal: inset }]}>
          <Alert message={move.problem} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: SPACE.xs, paddingVertical: SPACE.md },
  action: { marginTop: SPACE.xs, marginBottom: SPACE.lg },
  problem: { marginBottom: SPACE.lg },
});
