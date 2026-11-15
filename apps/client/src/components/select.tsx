import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import { useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type HostInstance } from 'react-native';

import { DropMenu, placeFloat, type MenuPlace } from '@/components/drop-menu';
import { RING_EDGE } from '@/components/focus-rings';
import { FieldLabel } from '@/components/field';
import { Meta } from '@/components/text';
import { focusRing, FONT, GROUP_RADIUS, pressTint, RADIUS, SPACE, TABULAR, TAP, useTheme } from '@/theme';

/** One choice a Select offers: its words in the list, `short` for the box, `meta` for what it does, `spoken` where the words are short for something. */
export interface SelectOption<T> {
  value: T;
  label: string;
  short?: string;
  meta?: string;
  spoken?: string;
}

/** The most a list takes of the window before it scrolls, and the least a small Select's list is wide (its right edge on the box's). */
const LIST_TALL = 360;
const SMALL_LIST = 200;

/**
 * Pick one from a list (shadcn's Select): a box like a text box showing
 * what's chosen, with a chevron; pressed, its list floats under it (over
 * it, near the window's foot), the chosen one ticked, and picking one puts
 * it away, as do a tap anywhere else and Escape. Its name sits over the box
 * as a text box's does, with `hint` under it; `small` is the same box sized
 * to its words with no name shown (beside a section's heading, at the end
 * of a row). A screen reader hears a button that opens a list, then a radio
 * group named `label`.
 */
export function Select<T extends string | number>({
  label,
  options,
  value,
  onChange,
  small = false,
  disabled = false,
  hint,
  testID,
}: {
  label: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  small?: boolean;
  disabled?: boolean;
  hint?: string;
  testID?: string;
}) {
  const win = useWindowDimensions();
  const box = useRef<HostInstance>(null);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const chosen = options.find((option) => option.value === value);
  const close = () => setPlace(null);
  const pick = (next: T) => {
    close();
    if (next !== value) onChange(next);
  };
  const shown = (
    <SelectBox
      boxRef={box}
      label={label}
      shown={chosen?.short ?? chosen?.label ?? String(value)}
      open={place !== null}
      onPress={() => placeFloat(box, small ? { win, most: LIST_TALL, least: SMALL_LIST, end: true } : { win, most: LIST_TALL }, setPlace)}
      small={small}
      disabled={disabled}
      testID={testID}
    />
  );
  return (
    <>
      {small ? (
        shown
      ) : (
        <View style={styles.field}>
          <FieldLabel>{label}</FieldLabel>
          {shown}
          {hint ? <Meta>{hint}</Meta> : null}
        </View>
      )}
      {place ? (
        <DropMenu place={place} onClose={close} label={label} testID={testID}>
          <SelectList label={label} options={options} value={value} onPick={pick} testID={testID} />
        </DropMenu>
      ) : null}
    </>
  );
}

/** The box: what's chosen and a chevron, edged as a text box is, wearing the focus ring while its list is open. A Combobox opens from the same box. */
export function SelectBox({
  boxRef,
  label,
  shown,
  open,
  onPress,
  small = false,
  disabled = false,
  testID,
}: {
  boxRef: RefObject<HostInstance | null>;
  label: string;
  shown: string;
  open: boolean;
  onPress: () => void;
  small?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <Pressable
      ref={boxRef}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${shown}`}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      {...(Platform.OS === 'web' ? ({ dataSet: RING_EDGE } as object) : {})}
      style={[
        styles.box,
        small && styles.small,
        { backgroundColor: colors.card, borderColor: colors.mutedForeground },
        open && focusRing(colors),
        disabled && styles.off,
      ]}
    >
      <Text numberOfLines={1} style={[type.body, TABULAR, { color: colors.foreground }, small ? styles.hug : styles.grow]}>
        {shown}
      </Text>
      <Chevron size={20} color={colors.mutedForeground} aria-hidden />
    </Pressable>
  );
}

/** The floating list: each choice a thumb-tall line (its `meta` under it), the chosen one in bold and ticked, a wash of ink under the finger or the mouse. */
function SelectList<T extends string | number>({
  label,
  options,
  value,
  onPick,
  testID,
}: {
  label: string;
  options: readonly SelectOption<T>[];
  value: T;
  onPick: (value: T) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.popover }} contentContainerStyle={styles.list}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID ? `${testID}-choices` : undefined}>
        {options.map((option) => (
          <Choice key={String(option.value)} option={option} chosen={option.value === value} onPick={onPick} testID={testID ? `${testID}-${option.value}` : undefined} />
        ))}
      </View>
    </ScrollView>
  );
}

/** One line of the list. */
function Choice<T extends string | number>({ option, chosen, onPick, testID }: { option: SelectOption<T>; chosen: boolean; onPick: (value: T) => void; testID?: string }) {
  const { colors, type } = useTheme();
  const [lit, setLit] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={option.meta ? `${option.spoken ?? option.label}, ${option.meta}` : (option.spoken ?? option.label)}
      aria-checked={chosen}
      onPress={() => onPick(option.value)}
      onPressIn={() => setLit(true)}
      onPressOut={() => setLit(false)}
      onHoverIn={() => setLit(true)}
      onHoverOut={() => setLit(false)}
      testID={testID}
      {...(Platform.OS === 'web' ? ({ dataSet: RING_EDGE } as object) : {})}
      style={[styles.choice, lit && { backgroundColor: pressTint(colors) }]}
    >
      <View style={styles.words}>
        <Text numberOfLines={1} style={[type.body, { color: colors.foreground }, chosen && styles.bold]}>
          {option.label}
        </Text>
        {option.meta ? <Meta numberOfLines={4}>{option.meta}</Meta> : null}
      </View>
      {chosen ? <CheckIcon size={20} color={colors.foreground} aria-hidden /> : <View style={styles.noTick} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  box: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: SPACE.md },
  // Sized to its words, never wider than half a phone.
  small: { alignSelf: 'flex-end', flexShrink: 0, maxWidth: SMALL_LIST * 1.25 },
  grow: { flex: 1, minWidth: 0 },
  hug: { flexShrink: 1 },
  off: { opacity: 0.5 },
  list: { padding: SPACE.xs },
  choice: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: GROUP_RADIUS - SPACE.xs },
  words: { flex: 1, minWidth: 0 },
  bold: { fontFamily: FONT.bold },
  noTick: { width: 20 },
});
