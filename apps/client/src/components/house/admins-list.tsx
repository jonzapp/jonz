import { firstName, HISTORY_COPY, memberCan, roleCopy } from '@app/core';
import { ShieldCheckIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Housemate } from '@/api/board';
import { setRole } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Group, GroupItem } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { INSET, SECTION_GAP } from '@/theme';

/**
 * Who looks after the house, on the Rules page beside the rules they can
 * change: one row each, and "Add an admin", which picks from the
 * housemates who aren't one. An admin can step another down with Remove at
 * once, as Make admin is at once, and either offers Undo in the toast; the
 * house always keeps one (the database checks), and the only admin leaves
 * from House by handing over. Housemates see the list without the buttons.
 */
export function AdminsList({ houseId, userId, view }: { houseId: string; userId: string; view: HouseView }) {
  const role = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const { members } = view.snapshot;
  const admins = members.filter((m) => m.role === 'admin');
  const others = members.filter((m) => m.role !== 'admin');
  const amAdmin = memberCan(view.me, 'people.roles');
  const ADMINS_COPY = roleCopy(view.snapshot.house.kind).admins;

  function change(person: Housemate, to: 'admin' | 'member') {
    const name = firstName(person.name);
    return role.run(() => setRole(houseId, person.userId, to)).then((done) => {
      if (done) offer(to === 'admin' ? HISTORY_COPY.madeAdmin(name) : HISTORY_COPY.madeHousemate(name), 'role', person.userId);
      return done;
    });
  }

  const chosen = others.find((m) => m.userId === pick) ?? null;
  return (
    <View style={styles.stack}>
      <Group testID="admins-list">
        {admins.map((m) => (
          <Row
            key={m.userId}
            leading={<Avatar name={m.name} me={m.userId === userId} />}
            title={m.userId === userId ? ADMINS_COPY.you(m.name) : m.name}
            trailing={
              amAdmin && admins.length > 1 && m.userId !== userId ? (
                <TextButton
                  label={ADMINS_COPY.remove}
                  accessibilityLabel={ADMINS_COPY.removeLabel(firstName(m.name))}
                  disabled={role.pending}
                  onPress={() => void change(m, 'member')}
                  testID="remove-admin"
                />
              ) : undefined
            }
            testID="admin-row"
          />
        ))}
        {amAdmin ? (
          <Row
            leading={<RowIcon icon={ShieldCheckIcon} />}
            title={ADMINS_COPY.add}
            meta={others.length === 0 ? ADMINS_COPY.everyoneIs : undefined}
            disabled={others.length === 0}
            onPress={() => {
              setPick(null);
              setAdding(true);
            }}
            testID="add-admin"
          />
        ) : null}
        {role.problem && !adding ? (
          <GroupItem>
            <Alert message={role.problem} />
          </GroupItem>
        ) : null}
      </Group>
      <Meta style={styles.note}>{admins.length === 1 && amAdmin ? `${ADMINS_COPY.note} ${ADMINS_COPY.onlyAdmin}` : ADMINS_COPY.note}</Meta>
      <ConfirmSheet
        visible={adding}
        title={ADMINS_COPY.addTitle}
        body={ADMINS_COPY.addBody}
        confirmLabel={chosen ? ADMINS_COPY.make(firstName(chosen.name)) : null}
        icon={ShieldCheckIcon}
        tone="primary"
        busy={role.pending}
        problem={role.problem}
        onConfirm={() =>
          void change(chosen!, 'admin').then((done) => {
            if (done) setAdding(false);
          })
        }
        onClose={() => setAdding(false)}
        testID="add-admin-sheet"
      >
        <Group>
          {others.map((m) => (
            <ChoiceRow
              key={m.userId}
              role="radio"
              label={m.name}
              leading={<Avatar name={m.name} userId={m.userId} />}
              checked={pick === m.userId}
              onPress={() => setPick(m.userId)}
              testID="admin-pick"
            />
          ))}
        </Group>
      </ConfirmSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SECTION_GAP / 2 },
  note: { paddingHorizontal: INSET },
});
