import { FOCUS_SHELL_COPY, planChoices, planLabel, type BestTime, type BoardItem, type PlanTime, BUSY_COPY } from '@app/core';
import { BellIcon, CalendarClockIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Group } from '@/components/group';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { Lead, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { usePlan } from '@/hooks/use-plan';
import { SPACE, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Plan it, on one of your open Johns (Today's card, its sheet): one tap
 * plans it for your best time on the latest day it fits, with Undo in a
 * toast and no dialog. Once planned, the line says when and that a reminder
 * is set, with Change, which opens the days and times left before it's due:
 * in a sheet of its own, or in place (`inline`) inside a sheet, which never
 * opens a second. Nothing when there's no time left before it's due.
 */
export function PlanIt({
  houseId,
  item,
  zone,
  now,
  bestTime,
  inline = false,
  testID = 'plan-it',
}: {
  houseId: string;
  item: Pick<BoardItem, 'id' | 'dueAt' | 'plannedAt'>;
  zone: string;
  now: Date;
  bestTime: BestTime | null;
  inline?: boolean;
  testID?: string;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const planned = item.plannedAt ?? null;
  const { pending, problem, plan } = usePlan(houseId, item.id, planned);
  const [open, setOpen] = useState(false);
  // Each opening starts on the plan as it is.
  const [opened, setOpened] = useState(0);
  const change = () => {
    setOpened((n) => n + 1);
    setOpen(true);
  };
  const choices = planChoices(item.dueAt, now, zone, bestTime, words);
  if (!planned && !choices) return null;

  const take = (at: PlanTime['at']) => plan(at, words('week.steady.plannedToast', { when: planLabel(at, now, zone) }));
  const picker = choices ? (
    <PlanPicker
      key={opened}
      choices={choices}
      planned={planned}
      pending={pending}
      onPlan={async (at) => {
        if (await take(at)) setOpen(false);
      }}
      onClear={async () => {
        if (await plan(null, words('week.steady.unplanned'))) setOpen(false);
      }}
      onCancel={inline ? () => setOpen(false) : undefined}
    />
  ) : null;

  if (inline && open && picker) {
    return (
      <View testID={testID} style={styles.inline}>
        <Lead>{words('week.steady.planTitle')}</Lead>
        <Meta>{words('week.steady.planBody', { due: choices!.dueWords })}</Meta>
        {picker}
        {problem ? <Alert message={problem} /> : null}
      </View>
    );
  }

  return (
    <View testID={testID}>
      {planned ? (
        <View style={styles.line}>
          <BellIcon size={16} color={colors.mutedForeground} aria-hidden />
          <Meta style={styles.grow} testID={`${testID}-when`}>
            {words('week.steady.planned', { when: planLabel(planned, now, zone) })}
          </Meta>
          {choices ? <TextButton label={words('week.steady.change')} align="end" onPress={change} testID={`${testID}-change`} /> : null}
        </View>
      ) : (
        <TextButton
          label={words('week.steady.plan')}
          icon={CalendarClockIcon}
          align="start"
          disabled={pending}
          onPress={() => void take(choices!.chosen.at)}
          testID={`${testID}-take`}
        />
      )}
      {problem ? <Alert message={problem} /> : null}
      {choices && !inline ? (
        <Sheet
          visible={open}
          title={words('week.steady.planTitle')}
          description={words('week.steady.planBody', { due: choices.dueWords })}
          onClose={() => setOpen(false)}
          testID="plan-sheet"
        >
          {picker}
        </Sheet>
      ) : null}
    </View>
  );
}

/** The days left before it's due as a switch across the page, that day's times as choices, and the one button. */
function PlanPicker({
  choices,
  planned,
  pending,
  onPlan,
  onClear,
  onCancel,
}: {
  choices: NonNullable<ReturnType<typeof planChoices>>;
  planned: Date | null;
  pending: boolean;
  onPlan: (at: Date) => void;
  onClear: () => void;
  /** In place, the way back to the line. */
  onCancel?: () => void;
}) {
  const words = useWords();
  const all = choices.days.flatMap((d) => d.times.map((t) => ({ day: d, time: t })));
  const start = all.find((c) => planned && c.time.at.getTime() === planned.getTime()) ?? all.find((c) => c.time === choices.chosen)!;
  const [day, setDay] = useState(start.day.date);
  const [at, setAt] = useState(start.time.at.getTime());
  // Clearing waits on the same save: then the button isn't the one busy.
  const [clearing, setClearing] = useState(false);
  const clearWaits = clearing && pending;
  const shown = choices.days.find((d) => d.date === day)!;
  const picked = shown.times.find((t) => t.at.getTime() === at) ?? shown.times[shown.times.length - 1];

  return (
    <>
      {choices.days.length > 1 ? (
        <Segmented
          options={choices.days.map((d) => ({ value: d.date, label: d.label }))}
          value={day}
          onChange={(d) => {
            setDay(d);
            const times = choices.days.find((x) => x.date === d)!.times;
            setAt((times.find((t) => t.best) ?? times[times.length - 1]).at.getTime());
          }}
          label={words('week.steady.planTitle')}
          equal
          testID="plan-days"
        />
      ) : null}
      <Group>
        {shown.times.map((t) => (
          <ChoiceRow
            key={t.at.getTime()}
            role="radio"
            label={t.label}
            meta={t.meta}
            checked={t === picked}
            onPress={() => setAt(t.at.getTime())}
            testID="plan-time"
          />
        ))}
      </Group>
      <Button
        label={words('week.steady.planFor', { when: `${shown.label} ${picked.label}` })}
        busy={pending && !clearing}
        busyLabel={BUSY_COPY.planning}
        disabled={clearWaits}
        onPress={() => {
          setClearing(false);
          onPlan(picked.at);
        }}
        testID="plan-save"
      />
      {planned || onCancel ? (
        <View style={styles.quiet}>
          {planned ? <TextButton label={words('week.steady.unplan')} align="start"
              disabled={pending}
              onPress={() => {
                setClearing(true);
                onClear();
              }}
              testID="plan-clear"
            /> : null}
          {onCancel ? <TextButton label={FOCUS_SHELL_COPY.cancel} align="start" onPress={onCancel} testID="plan-cancel" /> : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: TAP },
  grow: { flex: 1 },
  quiet: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -SPACE.sm },
  inline: { gap: SPACE.md },
});
