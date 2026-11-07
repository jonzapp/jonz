import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Lead } from '@/components/text';
import { INSET, SPACE, useTheme } from '@/theme';

/**
 * Nothing here yet, said plainly on the pavement at the leading edge, with
 * no card and no tape: a 24pt icon on a 48 tint plate, the screen's Lead as
 * a heading, a sentence in muted Body, and, when there's something to do,
 * one action (an admin's "Deal week 1"). Week before the deal, an
 * empty Groups page, Today when everything's done.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  /** One button, in a ButtonRow: across the column on a phone, its own width in a wide one on a laptop. */
  action?: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.empty}>
      <View aria-hidden style={[styles.plate, { backgroundColor: colors.secondary }]}>
        <Icon size={24} color={colors.foreground} aria-hidden />
      </View>
      <Lead header style={styles.title}>
        {title}
      </Lead>
      {body ? <Body style={[styles.body, { color: colors.mutedForeground }]}>{body}</Body> : null}
      {action != null ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const PLATE = 48;

const styles = StyleSheet.create({
  // The screen's gutter plus INSET puts it on the leading edge; with the
  // screen's own padding, it starts 48 under the title bar.
  empty: { paddingTop: SPACE.xxl, paddingHorizontal: INSET, alignItems: 'flex-start' },
  plate: { width: PLATE, height: PLATE, borderRadius: PLATE / 2, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: SPACE.lg },
  body: { marginTop: SPACE.xs },
  // Across the column, so a ButtonRow inside can fill it on a phone.
  action: { marginTop: SPACE.xl, alignSelf: 'stretch' },
});
