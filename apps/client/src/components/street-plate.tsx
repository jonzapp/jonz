import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GROUP_RADIUS, HAIR, INSET, SPACE, useTheme } from '@/theme';

/** From the plate's edge to its border, and the border's weight: the link cards' PLATE, at a phone's size. */
const PLATE_INSET = 5;
const PLATE_STROKE = 3;

/**
 * A street-name plate: words in Black caps inside an ink border inset from
 * the plate's edge, the sign every jonz.app link wears in a chat, brought
 * indoors. Today posts the next John on one, and a screen has one at most.
 * It is the card's colour, never amber, so the screen's one amber button is
 * still the one amber thing on it. Its words start INSET in from its edge,
 * on the page's leading edge. `tone` "hazard" draws the border in hazard,
 * for a John that's overdue.
 */
export function StreetPlate({
  children,
  tone = 'ink',
  numberOfLines = 3,
  testID,
}: {
  children: ReactNode;
  tone?: 'ink' | 'hazard';
  numberOfLines?: number;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={[styles.plate, { backgroundColor: colors.card }]} testID={testID}>
      <View
        style={[styles.border, { borderColor: tone === 'hazard' ? colors.hazard : colors.foreground }]}
        testID={tone === 'hazard' ? 'overdue-edge' : 'plate-border'}
      >
        <Text numberOfLines={numberOfLines} style={[type.plate, styles.words]}>
          {children}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { borderRadius: GROUP_RADIUS, padding: PLATE_INSET },
  border: {
    borderWidth: PLATE_STROKE,
    borderRadius: GROUP_RADIUS - PLATE_INSET,
    paddingHorizontal: INSET - PLATE_INSET - PLATE_STROKE,
    paddingVertical: SPACE.sm + HAIR,
  },
  // Overpass's caps sit high in their line.
  words: { paddingTop: HAIR + 1 },
});
