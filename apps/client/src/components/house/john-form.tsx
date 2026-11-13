import { CATEGORIES, CATEGORY_LABEL, CREW_CHOICES, crewLine, CURRENCY_SYMBOL, moneyInput, parseMinAge, parseMoney, pointsLabel, type Category, type GroupDef, type HouseRules, type JohnDef, type Words } from '@app/core';
import { Trash2Icon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { archiveJohn, saveJohn } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { TimingSentence, type TimingWord } from '@/components/house/john-timing';
import { TimingPicker } from '@/components/house/john-timing-picker';
import { ChoiceRow } from '@/components/setup/choice-row';
import { PickRow } from '@/components/setup/pick-row';
import { Meta } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';
import { INSET, LABEL_GAP, SECTION_GAP, SPACE } from '@/theme';

/** A John being added (no id yet) or edited. */
export type Draft = Omit<JohnDef, 'id'> & { id?: string };

type SetDraft = (patch: Partial<Draft>) => void;

const KINDS = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
const effort = (words: Words) => Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: pointsLabel(i + 1, words) }));

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
export function JohnForm({
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
  const kid = useKidFields(initial);
  const [picking, setPicking] = useState<TimingWord | null>(null);
  const set: SetDraft = (patch) => setV((old) => ({ ...old, ...patch }));

  async function save() {
    setDoing('save');
    const typed = family ? kid.read() : {};
    if (typed && (await move.run(() => saveJohn(houseId, rules, { ...v, ...typed }, new Date())))) onDone();
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
      <WhatAndWho value={v} groups={groups} onChange={set} />
      <TimingSentence value={v} rules={rules} now={new Date()} onChange={set} onPick={setPicking} />
      <HowItsDone value={v} onChange={set}>
        {family ? <KidFields kid={kid} rules={rules} /> : null}
      </HowItsDone>
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

/** What kind of John it is and who shares it, with a line on what sharing means. */
function WhatAndWho({ value: v, groups, onChange: set }: { value: Draft; groups: GroupDef[]; onChange: SetDraft }) {
  const words = useWords();
  const sharers = [{ value: '', label: words('house.johns.everyone') }, ...groups.map((g) => ({ value: g.id, label: g.name }))];
  // What "Shared by" means, under it: how to share with fewer when there's no
  // group yet, and what a group's John does once one is picked.
  const sharing = groups.length === 0 ? words('house.johns.noGroups') : v.groupId ? words('house.johns.groupOnly') : null;
  return (
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
  );
}

/**
 * How much effort it is, how many do it, whether it keeps its day and
 * whether the tick needs a photo. `children` are a family's fields, after
 * the effort.
 */
function HowItsDone({ value: v, onChange: set, children }: { value: Draft; onChange: SetDraft; children?: ReactNode }) {
  const words = useWords();
  // Done together: what its points add up to, and who shares them.
  const line = v.when === 'day' ? crewLine(v.crew, v.points, words) : null;
  const together = line ? `${line}. ${words('john.crew.hint')}` : null;
  return (
    <View style={styles.noted}>
      <Group>
        <PickRow label={words('house.johns.effort')} options={effort(words)} value={v.points} onChange={(points) => set({ points })} />
        {children}
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
  );
}

/**
 * A family's two extra answers, as typed: what the John earns a kid, and the
 * youngest a kid can be to be dealt it (empty for anyone). `read` gives them
 * as saved, or null (saying which is wrong) when one can't be read.
 */
function useKidFields(initial: Draft) {
  const words = useWords();
  const [pay, setPay] = useState(() => moneyInput(initial.payMinor ?? 0));
  const [payProblem, setPayProblem] = useState<string | null>(null);
  const [age, setAge] = useState(() => (initial.minAge == null ? '' : String(initial.minAge)));
  const [ageProblem, setAgeProblem] = useState<string | null>(null);

  function read(): { payMinor: number; minAge: number | null } | null {
    const payMinor = parseMoney(pay);
    if (payMinor === null || payMinor < 0) {
      setPayProblem(words('house.rules.badAmount'));
      return null;
    }
    const minAge = parseMinAge(age);
    if (minAge === undefined) {
      setAgeProblem(words('people.kids.problems.minAge'));
      return null;
    }
    return { payMinor, minAge };
  }

  return {
    pay,
    payProblem,
    age,
    ageProblem,
    typePay: (text: string) => {
      setPay(text);
      setPayProblem(null);
    },
    typeAge: (text: string) => {
      setAge(text);
      setAgeProblem(null);
    },
    read,
  };
}

function KidFields({ kid, rules }: { kid: ReturnType<typeof useKidFields>; rules: HouseRules }) {
  const words = useWords();
  return (
    <>
      <GroupItem>
        <Field
          label={`${words('house.pocket.johnField')} (${CURRENCY_SYMBOL[rules.currency]})`}
          value={kid.pay}
          onChangeText={kid.typePay}
          keyboardType="decimal-pad"
          hint={words('house.pocket.johnFieldMeta')}
          problem={kid.payProblem ?? undefined}
          testID="john-pay"
        />
      </GroupItem>
      <GroupItem>
        <Field
          label={words('people.kids.minAgeField')}
          value={kid.age}
          onChangeText={kid.typeAge}
          keyboardType="number-pad"
          maxLength={2}
          hint={words('people.kids.minAgeMeta')}
          problem={kid.ageProblem ?? undefined}
          testID="john-min-age"
        />
      </GroupItem>
    </>
  );
}

const styles = StyleSheet.create({
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
  noted: { gap: LABEL_GAP },
  form: { gap: SECTION_GAP },
  actions: { paddingHorizontal: INSET, gap: SPACE.sm },
});
