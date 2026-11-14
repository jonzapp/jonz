import { dayChoices, LAST_OF_MONTH, landingLabel, MAX_EVERY_MONTHS, MAX_EVERY_WEEKS, monthName, nextLine, REPEAT_CLOCK, REPEAT_QUICK, nextStartsOn, placeWord, previewLandings, RESPOND_HOURS, startMonths, weekdayName, type HouseRules } from '@app/core';
import { MinusIcon, PlusIcon } from 'lucide-react-native';
import { useState, type ComponentProps, type ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { IconButton } from '@/components/icon-button';
import { Field } from '@/components/field';
import { HouseTimeNote } from '@/components/house-time-note';
import { Group, GroupItem } from '@/components/group';
import type { Timing, TimingWord } from '@/components/house/john-timing';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Body, Lead, Meta } from '@/components/text';
import { FONT, INSET, LABEL_GAP, SECTION_GAP, SPACE, TABULAR, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

// The choices behind each word of a John's timing sentence (john-timing.tsx).

type Unit = 'weeks' | 'months' | 'years';
const UNIT_KEYS = ['weeks', 'months', 'years'] as const;
/** How far each unit's stepper goes. */
const MOST: Record<Unit, number> = { weeks: MAX_EVERY_WEEKS, months: 24, years: MAX_EVERY_MONTHS / 12 };

const unitOf = (t: Pick<Timing, 'everyMonths'>): Unit => (t.everyMonths === null ? 'weeks' : t.everyMonths % 12 === 0 ? 'years' : 'months');
const countOf = (t: Pick<Timing, 'everyWeeks' | 'everyMonths'>) =>
  t.everyMonths === null ? t.everyWeeks : t.everyMonths % 12 === 0 ? t.everyMonths / 12 : t.everyMonths;

/** A new period: in weeks the monthly fields clear; into months a John lands on the first of its day until told otherwise. */
function period(t: Timing, everyWeeks: number, everyMonths: number | null): Partial<Timing> {
  if (everyMonths === null) return { everyWeeks, everyMonths: null, weekOfMonth: null, anchorMonth: null };
  return { everyWeeks: 1, everyMonths, weekOfMonth: t.weekOfMonth ?? 1 };
}

/** Done within's choices: a window set outside them (by an older app) still shows. */
function respondChoices(now: number): number[] {
  return (RESPOND_HOURS as readonly number[]).includes(now) ? [...RESPOND_HOURS] : [...RESPOND_HOURS, now].sort((a, b) => a - b);
}

/** The quick period a John's timing is, if it's one of them. */
function quickOf(value: Timing) {
  return REPEAT_QUICK.find((q) => q.everyMonths === value.everyMonths && (q.everyMonths !== null || q.everyWeeks === value.everyWeeks));
}

/** A word's quick choices: the kit's Segmented, inset, two to a row unless said otherwise, so long words are never cut short. */
function QuickChoices<T extends string | number>({ perRow = 2, ...choices }: Omit<ComponentProps<typeof Segmented<T>>, 'equal'>) {
  return (
    <View style={styles.inset}>
      <Segmented {...choices} perRow={perRow} />
    </View>
  );
}

/** − n + for a count, with its value spoken. */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const words = useWords();
  const { type } = useTheme();
  const step = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }}>
      <IconButton outline icon={MinusIcon} label={`${words('house.repeat.fewer')}: ${label}`} disabled={value <= min} onPress={() => step(-1)} />
      <Text style={[type.lead, styles.count]} testID="stepper-value">
        {value}
      </Text>
      <IconButton outline icon={PlusIcon} label={`${words('house.repeat.more')}: ${label}`} disabled={value >= max} onPress={() => step(1)} />
    </View>
  );
}

/** What every word's choices are drawn from: the timing so far, and how to change it. */
interface Picking {
  value: Timing;
  rules: HouseRules;
  now: Date;
  onChange: (patch: Partial<Timing>) => void;
}

/**
 * One word's choices, in place of the form: a heading, the choices, and
 * Done to go back to the sentence. Every choice applies as it's made.
 */
