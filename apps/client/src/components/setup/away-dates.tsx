import { bookingWeeks, dayName, weekdayName, monthLabel, monthsSpanned, type IsoDow } from '@app/core';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { FONT, RADIUS, SPACE, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** A run of days being picked: neither end yet, the first, or both. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Five weeks at a time, a month or so; moving on keeps the last week in view. */
const WEEKS = 5;
const STEP = 4;

/**
 * Pick the days you're away from a calendar that opens on this week, the
 * first you can book, rather than on the 1st of the month: weeks start on
 * the house's first day and run on across months, the 1st of each marked
 * with its month. The first tap is the first day (and the last, for a single
 * day), the next the last day. Nothing before `today` can be picked.
 */
export function AwayDates({
  today,
  weekStarts,
  value,
  onChange,
}: {
  today: string;
  weekStarts: IsoDow;
  value: DateRange;
  onChange: (range: DateRange, picking: boolean) => void;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const [from, setFrom] = useState(0);
  const [picking, setPicking] = useState(false);
  const weeks = bookingWeeks(today, weekStarts, from, WEEKS);
  const days = Array.from({ length: 7 }, (_, i) => (((weekStarts - 1 + i) % 7) + 1) as IsoDow);
  const span = monthsSpanned(weeks[0][0], weeks[WEEKS - 1][6], words);

  function tap(date: string) {
    if (picking && value.from && date >= value.from) {
      setPicking(false);
      onChange({ from: value.from, to: date }, false);
    } else {
      setPicking(true);
      onChange({ from: date, to: date }, true);
    }
  }

  return (
    <View style={styles.calendar} testID="date-range">
      <View style={styles.head}>
        <IconButton
          icon={ChevronLeftIcon}
          label={words('house.setup.earlier')}
          disabled={from === 0}
          onPress={() => setFrom((was) => Math.max(0, was - STEP))}
        />
        {/* Two lines where a small phone can't fit "December 2026–January 2027" on one. */}
        <Text style={[type.rowTitle, styles.span]} numberOfLines={2} accessibilityLiveRegion="polite">
          {span}
        </Text>
        <IconButton icon={ChevronRightIcon} label={words('house.setup.later')} onPress={() => setFrom((was) => was + STEP)} />
      </View>
      <View style={styles.week} aria-hidden>
        {days.map((d) => (
          <Text key={d} style={[type.caps, styles.dow]}>
            {weekdayName(d, words, 'narrow')}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((date) => {
            const past = date < today;
            const end = date === value.from || date === value.to;
            const inside = value.from !== null && value.to !== null && date > value.from && date < value.to;
            const ink = end ? colors.background : past ? colors.mutedForeground : colors.foreground;
            // A picked day says so: the web hears aria-pressed, which React Native lacks.
            const picked = Platform.OS === 'web' ? ({ 'aria-pressed': end || inside } as object) : { 'aria-selected': end || inside };
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={dayName(date, words)}
                {...picked}
                aria-disabled={past}
                disabled={past}
                onPress={() => tap(date)}
                style={[
                  styles.day,
                  end && { backgroundColor: colors.foreground },
                  inside && { backgroundColor: colors.secondary },
                  date === today && !end && { borderColor: colors.foreground, borderWidth: 2 },
                ]}
              >
                {/* The 1st of a month says which month it starts, over its number. */}
                {date.endsWith('-01') ? (
                  <Text style={[type.caps, styles.month, { color: ink }]}>{monthLabel(date.slice(0, 7), words).slice(0, 3)}</Text>
                ) : null}
                {/* A day gone by stays readable, muted and in a lighter weight, not faded. */}
                <Text style={[type.body, styles.date, past && styles.pastDate, { color: ink }]}>{Number(date.slice(8))}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  span: { flexShrink: 1, textAlign: 'center' },
  week: { flexDirection: 'row', gap: 2 },
  dow: { flex: 1, textAlign: 'center', paddingVertical: SPACE.xs },
  day: { flex: 1, minHeight: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS },
  month: { position: 'absolute', top: 0 },
  date: { fontFamily: FONT.bold },
  pastDate: { fontFamily: FONT.regular },
});
