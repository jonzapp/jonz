import { johnFacts, johnsByKind, kindOf, kindsInOrder, listCells, listLine, NEW_JOHN, pocketMoney, pointsLabel, weeklyEffort, type GroupDef, type HouseRules, type JohnDef, type KindDef } from '@app/core';
import { ListTodoIcon, PlusIcon, SparklesIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { EmptyState } from '@/components/empty-state';
import { Group } from '@/components/group';
import { JohnForm, type Draft } from '@/components/house/john-form';
import { useHouseWorkspace } from '@/components/house/workspace';
import { JohnLine } from '@/components/house/john-line';
import { useSideBySide } from '@/components/page-columns';
import { Row } from '@/components/row';
import { useFilled } from '@/components/screen';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useAskJonz } from '@/hooks/use-ask-jonz';
import { INSET, SECTION_GAP, SPACE } from '@/theme';
import { TourSpot } from '@/components/tour/tour-spot';
import { useWords } from '@/hooks/use-words';

/**
 * The house's list of Johns: what it adds up to and Add a John over it, then
 * a section per kind with how many ("Kitchen", 3), one under another. On a
 * phone each John is a row: its lid bar, when it's due and only what sets
 * it apart, and its points; on a laptop a line of lined-up columns
 * (`JohnLine`), read down like a timetable. Admins add and edit
 * in a sheet; everyone else reads a John's details there. Changes land in the
 * next deal. Several page children, so it goes straight in a Screen.
 */
export function JohnList({
  houseId,
  rules,
  johns,
  kinds,
  groups,
  editable,
  whoAdds,
  quietAdd = false,
  family = false,
}: {
  houseId: string;
  rules: HouseRules;
  johns: JohnDef[];
  /** The house's own kinds of John: the list's sections, in their order, and each John's lid colour. */
  kinds: KindDef[];
  groups: GroupDef[];
  editable: boolean;
  /** An empty list, to someone who can't add to it: who will ("Sam will add the Johns."). */
  whoAdds?: string;
  /** Add a John in outline over the list on a laptop, for a page whose one amber button is another (the first deal). */
  quietAdd?: boolean;
  /** In a family each John can earn pocket money: the form asks how much, and each row says. */
  family?: boolean;
}) {
  const words = useWords();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [reading, setReading] = useState<JohnDef | null>(null);
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;
  // On a laptop a John opens in the panel beside the list, so the next one is a click away.
  const { panel } = useHouseWorkspace();
  const edit = (draft: Draft) => {
    if (!panel) {
      setEditing(draft);
      return;
    }
    panel.open({
      title: draft.id ? words('house.johns.edit', { name: draft.name }) : words('house.johns.add'),
      description: words('house.johns.hint'),
      testID: 'john-panel',
      content: (
        <JohnForm
          key={draft.id ?? 'new'}
          houseId={houseId}
          rules={rules}
          initial={draft}
          kinds={kinds}
          groups={groups}
          family={family}
          onDone={panel.close}
        />
      ),
    });
  };
  const kindName = (john: JohnDef) => kindOf(john, kinds)?.name ?? words('house.kinds.none');
  const read = (john: JohnDef) => {
    if (!panel) {
      setReading(john);
      return;
    }
    panel.open({ title: john.name, testID: 'john-facts', content: <JohnFacts john={john} group={groupName(john.groupId)} kind={kindName(john)} /> });
  };
  // A new John starts in the first kind on the list.
  const first = kindsInOrder(kinds)[0];
  const add = () => edit({ ...NEW_JOHN, kindId: first?.id ?? null });
  return (
    <>
      {johns.length === 0 ? (
        <NoJohns editable={editable} whoAdds={whoAdds} onAdd={add} />
      ) : (
        <>
          <ListBar johns={johns} onAdd={editable ? add : undefined} quiet={quietAdd} />
          {/* The kinds, not the bar above them: a View round both would take the page's gap between them. */}
          <TourSpot id="johns.list">
          {/* The spot is one box: it keeps the page's gap between the kinds itself. */}
          <View style={styles.kinds} testID="john-kinds">
            {/* Johns with no kind (theirs was deleted) come last, grey, until they're given one. */}
            {johnsByKind(johns, kinds).map(({ kind, johns: mine }) => (
              <Section
                key={kind?.id ?? 'none'}
                label={kind?.name ?? words('house.kinds.none')}
                right={String(mine.length)}
                testID={`kind-${kind ? (kind.preset ?? kind.id) : 'none'}`}
              >
                {mine.map((j) => (
                  <ListedJohn key={j.id} john={j} lid={kind?.colour ?? 'other'} group={groupName(j.groupId)} rules={rules} family={family} editable={editable} onOpen={() => (editable ? edit(j) : read(j))} />
                ))}
              </Section>
            ))}
          </View>
          </TourSpot>
        </>
      )}
      <Sheet
        visible={editing !== null}
        title={editing?.id ? words('house.johns.edit', { name: editing.name }) : words('house.johns.add')}
        description={words('house.johns.hint')}
        flush
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <JohnForm
            key={editing.id ?? 'new'}
            houseId={houseId}
            rules={rules}
            initial={editing}
            kinds={kinds}
            groups={groups}
            family={family}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
      <Sheet visible={reading !== null} title={reading?.name} flush onClose={() => setReading(null)} testID="john-facts">
        {reading ? <JohnFacts john={reading} group={groupName(reading.groupId)} kind={kindName(reading)} /> : null}
      </Sheet>
    </>
  );
}