export function TimingPicker({ word, onDone, ...picking }: Picking & { word: TimingWord; onDone: () => void }) {
  const words = useWords();
  const Choices = CHOICES[word];
  return (
    <View style={styles.picker} testID={`picker-${word}`}>
      <Choices {...picking} />
      <View style={styles.inset}>
        <ButtonRow>
          <Button label={words('house.repeat.done')} onPress={onDone} testID="timing-done" />
        </ButtonRow>
      </View>
    </View>
  );
}

/** A picker's heading, with a line under it when it needs saying more. */
function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={[styles.inset, styles.head]}>
      <Lead header>{title}</Lead>
      {sub ? <Meta>{sub}</Meta> : null}
    </View>
  );
}

/** How often: the quick periods, then any count of weeks, months or years. */
function OftenChoices({ value, onChange }: Picking) {
  const words = useWords();
  const [unit, setUnit] = useState<Unit>(unitOf(value));
  const setCount = (n: number, inUnit: Unit = unit) =>
    onChange(inUnit === 'weeks' ? period(value, n, null) : period(value, 1, inUnit === 'years' ? n * 12 : n));
  return (
    <>
      <Head title={words('house.repeat.often')} />
      <QuickChoices
        label={words('house.repeat.often')}
        options={REPEAT_QUICK.map((q) => ({ value: q.key, label: words(`house.repeat.quick.${q.key}` as const) }))}
        value={quickOf(value)?.key ?? ''}
        onChange={(key) => {
          const q = REPEAT_QUICK.find((one) => one.key === key)!;
          setUnit(unitOf(q));
          onChange(period(value, q.everyWeeks, q.everyMonths));
        }}
        testID="timing-quick"
      />
      <View style={styles.noted}>
        <Body style={styles.inset}>{words('house.repeat.anyPeriod')}</Body>
        <Group>
          <GroupItem>
            <View style={styles.period}>
              <Stepper label={words('house.repeat.often')} value={countOf(value)} min={1} max={MOST[unit]} onChange={(n) => setCount(n)} />
              <Segmented
                label={words('house.repeat.often')}
                options={UNIT_KEYS.map((u) => ({ value: u, label: words(`house.repeat.units.${u}` as const) }))}
                value={unit}
                onChange={(u) => {
                  setUnit(u);
                  setCount(Math.min(countOf(value), MOST[u]), u);
                }}
                equal
                testID="timing-unit"
              />
            </View>
          </GroupItem>
        </Group>
      </View>
    </>
  );
}

/** Which month it starts in, each with the day it would land on. */
function FromChoices({ value, rules, now, onChange }: Picking) {
  const words = useWords();
  const from = nextStartsOn(now, rules.timezone, rules.weekStarts);
  const months = startMonths({ everyMonths: value.everyMonths, weekOfMonth: value.weekOfMonth, dueDow: value.dueDow }, from, rules.weekStarts);
  const chosen = value.anchorMonth === null ? months[0]?.month : months.find((m) => (m.month - value.anchorMonth!) % (value.everyMonths ?? 1) === 0)?.month;
  return (
    <>
      <Head title={words('house.repeat.startsIn')} sub={words('house.repeat.startsInSub')} />
      <Group>
        {months.map((m) => (
          <ChoiceRow
            key={m.month}
            role="radio"
            label={monthName(m.month, words)}
            meta={landingLabel(m.date, words, { day: true, year: true })}
            checked={m.month === chosen}
            onPress={() => onChange({ anchorMonth: m.month })}
          />
        ))}
      </Group>
    </>
  );
}

/** Which of the month's days (the first Saturday, the last), each with where it lands next. */
function WhichChoices({ value, rules, now, onChange }: Picking) {
  const words = useWords();
  const preview = (weekOfMonth: number) =>
    previewLandings({ ...value, weekOfMonth }, now, rules.timezone, rules.weekStarts, 3).map((d) => landingLabel(d, words));
  return (
    <>
      <Head title={words('house.repeat.which', { day: weekdayName(value.dueDow, words) })} sub={words('house.repeat.whichSub')} />
      <Group>
        {[1, 2, 3, 4, LAST_OF_MONTH].map((n) => (
          <ChoiceRow
            key={n}
            role="radio"
            label={placeWord(n, words).charAt(0).toLocaleUpperCase() + placeWord(n, words).slice(1)}
            meta={preview(n).join(', ')}
            checked={value.weekOfMonth === n}
            onPress={() => onChange({ weekOfMonth: n })}
          />
        ))}
      </Group>
    </>
  );
}

