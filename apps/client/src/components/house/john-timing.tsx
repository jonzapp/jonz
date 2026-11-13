import { dayChoices, LAST_OF_MONTH, landingLabel, MAX_EVERY_MONTHS, MAX_EVERY_WEEKS, monthName, nextLine, REPEAT_CLOCK, REPEAT_QUICK, nextStartsOn, periodWords, placeWord, previewLandings, RESPOND_HOURS, startMonths, weekdayName, type HouseRules, type JohnDef } from '@app/core';
import { MinusIcon, PlusIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Body, Lead, Meta } from '@/components/text';
import { FONT, INSET, LABEL_GAP, SECTION_GAP, SPACE, TABULAR, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

// When a John comes round, as one sentence in the John editor: "Every [3
// months] from [November] on the [first] [Saturday] by [21:00]", or "On call,
// up to [2 times] a week, done within [12 hours]". Each word in brackets
// opens its own choices in the editor's sheet (a sheet changes its own
// content; it never opens a second one), and Done goes back to the sentence.

/** The John's timing, as the editor holds it. */
export type Timing = Pick<
  JohnDef,
  'when' | 'everyWeeks' | 'everyMonths' | 'weekOfMonth' | 'anchorMonth' | 'anchorWeek' | 'dueDow' | 'dueTime' | 'respondHours' | 'perWeek'
>;

/** A word in the sentence that opens its choices. */
export type TimingWord = 'often' | 'from' | 'which' | 'day' | 'time' | 'times' | 'within';

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

/**
 * The switch between a John on a schedule and one on call, the sentence
 * under it, and where it lands next. Pressing a word calls `onPick`.
 */
export function TimingSentence({
  value,
  rules,
  now,
  onChange,
  onPick,
}: {
  value: Timing;
  rules: HouseRules;
  now: Date;
  onChange: (patch: Partial<Timing>) => void;
  onPick: (word: TimingWord) => void;
}) {
  const words = useWords();
  const onCall = value.when === 'on_call';
  const from = nextStartsOn(now, rules.timezone, rules.weekStarts);
  const day = weekdayName(value.dueDow, words);
  const parts: (string | { word: TimingWord; label: string; what: string })[] = onCall
    ? [
        words('house.repeat.onCallUpTo'),
        { word: 'times', label: words('house.repeat.times', { n: value.perWeek }), what: words('house.repeat.timesAWeek') },
        words('house.repeat.aWeekWithin'),
        { word: 'within', label: words('house.johns.respondHours', { hours: value.respondHours }), what: words('house.repeat.within') },
      ]
    : [
        words('house.repeat.every'),
        { word: 'often', label: periodWords(value), what: words('house.repeat.often') },
        ...(value.everyMonths !== null && value.weekOfMonth !== null
          ? [
              ...(value.everyMonths > 1
                ? [
                    value.everyMonths % 12 === 0 ? words('house.repeat.in') : words('house.repeat.from'),
                    {
                      word: 'from' as const,
                      label: monthName(
                        value.anchorMonth ??
                          startMonths({ everyMonths: value.everyMonths, weekOfMonth: value.weekOfMonth, dueDow: value.dueDow }, from, rules.weekStarts)[0]
                            ?.month ??
                          0,
                       words),
                      what: words('house.repeat.startsIn'),
                    },
                  ]
                : []),
              words('house.repeat.onThe'),
              { word: 'which' as const, label: placeWord(value.weekOfMonth, words), what: words('house.repeat.which', { day }) },
            ]
          : [words('house.repeat.on')]),
        { word: 'day', label: day, what: words('house.repeat.day') },
        words('house.repeat.by'),
        { word: 'time', label: value.dueTime, what: words('house.repeat.time') },
      ];
  const next = onCall ? null : nextLine(previewLandings(value, now, rules.timezone, rules.weekStarts, 4), words);

  return (
    <View style={styles.block}>
      <View style={styles.inset}>
        <Segmented
          label={words('house.repeat.timing')}
          options={[
            { value: 'day' as const, label: words('house.repeat.onSchedule') },
            { value: 'on_call' as const, label: words('house.johns.onCall') },
          ]}
          value={value.when}
          onChange={(when) => onChange({ when })}
          equal
          testID="john-timing"
        />
      </View>
      <View style={styles.noted}>
        <Group>
          <GroupItem>
            <Sentence parts={parts} onPick={onPick} />
          </GroupItem>
        </Group>
        {next ? (
          <Meta style={styles.note} testID="john-next">
            {next}
          </Meta>
        ) : onCall ? (
          <Meta style={styles.note} testID="on-call-note">
            {words('house.johns.onCallHint')}
          </Meta>
        ) : null}
      </View>
    </View>
  );
}

/** The sentence: plain words, and words to press, wrapping like text. */
function Sentence({
  parts,
  onPick,
}: {
  parts: readonly (string | { word: TimingWord; label: string; what: string })[];
  onPick: (word: TimingWord) => void;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const big = [type.lead, styles.sentence];
  return (
    <View style={styles.words} testID="john-sentence">
      {parts.flatMap((w, i) =>
        typeof w === 'string' ? (
          w.split(' ').map((plain, j) => (
            <Text key={`${i}-${j}`} style={big}>
              {plain}
            </Text>
          ))
        ) : (
          <Pressable
            key={w.word}
            accessibilityRole="button"
            accessibilityLabel={words('house.repeat.word', { what: w.what, value: w.label })}
            onPress={() => onPick(w.word)}
            hitSlop={8}
            testID={`timing-${w.word}`}
            style={({ pressed }) => [styles.word, { borderBottomColor: colors.hivis }, pressed && { backgroundColor: colors.secondary }]}
          >
            <Text style={big}>{w.label}</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** A pill to pick one of a few with: chosen in hi-vis. */
function Pill({ label, chosen, onPress, spoken }: { label: string; chosen: boolean; onPress: () => void; spoken?: string }) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={spoken ?? label}
      aria-checked={chosen}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: chosen ? colors.hivis : colors.border, backgroundColor: chosen ? colors.hivis : pressed ? colors.secondary : colors.card },
      ]}
    >
      <Text style={[type.body, styles.pillText, { color: chosen ? colors.onHivis : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** − n + for a count, with its value spoken. */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const words = useWords();
  const { colors, type } = useTheme();
  const step = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  const round = [styles.round, { borderColor: colors.border }];
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${words('house.repeat.fewer')}: ${label}`} disabled={value <= min} onPress={() => step(-1)} style={[round, value <= min && styles.off]}>
        <MinusIcon size={20} color={colors.foreground} aria-hidden />
      </Pressable>
      <Text style={[type.lead, styles.count]} testID="stepper-value">
        {value}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${words('house.repeat.more')}: ${label}`} disabled={value >= max} onPress={() => step(1)} style={[round, value >= max && styles.off]}>
        <PlusIcon size={20} color={colors.foreground} aria-hidden />
      </Pressable>
    </View>
  );
}

/**
 * One word's choices, in place of the form: a heading, the choices, and
 * Done to go back to the sentence. Every choice applies as it's made.
 */
export function TimingPicker({
  word,
  value,
  rules,
  now,
  onChange,
  onDone,
}: {
  word: TimingWord;
  value: Timing;
  rules: HouseRules;
  now: Date;
  onChange: (patch: Partial<Timing>) => void;
  onDone: () => void;
}) {
  const words = useWords();
  const [unit, setUnit] = useState<Unit>(unitOf(value));
  const from = nextStartsOn(now, rules.timezone, rules.weekStarts);
  const day = weekdayName(value.dueDow, words);
  const preview = (patch: Partial<Timing>, count: number) =>
    previewLandings({ ...value, ...patch }, now, rules.timezone, rules.weekStarts, count).map((d) => landingLabel(d, words));

  const setCount = (n: number, inUnit: Unit = unit) =>
    onChange(inUnit === 'weeks' ? period(value, n, null) : period(value, 1, inUnit === 'years' ? n * 12 : n));

  let title = '';
  let sub: string | null = null;
  let body: ReactNode = null;
  switch (word) {
    case 'often':
      title = words('house.repeat.often');
      body = (
        <>
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={words('house.repeat.often')}>
            {REPEAT_QUICK.map((q) => (
              <Pill
                key={q.key}
                label={words(`house.repeat.quick.${q.key}` as const)}
                chosen={q.everyMonths === value.everyMonths && (q.everyMonths !== null || q.everyWeeks === value.everyWeeks)}
                onPress={() => {
                  setUnit(unitOf(q));
                  onChange(period(value, q.everyWeeks, q.everyMonths));
                }}
              />
            ))}
          </View>
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
      break;
    case 'from': {
      title = words('house.repeat.startsIn');
      sub = words('house.repeat.startsInSub');
      const months = startMonths({ everyMonths: value.everyMonths, weekOfMonth: value.weekOfMonth, dueDow: value.dueDow }, from, rules.weekStarts);
      const chosen = value.anchorMonth === null ? months[0]?.month : months.find((m) => (m.month - value.anchorMonth!) % (value.everyMonths ?? 1) === 0)?.month;
      body = (
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
      );
      break;
    }
    case 'which':
      title = words('house.repeat.which', { day });
      sub = words('house.repeat.whichSub');
      body = (
        <Group>
          {[1, 2, 3, 4, LAST_OF_MONTH].map((n) => (
            <ChoiceRow
              key={n}
              role="radio"
              label={placeWord(n, words).charAt(0).toLocaleUpperCase() + placeWord(n, words).slice(1)}
              meta={preview({ weekOfMonth: n }, 3).join(', ')}
              checked={value.weekOfMonth === n}
              onPress={() => onChange({ weekOfMonth: n })}
            />
          ))}
        </Group>
      );
      break;
    case 'day': {
      title = words('house.repeat.day');
      const first = previewLandings(value, now, rules.timezone, rules.weekStarts, 1)[0];
      body = (
        <View style={styles.noted}>
          <View style={styles.inset}>
            <Segmented label={words('house.repeat.day')} options={dayChoices(words)} value={value.dueDow} onChange={(dueDow) => onChange({ dueDow })} equal testID="timing-days" />
          </View>
          {first ? <Meta style={styles.note}>{nextLine([first], words)}</Meta> : null}
        </View>
      );
      break;
    }
    case 'time':
      title = words('house.repeat.time');
      body = (
        <>
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={words('house.repeat.time')}>
            {REPEAT_CLOCK.map((c) => (
              <Pill key={c.time} label={`${words(`house.repeat.clock.${c.key}` as const)} ${c.time}`} chosen={value.dueTime === c.time} onPress={() => onChange({ dueTime: c.time })} />
            ))}
          </View>
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
          </View>
        </>
      );
      break;
    case 'times':
      title = words('house.repeat.timesAWeek');
      sub = words('house.repeat.timesAWeekSub');
      body = (
        <Group>
          <GroupItem>
            <Stepper label={words('house.repeat.timesAWeek')} value={value.perWeek} min={1} max={14} onChange={(perWeek) => onChange({ perWeek })} />
          </GroupItem>
        </Group>
      );
      break;
    case 'within': {
      title = words('house.repeat.within');
      sub = words('house.repeat.withinSub');
      // A window set outside the choices (by an older app) still shows.
      const hours: number[] = (RESPOND_HOURS as readonly number[]).includes(value.respondHours)
        ? [...RESPOND_HOURS]
        : [...RESPOND_HOURS, value.respondHours].sort((a, b) => a - b);
      body = (
        <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={words('house.repeat.within')}>
          {hours.map((h) => (
            <Pill key={h} label={words('house.johns.respondHours', { hours: h })} chosen={value.respondHours === h} onPress={() => onChange({ respondHours: h })} />
          ))}
        </View>
      );
      break;
    }
  }

  return (
    <View style={styles.picker} testID={`picker-${word}`}>
      <View style={[styles.inset, styles.head]}>
        <Lead header>{title}</Lead>
        {sub ? <Meta>{sub}</Meta> : null}
      </View>
      {body}
      <View style={styles.inset}>
        <ButtonRow>
          <Button label={words('house.repeat.done')} onPress={onDone} testID="timing-done" />
        </ButtonRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: LABEL_GAP * 2 },
  picker: { gap: SECTION_GAP },
  head: { gap: SPACE.xs },
  inset: { paddingHorizontal: INSET },
  noted: { gap: LABEL_GAP },
  note: { paddingHorizontal: INSET },
  words: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 2, paddingVertical: SPACE.md, alignItems: 'baseline' },
  sentence: { fontSize: 20, lineHeight: 30 },
  word: { borderBottomWidth: 3, borderRadius: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, paddingHorizontal: INSET },
  pill: { minHeight: 44, paddingHorizontal: SPACE.md, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  pillText: { fontFamily: FONT.bold, fontSize: 15 },
  period: { gap: SPACE.md, paddingVertical: SPACE.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingVertical: SPACE.sm },
  round: { width: TAP, height: TAP, borderRadius: TAP / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 32, textAlign: 'center', ...TABULAR, fontFamily: FONT.extrabold },
  off: { opacity: 0.4 },
});
