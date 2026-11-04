import { FAMILY_COPY, HOUSE_KINDS, type HouseKind } from '@app/core';
import { CircleDotIcon, CircleIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Meta, RowTitle } from '@/components/text';
import { ICON_ONLY, RADIUS, ROW_GAP, SPACE, TAP, useTheme } from '@/theme';

/**
 * "Who lives here?" on Start a house: two cards, Housemates and Family,
 * each a radio with a line on what it means, the chosen one edged in ink
 * like a focused field. A radio group to a screen reader.
 */
export function KindChoice({ value, onChange }: { value: HouseKind; onChange: (kind: HouseKind) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={FAMILY_COPY.whoLivesHere} style={styles.stack} testID="house-kind">
      {HOUSE_KINDS.map((kind) => {
        const chosen = kind === value;
        return (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            accessibilityLabel={`${FAMILY_COPY.kinds[kind]}, ${FAMILY_COPY.kindBody[kind]}`}
            aria-checked={chosen}
            onPress={() => onChange(kind)}
            testID={`house-kind-${kind}`}
            style={[
              styles.card,
              { borderColor: chosen ? colors.foreground : colors.input, borderWidth: chosen ? 2 : 1, padding: chosen ? SPACE.lg - 1 : SPACE.lg },
            ]}
          >
            {chosen ? (
              <CircleDotIcon size={ICON_ONLY} color={colors.foreground} aria-hidden />
            ) : (
              <CircleIcon size={ICON_ONLY} color={colors.mutedForeground} aria-hidden />
            )}
            <View style={styles.words}>
              <RowTitle>{FAMILY_COPY.kinds[kind]}</RowTitle>
              <Meta>{FAMILY_COPY.kindBody[kind]}</Meta>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.md },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: ROW_GAP, borderRadius: RADIUS, minHeight: TAP },
  words: { flex: 1, minWidth: 0, gap: SPACE.xs },
});
