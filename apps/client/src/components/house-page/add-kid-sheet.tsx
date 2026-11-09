import { checkKid, KIDS_COPY, BUSY_COPY } from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addKid } from '@/api/kids';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { Sheet } from '@/components/sheet';
import { useToastIfAny } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { INSET, SECTION_GAP, SPACE } from '@/theme';

/**
 * Add a child, a parent's sheet from the Table (family step 4): their name
 * and the year they were born, then Add them. The child doesn't sign in; a
 * parent picks them at the top of Today and ticks for them.
 */
export function AddKidSheet({ houseId, visible, onClose }: { houseId: string; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title={KIDS_COPY.addTitle} description={KIDS_COPY.addBody} flush onClose={onClose}>
      {visible ? <AddKidForm houseId={houseId} onDone={onClose} /> : null}
    </Sheet>
  );
}

function AddKidForm({ houseId, onDone }: { houseId: string; onDone: () => void }) {
  const move = useMove(houseId);
  const toasts = useToastIfAny();
  const [name, setName] = useState('');
  const [born, setBorn] = useState('');
  const [problems, setProblems] = useState<Partial<Record<'name' | 'born', string>>>({});

  async function save() {
    const checked = checkKid({ name, born }, new Date().getFullYear());
    if (!checked.kid) {
      setProblems(checked.problems);
      return;
    }
    setProblems({});
    const { kid } = checked;
    if (await move.run(() => addKid(kid.name, kid.bornYear))) {
      toasts?.show(KIDS_COPY.added(kid.name.split(' ')[0]));
      onDone();
    }
  }

  return (
    <View style={styles.form} testID="add-kid-form">
      <Group>
        <GroupItem>
          <View style={styles.fields}>
            <Field label={KIDS_COPY.name} value={name} onChangeText={setName} maxLength={40} problem={problems.name} testID="kid-name" />
            <Field
              label={KIDS_COPY.born}
              hint={KIDS_COPY.bornMeta}
              value={born}
              onChangeText={setBorn}
              keyboardType="number-pad"
              maxLength={4}
              problem={problems.born}
              testID="kid-born"
            />
          </View>
        </GroupItem>
      </Group>
      <View style={styles.actions}>
        {move.problem ? <Alert message={move.problem} /> : null}
        <ButtonRow>
          <Button label={KIDS_COPY.submit} busy={move.pending} busyLabel={BUSY_COPY.adding} onPress={() => void save()} testID="add-kid" />
        </ButtonRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SECTION_GAP },
  fields: { gap: SPACE.lg },
  actions: { paddingHorizontal: INSET, gap: SPACE.sm },
});
