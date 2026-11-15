import { StyleSheet, View } from 'react-native';

import { Meta, RowTitle } from '@/components/text';
import { MARK_GAP, SPACE, useTheme } from '@/theme';

/** How much of a limit is nearly all of it: from here its bar warns. */
const NEARLY = 0.9;

/**
 * A bar that fills (shadcn's Progress): how far through something is,
 * `value` of `max`. `label` and `amount` sit on one line over it, the
 * name in RowTitle and how much in Meta. The track is the muted grey; the
 * filled part ink while it's going, hazard once `warn` (a limit nearly
 * used: Ask Jonz's week from 90%), and green once it's complete. Never
 * amber: that's the screen's one main button. A screen reader hears a
 * progress bar named `label` (or `spoken`) at its percentage.
 */
export function Progress({
  value,
  max,
  label,
  amount,
  spoken,
  warn = false,
  testID,
}: {
  value: number;
  max: number;
  label?: string;
  amount?: string;
  /** Its name for a screen reader when there's no `label` over it. */
  spoken?: string;
  warn?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const part = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const done = part >= 1 && !warn;
  const fill = warn ? colors.hazard : done ? colors.good : colors.foreground;
  return (
    <View style={styles.progress} testID={testID}>
      {label || amount ? (
        <View style={styles.top}>
          {label ? <RowTitle style={styles.label}>{label}</RowTitle> : <View />}
          {amount ? <Meta>{amount}</Meta> : null}
        </View>
      ) : null}
      <View
        accessible
        role="progressbar"
        aria-label={spoken ?? label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(part * 100)}
        style={[styles.track, { backgroundColor: colors.secondary }]}
        testID={testID ? `${testID}-bar` : undefined}
      >
        <View style={[styles.fill, { width: `${Math.round(part * 100)}%`, backgroundColor: fill }]} testID={testID ? `${testID}-fill` : undefined} />
      </View>
    </View>
  );
}

/** Whether a share of a limit is nearly used: a Progress over it warns. */
export function nearlyUsed(part: number): boolean {
  return part >= NEARLY;
}

const styles = StyleSheet.create({
  progress: { gap: MARK_GAP },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
  label: { flexShrink: 1 },
  track: { height: MARK_GAP, borderRadius: MARK_GAP / 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: MARK_GAP / 2 },
});
