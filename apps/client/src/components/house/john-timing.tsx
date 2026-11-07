import {
  DOW_LABEL,
  JOHN_LIST_COPY,
  LAST_OF_MONTH,
  landingLabel,
  MAX_EVERY_MONTHS,
  MAX_EVERY_WEEKS,
  monthName,
  nextLine,
  nextStartsOn,
  periodWords,
  placeWord,
  previewLandings,
  REPEAT_COPY,
  RESPOND_HOURS,
  startMonths,
  type HouseRules,
  type IsoDow,
  type JohnDef,
} from '@app/core';
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

const DAYS = ([1, 2, 3, 4, 5, 6, 7] as IsoDow[]).map((d) => ({ value: d, label: DOW_LABEL[d].slice(0, 3), spoken: DOW_LABEL[d] }));
const TIMINGS = [
  { value: 'day' as const, label: REPEAT_COPY.onSchedule },
  { value: 'on_call' as const, label: JOHN_LIST_COPY.onCall },
];
type Unit = 'weeks' | 'months' | 'years';
const UNITS: { value: Unit; label: string }[] = (['weeks', 'months', 'years'] as const).map((u) => ({ value: u, label: REPEAT_COPY.units[u] }));
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
  const onCall = value.when === 'on_call';
  const from = nextStartsOn(now, rules.timezone, rules.weekStarts);
  const day = DOW_LABEL[value.dueDow];
  const words: (string | { word: TimingWord; label: string; what: string })[] = onCall
    ? [
        REPEAT_COPY.onCallUpTo,
        { word: 'times', label: REPEAT_COPY.times(value.perWeek), what: REPEAT_COPY.timesAWeek },
        REPEAT_COPY.aWeekWithin,
        { word: 'within', label: JOHN_LIST_COPY.respondHours(value.respondHours), what: REPEAT_COPY.within },
      ]
    : [
        REPEAT_COPY.every,
        { word: 'often', label: periodWords(value), what: REPEAT_COPY.often },
        ...(value.everyMonths !== null && value.weekOfMonth !== null
          ? [
              ...(value.everyMonths > 1
                ? [
                    value.everyMonths % 12 === 0 ? REPEAT_COPY.in : REPEAT_COPY.from,
                    {
                      word: 'from' as const,
                      label: monthName(
                        value.anchorMonth ??
                          startMonths({ everyMonths: value.everyMonths, weekOfMonth: value.weekOfMonth, dueDow: value.dueDow }, from, rules.weekStarts)[0]
                            ?.month ??
                          0,
                      ),
                      what: REPEAT_COPY.startsIn,
                    },
                  ]
                : []),
              REPEAT_COPY.onThe,
              { word: 'which' as const, label: placeWord(value.weekOfMonth), what: REPEAT_COPY.which(day) },
            ]
          : [REPEAT_COPY.on]),
        { word: 'day', label: day, what: REPEAT_COPY.day },
        REPEAT_COPY.by,
        { word: 'time', label: value.dueTime, what: REPEAT_COPY.time },
      ];
  const next = onCall ? null : nextLine(previewLandings(value, now, rules.timezone, rules.weekStarts, 4));

  return (
    <View style={styles.block}>
      <View style={styles.inset}>
        <Segmented
          label={REPEAT_COPY.timing}
          options={TIMINGS}
          value={value.when}
          onChange={(when) => onChange({ when })}
          equal
          testID="john-timing"
        />
      </View>
      <View style={styles.noted}>
        <Group>
          <GroupItem>
            <Sentence words={words} onPick={onPick} />
          </GroupItem>
        </Group>
        {next ? (
          <Meta style={styles.note} testID="john-next">
            {next}
          </Meta>
        ) : onCall ? (
          <Meta style={styles.note} testID="on-call-note">
            {JOHN_LIST_COPY.onCallHint}
          </Meta>
        ) : null}
      </View>
    </View>
  );
}

