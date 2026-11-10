import { firstName, membersLine, type GroupDef } from '@app/core';
import { PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Housemate } from '@/api/board';
import { deleteGroup, saveGroup } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { INSET, LABEL_GAP, SECTION_GAP, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

type Draft = { id?: string; name: string; memberIds: string[] };

/**
 * Groups, on the John list: the parts of the house only some of you share.
 * A John can belong to one, and then only that group is handed it. Each
 * group is a row (its name, who's in it), which an admin opens to change,
 * and Add a group for an admin; under them, what a group is for while
 * there are none, and what belonging to one does once there are.
 */
export function GroupsList({
  houseId,
  groups,
  people,
  me,
  editable,
}: {
  houseId: string;
  groups: GroupDef[];
  people: Housemate[];
  me: string;
  editable: boolean;
}) {
  const words = useWords();
  const [editing, setEditing] = useState<Draft | null>(null);
  const add = () => setEditing({ name: '', memberIds: [] });

  return (
    <>
      <View style={styles.noted} testID="groups">
        <Group>
          {groups.map((g) => {
            const members = membersLine(g.memberIds, people, me, words);
            return (
              <Row
                key={g.id}
                leading={<RowIcon icon={UsersIcon} />}
                title={g.name}
                meta={members}
                chevron={editable}
                onPress={editable ? () => setEditing({ id: g.id, name: g.name, memberIds: g.memberIds }) : undefined}
                accessibilityLabel={editable ? `${words('house.groups.edit', { name: g.name })}, ${members}` : undefined}
                testID="group"
              />
            );
          })}
          {editable ? <Row leading={<RowIcon icon={PlusIcon} />} title={words('house.setup.addGroup')} onPress={add} testID="add-group" /> : null}
        </Group>
        {/* With none yet, what a group is for; then what belonging to one does. */}
        <Meta style={styles.note}>{groups.length === 0 ? words('house.groups.empty') : words('house.setup.groupsNote')}</Meta>
      </View>
      <Sheet
        visible={editing !== null}
        title={editing?.id ? words('house.groups.edit', { name: editing.name }) : words('house.setup.addGroup')}
        description={words('house.groups.hint')}
        flush
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <GroupForm
            key={editing.id ?? 'new'}
            houseId={houseId}
            initial={editing}
            people={people}
            me={me}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

/** A group's name and who's in it, a row each to tick by first name, then Save (the sheet's one amber button) and Delete. */
function GroupForm({
  houseId,
  initial,
  people,
  me,
  onDone,
}: {
  houseId: string;
  initial: Draft;
  people: Housemate[];
  me: string;
  onDone: () => void;
}) {
  const words = useWords();
  const move = useMove(houseId);
  // Which of the two buttons is waiting: they share one move.
  const [doing, setDoing] = useState<'save' | 'remove'>('save');
  const [name, setName] = useState(initial.name);
  const [picked, setPicked] = useState(() => new Set(initial.memberIds));
  const toggle = (id: string) =>
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    setDoing('save');
    if (await move.run(() => saveGroup(houseId, { id: initial.id, name, members: [...picked] }))) onDone();
  }

  async function remove() {
    setDoing('remove');
    if (initial.id && (await move.run(() => deleteGroup(initial.id!)))) onDone();
  }

  return (
    <View style={styles.form} testID="group-form">
      <Group>
        <GroupItem>
          <Field
            label={words('house.groups.name')}
            placeholder={words('house.groups.namePlaceholder')}
            value={name}
            onChangeText={setName}
            maxLength={40}
            testID="group-name"
          />
        </GroupItem>
      </Group>
      <Section label={words('house.groups.who')}>
        {people.map((p) => (
          <ChoiceRow
            key={p.userId}
            role="checkbox"
            label={p.userId === me ? words('house.setup.you') : firstName(p.name)}
            checked={picked.has(p.userId)}
            leading={<Avatar name={p.name} userId={p.userId} me={p.userId === me} />}
            onPress={() => toggle(p.userId)}
          />
        ))}
      </Section>
      <View style={styles.actions}>
        {move.problem ? <Alert message={move.problem} /> : null}
        <ButtonRow stacked>
          <Button
            label={initial.id ? words('house.groups.save') : words('house.groups.create')}
            busyLabel={words('house.groups.saving')}
            busy={move.pending && doing === 'save'}
            disabled={picked.size === 0 || !name.trim()}
            onPress={() => void save()}
            testID="save-group"
          />
          {initial.id ? (
            <Button variant="hazard" icon={Trash2Icon} label={words('house.groups.remove')} busy={move.pending && doing === 'remove'} busyLabel={words('common.busy.removing')} onPress={() => void remove()} />
          ) : null}
        </ButtonRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noted: { gap: LABEL_GAP },
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
  form: { gap: SECTION_GAP },
  actions: { paddingHorizontal: INSET, gap: SPACE.sm },
});
