import { CheckIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Hairline, useRowInset } from '@/components/group';
import { Body, Meta, RowTitle } from '@/components/text';
import { HAIR, LEADING, RADIUS, ROW_GAP, ROW_MIN, SPACE, useTheme } from '@/theme';

/** A row with a meta line comes out this tall, as Row's does. */
const TWO_LINES = 64;

/**
 * One of a list to pick from, as a row in a group: a `radio` (one of a few,
 * PickRow's options) or a `checkbox` (any of them: who's in a group). A 32pt
 * leading slot (an avatar, or nothing, which still indents it), the words,
 * and at the end a tick when it's chosen; a checkbox shows its empty box
 * too, edged in muted ink so it reads on the card colour. With `meta` it's
 * a setting of its own ("Needs a photo"): its name as a RowTitle over one
 * line on what it means, from the leading edge, or after `leading` when it
 * has one (someone on a roll call). The state is `aria-checked`.
 */
export function ChoiceRow({
  role,
  label,
  meta,
  checked,
  onPress,
  leading,
  disabled = false,
  metaLines = 1,
  testID,
}: {
  role: 'radio' | 'checkbox';
  label: string;
  meta?: string;
  checked: boolean;
  onPress: () => void;
  leading?: ReactNode;
  disabled?: boolean;
  /** How many lines the meta may take before it's cut short. */
  metaLines?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const inset = useRowInset();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole={role}
      // A setting says what it means as well as its name.
      accessibilityLabel={meta ? `${label}, ${meta}` : label}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID={testID}
      style={[
        styles.row,
        { paddingHorizontal: inset, minHeight: meta ? TWO_LINES : ROW_MIN },
        pressed && { backgroundColor: colors.secondary },
        disabled && styles.off,
      ]}
    >
      <Hairline />
      {meta ? (
        <>
          {/* A setting has no leading slot; someone to pick, with a line about them, has their avatar. */}
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <View style={styles.words}>
            {/* A label wraps rather than being cut short (docs/style/words.md). */}
            <RowTitle>{label}</RowTitle>
            <Meta numberOfLines={metaLines}>{meta}</Meta>
          </View>
        </>
      ) : (
        <>
          <View style={styles.leading}>{leading}</View>
          <Body style={styles.words}>{label}</Body>
        </>
      )}
      {role === 'checkbox' ? (
        <View
          aria-hidden
          style={[
            styles.box,
            checked ? { backgroundColor: colors.foreground, borderColor: colors.foreground } : { borderColor: colors.mutedForeground },
          ]}
        >
          {checked ? <CheckIcon size={16} strokeWidth={3} color={colors.card} /> : null}
        </View>
      ) : checked ? (
        <CheckIcon size={20} color={colors.foreground} aria-hidden />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingVertical: SPACE.sm },
  leading: { width: LEADING, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: HAIR },
  box: { width: 22, height: 22, borderRadius: RADIUS - 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.5 },
});
