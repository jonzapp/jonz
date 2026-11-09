import { FOCUS_SHELL_COPY } from '@app/core';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Button, type ButtonIcon } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Sheet } from '@/components/sheet';
import { SPACE } from '@/theme';

/**
 * "Are you sure?", for a move that can't be taken back or costs something
 * (Re-deal this week, Remove a housemate, Leave the house): the question as
 * the sheet's Lead, what it costs in a sentence, then the move and Cancel,
 * full width, the move first. `tone="hazard"` makes the move a hazard
 * outline (striking something out); `primary` makes it the sheet's one amber
 * button. `children` go under the body, for what the sentence needs beside
 * it (Leave's Try again, when the Stake couldn't be read). `busy` holds both
 * buttons while the move is on its way, and `problem` is the refusal's
 * sentence, shown above them. A null `confirmLabel` is a move that can't be
 * made yet: the body says why, and only Cancel shows.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  icon,
  tone = 'hazard',
  busy = false,
  busyLabel,
  problem,
  onConfirm,
  onClose,
  children,
  testID,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string | null;
  icon?: ButtonIcon;
  tone?: 'primary' | 'hazard';
  /** Waiting on the server after Confirm: it shows a spinner and `busyLabel` ("Deleting"), and Cancel holds still. */
  busy?: boolean;
  busyLabel?: string;
  problem?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <Sheet visible={visible} title={title} description={body} onClose={onClose} testID={testID}>
      {children}
      {problem ? <Alert message={problem} /> : null}
      <View style={styles.buttons}>
        <ButtonRow stacked>
          {confirmLabel === null ? null : (
            <Button variant={tone} icon={icon} label={confirmLabel} busy={busy} busyLabel={busyLabel} onPress={onConfirm} testID="confirm" />
          )}
          <Button variant="outline" label={FOCUS_SHELL_COPY.cancel} onPress={onClose} testID="cancel" />
        </ButtonRow>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: SPACE.sm, marginTop: SPACE.sm },
});
