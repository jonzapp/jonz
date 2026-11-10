import { RefreshCwIcon } from 'lucide-react-native';
import { ActivityIndicator, Platform, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { INSET, SPACE, TAP, useTheme, WIDE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** A long list's next page: whether there is one, whether it's being read, whether the last read failed, and how to read it. */
export interface ListMore {
  has: boolean;
  busy: boolean;
  failed: boolean;
  load: () => void;
}

/**
 * A Screen's `onNearEnd` for a long list: read the next page as you near the
 * end, unless it's being read, there's no more, or the last read failed (the
 * foot's Try again does that, so a dropped connection doesn't spin).
 */
export function nearEnd(more: ListMore): () => void {
  return () => {
    if (more.has && !more.busy && !more.failed) more.load();
  };
}

/**
 * The foot of every long list (the Wall, History, the Audit log), the same
 * everywhere. More loads by itself as you near the end (`nearEnd`), so this
 * only says what's happening: how far back what's shown goes, Loading more,
 * That's everything at the very end, or that a read failed, with Try again.
 * Show more is there for a keyboard, a screen reader, or a page too short to
 * scroll. On a phone it sits under the last row; on a laptop it stays pinned
 * along the bottom of the window, full width, so you always see where you are.
 */
export function ListFoot({ more, shown, testID = 'list-foot' }: { more: ListMore; shown?: string | null; testID?: string }) {
  const words = useWords();
  const { colors, type } = useTheme();
  const wide = useWindowDimensions().width >= WIDE;
  // Sticky is the web's; the app on a phone never spreads this wide.
  const pinned = Platform.OS === 'web' && wide;

  let body;
  if (more.failed) {
    body = (
      <>
        <Alert message={words('common.list.failed')} />
        <Button variant="outline" icon={RefreshCwIcon} label={words('common.shell.retry')} onPress={more.load} testID={`${testID}-retry`} />
      </>
    );
  } else if (more.busy) {
    body = (
      <>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.foreground} />
          <Text style={[type.rowTitle, { color: colors.foreground }]}>{words('common.list.loading')}</Text>
        </View>
        {shown ? <Meta>{shown}</Meta> : null}
      </>
    );
  } else if (more.has) {
    body = (
      <>
        {shown ? <Meta>{shown}</Meta> : null}
        <TextButton label={words('common.list.more')} onPress={more.load} testID={`${testID}-more`} />
      </>
    );
  } else {
    body = <Meta>{words('common.list.everything')}</Meta>;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.foot,
        more.failed && styles.failed,
        pinned && [
          styles.pinned,
          STICKY,
          { backgroundColor: colors.background, borderTopColor: colors.border },
          more.failed && styles.failed,
        ],
      ]}
      testID={testID}
    >
      {body}
    </View>
  );
}

// React Native's types stop at absolute; the web's sticky keeps the foot in view along the window's bottom.
const STICKY = { position: 'sticky', bottom: 0, zIndex: 1 } as unknown as ViewStyle;

const styles = StyleSheet.create({
  foot: { alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, minHeight: TAP, paddingHorizontal: INSET },
  loading: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  pinned: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  failed: { flexDirection: 'column', alignItems: 'stretch' },
});
