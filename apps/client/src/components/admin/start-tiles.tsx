import { NOTICE_KINDS, type NoticeKind } from '@app/core';
import { GiftIcon, NewspaperIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GROUP_RADIUS, SPACE, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

const ICON: Record<NoticeKind, LucideIcon> = { status: TriangleAlertIcon, offer: GiftIcon, news: NewspaperIcon };

/** Narrower than this, three tiles side by side can't fit "Something’s" on a line at the row title's size. */
const ROOMY = 3 * 140;

/**
 * The ways in to a new notice, named by what's happening rather than by a
 * button that says New: Something's wrong (in hazard, first), An offer,
 * News. Each opens the editor with its kind set. On a phone the tiles are
 * tighter, with smaller titles, so no word breaks in two.
 */
export function StartTiles({ chosen, onStart }: { chosen: NoticeKind | null; onStart: (kind: NoticeKind) => void }) {
  const [width, setWidth] = useState<number | null>(null);
  const tight = width !== null && width < ROOMY;
  return (
    <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="start-tiles">
      {NOTICE_KINDS.map((kind) => (
        <Tile key={kind} kind={kind} tight={tight} chosen={chosen === kind} onPress={() => onStart(kind)} />
      ))}
    </View>
  );
}

function Tile({ kind, tight, chosen, onPress }: { kind: NoticeKind; tight: boolean; chosen: boolean; onPress: () => void }) {
  const words = useWords();
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState(false);
  const Icon = ICON[kind];
  const title = words(`admin.shell.start.${kind}.title` as const);
  const meta = words(`admin.shell.start.${kind}.meta` as const);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.tile,
        tight && styles.tight,
        { backgroundColor: chosen || pressed ? colors.secondary : colors.card },
        chosen && { borderColor: colors.foreground },
      ]}
      testID={`start-${kind}`}
    >
      <Icon size={22} strokeWidth={2.5} color={kind === 'status' ? colors.hazard : colors.foreground} aria-hidden />
      <Text style={[type.rowTitle, tight && { fontSize: type.sectionLabel.fontSize, lineHeight: type.sectionLabel.lineHeight }, { color: colors.foreground }]}>
        {title}
      </Text>
      <Text style={[type.meta, { color: colors.mutedForeground }]}>{meta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 2 * TAP,
    padding: SPACE.md,
    gap: SPACE.xs,
    borderRadius: GROUP_RADIUS,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tight: { paddingHorizontal: SPACE.sm },
});
