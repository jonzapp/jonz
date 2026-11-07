import { confirmsDelete, DELETE_COPY, passDay, withAlpha } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { deletionPreview, requestDeletion } from '@/api/account';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Reading } from '@/components/read-state';
import { Body } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useMembership } from '@/hooks/use-membership';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';

/**
 * Delete my account, in House's sheet and on jonz.app/delete: what goes,
 * what stays with your house, and (if you pay for one) that your House Pass
 * stops renewing; then the 30 days to change your mind, on hi-vis, and the
 * word to type. Delete is a hazard button that waits for the word; Keep it
 * puts the sheet away. Asking signs you out everywhere else, and the app
 * becomes the being-deleted screen, which says when it goes.
 */
export function DeleteAccountForm({ onKeep }: { onKeep: () => void }) {
  const { refresh } = useMembership();
  const preview = useQuery({ queryKey: ['deletion-preview'], queryFn: deletionPreview });
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = confirmsDelete(typed);

  async function remove() {
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await requestDeletion();
      await refresh();
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  const house = preview.data?.house ?? null;
  const passUntil = preview.data?.passUntil ?? null;
  return (
    <View style={styles.form} testID="delete-account-form">
      <Said lead={DELETE_COPY.goesLead} words={DELETE_COPY.goes} />
      {preview.isPending ? <Reading label={DELETE_COPY.reading} /> : null}
      {house ? <Said lead={DELETE_COPY.staysLead(house)} words={DELETE_COPY.stays} testID="delete-stays" /> : null}
      {passUntil ? <Said lead={DELETE_COPY.passLead} words={DELETE_COPY.pass(passDay(passUntil))} testID="delete-pass" /> : null}
      <Note>{DELETE_COPY.wait}</Note>
      <Field
        label={DELETE_COPY.typeLabel}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="done"
        onSubmitEditing={() => void remove()}
        testID="delete-word"
      />
      {problem ? <Alert message={problem} /> : null}
      <View style={styles.buttons}>
        <ButtonRow>
          <Button
            variant="hazard"
            icon={Trash2Icon}
            label={DELETE_COPY.confirm}
            disabled={!ready || busy}
            onPress={() => void remove()}
            testID="delete-account"
          />
        </ButtonRow>
        <TextButton label={DELETE_COPY.keepIt} disabled={busy} onPress={onKeep} testID="keep-it" />
      </View>
    </View>
  );
}

/** One line of what happens: its lead in bold, then the rest. */
function Said({ lead, words, testID }: { lead: string; words: string; testID?: string }) {
  return (
    <Body testID={testID}>
      <Text style={styles.lead}>{lead}</Text> {words}
    </Body>
  );
}

/** The 30 days, on a hi-vis tint: the one thing to remember. */
function Note({ children }: { children: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: withAlpha(colors.hivis, scheme === 'dark' ? 0.12 : 0.16) }]} testID="delete-wait">
      <Body>{children}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.md },
  lead: { fontFamily: FONT.bold },
  note: { borderRadius: RADIUS, padding: SPACE.md },
  buttons: { gap: SPACE.sm, marginTop: SPACE.sm },
});
