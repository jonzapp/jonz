import { settleRows, type SettleRow } from '@app/core';
import * as Clipboard from 'expo-clipboard';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { confirmPayment, type StakeRead } from '@/api/stake';
import { MoveProblem } from '@/components/house-page/move-problem';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { GroupItem, useRowInset } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** Where "Open Splitwise" goes: its web app, which hands over to the Splitwise app where it's installed. */
const SPLITWISE_URL = 'https://secure.splitwise.com/';

/**
 * Settling up, on the Overview while anything from a closed month is still
 * to settle: each settle-up between you and a housemate, what's owed to
 * you with its "Mark received" (the first one the page's amber button),
 * then the way to Stake history. A house that settles up in Splitwise gets
 * each amount to copy across and "Added to Splitwise" in place of "Mark
 * received", with Open Splitwise under them. Nothing to settle, it isn't
 * there: the Overview's first figure says how your month stands and opens
 * Stake history.
 */
export function SettleUpSection({
  houseId,
  userId,
  view,
  stake,
}: {
  houseId: string;
  userId: string;
  view: HouseView;
  stake: StakeRead;
}) {
  const words = useWords();
  const { rules, members } = view.snapshot;
  const rows = settleRows({
    transfers: stake.transfers,
    me: userId,
    members,
    currency: rules.currency,
    ledger: stake.ledger,
    closedMonths: stake.closedMonths,
    settleIn: view.snapshot.house.settleIn,
  }, words);
  if (rows.length === 0) return null;
  const toSplitwise = rows.some((row) => row.splitwise);

  return (
    <Section label={words('house.page.settleUp')} testID="settle-up">
      {rows.map((row) => (
        <SettleUp key={row.key} houseId={houseId} row={row} />
      ))}
      {toSplitwise ? (
        <GroupItem>
          <Button
            variant="outline"
            icon={ExternalLinkIcon}
            iconAfter
            label={words('house.page.openSplitwise')}
            onPress={() => void Linking.openURL(SPLITWISE_URL)}
            testID="open-splitwise"
          />
        </GroupItem>
      ) : null}
      <Row title={words('house.page.history')} href="/house/stake" chevron testID="to-stake" />
    </Section>
  );
}

/**
 * One settle-up, from your side: the row, and for what's owed to you the
 * button that says it arrived, or in a Splitwise house its description
 * and amount to copy, then the button that says it's been added there.
 */
function SettleUp({ houseId, row }: { houseId: string; row: SettleRow }) {
  const words = useWords();
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const toasts = useToastIfAny();
  const splitwise = row.splitwise;
  const inset = useRowInset();
  return (
    <View testID="transfer">
      {/* The months it's from are in the title: two lines, so it isn't cut off. */}
      <Row leading={<Avatar name={row.name} userId={row.userId} />} title={row.title} titleLines={2} meta={row.meta} />
      {splitwise ? (
        <View style={[styles.copy, { paddingHorizontal: inset }]} testID="splitwise-line">
          <Meta style={styles.description}>{splitwise.description}</Meta>
          {/* eslint-disable-next-line jonz/button-in-row -- beside the words it copies, not a lone action */}
          <Button
            variant="outline"
            icon={CopyIcon}
            label={splitwise.copy}
            spoken={splitwise.spoken}
            onPress={() =>
              void Clipboard.setStringAsync(splitwise.amount).then(() => toasts?.show(words('house.page.copied', { plain: splitwise.amount })))
            }
            testID="copy-amount"
          />
        </View>
      ) : null}
      {row.action ? (
        <View style={[styles.action, { paddingHorizontal: inset }]}>
          <ButtonRow>
            <Button
              variant={row.primary ? 'primary' : 'outline'}
              icon={CheckIcon}
              label={row.action}
              busyLabel={words('house.page.marking')}
              spoken={row.spoken ?? undefined}
              busy={move.pending}
              onPress={() =>
                void move
                  .run(() =>
                    splitwise
                      ? confirmPayment(houseId, row.userId, row.amount, 'splitwise')
                      : confirmPayment(houseId, row.userId, row.amount),
                  )
                  .then((done) => {
                    if (done) offer(splitwise ? words('wall.history.inSplitwise') : words('wall.history.paid'), 'payment', row.userId);
                  })
              }
            />
          </ButtonRow>
        </View>
      ) : null}
      <MoveProblem message={move.problem} inset={inset} />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: SPACE.xs, marginBottom: SPACE.lg },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.xs,
  },
  description: { flex: 1 },
});
