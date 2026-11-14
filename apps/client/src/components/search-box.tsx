import { SearchIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { RADIUS, SPACE, TAP, useTheme } from '@/theme';

/**
 * A box that narrows a list already on the page as you type (the time zone
 * picker's): the magnifier, then the words. It looks like an admin list's
 * search (SmartSearch), two points of ink while you're in it, but has no
 * filters and nothing to wait for. Its placeholder is its spoken name.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  testID = 'search-box',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: colors.card, borderColor: focused ? colors.foreground : colors.mutedForeground },
        focused && styles.focused,
      ]}
      testID={testID}
    >
      <SearchIcon size={20} color={colors.mutedForeground} aria-hidden />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        enterKeyHint="search"
        style={[styles.input, { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize, color: colors.foreground }]}
        testID={`${testID}-input`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: SPACE.md },
  // Two points of ink while you type in it; the padding gives the point back.
  focused: { borderWidth: 2, paddingHorizontal: SPACE.md - 1 },
  // The box draws the focus, so the field inside draws none of its own on the web (a browser's `auto` ring ignores its width, hence solid).
  input: { flex: 1, minHeight: TAP - 4, paddingVertical: 0, outlineStyle: 'solid', outlineWidth: 0 },
});
