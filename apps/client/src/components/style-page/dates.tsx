import { useState } from 'react';

import { Calendar, type DateRange } from '@/components/calendar';
import { DateField } from '@/components/date-field';
import { GroupItem } from '@/components/group';

/** A set day, not today's: the style page's pictures never move with the clock. */
const TODAY = '2026-11-16';

/** Picking days: a Date field that opens a calendar, and a Calendar open on the page picking a run, as time away does. */
export function Dates() {
  const [day, setDay] = useState('2026-12-31');
  const [range, setRange] = useState<DateRange>({ from: '2026-11-20', to: '2026-11-24' });
  return (
    <GroupItem>
      <DateField label="Ends on" value={day} onChange={setDay} today={TODAY} hint="The last day anyone can use the code." testID="style-date" />
      <Calendar today={TODAY} weekStarts={1} value={range} onChange={setRange} testID="style-calendar" />
    </GroupItem>
  );
}
