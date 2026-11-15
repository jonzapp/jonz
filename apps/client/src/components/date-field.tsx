import { localDay, type IsoDow } from '@app/core';
import { CalendarIcon } from 'lucide-react-native';
import { useRef, type ReactNode } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';

import { Alert } from '@/components/alert';
import { Calendar } from '@/components/calendar';
import { DropMenu, useFloatOrSheet } from '@/components/drop-menu';
import { FieldLabel } from '@/components/field';
import { SelectBox } from '@/components/select';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { SPACE, useTheme } from '@/theme';

/** How wide the floating calendar is on a laptop, and the most of the window it takes. */
const CALENDAR_WIDTH = 360;
const CALENDAR_TALL = 480;

/**
 * Pick a day (shadcn's Date Picker): a box like a Select's showing the day
 * in words with the year ("Thu 31 Dec 2026"), and a calendar icon. Pressed,
 * a Calendar floats under it on a laptop (over it near the window's foot)
 * and opens as a sheet on a phone; tapping a day puts it away, as do a tap
 * anywhere else and Escape. Its name sits over the box as a text box's
 * does, with `hint` or `problem` under it. `value` is a local
 * `yyyy-MM-dd` day; nothing before `today` can be picked. For a page whose
 * whole job is picking a day (moving out, time away), the Calendar sits
 * open on the page instead.
 */
export function DateField({
  label,
  value,
  onChange,
  today,
  weekStarts = 1,
  hint,
  problem,
  testID,
}: {
  label: string;
  value: string;
  onChange: (day: string) => void;
  today: string;
  /** The first day of the calendar's weeks: the house's, or Monday. */
  weekStarts?: IsoDow;
  hint?: string;
  problem?: string;
  testID?: string;
}) {
  const words = useWords();
  const box = useRef<HostInstance>(null);
  const { wide, open, place, show, close } = useFloatOrSheet(box, { most: CALENDAR_TALL, least: CALENDAR_WIDTH });
  const calendar = (
    <Calendar
      today={today}
      weekStarts={weekStarts}
      value={{ from: value, to: value }}
      onChange={(next) => {
        close();
        if (next.from && next.from !== value) onChange(next.from);
      }}
      single
      testID={testID ? `${testID}-calendar` : undefined}
    />
  );
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <SelectBox
        boxRef={box}
        label={label}
        shown={localDay(value, 'weekdayDayMonthYear', words)}
        open={open}
        onPress={show}
        icon={CalendarIcon}
        popup="dialog"
        testID={testID}
      />
      {problem ? <Alert message={problem} /> : hint ? <Meta>{hint}</Meta> : null}
      {wide ? (
        open && place ? (
          <DropMenu place={place} onClose={close} label={label} testID={testID}>
            <FloatingCalendar>{calendar}</FloatingCalendar>
          </DropMenu>
        ) : null
      ) : (
        <Sheet visible={open} title={label} onClose={close} testID={testID ? `${testID}-sheet` : undefined}>
          {calendar}
        </Sheet>
      )}
    </View>
  );
}

/** The card the calendar floats on, on a laptop. */
function FloatingCalendar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.popover }]}>{children}</View>;
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  card: { padding: SPACE.sm },
});
