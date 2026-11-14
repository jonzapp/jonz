import { zoneCity, zoneGap } from '@app/core';
import { GlobeIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Meta } from '@/components/text';
import type { Zones } from '@/hooks/use-zones';
import { useWords } from '@/hooks/use-words';
import { FONT, INSET, MARK_GAP, SECTION_GAP, SPACE, TAP, useTheme } from '@/theme';

/**
 * The one line that says whose clock a page's times are on, when this
 * phone's clock isn't the house's (Your time, said once; 14 Nov): "Your
 * time, Regina. The house is 6 hours ahead. Show house time". A tap reads
 * every time on the other clock, on every screen, until it's tapped again.
 * Nothing at all while the clocks agree. It heads its page (or sits under
 * Today's date, `underTopLine`), with what follows close under it, as under
 * a top line; `inline` sets it in a group as one more line (the style page).
 */
export function ZoneLine({ zones, now, underTopLine = false, inline = false }: { zones: Zones; now: Date; underTopLine?: boolean; inline?: boolean }) {
  const words = useWords();
  const { colors } = useTheme();
  if (!zones.away) return null;
  const mine = zones.showing === 'mine';
  const said = mine
    ? words('common.zone.yours', { city: zoneCity(zones.phone), gap: zoneGap({ zone: zones.house, from: zones.phone }, now, words) })
    : words('common.zone.houses', { city: zoneCity(zones.house), gap: zoneGap({ zone: zones.phone, from: zones.house }, now, words) });
  const action = words(mine ? 'common.zone.showHouse' : 'common.zone.showMine');
  // The sentence, then the bold way to flip it, on one run of words that wraps as one.
  const lead = `${said} `;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${said} ${action}`}
      onPress={zones.flip}
      style={({ pressed }) => [styles.line, underTopLine && styles.under, inline && styles.inline, pressed && styles.pressed]}
      testID="zone-line"
    >
      <GlobeIcon size={16} color={colors.foreground} aria-hidden />
      <Meta style={styles.words}>
        {lead}
        <Text style={[styles.action, { color: colors.foreground }]}>{action}</Text>
      </Meta>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The page's next part sits SPACE.xs under it rather than a section gap, as under Today's date.
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MARK_GAP,
    minHeight: TAP,
    paddingHorizontal: INSET,
    paddingVertical: SPACE.xs,
    alignSelf: 'flex-start',
    marginBottom: SPACE.xs - SECTION_GAP,
  },
  // Under the date its words sit as close as a second line would: its target reaches up into the date's gap.
  under: { marginTop: -SPACE.sm },
  inline: { marginBottom: 0, paddingHorizontal: 0 },
  pressed: { opacity: 0.6 },
  words: { flexShrink: 1 },
  action: { fontFamily: FONT.bold },
});
