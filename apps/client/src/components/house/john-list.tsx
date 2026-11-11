import { CATEGORIES, CATEGORY_LABEL, CREW_CHOICES, crewLine, CURRENCY_SYMBOL, johnFacts, johnsByKind, listLine, moneyInput, NEW_JOHN, parseMinAge, parseMoney, pocketMoney, pointsLabel, weeklyEffort, type Category, type GroupDef, type HouseRules, type JohnDef, type Words } from '@app/core';
import { ListTodoIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { archiveJohn, saveJohn } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { TimingPicker, TimingSentence, type TimingWord } from '@/components/house/john-timing';
import { useHouseWorkspace } from '@/components/house/workspace';
import { Flow, type FlowItem } from '@/components/page-columns';
import { Row } from '@/components/row';
import { useFilled } from '@/components/screen';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { PickRow } from '@/components/setup/pick-row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useAskJonz } from '@/hooks/use-ask-jonz';
import { useMove } from '@/hooks/use-move';
import { INSET, LABEL_GAP, SECTION_GAP, SPACE } from '@/theme';
import { TourSpot } from '@/components/tour/tour-spot';
import { useWords } from '@/hooks/use-words';

type Draft = Omit<JohnDef, 'id'> & { id?: string };

const KINDS = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
const effort = (words: Words) => Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: pointsLabel(i + 1, words) }));

/**
 * The house's list of Johns: what it adds up to and Add a John over it, then
 * a section per kind with how many ("Kitchen", 3), each John a row: its lid
 * bar, when it's due and only what sets it apart, and its points. Admins add and edit
 * in a sheet; everyone else reads a John's details there. Changes land in the
 * next deal. Several page children, so it goes straight in a Screen.
 */
export function JohnList({
  houseId,
  rules,
  johns,
  groups,
  editable,
  whoAdds,
  quietAdd = false,
  more,
  family = false,
}: {
  houseId: string;
  rules: HouseRules;
  johns: JohnDef[];
  groups: GroupDef[];
  editable: boolean;
  /** An empty list, to someone who can't add to it: who will ("Sam will add the Johns."). */
  whoAdds?: string;
  /** Add a John in outline over the list on a laptop, for a page whose one amber button is another (the first deal). */
  quietAdd?: boolean;
  /** On a laptop, more sections to sit among the kinds (the house's groups). */
  more?: readonly FlowItem[];
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
          groups={groups}
          family={family}
          onDone={panel.close}
        />
      ),
    });
  };
  const read = (john: JohnDef) => {
    if (!panel) {
      setReading(john);
      return;
    }
    panel.open({ title: john.name, testID: 'john-facts', content: <JohnFacts john={john} group={groupName(john.groupId)} /> });
  };
  const add = () => edit({ ...NEW_JOHN });
  // Describe your house: the chat's page on a phone, the panel beside the list from WIDE.
  const ask = useAskJonz();
  // On a laptop the kinds sit in columns, with Add a John above them rather than at the foot.
  const filled = useFilled() !== null;

  return (
    <>
      {johns.length === 0 ? (
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
                  <Button variant="outline" icon={PlusIcon} label={words('house.johns.add')} onPress={add} testID="add-john" />
                </ButtonRow>
              </View>
            ) : undefined
          }
        />
        </TourSpot>
      ) : (
        <>
          {filled ? (
            <View style={styles.toolbar} testID="john-list-bar">
              <Meta style={styles.toolbarWords}>
                {words('common.join.then', { first: words('house.johns.count', { n: johns.length }), second: words('house.johns.perWeek', { points: weeklyEffort(johns) }) })}
              </Meta>
              {editable ? (
                // eslint-disable-next-line jonz/button-in-row -- the page's tool beside its count, at the top right (docs/style/layout.md)
                <Button
                  variant={quietAdd ? 'outline' : undefined}
                  icon={PlusIcon}
                  label={words('house.johns.add')}
                  onPress={add}
                  testID="add-john"
                />
              ) : null}
            </View>
          ) : (
            // On a phone, the same over the list: what it adds up to, then Add a John.
            <View style={styles.top} testID="john-list-bar">
              <Meta>{words('common.join.then', { first: words('house.johns.count', { n: johns.length }), second: words('house.johns.perWeek', { points: weeklyEffort(johns) }) })}</Meta>
              {editable ? (
                <ButtonRow>
                  <Button variant={quietAdd ? 'outline' : undefined} icon={PlusIcon} label={words('house.johns.add')} onPress={add} testID="add-john" />
                </ButtonRow>
              ) : null}
            </View>
          )}
          {/* The kinds, not the bar above them: a View round both would take the page's gap between them. */}
          <TourSpot id="johns.list">
          {/* The spot is one box: on a phone it keeps the page's gap between the kinds itself. */}
          <View style={filled ? undefined : styles.kinds}>
          <Flow
            testID="john-kinds"
            items={johnsByKind(johns, words)
              .map((kind): FlowItem => ({
                key: kind.category,
                // A John's row is about two lines; the kind's name about one.
                weight: kind.johns.length + 1,
                node: (
                  <Section label={CATEGORY_LABEL[kind.category]} right={String(kind.johns.length)} testID={`kind-${kind.category}`}>
                    {kind.johns.map((j) => {
                      const schedule = listLine(j, words, groupName(j.groupId));
                      const earns = family && j.payMinor ? words('house.pocket.earns', { money: pocketMoney(j.payMinor, rules.currency, words) }) : null;
                      const aged = family && j.minAge ? words('people.kids.minAgeLine', { age: j.minAge }) : null;
                      // Whether it keeps its day is in its own sheet, with the rest of its details.
                      const line = [schedule, j.crew === 1 ? null : words('john.crew.choice', { crew: j.crew }), earns, aged]
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <Row
                          key={j.id}
                          title={j.name}
                          lid={j.category}
                          meta={line}
                          trailing={pointsLabel(j.points, words)}
                          onPress={() => (editable ? edit(j) : read(j))}
                          accessibilityLabel={editable ? `${words('house.johns.edit', { name: j.name })}, ${line}, ${pointsLabel(j.points, words)}` : undefined}
                          testID="john-def"
                        />
                      );
                    })}
                  </Section>
                ),
              }))
              .concat(more ?? [])}
          />
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
            groups={groups}
            family={family}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
      <Sheet visible={reading !== null} title={reading?.name} flush onClose={() => setReading(null)} testID="john-facts">
        {reading ? <JohnFacts john={reading} group={groupName(reading.groupId)} /> : null}
      </Sheet>
    </>
  );
}