/** The empty list: what to do about it for whoever can add, and who will for everyone else. */
function NoJohns({ editable, whoAdds, onAdd }: { editable: boolean; whoAdds?: string; onAdd: () => void }) {
  const words = useWords();
  // Describe your house: the chat's page on a phone, the panel beside the list from WIDE.
  const ask = useAskJonz();
  return (
    <TourSpot id="johns.list">
      <EmptyState
        icon={ListTodoIcon}
        title={words('house.setup.noJohns')}
        body={editable ? words('house.setup.noJohnsBody') : whoAdds}
        action={
          editable ? (
            <View style={styles.emptyActions}>
              <ButtonRow stacked>
                <Button icon={SparklesIcon} label={words('today.nextUp.describe')} {...ask} testID="describe-house" />
                <Button variant="outline" icon={PlusIcon} label={words('house.johns.add')} onPress={onAdd} testID="add-john" />
              </ButtonRow>
            </View>
          ) : undefined
        }
      />
    </TourSpot>
  );
}

/**
 * Over the list: what it adds up to, then Add a John (with `onAdd`). On a
 * laptop the button sits at the top right over the kinds; on a phone, under
 * the count.
 */
function ListBar({ johns, onAdd, quiet }: { johns: JohnDef[]; onAdd?: () => void; quiet: boolean }) {
  const words = useWords();
  const filled = useFilled() !== null;
  const sum = words('common.join.then', {
    first: words('house.johns.count', { n: johns.length }),
    second: words('house.johns.perWeek', { points: weeklyEffort(johns) }),
  });
  const variant = quiet ? 'outline' : undefined;
  if (filled) {
    return (
      <View style={styles.toolbar} testID="john-list-bar">
        <Meta style={styles.toolbarWords}>{sum}</Meta>
        {onAdd ? (
          // eslint-disable-next-line jonz/button-in-row -- the page's tool beside its count, at the top right (docs/style/layout.md)
          <Button variant={variant} icon={PlusIcon} label={words('house.johns.add')} onPress={onAdd} testID="add-john" />
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.top} testID="john-list-bar">
      <Meta>{sum}</Meta>
      {onAdd ? (
        <ButtonRow>
          <Button variant={variant} icon={PlusIcon} label={words('house.johns.add')} onPress={onAdd} testID="add-john" />
        </ButtonRow>
      ) : null}
    </View>
  );
}

/**
 * One John on the list: on a laptop a line of lined-up columns, on a phone
 * a row with when it's due and only what sets it apart. Pressing it opens
 * the John, to edit for an admin and to read for everyone else.
 */
function ListedJohn({
  john: j,
  lid,
  group,
  rules,
  family,
  editable,
  onOpen,
}: {
  john: JohnDef;
  /** Its kind's colour. */
  lid: string;
  group: string | null;
  rules: HouseRules;
  family: boolean;
  editable: boolean;
  onOpen: () => void;
}) {
  const words = useWords();
  const filled = useFilled() !== null;
  const roomy = useSideBySide();
  const earns = family && j.payMinor ? words('house.pocket.earns', { money: pocketMoney(j.payMinor, rules.currency, words) }) : null;
  const aged = family && j.minAge ? words('people.kids.minAgeLine', { age: j.minAge }) : null;
  // Whether it keeps its day is in its own sheet, with the rest of its details.
  const line = [listLine(j, words, group), j.crew === 1 ? null : words('john.crew.choice', { crew: j.crew }), earns, aged]
    .filter(Boolean)
    .join(', ');
  const points = pointsLabel(j.points, words);
  const spoken = `${editable ? words('house.johns.edit', { name: j.name }) : j.name}, ${line}, ${points}`;
  if (filled) {
    const cells = listCells(j, words, group);
    return (
      <JohnLine
        name={j.name}
        lid={lid}
        when={cells.when}
        often={cells.often}
        also={[...cells.also, ...[earns, aged].filter((x): x is string => x !== null)]}
        points={points}
        weekly={j.when !== 'on_call' && j.everyWeeks === 1 && !j.everyMonths}
        roomy={roomy}
        onPress={onOpen}
        accessibilityLabel={spoken}
      />
    );
  }
  return <Row title={j.name} lid={lid} meta={line} trailing={points} onPress={onOpen} accessibilityLabel={editable ? spoken : undefined} testID="john-def" />;
}

/** A John's details, to read: what an admin would edit, one row each. */
function JohnFacts({ john, group, kind }: { john: JohnDef; group: string | null; kind: string }) {
  const words = useWords();
  return (
    <Group>
      {johnFacts(john, { group, kind }, words).map((fact) => (
        <Row key={fact.label} title={fact.label} trailing={fact.value} testID="john-fact" />
      ))}
    </Group>
  );
}

const styles = StyleSheet.create({
  emptyActions: { gap: SPACE.sm, alignSelf: 'stretch' },
  // Over the kinds on a phone: the list's sum, then Add a John across the column.
  top: { gap: SPACE.sm, paddingHorizontal: INSET },
  kinds: { gap: SECTION_GAP },
  // Above the kinds on a laptop: how much the list adds up to, and Add a John at the right.
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingLeft: INSET },
  toolbarWords: { flex: 1 },
});
