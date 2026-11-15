import { CODE_LENGTH, cleanCode } from '@app/core';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Alert } from '@/components/alert';
import { FieldLabel } from '@/components/field';
import { Lead, Meta } from '@/components/text';
import { focusRing, RADIUS, SPACE, TAP, useTheme } from '@/theme';

type Props = {
  label: string;
  hint?: string;
  problem?: string;
  value: string;
  onChangeText: (code: string) => void;
  /** Called once the last digit lands, to check the code without a tap. */
  onFilled?: (code: string) => void;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
} & Pick<TextInputProps, 'onSubmitEditing'>;

const BOXES = Array.from({ length: CODE_LENGTH }, (_, index) => index);

/**
 * A 6-digit code as six equal boxes that together span the column, edge to
 * edge with the button and the fields around them (docs/style/controls.md).
 * Each box has a field's edge and fill; the one the next digit goes in has a
 * 2pt ink edge and a caret. A problem puts the ink edge on all six and the
 * reason underneath, as on any field.
 *
 * The boxes are only a picture. One real text box lies over them with its
 * words and caret see-through (not hidden, so password managers and the
 * phone's autofill still find it): "one-time-code", so iPhones, Macs and
 * password managers offer the code from Mail, Messages or a saved
 * authenticator key; paste ("123 456" or "123-456"), backspace and a screen
 * reader work as in any field. It has the label, it's the one thing focus
 * lands on, and its value is the code.
 */
export function CodeBoxes({ label, hint, problem, value, onChangeText, onFilled, editable = true, autoFocus, testID, onSubmitEditing }: Props) {
  const { colors, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(BOX_MAX_HEIGHT);
  const digits = value.slice(0, CODE_LENGTH);
  // The box the next digit goes in (the last one once it's full), while the field has focus.
  const active = focused && editable ? Math.min(digits.length, CODE_LENGTH - 1) : -1;

  const change = (text: string) => {
    let next = cleanCode(text);
    // A digit typed after a wrong code starts it over, with nothing to clear first.
    if (problem && digits.length === CODE_LENGTH && next.length > CODE_LENGTH && next.startsWith(digits)) {
      next = next.slice(CODE_LENGTH);
    }
    next = next.slice(0, CODE_LENGTH);
    onChangeText(next);
    if (next.length === CODE_LENGTH && digits.length < CODE_LENGTH) onFilled?.(next);
  };

  const box = (index: number) => {
    const digit = digits[index];
    const here = index === active;
    return (
      <View
        key={index}
        style={[
          styles.box,
          {
            height,
            backgroundColor: colors.card,
            borderColor: problem ? colors.foreground : colors.mutedForeground,
          },
          // The box the next digit goes in wears the focus ring, as any box you type in does.
          here && focusRing(colors),
        ]}
        testID={testID ? `${testID}-box-${index}` : undefined}
      >
        {digit ? (
          <Lead>{digit}</Lead>
        ) : here ? (
          <View style={[styles.caret, { height: type.lead.fontSize, backgroundColor: colors.foreground }]} />
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={styles.row}
        onLayout={(event) => {
          const width = (event.nativeEvent.layout.width - SPACE.sm * (CODE_LENGTH - 1)) / CODE_LENGTH;
          setHeight(boxHeight(width));
        }}
        testID={testID ? `${testID}-boxes` : undefined}
      >
        <View style={styles.boxes} aria-hidden importantForAccessibility="no-hide-descendants">
          {BOXES.map(box)}
        </View>
        <TextInput
          accessibilityLabel={label}
          value={digits}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoCorrect={false}
          spellCheck={false}
          editable={editable}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          caretHidden
          selectionColor="transparent"
          // @ts-expect-error react-native-web's data attributes, for the autofill rule below.
          dataSet={{ codeBoxes: 'true' }}
          // Body's size, so Safari on an iPhone doesn't zoom in when it's tapped.
          style={[styles.input, { fontSize: type.body.fontSize }]}
          testID={testID}
        />
      </View>
      {problem ? <Alert message={problem} /> : hint ? <Meta>{hint}</Meta> : null}
    </View>
  );
}

/**
 * A box's height for its width: a little taller than wide (5 to 4), never
 * shorter than TAP or taller than a thumb and a third. So 48 in a small
 * phone's sign-in card, and 64 once the column is about 350 wide (a phone's
 * page, a laptop's form).
 */
export function boxHeight(width: number) {
  return Math.round(Math.min(BOX_MAX_HEIGHT, Math.max(TAP, width * BOX_SHAPE)));
}

const BOX_SHAPE = 1.25;
const BOX_MAX_HEIGHT = TAP + SPACE.lg;

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  row: { position: 'relative', alignSelf: 'stretch' },
  // Six equal shares of the column with one gap between each, so the first
  // box starts where the button starts and the last ends where it ends.
  boxes: { flexDirection: 'row', gap: SPACE.sm },
  box: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caret: { width: 2 },
  // The real field covers the boxes, so a tap anywhere on them lands in it.
  input: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', cursor: 'text', caretColor: 'transparent' } as object) : null),
  },
});

// A browser paints an autofilled field yellow or blue and its words black,
// which would cover the boxes. This keeps the field see-through when a code
// is filled in for you.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('code-boxes-autofill')) {
  const rule = document.createElement('style');
  rule.id = 'code-boxes-autofill';
  rule.textContent =
    '[data-code-boxes]:-webkit-autofill,[data-code-boxes]:autofill{-webkit-text-fill-color:transparent;box-shadow:none;transition:background-color 86400s 0s}';
  document.head.appendChild(rule);
}
