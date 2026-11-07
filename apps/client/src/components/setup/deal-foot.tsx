import { DEAL_COPY, SETUP_COPY } from '@app/core';
import { ShuffleIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { dealThisWeek } from '@/api/settings';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { DealButton } from '@/components/house/deal-button';
import { Meta } from '@/components/text';
import { useToast } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { INSET, SPACE } from '@/theme';

/**
 * The deal at the foot of the John list, for an admin: what it does in a
 * sentence, then the button. Before the first deal it starts the house: the
 * DealButton, the page's one amber button. Afterwards it re-deals this week,
 * in outline and only while nothing in it is ticked (`canRedeal`), asking
 * first, since it hands everyone's Johns out again; with something ticked
 * there's nothing to offer, so nothing shows. The server checks it's an
 * admin asking, and its refusal shows where the move was made.
 */
export function DealFoot({ houseId, started, canRedeal = true }: { houseId: string; started: boolean; canRedeal?: boolean }) {
  const move = useMove(houseId);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  // A refusal belongs to the confirm it was made in, not the next one.
  const [asked, setAsked] = useState(false);

  async function redeal() {
    setAsked(true);
    if (await move.run(() => dealThisWeek(houseId))) {
      setConfirming(false);
      toast.show(SETUP_COPY.redealt);
    }
  }

  if (started && !canRedeal) return null;

  return (
    <View style={styles.foot} testID="deal">
      <Meta>{started ? DEAL_COPY.againBody : DEAL_COPY.firstBody}</Meta>
      {started ? (
        <ButtonRow>
          <Button
            variant="outline"
            icon={ShuffleIcon}
            label={DEAL_COPY.again}
            onPress={() => {
              setAsked(false);
              setConfirming(true);
            }}
            testID="deal-week"
          />
        </ButtonRow>
      ) : (
        <DealButton houseId={houseId} />
      )}
      <ConfirmSheet
        visible={confirming}
        title={SETUP_COPY.redealTitle}
        body={SETUP_COPY.redealBody}
        confirmLabel={DEAL_COPY.again}
        icon={ShuffleIcon}
        tone="primary"
        busy={move.pending}
        problem={asked ? move.problem : null}
        onConfirm={() => void redeal()}
        onClose={() => setConfirming(false)}
        testID="redeal-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // On the pavement, on the leading edge.
  foot: { paddingHorizontal: INSET, gap: SPACE.md },
});
