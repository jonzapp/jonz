import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { RING_PART, RING_PART_SHOWN } from '@/components/focus-rings';
import { TAP, useTheme } from '@/theme';

/** The track's size and the room inside its edge; the knob fills its height and travels the rest of its width. */
const TRACK = { width: 52, height: 32, pad: 3, edge: 1 } as const;
const KNOB = TRACK.height - 2 * (TRACK.pad + TRACK.edge);
const TRAVEL = TRACK.width - 2 * (TRACK.pad + TRACK.edge) - KNOB;

/**
 * Turns one thing on or off, straight away (each reminder): a track with a
 * knob, dark and to the right when on (ink, never amber), pale and to the
 * left when off. The whole thumb-sized square around it takes the tap. A
 * screen reader hears a switch, its name and whether it's on. Choosing
 * several things in a list stays a tick box (`ChoiceRow`); a setting saved
 * with the rest of a form too.
 */
export function Switch({
  value,
  onChange,
  label,
  disabled = false,
  testID,
}: {
  value: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const ring = Platform.OS === 'web' ? ({ dataSet: RING_PART } as object) : {};
  const part = Platform.OS === 'web' ? ({ dataSet: RING_PART_SHOWN } as object) : {};
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      testID={testID}
      {...ring}
      style={[styles.target, disabled && styles.off]}
    >
      <View
        {...part}
        style={[
          styles.track,
          { backgroundColor: value ? colors.foreground : colors.secondary, borderColor: value ? colors.foreground : colors.mutedForeground },
        ]}
      >
        <View
          style={[
            styles.knob,
            {
              backgroundColor: value ? colors.background : colors.card,
              borderColor: value ? colors.foreground : colors.mutedForeground,
              transform: [{ translateX: value ? TRAVEL : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: TAP, minWidth: TAP, justifyContent: 'center', alignItems: 'flex-end' },
  track: { width: TRACK.width, height: TRACK.height, borderRadius: TRACK.height / 2, borderWidth: TRACK.edge, padding: TRACK.pad, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, borderWidth: 1 },
  off: { opacity: 0.5 },
});
