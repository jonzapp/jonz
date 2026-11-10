import { memberCan, okWho, pocketMoney, tickedLine, type BoardItem, BUSY_COPY } from '@app/core';
import { useState } from 'react';
import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { answerTick } from '@/api/disputes';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Body, Meta } from '@/components/text';
import { useToast } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';

import type { JohnSheetContext } from './body';
import { SheetLines } from './parts';
import { useWords } from '@/hooks/use-words';

/**
 * A kid's tick in a family, waiting for a parent's OK: who ticked it and
 * that it waits. A parent sees who can answer and two equal outline
 * buttons, OK it then Not yet (the vote's order: it's fine, then not); Not
 * yet sends the John back to the kid, open again. Anyone else just sees
 * that it waits. There is no closing time and no vote.
 */
export function AwaitsOk({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const move = useMove(context.houseId);
  // Which answer is waiting: the two share one move.
  const [said, setSaid] = useState(true);
  const toast = useToast();
  const parentIds = context.members.filter((m) => m.role === 'admin').map((m) => m.userId);
  const parent = memberCan(context.me, 'ticks:write');

  async function answer(ok: boolean) {
    setSaid(ok);
    // A Together John is answered from any of its places: they share one tick.
    if (await move.run(() => answerTick(item.id, ok))) {
      context.close();
      toast.show(ok ? words('today.parentOk.okayed') : words('today.parentOk.sentBack'));
    }
  }

  return (
    <SheetLines testID="awaits-ok">
      <Body testID="ticked-line">{tickedLine(item, context.members, context.userId, context.rules, context.now, words)}</Body>
      {parent ? (
        <>
          <Meta testID="ok-who">{okWho(item, context.members, parentIds, context.userId, words)}</Meta>
          <View style={styles.pair}>
            <ButtonRow>
              <Button
                variant="outline"
                icon={ThumbsUpIcon}
                // A John that earns says so: "OK, pay 20p".
                label={item.payMinor ? words('house.pocket.okPay', { money: pocketMoney(item.payMinor, context.rules.currency) }) : words('today.parentOk.ok')}
                busy={move.pending && said}
                busyLabel={BUSY_COPY.approving}
                onPress={() => void answer(true)}
                testID="ok-it"
              />
              <Button
                variant="outline"
                icon={ThumbsDownIcon}
                label={words('today.parentOk.notYet')}
                busy={move.pending && !said}
                busyLabel={BUSY_COPY.sending}
                onPress={() => void answer(false)}
                testID="not-yet"
              />
            </ButtonRow>
          </View>
          {move.problem ? <Alert message={move.problem} /> : null}
        </>
      ) : null}
    </SheetLines>
  );
}

const styles = StyleSheet.create({
  pair: { marginTop: SPACE.sm },
});
