import { BOARD_COPY, formatMoney, memberCan, payRows, pocketCard, POCKET_COPY, type PayRow, type PocketView } from '@app/core';
import type { UseQueryResult } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { payPocketMoney } from '@/api/pocket';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { GroupItem, useRowInset } from '@/components/group';
import { Reading, ReadFailed } from '@/components/read-state';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Lead, Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';

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
  const { rules, members } = view.snapshot;
  const parent = memberCan(view.me, 'pocket.pay');
  const inset = useRowInset();
  if (!pocket.data) {
    return (
      <Section label={POCKET_COPY.card} testID="pocket">
        <GroupItem>
          {pocket.isError ? <ReadFailed onRetry={() => void pocket.refetch()} /> : <Reading />}
        </GroupItem>
      </Section>
    );
  }
  const card = pocketCard(pocket.data, rules.currency);
  const rows = payRows({ owed: pocket.data.owed, members, me: userId, parent, currency: rules.currency });
  const parents = members.filter((m) => m.role === 'admin').length;
  const line = POCKET_COPY.family(parents, members.length - parents, formatMoney(view.snapshot.house.pocketCapMinor ?? 0, rules.currency));
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
      <Row title={POCKET_COPY.history} href="/house/pocket" chevron testID="to-pocket" />
      {parent ? <Row title={BOARD_COPY.row} meta={BOARD_COPY.rowMeta} href="/house/board" chevron testID="to-board" /> : null}
    </Section>
    </>
  );
}

/** One kid's month to pay: the row, and for a parent the button that says it's paid. */
function PayDay({ houseId, row, fullName }: { houseId: string; row: PayRow; fullName: string }) {
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
              disabled={move.pending}
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
