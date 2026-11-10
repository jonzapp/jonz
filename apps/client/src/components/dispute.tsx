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
import { useWords } from '@/hooks/use-words';

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
  const words = useWords();
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const [reason, setReason] = useState('');

  async function send() {
    if (await move.run(() => raiseDispute(assignmentId, reason))) {
      setReason('');
      onSent?.();
      offer(words('wall.history.disputed'), 'dispute', assignmentId);
    }
  }

  return (
    <View style={styles.form}>
      <Field
        label={words('john.dispute.label')}
        placeholder={words('john.dispute.placeholder')}
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
          label={words('john.dispute.send')}
          busyLabel={words('john.dispute.sending')}
          busy={move.pending}
          disabled={!reason.trim()}
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
