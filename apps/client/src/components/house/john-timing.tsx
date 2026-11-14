import { monthName, nextLine, nextStartsOn, periodWords, placeWord, previewLandings, startMonths, weekdayName, type HouseRules, type JohnDef } from '@app/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Group, GroupItem } from '@/components/group';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { HAIR, INSET, LABEL_GAP, MARK_GAP, MARK_RADIUS, SPACE, useTheme } from '@/theme';
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

const styles = StyleSheet.create({
  block: { gap: LABEL_GAP * 2 },
  inset: { paddingHorizontal: INSET },
  noted: { gap: LABEL_GAP },
  note: { paddingHorizontal: INSET },
  words: { flexDirection: 'row', flexWrap: 'wrap', columnGap: MARK_GAP, rowGap: HAIR, paddingVertical: SPACE.md, alignItems: 'baseline' },
  sentence: { fontSize: 20, lineHeight: 30 },
  word: { borderBottomWidth: 3, borderRadius: MARK_RADIUS },
});
