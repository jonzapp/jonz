import { firstName, memberCan, roleCopy, BUSY_COPY } from '@app/core';
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
import { useWords } from '@/hooks/use-words';

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
  const amAdmin = memberCan(view.me, 'members:write');
  const say = useWords(view.snapshot.house.kind);
  const copy = roleCopy(say).admins;

  function change(person: Housemate, to: 'admin' | 'member') {
    const name = firstName(person.name);
    return role.run(() => setRole(houseId, person.userId, to)).then((done) => {
      if (done) offer(say(to === 'admin' ? 'wall.history.madeAdmin' : 'wall.history.madeMember', { name }), 'role', person.userId);
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
            title={m.userId === userId ? copy.you(m.name) : m.name}
            trailing={
              amAdmin && admins.length > 1 && m.userId !== userId ? (
                <TextButton
                  label={copy.remove}
                  accessibilityLabel={copy.removeLabel(firstName(m.name))}
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
            title={copy.add}
            meta={others.length === 0 ? copy.everyoneIs : undefined}
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
      <Meta style={styles.note}>{admins.length === 1 && amAdmin ? `${copy.note} ${copy.onlyAdmin}` : copy.note}</Meta>
      <ConfirmSheet
        visible={adding}
        title={copy.add}
        body={copy.addBody}
        confirmLabel={chosen ? copy.make(firstName(chosen.name)) : null}
        icon={ShieldCheckIcon}
        tone="primary"
        busy={role.pending}
        busyLabel={BUSY_COPY.saving}
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