/** A John's details, to read: what an admin would edit, one row each. */
function JohnFacts({ john, group }: { john: JohnDef; group: string | null }) {
  const words = useWords();
  return (
    <Group>
      {johnFacts(john, group, words).map((fact) => (
        <Row key={fact.label} title={fact.label} trailing={fact.value} testID="john-fact" />
      ))}
    </Group>
  );
}

/**
 * One John's details: its name; what it is and who shares it, with a line on
 * what sharing means; then when, as a sentence under a switch between on a
 * schedule and on call ("Every 3 months from November on the first Saturday
 * by 21:00"), each of whose words opens its choices in place of the form;
 * then how much effort, how many do it (a John on a set day: one, 2 to 6, or
 * everyone home, with what that adds up to under it), whether it keeps its
 * day (always dealt on it, whatever the budget), and whether the tick needs a
 * photo. Save is the sheet's one amber button.
 */
function JohnForm({
  houseId,
  rules,
  initial,
  groups,
  family = false,
  onDone,
}: {
  houseId: string;
  rules: HouseRules;
  initial: Draft;
  groups: GroupDef[];
  family?: boolean;
  onDone: () => void;
}) {
  const words = useWords();
  const move = useMove(houseId);
  // Which of the two buttons is waiting: they share one move.
  const [doing, setDoing] = useState<'save' | 'remove'>('save');
  const [v, setV] = useState(initial);
  // In a family, what it earns a kid, as typed.
  const [pay, setPay] = useState(() => moneyInput(initial.payMinor ?? 0));
  const [payProblem, setPayProblem] = useState<string | null>(null);
  // In a family, the youngest a kid can be to be dealt it, as typed (empty for anyone).
  const [age, setAge] = useState(() => (initial.minAge == null ? '' : String(initial.minAge)));
  const [ageProblem, setAgeProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<TimingWord | null>(null);
  const set = (patch: Partial<Draft>) => setV((old) => ({ ...old, ...patch }));
  const sharers = [{ value: '', label: words('house.johns.everyone') }, ...groups.map((g) => ({ value: g.id, label: g.name }))];
  // What "Shared by" means, under it: how to share with fewer when there's no
  // group yet, and what a group's John does once one is picked.
  const sharing = groups.length === 0 ? words('house.johns.noGroups') : v.groupId ? words('house.johns.groupOnly') : null;
  // Done together: what its points add up to, and who shares them.
  const line = v.when === 'day' ? crewLine(v.crew, v.points, words) : null;
  const together = line ? `${line}. ${words('john.crew.hint')}` : null;

  async function save() {
    setDoing('save');
    const payMinor = family ? parseMoney(pay) : undefined;
    if (payMinor === null || (payMinor !== undefined && payMinor < 0)) {
      setPayProblem(words('house.rules.badAmount'));
      return;
    }
    const minAge = family ? parseMinAge(age) : undefined;
    if (family && minAge === undefined) {
      setAgeProblem(words('people.kids.problems.minAge'));
      return;
    }
    if (await move.run(() => saveJohn(houseId, rules, family ? { ...v, payMinor, minAge } : v, new Date()))) onDone();
  }

  async function remove() {
    setDoing('remove');
    if (v.id && (await move.run(() => archiveJohn(houseId, v.id!, new Date())))) onDone();
  }

  // A word of the timing sentence, pressed: its choices in place of the form until Done.
  if (picking) {
    return (
      <View style={styles.form} testID="john-form">
        <TimingPicker word={picking} value={v} rules={rules} now={new Date()} onChange={set} onDone={() => setPicking(null)} />
      </View>
    );
  }

  return (
    <View style={styles.form} testID="john-form">
      <Group>
        <GroupItem>
          <Field
            label={words('house.johns.name')}
            placeholder={words('house.johns.namePlaceholder')}
            value={v.name}
            onChangeText={(name) => set({ name })}
            maxLength={60}
            testID="john-name"
          />
        </GroupItem>
      </Group>
      <View style={styles.noted}>
        <Group>
          <PickRow label={words('house.johns.kind')} options={KINDS} value={v.category} onChange={(category: Category) => set({ category })} />
          <PickRow label={words('house.johns.sharedBy')} options={sharers} value={v.groupId ?? ''} onChange={(id) => set({ groupId: id || null })} />
        </Group>
        {sharing ? (
          <Meta style={styles.note} testID="sharing-note">
            {sharing}
          </Meta>
        ) : null}
      </View>
      <TimingSentence value={v} rules={rules} now={new Date()} onChange={set} onPick={setPicking} />
      <View style={styles.noted}>
        <Group>
          <PickRow label={words('house.johns.effort')} options={effort(words)} value={v.points} onChange={(points) => set({ points })} />
          {family ? (
            <GroupItem>
              <Field
                label={`${words('house.pocket.johnField')} (${CURRENCY_SYMBOL[rules.currency]})`}
                value={pay}
                onChangeText={(text) => {
                  setPay(text);
                  setPayProblem(null);
                }}
                keyboardType="decimal-pad"
                hint={words('house.pocket.johnFieldMeta')}
                problem={payProblem ?? undefined}
                testID="john-pay"
              />
            </GroupItem>
          ) : null}
          {family ? (
            <GroupItem>
              <Field
                label={words('people.kids.minAgeField')}
                value={age}
                onChangeText={(text) => {
                  setAge(text);
                  setAgeProblem(null);
                }}
                keyboardType="number-pad"
                maxLength={2}
                hint={words('people.kids.minAgeMeta')}
                problem={ageProblem ?? undefined}
                testID="john-min-age"
              />
            </GroupItem>
          ) : null}
          {/* On call stays one person: whoever is on call. */}
          {v.when === 'day' ? (
            <PickRow label={words('john.crew.doneBy')} options={CREW_CHOICES.map((n) => ({ value: n, label: words('john.crew.choice', { crew: n }) }))} value={v.crew} onChange={(crew) => set({ crew })} testID="john-crew" />
          ) : null}
          {/* On call has no day to keep. */}
          {v.when === 'day' ? (
            <ChoiceRow
              role="checkbox"
              label={words('week.steady.keepDay')}
              meta={words('week.steady.keepDayMeta')}
              metaLines={2}
              checked={v.keepDay}
              onPress={() => set({ keepDay: !v.keepDay })}
              testID="john-keep-day"
            />
          ) : null}
          <ChoiceRow
            role="checkbox"
            label={words('house.johns.photo')}
            meta={words('house.setup.photoMeta')}
            checked={v.needsPhoto}
            onPress={() => set({ needsPhoto: !v.needsPhoto })}
            testID="john-photo"
          />
        </Group>
        {together ? (
          <Meta style={styles.note} testID="crew-note">
            {together}
          </Meta>
        ) : null}
      </View>
      <View style={styles.actions}>
        {move.problem ? <Alert message={move.problem} /> : null}
        <ButtonRow stacked>
          <Button
            label={v.id ? words('house.johns.save') : words('house.johns.create')}
            busyLabel={words('house.johns.saving')}
            busy={move.pending && doing === 'save'}
            disabled={!v.name.trim()}
            onPress={() => void save()}
            testID="save-john"
          />
          {v.id ? (
            <Button variant="hazard" icon={Trash2Icon} label={words('house.johns.remove')} busy={move.pending && doing === 'remove'} busyLabel={words('common.busy.removing')} onPress={() => void remove()} />
          ) : null}
        </ButtonRow>
      </View>
    </View>
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
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
  noted: { gap: LABEL_GAP },
  form: { gap: SECTION_GAP },
  actions: { paddingHorizontal: INSET, gap: SPACE.sm },
});
