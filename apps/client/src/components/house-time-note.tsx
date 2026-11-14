import { houseTimeNote } from '@app/core';
import type { StyleProp, TextStyle } from 'react-native';

import { Meta } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { deviceTimeZone } from '@/locale';

/** The house's zone and the time now, for a screen that sets days or times on the house's clock. */
export interface HouseClock {
  zone: string;
  now: Date;
}

/**
 * Where a time or a day is set in the house's zone (a John's due time,
 * booking time away, moving out): one quiet line, "In house time: London,
 * 8 hours ahead of you.", and only while this phone's clock says another
 * time than the house's (docs/specs/time-zones.md). Everywhere else times
 * are on the phone's own clock, with nothing said.
 */
export function HouseTimeNote({ house, now, style }: { house: string; now: Date; style?: StyleProp<TextStyle> }) {
  const words = useWords();
  const note = houseTimeNote({ house, phone: deviceTimeZone() }, now, words);
  return note ? (
    <Meta style={style} testID="house-time-note">
      {note}
    </Meta>
  ) : null;
}
