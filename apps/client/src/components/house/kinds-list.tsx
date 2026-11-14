import { freeColour, kindOf, kindsInOrder, listLine, moveKind, pointsLabel, type JohnDef, type KindDef } from '@app/core';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteKind, orderKinds, saveKind } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ColourPicker } from '@/components/colour-picker';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { useHouseWorkspace } from '@/components/house/workspace';
import { LidBar } from '@/components/lid';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useJohnList } from '@/hooks/use-john-list';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';
import { INSET, LABEL_GAP, LEADING, SECTION_GAP, SPACE } from '@/theme';

/** A kind being added (no id yet) or changed. */
type Draft = { id?: string; name: string; colour: string };

/**
 * Kinds, under the John list (Kinds list A, 14 Nov): the house's own kinds
 * of John in their order, each a row with its lid bar, its name and how
 * many Johns it has, then Add a kind; under them, what a kind does and
 * doesn't. An admin opens one to rename it, give it a colour, move it up or
 * down the list or delete it: in the panel beside the list on a laptop, a
 * sheet on a phone.
 */
export function KindsList({ houseId, kinds, johns }: { houseId: string; kinds: KindDef[]; johns: JohnDef[] }) {
  const words = useWords();
  const [editing, setEditing] = useState<Draft | null>(null);
  const { panel } = useHouseWorkspace();
  const open = (draft: Draft) => {
    if (!panel) {
      setEditing(draft);
      return;
    }
    panel.open({
      title: draft.id ? words('house.kinds.edit', { name: draft.name }) : words('house.kinds.add'),
      description: words('house.kinds.hint'),
      testID: 'kind-panel',
      content: <KindForm key={draft.id ?? 'new'} houseId={houseId} initial={draft} onDone={panel.close} />,
    });
  };
  const count = (k: KindDef) => johns.filter((j) => kindOf(j, kinds)?.id === k.id).length;
  return (
    <>
      <View style={styles.noted} testID="kinds">
        <Group>
          {kindsInOrder(kinds).map((k) => (
            <KindRow key={k.id} name={k.name} colour={k.colour} johns={count(k)} onPress={() => open({ id: k.id, name: k.name, colour: k.colour })} />
          ))}
          <AddKindRow onPress={() => open({ name: '', colour: freeColour(kinds) })} />
        </Group>
        <Meta style={styles.note}>{words('house.kinds.note')}</Meta>
      </View>
      <Sheet
        visible={editing !== null}
        title={editing?.id ? words('house.kinds.edit', { name: editing.name }) : words('house.kinds.add')}
        description={words('house.kinds.hint')}
        flush
        onClose={() => setEditing(null)}
      >
        {editing ? <KindForm key={editing.id ?? 'new'} houseId={houseId} initial={editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </>
  );
}

/** One kind on the Kinds list: its lid bar, its name and how many Johns it has. It opens the kind. */
export function KindRow({ name, colour, johns, onPress }: { name: string; colour: string; johns: number; onPress: () => void }) {
  const words = useWords();
  const count = words('house.kinds.count', { n: johns });
  return (
    <Row
      leading={
        <View style={styles.lead}>
          <LidBar lid={colour} />
        </View>
      }
      title={name}
      meta={count}
      chevron
      onPress={onPress}
      accessibilityLabel={`${words('house.kinds.edit', { name })}, ${count}`}
      testID="kind-row"
    />
  );
}

/** Add a kind, at the foot of the Kinds list. */
export function AddKindRow({ onPress }: { onPress: () => void }) {
  const words = useWords();
  return <Row leading={<RowIcon icon={PlusIcon} />} title={words('house.kinds.add')} onPress={onPress} testID="add-kind" />;
}

/**
 * One kind: its name, its colour (the ready colours, then any colour), how
 * a John of it looks, then for a kind already on the list its place (Move
 * up, Move down, which happen at once) and Delete, saying its Johns will
 * have no kind until they're given one (no kind C, 14 Nov). Save is the
 * sheet's one amber button. The house's kinds and Johns are read here, so a
 * move shows its new place straight away.
 */
function KindForm({ houseId, initial, onDone }: { houseId: string; initial: Draft; onDone: () => void }) {
  const words = useWords();
  const list = useJohnList(houseId).data;
  const kinds = kindsInOrder(list?.kinds ?? []);
  const johns = list?.johns ?? [];
  const move = useMove(houseId);
  // Which button is waiting: they share one move.
  const [doing, setDoing] = useState<'save' | 'remove' | 'up' | 'down'>('save');
  const [name, setName] = useState(initial.name);
  const [colour, setColour] = useState(initial.colour);
  const mine = initial.id ? johns.filter((j) => kindOf(j, kinds)?.id === initial.id) : [];
  const at = initial.id ? kinds.findIndex((k) => k.id === initial.id) : -1;

  async function save() {
    setDoing('save');
    if (await move.run(() => saveKind(houseId, initial.id ?? null, { name, colour }))) onDone();
  }

  async function shift(by: -1 | 1) {
    setDoing(by < 0 ? 'up' : 'down');
    await move.run(() => orderKinds(houseId, moveKind(kinds, initial.id!, by)));
  }

  async function remove() {
    setDoing('remove');
    if (initial.id && (await move.run(() => deleteKind(initial.id!)))) onDone();
  }

  const sample = mine[0];
  const deletable = at >= 0;
  const note = deletable && mine.length > 0 ? words('house.kinds.deleteNote', { n: mine.length }) : null;
  return (
    <View style={styles.form} testID="kind-form">
      <Group>
        <GroupItem>
          <Field
            label={words('house.kinds.name')}
            placeholder={words('house.kinds.namePlaceholder')}
            value={name}
            onChangeText={setName}
            maxLength={30}
            testID="kind-name"
          />
        </GroupItem>
      </Group>
      <Section label={words('house.kinds.colour')}>
        <GroupItem>
          <ColourPicker value={colour} onChange={setColour} />
        </GroupItem>
      </Section>
      <Section label={words('house.kinds.preview')} testID="kind-preview">
        <Row
          title={sample?.name ?? words('house.kinds.sampleJohn')}
          lid={colour}
          meta={[name.trim() || words('house.kinds.newName'), sample ? listLine(sample, words) : null].filter(Boolean).join(', ')}
          trailing={sample ? pointsLabel(sample.points, words) : undefined}
        />
      </Section>
      {at >= 0 && kinds.length > 1 ? (
        <Section label={words('house.kinds.place')} testID="kind-place">
          {at > 0 ? (
            <Row
              leading={<RowIcon icon={ArrowUpIcon} />}
              title={words('house.kinds.moveUp')}
              meta={words('house.kinds.above', { name: kinds[at - 1].name })}
              disabled={move.pending}
              onPress={() => void shift(-1)}
              testID="kind-up"
            />
          ) : null}
          {at < kinds.length - 1 ? (
            <Row
              leading={<RowIcon icon={ArrowDownIcon} />}
              title={words('house.kinds.moveDown')}
              meta={words('house.kinds.below', { name: kinds[at + 1].name })}
              disabled={move.pending}
              onPress={() => void shift(1)}
              testID="kind-down"
            />
          ) : null}
        </Section>
      ) : null}
      <View style={styles.actions}>
        {move.problem ? <Alert message={move.problem} /> : null}
        {note ? <Meta testID="kind-note">{note}</Meta> : null}
        <ButtonRow stacked>
          <Button
            label={initial.id ? words('house.kinds.save') : words('house.kinds.create')}
            busyLabel={words('house.kinds.saving')}
            busy={move.pending && doing === 'save'}
            disabled={!name.trim()}
            onPress={() => void save()}
            testID="save-kind"
          />
          {deletable ? (
            <Button
              variant="hazard"
              icon={Trash2Icon}
              label={words('house.kinds.remove')}
              busy={move.pending && doing === 'remove'}
              busyLabel={words('common.busy.removing')}
              onPress={() => void remove()}
              testID="delete-kind"
            />
          ) : null}
        </ButtonRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noted: { gap: LABEL_GAP },
  // A line under the kinds, on the leading edge.
  note: { paddingHorizontal: INSET },
  // The lid bar in the leading slot, where the other rows have an icon.
  lead: { width: LEADING, alignItems: 'center' },
  form: { gap: SECTION_GAP },
  actions: { paddingHorizontal: INSET, gap: SPACE.sm },
});
