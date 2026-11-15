import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import type { ButtonIcon } from '@/components/button';
import { RING_EDGE } from '@/components/focus-rings';
import { focusRing, FONT, pressTint, RADIUS, SPACE, TAP, useTheme } from '@/theme';

/**
 * The edged box a text box is (shadcn's Input group), with something at its
 * start (an icon, aria-hidden) and its end (an `InputButton`): a search's
 * magnifier, a password's Show, an address's Copy. On the card colour, its
 * edge the darker grey (ink once there's a `problem`), the focus ring while
 * `focused`. Its middle is a text box (`InputGroup`) or words (`CopyLine`).
 */
export function InputBox({
  start,
  end,
  focused = false,
  problem = false,
  tall = false,
  children,
  testID,
}: {
  start?: ReactNode;
  end?: ReactNode;
  focused?: boolean;
  problem?: boolean;
  tall?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.box,
        tall && styles.tall,
        end ? styles.withEnd : null,
        { backgroundColor: colors.card, borderColor: problem ? colors.foreground : colors.mutedForeground },
        focused && focusRing(colors),
      ]}
    >
      {start}
      {children}
      {end}
    </View>
  );
}

/**
 * A text box in an InputBox: the box wears the focus ring while you type,
 * and the text box inside draws none of its own. `multiline` is a few lines
 * tall, written from the top. `boxTestID` names the box, `testID` the text
 * box; everything else goes to the TextInput.
 */
export function InputGroup({
  start,
  end,
  problem = false,
  boxTestID,
  testID,
  ...input
}: { start?: ReactNode; end?: ReactNode; problem?: boolean; boxTestID?: string; testID?: string } & Omit<TextInputProps, 'style' | 'testID'>) {
  const { colors, type } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <InputBox start={start} end={end} focused={focused} problem={problem} tall={input.multiline === true} testID={boxTestID}>
      <TextInput
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
        // Body's face and size; a line height would set single-line text off centre on iOS.
        style={[styles.input, input.multiline && styles.lines, { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize, color: colors.foreground }]}
        testID={testID}
      />
    </InputBox>
  );
}

/**
 * A button inside an InputBox, at its end: its icon (and `label`, when it
 * has words, as Copy has), as tall as the box inside its edge and a thumb
 * wide at least, washed with ink under the finger or the mouse. `spoken` is
 * what a screen reader hears.
 */
export function InputButton({
  icon: Icon,
  label,
  spoken,
  onPress,
  testID,
}: {
  icon: ButtonIcon;
  label?: string;
  spoken: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const [lit, setLit] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      onPressIn={() => setLit(true)}
      onPressOut={() => setLit(false)}
      onHoverIn={() => setLit(true)}
      onHoverOut={() => setLit(false)}
      testID={testID}
      {...(Platform.OS === 'web' ? ({ dataSet: RING_EDGE } as object) : {})}
      style={[styles.button, lit && { backgroundColor: pressTint(colors) }]}
    >
      <Icon size={20} color={colors.foreground} aria-hidden />
      {label ? <Text style={[type.body, styles.bold, { color: colors.foreground }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: 1, borderRadius: RADIUS, paddingLeft: SPACE.md, paddingRight: SPACE.md },
  // The end button runs to the box's edge.
  withEnd: { paddingRight: 0 },
  tall: { alignItems: 'stretch' },
  // The box draws the focus, so the field inside draws none of its own on the web (a browser's `auto` ring ignores its width, hence solid).
  input: { flex: 1, minWidth: 0, minHeight: TAP - 2, paddingVertical: 0, outlineStyle: 'solid', outlineWidth: 0 },
  // Room for a few lines, written from the top, as far in from the edge above as from the sides.
  lines: { minHeight: 96, paddingVertical: SPACE.md, textAlignVertical: 'top' },
  button: {
    minWidth: TAP,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    borderTopRightRadius: RADIUS - 1,
    borderBottomRightRadius: RADIUS - 1,
  },
  bold: { fontFamily: FONT.bold },
});
