import { dayName, monthLabel, monthWeeks, shiftMonth, weekdayName, type IsoDow } from '@app/core';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** A calendar day's height, the same in Who's away and here, so the two calendars are one shape. */
export const DAY_HEIGHT = 52;

/** A run of days being picked: neither end yet, the first, or both. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

/**
 * Pick the days you're away from a month calendar, the same shape as Who's
 * away's: weeks from the house's first day, opening on this month, with the
 * days either side from the months around it, lighter. The first tap is the
 * first day (and the last, for a single day), the next the last day; the two
 * ends are solid ink and the days between grey. Nothing before `today` can
 * be picked, nor a month before this one shown.
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
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picking, setPicking] = useState(false);
  const weeks = monthWeeks(month, weekStarts);
  const days = Array.from({ length: 7 }, (_, i) => (((weekStarts - 1 + i) % 7) + 1) as IsoDow);

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
          label={words('house.away.earlierMonth')}
          disabled={month <= today.slice(0, 7)}
          onPress={() => setMonth((was) => shiftMonth(was, -1))}
        />
        <Text style={[type.rowTitle, styles.span]} accessibilityLiveRegion="polite">
          {monthLabel(month, words)}
        </Text>
        <IconButton icon={ChevronRightIcon} label={words('house.away.laterMonth')} onPress={() => setMonth((was) => shiftMonth(was, 1))} />
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
            // Another month's days are lighter, as the days gone by are, and as Who's away's are.
            const faint = past || date.slice(0, 7) !== month;
            const end = date === value.from || date === value.to;
            const inside = value.from !== null && value.to !== null && date > value.from && date < value.to;
            const ink = end ? colors.background : faint ? colors.mutedForeground : colors.foreground;
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
                {/* A faint day stays readable, muted and in a lighter weight, not faded. */}
                <Text style={[type.body, styles.date, faint && styles.pastDate, { color: ink }]}>{Number(date.slice(8))}</Text>
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
  day: { flex: 1, minHeight: DAY_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS },
  date: { fontFamily: FONT.bold },
  pastDate: { fontFamily: FONT.regular },
});
