import { DISPUTE_COPY, HISTORY_COPY } from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { raiseDispute } from '@/api/disputes';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { SPACE } from '@/theme';

/**
 * Housemate check: what's wrong with someone's tick, and "Put it to the
 * house", in place inside the John sheet (which never opens a second
 * sheet). `onSent` follows a dispute the house accepted.
 */
export function DisputeForm({
  houseId,
  assignmentId,
  onSent,
  autoFocus = true,
}: {
  houseId: string;
  assignmentId: string;
  onSent?: () => void;
  autoFocus?: boolean;
}) {
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const [reason, setReason] = useState('');

  async function send() {
    if (await move.run(() => raiseDispute(assignmentId, reason))) {
      setReason('');
      onSent?.();
      offer(HISTORY_COPY.disputed, 'dispute', assignmentId);
    }
  }

  return (
    <View style={styles.form}>
      <Field
        label={DISPUTE_COPY.label}
        placeholder={DISPUTE_COPY.placeholder}
        value={reason}
        onChangeText={setReason}
        maxLength={280}
        multiline
        autoFocus={autoFocus}
        testID="dispute-reason"
      />
      {move.problem ? <Alert message={move.problem} /> : null}
      <ButtonRow>
        <Button
          label={move.pending ? DISPUTE_COPY.sending : DISPUTE_COPY.send}
          disabled={move.pending || !reason.trim()}
          onPress={() => void send()}
          testID="send-dispute"
        />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.md },
});
