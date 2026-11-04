import { ADMIN_COPY, ADMIN_PAGES, type AdminPage } from '@app/core';
import { Link } from 'expo-router';
import { InboxIcon, MegaphoneIcon, MessageSquareIcon, ScrollTextIcon, UserXIcon, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/wordmark';
import { Chip } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { FONT, RAIL, SPACE, TAP, useTheme, WIDE } from '@/theme';

const ICON: Record<AdminPage, LucideIcon> = { inbox: InboxIcon, messages: MessageSquareIcon, notices: MegaphoneIcon, deletions: UserXIcon, audit: ScrollTextIcon };

/** The tab bar's height above the home bar, so a toast clears it. */
export const ADMIN_TAB_BAR = 56;

/**
 * The owner's pages: a rail down the left from WIDE, as the house's, with
 * the wordmark and an Owner chip so it is never mistaken for a house; on a
 * phone, tabs along the bottom, as the house's tabs are.
 */
export function AdminShell({ page, children }: { page: AdminPage; children: ReactNode }) {
  const { colors } = useTheme();
  const wide = useWindowDimensions().width >= WIDE;
  if (!wide) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.fill}>{children}</View>
        <AdminTabs page={page} />
      </View>
    );
  }
  return (
    <View style={[styles.row, { backgroundColor: colors.background }]}>
      <AdminRail page={page} />
      <View style={styles.fill}>{children}</View>
    </View>
  );
}

function AdminRail({ page }: { page: AdminPage }) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="admin-rail"
      style={[styles.rail, { paddingTop: insets.top + SPACE.lg, backgroundColor: colors.background, borderRightColor: colors.border }]}
    >
      <View style={styles.brand}>
        <Wordmark size={20} />
        <Chip label={ADMIN_COPY.owner} />
      </View>
      <View role="tablist" style={styles.items}>
        {ADMIN_PAGES.map(({ key, label, path }) => {
          const Icon = ICON[key];
          const on = key === page;
          return (
            <Link key={key} href={path as never} asChild>
              <Pressable
                role="tab"
                aria-selected={on}
                style={StyleSheet.flatten([styles.item, on && { backgroundColor: colors.card }])}
                testID={`admin-nav-${key}`}
              >
                {on ? <View aria-hidden style={[styles.marker, { backgroundColor: colors.hivis }]} /> : null}
                <Icon size={22} color={colors.foreground} strokeWidth={2.5} />
                <Text style={[type.body, styles.label, { color: colors.foreground }]}>{label}</Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
      <Meta style={styles.foot}>{ADMIN_COPY.signedInWithCode}</Meta>
    </View>
  );
}

/** On a phone: the owner's pages as tabs along the bottom, the current one ink with the hi-vis marker. */
function AdminTabs({ page }: { page: AdminPage }) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      role="tablist"
      testID="admin-tabs"
      style={[styles.bar, { paddingBottom: insets.bottom, backgroundColor: colors.background, borderTopColor: colors.border }]}
    >
      {ADMIN_PAGES.map(({ key, label, path }) => {
        const Icon = ICON[key];
        const on = key === page;
        const ink = on ? colors.foreground : colors.mutedForeground;
        return (
          <Link key={key} href={path as never} asChild>
            <Pressable role="tab" aria-selected={on} style={styles.tab} testID={`admin-tab-${key}`}>
              {on ? <View aria-hidden style={[styles.tabMarker, { backgroundColor: colors.hivis }]} /> : null}
              <Icon size={24} color={ink} strokeWidth={2.5} aria-hidden />
              <Text style={[type.tabLabel, { color: ink }]}>{label}</Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  row: { flex: 1, flexDirection: 'row' },
  rail: { width: RAIL, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.md, paddingBottom: SPACE.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.md, marginBottom: SPACE.xl },
  items: { gap: SPACE.xs },
  item: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderRadius: 6,
    overflow: 'hidden',
  },
  marker: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  label: { fontFamily: FONT.bold },
  foot: { marginTop: 'auto', paddingHorizontal: SPACE.md },
  bar: { flexDirection: 'row', paddingHorizontal: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: ADMIN_TAB_BAR, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  tabMarker: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: TAP,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
