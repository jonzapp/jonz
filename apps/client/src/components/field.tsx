import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Alert } from '@/components/alert';
import { Body, Meta } from '@/components/text';
import { focusRing, FONT, RADIUS, SPACE, TAP, useTheme } from '@/theme';

/** A form control's label: Body Bold, sentence case. Field, Choice and a Segmented in a form use it. */
export function FieldLabel({ children }: { children: string }) {
  return <Body style={styles.label}>{children}</Body>;
}

/**
 * A labelled text box at least a thumb tall (a multiline one, a few lines
 * tall): the label in Body Bold and sentence case, the box on the card
 * colour, then a hint in Meta or a problem to fix (an Alert: ink, a
 * triangle, never hazard). While you type in it, it wears the focus ring.
 */
export function Field({
  label,
  hint,
  problem,
  ...input
}: { label: string; hint?: string; problem?: string } & Omit<TextInputProps, 'style'>) {
  const { colors, type } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[
          styles.input,
          input.multiline && styles.multiline,
          // Body's face and size; a line height would set single-line text off centre on iOS.
          { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize },
          {
            borderColor: problem ? colors.foreground : colors.mutedForeground,
            color: colors.foreground,
            backgroundColor: colors.card,
          },
          focused && focusRing(colors),
        ]}
      />
      {problem ? <Alert message={problem} /> : hint ? <Meta>{hint}</Meta> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  label: { fontFamily: FONT.bold },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: RADIUS,
    paddingHorizontal: SPACE.md,
    // The ring is the box's own, so the field draws none of the browser's on the web (`auto` ignores a width, hence solid).
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  // Room for a few lines, written from the top, as far in from the edge above as from the sides.
  multiline: { minHeight: 96, paddingVertical: SPACE.md, textAlignVertical: 'top' },
});
