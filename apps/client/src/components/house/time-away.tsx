import { addDaysTo, awayMovedLine, awayShade, backOn, dateRange, dayName, DOW_LABEL, firstName, monthLabel, monthWeeks, shiftMonth, tripMeta, tripStarted, tripsOn, upcomingTrips, withAlpha, type AwayPeriod, type IsoDow } from '@app/core';
import { ChevronLeftIcon, ChevronRightIcon, PlaneIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cancelAway, setAway, type Booked } from '@/api/away';
import type { Housemate } from '@/api/board';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Group, GroupItem } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { AwayDates, type DateRange } from '@/components/setup/away-dates';
import { Sheet } from '@/components/sheet';
import { Body, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { ButtonRow } from '@/components/button-row';
import { IconButton } from '@/components/icon-button';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { FONT, RADIUS, SPACE, useTheme, type Theme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Who's away, on a month calendar for a group: weeks from the house's first
 * day, each day as dark as how many are away (one, two, three or more), with
 * how many under its date and today outlined, then a key to the shades. It
 * opens on this month; the months before it are gone from what's read, so
 * it goes no further back. Tapping a day opens its sheet: who's away and
 * who's home. Each day is a button that says the same in words.
 */
export function AwayMonth({
  periods,
  people,
  me,
  today,
  weekStarts,
}: {
  periods: AwayPeriod[];
  people: Housemate[];
  me: string;
  today: string;
  weekStarts: IsoDow;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const weeks = monthWeeks(month, weekStarts);
  const days = Array.from({ length: 7 }, (_, i) => DOW_LABEL[(((weekStarts - 1 + i) % 7) + 1) as IsoDow]);
  const nobody = upcomingTrips(periods, today).length === 0;

  function open(date: string) {
    setDay(date);
    setMonth(date.slice(0, 7));
  }

  return (
    <>
      <GroupItem testID="away-month">
        <View style={styles.calendar}>
          <View style={styles.head}>
            <IconButton
              icon={ChevronLeftIcon}
              label={words('house.away.earlierMonth')}
              disabled={month <= today.slice(0, 7)}
              onPress={() => setMonth((was) => shiftMonth(was, -1))}
            />
            <Text style={[type.rowTitle, styles.month]} accessibilityLiveRegion="polite">
              {monthLabel(month)}
            </Text>
            <IconButton
              icon={ChevronRightIcon}
              label={words('house.away.laterMonth')}
              onPress={() => setMonth((was) => shiftMonth(was, 1))}
            />
          </View>
          <View style={styles.week} aria-hidden>
            {days.map((d) => (
              <Text key={d} style={[type.caps, styles.dow]}>
                {d.slice(0, 1)}
              </Text>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={week[0]} style={styles.week}>
              {week.map((date) => {
                const away = tripsOn(periods, date).length;
                const shade = shadeOf(colors, away);
                // Another month's days and the days gone by are lighter, as the booking calendar's are.
                const faint = date.slice(0, 7) !== month || date < today;
                const ink = away >= 3 ? colors.card : faint && away < 2 ? colors.mutedForeground : colors.foreground;
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={words('house.away.dayLabel', { day: dayName(date), away })}
                    onPress={() => open(date)}
                    style={[styles.day, { backgroundColor: shade }]}
                    testID="away-day"
                  >
                    {date === today ? (
                      <View pointerEvents="none" style={[styles.today, { borderColor: colors.foreground }]} testID="away-today">
                        {away >= 3 ? <View style={[styles.todayInner, { borderColor: colors.card }]} /> : null}
                      </View>
                    ) : null}
                    <View style={styles.date}>
                      <Text style={[type.body, styles.number, faint && styles.faint, date === today && styles.todayNumber, { color: ink }]}>
                        {Number(date.slice(8))}
                      </Text>
                    </View>
                    <Text style={[type.initials, { color: ink }]}>{away > 0 ? away : ' '}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <View style={styles.key} aria-hidden>
          {[1, 2, 3].map((n) => (
            <View key={n} style={styles.keyItem}>
              <View style={[styles.swatch, { backgroundColor: shadeOf(colors, n) }]} />
              <Meta>{awayShade(n, words)}</Meta>
            </View>
          ))}
        </View>
        {nobody ? <Body>{words('house.away.nobody')}</Body> : <Meta>{words('house.away.tapADay')}</Meta>}
      </GroupItem>
      <DaySheet day={day} periods={periods} people={people} me={me} onDay={open} onClose={() => setDay(null)} />
    </>
  );
}

/** A day's shade: none with nobody away, ink faintly for one, more for two, solid ink for three or more. */
function shadeOf(colors: Theme['colors'], away: number): string {
  if (away <= 0) return 'transparent';
  if (away >= 3) return colors.foreground;
  return withAlpha(colors.foreground, away === 1 ? 0.12 : 0.3);
}

/**
 * One day of the month calendar: who's away (back when, and where), then
 * who's home, and the day before and after it, so you can walk through a
 * trip without closing the sheet.
 */
function DaySheet({
  day,
  periods,
  people,
  me,
  onDay,
  onClose,
}: {
  day: string | null;
  periods: AwayPeriod[];
  people: Housemate[];
  me: string;
  onDay: (date: string) => void;
  onClose: () => void;
}) {
  const words = useWords();
  const trips = day ? tripsOn(periods, day) : [];
  const home = people.filter((p) => !trips.some((t) => t.userId === p.userId));
  const name = (p: Housemate) => (p.userId === me ? words('house.setup.you') : firstName(p.name));
  const person = (id: string) => people.find((p) => p.userId === id);
  return (
    <Sheet
      visible={day !== null}
      title={day ? dayName(day) : undefined}
      description={words('house.away.dayCount', { away: trips.length, home: home.length })}
      flush
      onClose={onClose}
      testID="away-day-sheet"
    >
      <Section label={words('house.away.awayLabel')}>
        <Group>
          {trips.length === 0 ? (
            <GroupItem>
              <Body>{words('house.away.everyoneHome')}</Body>
            </GroupItem>
          ) : (
            trips.map((t) => {
              const who = person(t.userId);
              const back = backOn(t);
              return (
                <Row
                  key={t.id}
                  leading={<Avatar name={who?.name ?? words('common.shell.formerHousemate')} userId={t.userId} me={t.userId === me} />}
                  title={who ? name(who) : words('common.shell.formerHousemate')}
                  meta={[words('house.away.backOn', { day: dateRange(back, back) }), t.note || null].filter(Boolean).join(', ')}
                  testID="day-away"
                />
              );
            })
          )}
        </Group>
      </Section>
      <Section label={words('house.away.homeLabel')}>
        <Group>
          <GroupItem testID="day-home">
            {home.length === 0 ? (
              <Body>{words('house.away.nobodyHome')}</Body>
            ) : (
              <View style={styles.home}>
                {home.map((p) => (
                  <View key={p.userId} style={styles.homeItem}>
                    <Avatar name={p.name} userId={p.userId} me={p.userId === me} size={24} />
                    <Body>{name(p)}</Body>
                  </View>
                ))}
              </View>
            )}
          </GroupItem>
        </Group>
      </Section>
      {day ? (
        <ButtonRow>
          <Button variant="ghost" icon={ChevronLeftIcon} label={words('house.away.dayBefore')} onPress={() => onDay(addDaysTo(day, -1))} />
          <Button variant="ghost" icon={ChevronRightIcon} label={words('house.away.dayAfter')} iconAfter onPress={() => onDay(addDaysTo(day, 1))} />
        </ButtonRow>
      ) : null}
    </Sheet>
  );
}

/** Your own trips still to come, as rows for a group, each with a way to cancel it or to come back early. */
export function MyTrips({ houseId, periods, today }: { houseId: string; periods: AwayPeriod[]; today: string }) {
  if (periods.length === 0) return null;
  return (
    <>
      {periods.map((p) => (
        <TripRow key={p.id} houseId={houseId} period={p} today={today} />
      ))}
    </>
  );
}

function TripRow({ houseId, period, today }: { houseId: string; period: AwayPeriod; today: string }) {
  const words = useWords();
  const move = useMove(houseId);
  const range = dateRange(period.startsOn, period.endsOn);
  const label = tripStarted(period, today) ? words('house.away.back') : words('house.away.cancel');
  return (
    <>
      <Row
        leading={<RowIcon icon={PlaneIcon} />}
        title={range}
        meta={tripMeta(period, today, words) || undefined}
        trailing={
          <TextButton
            label={label}
            align="end"
            accessibilityLabel={`${label}, ${range}`}
            disabled={move.pending}
            onPress={() => void move.run(() => cancelAway(period.id))}
          />
        }
        testID="my-trip"
      />
      {move.problem ? (
        <GroupItem>
          <Alert message={move.problem} />
        </GroupItem>
      ) : null}
    </>
  );
}

/**
 * Book time away for yourself, as one item in a group: how it works, the
 * days from a calendar that opens on this week, where, and Book, the page's
 * one amber button. What booking moved is said under it.
 */
export function AwayForm({ houseId, today, weekStarts }: { houseId: string; today: string; weekStarts: IsoDow }) {
  const words = useWords();
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [moved, setMoved] = useState<Booked | null>(null);

  async function book() {
    if (!range.from || !range.to) return;
    let count: Booked = { before: 0, handed: 0, skipped: 0 };
    const ok = await move.run(async () => {
      count = await setAway({ from: range.from!, to: range.to!, note });
    });
    if (!ok) return;
    offer(words('wall.history.away'), 'away');
    setMoved(count);
    setRange({ from: null, to: null });
    setNote('');
  }

  const status = picking ? words('house.away.pickTo') : range.from && range.to ? words('house.away.picked', { range: dateRange(range.from, range.to) }) : words('house.away.pickFrom');

  return (
    <GroupItem testID="away-form">
      <Meta>{words('house.away.howItWorks')}</Meta>
      <AwayDates
        today={today}
        weekStarts={weekStarts}
        value={range}
        onChange={(next, stillPicking) => {
          setMoved(null);
          setRange(next);
          setPicking(stillPicking);
        }}
      />
      <View accessibilityLiveRegion="polite" testID="away-picked">
        <Body>{status}</Body>
      </View>
      <Field
        label={words('house.away.note')}
        placeholder={words('house.away.notePlaceholder')}
        value={note}
        onChangeText={setNote}
        maxLength={60}
        testID="away-note"
      />
      {move.problem ? <Alert message={move.problem} /> : null}
      {moved && moved.before + moved.handed + moved.skipped > 0 ? (
        <View accessibilityLiveRegion="polite">
          <Meta>{awayMovedLine(moved.before, moved.handed, moved.skipped, words)}</Meta>
        </View>
      ) : null}
      <ButtonRow atEdge>
        <Button
          icon={PlaneIcon}
          label={words('house.setup.book')}
          busyLabel={words('house.away.booking')}
          busy={move.pending}
          disabled={!range.from || !range.to}
          onPress={() => void book()}
          testID="book-away"
        />
      </ButtonRow>
    </GroupItem>
  );
}

const styles = StyleSheet.create({
  calendar: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { flexShrink: 1, textAlign: 'center' },
  week: { flexDirection: 'row', gap: 2 },
  dow: { flex: 1, textAlign: 'center', paddingVertical: SPACE.xs },
  day: { flex: 1, minHeight: 52, alignItems: 'center', paddingTop: SPACE.xs, borderRadius: RADIUS },
  date: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: FONT.bold, lineHeight: 20 },
  faint: { fontFamily: FONT.regular },
  // Today is outlined, not filled, because a solid day already means three or more away. On a
  // solid day a card-coloured line inside the outline keeps it showing.
  today: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: RADIUS, borderWidth: 2 },
  todayInner: { flex: 1, borderRadius: RADIUS - 2, borderWidth: 2 },
  todayNumber: { fontFamily: FONT.extrabold },
  key: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACE.lg },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + 2 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  home: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  homeItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
});
