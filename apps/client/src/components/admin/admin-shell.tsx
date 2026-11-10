import { ADMIN_COPY, ADMIN_GROUPS, adminGroupOf, adminPage, type AdminGroup, type AdminPage } from '@app/core';
import { Link, useRouter } from 'expo-router';
import {
  ArchiveIcon,
  ArrowLeftIcon,
  HouseIcon,
  InboxIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SendIcon,
  TicketIcon,
  UserXIcon,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/segmented';
import { Wordmark } from '@/components/wordmark';
import { Chip } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { FONT, RAIL, SPACE, TAP, useTheme, WIDE } from '@/theme';

/** Each page's icon, on the rail and the tabs. */
export const ADMIN_ICON: Record<AdminPage, LucideIcon> = {
  overview: LayoutGridIcon,
  inbox: InboxIcon,
  houses: HouseIcon,
  messages: MessageSquareIcon,
  notices: MegaphoneIcon,
  promotions: TicketIcon,
  deletions: UserXIcon,
  audit: ScrollTextIcon,
};

/** Each group's icon on a phone's tabs: a one-page group has its page's. */
const GROUP_ICON: Record<AdminGroup, LucideIcon> = {
  overview: LayoutGridIcon,
  inbox: InboxIcon,
  houses: HouseIcon,
  send: SendIcon,
  records: ArchiveIcon,
};

/** The tab bar's height above the home bar, so a toast clears it. */
export const ADMIN_TAB_BAR = 56;

/**
 * The owner's pages: a rail down the left from WIDE, as the house's, with
 * the wordmark and an Owner chip so it is never mistaken for a house, and
 * Back to my house at its foot; on a phone, tabs along the bottom, as the
 * house's tabs are (Back to my house is at Overview's foot there). `aside` sits
 * down the right from WIDE (the owner's Ask Jonz, when it's open).
 */
export function AdminShell({ page, aside, children }: { page: AdminPage; aside?: ReactNode; children: ReactNode }) {
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
      {aside}
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
        {ADMIN_GROUPS.map((group) => (
          <View key={group.key} style={group.pages.length > 1 ? styles.group : undefined}>
            {group.pages.length > 1 ? <Meta style={styles.heading}>{group.label}</Meta> : null}
            {group.pages.map((key) => {
              const { label, path } = adminPage(key);
              const Icon = ADMIN_ICON[key];
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
        ))}
      </View>
      <View style={styles.foot}>
        {/* The way back to the owner's own house: "/" opens it. */}
        <TextButton label={ADMIN_COPY.backToHouse} icon={ArrowLeftIcon} href="/" align="start" testID="admin-to-house" />
        <Meta>{ADMIN_COPY.signedInWithCode}</Meta>
      </View>
    </View>
  );
}

/** On a phone: the owner's groups as tabs along the bottom, the current one ink with the hi-vis marker. */
function AdminTabs({ page }: { page: AdminPage }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = adminGroupOf(page).key;
  return (
    <View
      role="tablist"
      testID="admin-tabs"
      style={[styles.bar, { paddingBottom: insets.bottom, backgroundColor: colors.background, borderTopColor: colors.border }]}
    >
      {ADMIN_GROUPS.map((group) => (
        <AdminTab
          key={group.key}
          label={group.label}
          path={adminPage(group.pages[0]).path}
          icon={GROUP_ICON[group.key]}
          on={group.key === current}
          testID={`admin-tab-${group.key}`}
        />
      ))}
    </View>
  );
}

/**
 * On a phone, at the top of a page whose tab holds more than one (Send,
 * Records): a switch between them. Nothing on a laptop, where the side list
 * names every page.
 */
export function AdminSwitch({ page }: { page: AdminPage }) {
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE;
  const group = adminGroupOf(page);
  if (wide || group.pages.length < 2) return null;
  return (
    <View style={styles.switch}>
      <Segmented
      label={group.label}
      options={group.pages.map((key) => ({ value: key, label: adminPage(key).label }))}
      value={page}
      onChange={(key) => router.navigate(adminPage(key).path as never)}
      equal
      testID="admin-switch"
      />
    </View>
  );
}

function AdminTab({ label, path, icon: Icon, on, testID }: { label: string; path: string; icon: LucideIcon; on: boolean; testID: string }) {
  const { colors, type } = useTheme();
  const ink = on ? colors.foreground : colors.mutedForeground;
  return (
    <Link href={path as never} asChild>
      <Pressable role="tab" aria-selected={on} style={styles.tab} testID={testID}>
        {on ? <View aria-hidden style={[styles.tabMarker, { backgroundColor: colors.hivis }]} /> : null}
        <Icon size={24} color={ink} strokeWidth={2.5} aria-hidden />
        <Text style={[type.tabLabel, { color: ink }]}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  row: { flex: 1, flexDirection: 'row' },
  rail: { width: RAIL, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.md, paddingBottom: SPACE.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.md, marginBottom: SPACE.xl },
  items: { gap: SPACE.xs },
  switch: { marginBottom: SPACE.xl },
  group: { gap: SPACE.xs, marginTop: SPACE.md },
  heading: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.xs },
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
  foot: { marginTop: 'auto', paddingHorizontal: SPACE.md, alignItems: 'flex-start' },
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