/** The sentence: plain words, and words to press, wrapping like text. */
function Sentence({
  words,
  onPick,
}: {
  words: readonly (string | { word: TimingWord; label: string; what: string })[];
  onPick: (word: TimingWord) => void;
}) {
  const { colors, type } = useTheme();
  const big = [type.lead, styles.sentence];
  return (
    <View style={styles.words} testID="john-sentence">
      {words.flatMap((w, i) =>
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
            accessibilityLabel={REPEAT_COPY.word(w.what, w.label)}
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
  const { colors, type } = useTheme();
  const step = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  const round = [styles.round, { borderColor: colors.border }];
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${REPEAT_COPY.fewer}: ${label}`} disabled={value <= min} onPress={() => step(-1)} style={[round, value <= min && styles.off]}>
        <MinusIcon size={20} color={colors.foreground} aria-hidden />
      </Pressable>
      <Text style={[type.lead, styles.count]} testID="stepper-value">
        {value}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${REPEAT_COPY.more}: ${label}`} disabled={value >= max} onPress={() => step(1)} style={[round, value >= max && styles.off]}>
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
  const [unit, setUnit] = useState<Unit>(unitOf(value));
  const from = nextStartsOn(now, rules.timezone, rules.weekStarts);
  const day = DOW_LABEL[value.dueDow];
  const preview = (patch: Partial<Timing>, count: number) =>
    previewLandings({ ...value, ...patch }, now, rules.timezone, rules.weekStarts, count).map((d) => landingLabel(d));

  const setCount = (n: number, inUnit: Unit = unit) =>
    onChange(inUnit === 'weeks' ? period(value, n, null) : period(value, 1, inUnit === 'years' ? n * 12 : n));

  let title = '';
  let sub: string | null = null;
  let body: ReactNode = null;
  switch (word) {
    case 'often':
      title = REPEAT_COPY.often;
      body = (
        <>
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={REPEAT_COPY.often}>
            {REPEAT_COPY.quick.map((q) => (
              <Pill
                key={q.label}
                label={q.label}
                chosen={q.everyMonths === value.everyMonths && (q.everyMonths !== null || q.everyWeeks === value.everyWeeks)}
                onPress={() => {
                  setUnit(unitOf(q));
                  onChange(period(value, q.everyWeeks, q.everyMonths));
                }}
              />
            ))}
          </View>
          <View style={styles.noted}>
            <Body style={styles.inset}>{REPEAT_COPY.anyPeriod}</Body>
            <Group>
              <GroupItem>
                <View style={styles.period}>
                  <Stepper label={REPEAT_COPY.often} value={countOf(value)} min={1} max={MOST[unit]} onChange={(n) => setCount(n)} />
                  <Segmented
                    label={REPEAT_COPY.often}
                    options={UNITS}
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
      title = REPEAT_COPY.startsIn;
      sub = REPEAT_COPY.startsInSub;
      const months = startMonths({ everyMonths: value.everyMonths, weekOfMonth: value.weekOfMonth, dueDow: value.dueDow }, from, rules.weekStarts);
      const chosen = value.anchorMonth === null ? months[0]?.month : months.find((m) => (m.month - value.anchorMonth!) % (value.everyMonths ?? 1) === 0)?.month;
      body = (
        <Group>
          {months.map((m) => (
            <ChoiceRow
              key={m.month}
              role="radio"
              label={monthName(m.month)}
              meta={landingLabel(m.date, { day: true, year: true })}
              checked={m.month === chosen}
              onPress={() => onChange({ anchorMonth: m.month })}
            />
          ))}
        </Group>
      );
      break;
    }
    case 'which':
      title = REPEAT_COPY.which(day);
      sub = REPEAT_COPY.whichSub;
      body = (
        <Group>
          {[1, 2, 3, 4, LAST_OF_MONTH].map((n) => (
            <ChoiceRow
              key={n}
              role="radio"
              label={placeWord(n).charAt(0).toLocaleUpperCase() + placeWord(n).slice(1)}
              meta={preview({ weekOfMonth: n }, 3).join(', ')}
              checked={value.weekOfMonth === n}
              onPress={() => onChange({ weekOfMonth: n })}
            />
          ))}
        </Group>
      );
      break;
    case 'day': {
      title = REPEAT_COPY.day;
      const first = previewLandings(value, now, rules.timezone, rules.weekStarts, 1)[0];
      body = (
        <View style={styles.noted}>
          <View style={styles.inset}>
            <Segmented label={REPEAT_COPY.day} options={DAYS} value={value.dueDow} onChange={(dueDow) => onChange({ dueDow })} equal testID="timing-days" />
          </View>
          {first ? <Meta style={styles.note}>{REPEAT_COPY.next(landingLabel(first, { day: true }), [])}</Meta> : null}
        </View>
      );
      break;
    }
    case 'time':
      title = REPEAT_COPY.time;
      body = (
        <>
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={REPEAT_COPY.time}>
            {REPEAT_COPY.clock.map((c) => (
              <Pill key={c.time} label={`${c.label} ${c.time}`} chosen={value.dueTime === c.time} onPress={() => onChange({ dueTime: c.time })} />
            ))}
          </View>
          <View style={styles.noted}>
            <View style={styles.inset}>
              <Field
                label={REPEAT_COPY.anyTime}
                value={value.dueTime}
                onChangeText={(dueTime) => onChange({ dueTime })}
                placeholder="21:00"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                testID="john-time"
              />
            </View>
            <Meta style={styles.note}>{REPEAT_COPY.lateAfter(rules.lateHours)}</Meta>
          </View>
        </>
      );
      break;
    case 'times':
      title = REPEAT_COPY.timesAWeek;
      sub = REPEAT_COPY.timesAWeekSub;
      body = (
        <Group>
          <GroupItem>
            <Stepper label={REPEAT_COPY.timesAWeek} value={value.perWeek} min={1} max={14} onChange={(perWeek) => onChange({ perWeek })} />
          </GroupItem>
        </Group>
      );
      break;
    case 'within': {
      title = REPEAT_COPY.within;
      sub = REPEAT_COPY.withinSub;
      // A window set outside the choices (by an older app) still shows.
      const hours: number[] = (RESPOND_HOURS as readonly number[]).includes(value.respondHours)
        ? [...RESPOND_HOURS]
        : [...RESPOND_HOURS, value.respondHours].sort((a, b) => a - b);
      body = (
        <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={REPEAT_COPY.within}>
          {hours.map((h) => (
            <Pill key={h} label={JOHN_LIST_COPY.respondHours(h)} chosen={value.respondHours === h} onPress={() => onChange({ respondHours: h })} />
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
          <Button label={REPEAT_COPY.done} onPress={onDone} testID="timing-done" />
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