/** The day of the week, with where it lands next. */
function DayChoices({ value, rules, now, onChange }: Picking) {
  const words = useWords();
  const first = previewLandings(value, now, rules.timezone, rules.weekStarts, 1)[0];
  return (
    <>
      <Head title={words('house.repeat.day')} />
      <View style={styles.noted}>
        <View style={styles.inset}>
          <Segmented label={words('house.repeat.day')} options={dayChoices(words)} value={value.dueDow} onChange={(dueDow) => onChange({ dueDow })} equal testID="timing-days" />
        </View>
        {first ? <Meta style={styles.note}>{nextLine([first], words)}</Meta> : null}
      </View>
    </>
  );
}

/** The time it's due by: the quick times, or any typed. */
function TimeChoices({ value, rules, now, onChange }: Picking) {
  const words = useWords();
  return (
    <>
      <Head title={words('house.repeat.time')} />
      <QuickChoices
        label={words('house.repeat.time')}
        options={REPEAT_CLOCK.map((c) => ({ value: c.time, label: `${words(`house.repeat.clock.${c.key}` as const)} ${c.time}` }))}
        value={value.dueTime}
        onChange={(dueTime) => onChange({ dueTime })}
        testID="timing-clock"
      />
      <View style={styles.noted}>
        <View style={styles.inset}>
          <Field
            label={words('house.repeat.anyTime')}
            value={value.dueTime}
            onChangeText={(dueTime) => onChange({ dueTime })}
            placeholder="21:00"
            maxLength={5}
            keyboardType="numbers-and-punctuation"
            testID="john-time"
          />
        </View>
        <Meta style={styles.note}>{words('house.repeat.lateAfter', { hours: rules.lateHours })}</Meta>
        <HouseTimeNote house={rules.timezone} now={now} style={styles.note} />
      </View>
    </>
  );
}

/** On call: how many times a week it can be asked for. */
function TimesChoices({ value, onChange }: Picking) {
  const words = useWords();
  return (
    <>
      <Head title={words('house.repeat.timesAWeek')} sub={words('house.repeat.timesAWeekSub')} />
      <Group>
        <GroupItem>
          <Stepper label={words('house.repeat.timesAWeek')} value={value.perWeek} min={1} max={14} onChange={(perWeek) => onChange({ perWeek })} />
        </GroupItem>
      </Group>
    </>
  );
}

/** On call: how long whoever has it gets once it's flagged. */
function WithinChoices({ value, onChange }: Picking) {
  const words = useWords();
  return (
    <>
      <Head title={words('house.repeat.within')} sub={words('house.repeat.withinSub')} />
      <QuickChoices
        label={words('house.repeat.within')}
        options={respondChoices(value.respondHours).map((h) => ({ value: h, label: words('house.johns.respondHours', { hours: h }) }))}
        value={value.respondHours}
        onChange={(respondHours) => onChange({ respondHours })}
        perRow={3}
        testID="timing-within"
      />
    </>
  );
}

const CHOICES: Record<TimingWord, ComponentType<Picking>> = {
  often: OftenChoices,
  from: FromChoices,
  which: WhichChoices,
  day: DayChoices,
  time: TimeChoices,
  times: TimesChoices,
  within: WithinChoices,
};

const styles = StyleSheet.create({
  picker: { gap: SECTION_GAP },
  head: { gap: SPACE.xs },
  inset: { paddingHorizontal: INSET },
  noted: { gap: LABEL_GAP },
  note: { paddingHorizontal: INSET },
  period: { gap: SPACE.md, paddingVertical: SPACE.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingVertical: SPACE.sm },
  count: { minWidth: 32, textAlign: 'center', ...TABULAR, fontFamily: FONT.extrabold },
});
