import { FOCUS_SHELL_COPY, SECTION_LABEL, SHELL_COPY } from '@app/core';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { CalendarDaysIcon, HouseIcon, ListChecksIcon, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CountBadge } from '@/components/badge';
import { Meta, RowTitle } from '@/components/text';
import { TourSpot } from '@/components/tour/tour-spot';
import { FONT, GUTTER, INSET, RAIL, SPACE, TAP, useTheme } from '@/theme';

/** The house's three places, in the order the tabs and the rail show them. */
export const PLACES = ['today', 'week', 'house'] as const;
export type Place = (typeof PLACES)[number];

const ICON: Record<Place, LucideIcon> = {
  today: ListChecksIcon,
  week: CalendarDaysIcon,
  house: HouseIcon,
};

/**
 * The icons in the J's own line: heavier than lucide's, with square ends and
 * round corners, as the mark's J is stroked (packages/core/src/mark.ts).
 */
const STROKE = { strokeWidth: 2.5, strokeLinecap: 'butt', strokeLinejoin: 'round' } as const;

/** What the rail says about the house; null until the house has been read. */
export interface ShellHouse {
  name: string;
  memberCount: number;
}

/**
 * The house's three places: tabs along the bottom of a phone, a rail down
 * the left from WIDE on the web, the same three either way. The current one
 * is ink with the 3pt hi-vis marker (amber's one job besides the primary
 * button); Today carries a badge counting the disputes waiting for your
 * vote, said in words to a screen reader.
 */
export function HouseTabBar({
  state,
  emitter,
  navigateToTab,
  insets,
  wide,
  house,
  toVote,
}: BottomTabBarProps & { wide: boolean; house: ShellHouse | null; toVote: number }) {
  const { colors, type } = useTheme();

  const places = state.routes.map((route, index) => {
    const place = route.name as Place;
    const focused = index === state.index;
    const Icon = ICON[place] ?? HouseIcon;
    const label = SECTION_LABEL[place];
    const badge = place === 'today' ? toVote : 0;
    const ink = focused ? colors.foreground : colors.mutedForeground;
    const onPress = () => {
      // A press on the current tab still goes out: House's stack goes back to its top.
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    const common = {
      role: 'tab' as const,
      'aria-selected': focused,
      accessibilityLabel: FOCUS_SHELL_COPY.tab(label, badge),
      testID: `tab-${place}`,
      onPress,
    };
    return wide ? (
      <Pressable key={route.key} {...common} style={styles.railItem}>
        {focused ? <View aria-hidden style={[styles.railMarker, { backgroundColor: colors.hivis }]} /> : null}
        <Icon size={24} color={ink} {...STROKE} aria-hidden />
        <Text style={[type.body, styles.railLabel, { color: ink }]}>{label}</Text>
        <CountBadge count={badge} />
      </Pressable>
    ) : (
      <Pressable key={route.key} {...common} style={styles.tab}>
        {focused ? <View aria-hidden style={[styles.marker, { backgroundColor: colors.hivis }]} /> : null}
        <View>
          <Icon size={24} color={ink} {...STROKE} aria-hidden />
          {badge > 0 ? (
            <View style={styles.badge}>
              <CountBadge count={badge} ring />
            </View>
          ) : null}
        </View>
        <Text style={[type.tabLabel, { color: ink }]}>{label}</Text>
      </Pressable>
    );
  });

  if (!wide) {
    return (
      <TourSpot id="shell.tabs">
        <View
          role="tablist"
          accessibilityLabel={FOCUS_SHELL_COPY.places}
          style={[styles.bar, { paddingBottom: insets.bottom, backgroundColor: colors.background, borderTopColor: colors.border }]}
        >
          {places}
        </View>
      </TourSpot>
    );
  }

  return (
    <View style={[styles.rail, { backgroundColor: colors.background, borderRightColor: colors.border }]}>
      {house ? (
        <View style={styles.house}>
          <RowTitle numberOfLines={2}>{house.name}</RowTitle>
          <Meta>{SHELL_COPY.housemates(house.memberCount)}</Meta>
        </View>
      ) : null}
      <TourSpot id="shell.tabs">
        <View role="tablist" accessibilityLabel={FOCUS_SHELL_COPY.places} style={styles.railItems}>
          {places}
        </View>
      </TourSpot>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  marker: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: TAP,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  badge: { position: 'absolute', top: -7, left: 14 },
  rail: {
    width: RAIL,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACE.xl,
    gap: SPACE.xl,
  },
  house: { paddingHorizontal: GUTTER + INSET - SPACE.sm, gap: 2 },
  railItems: { gap: SPACE.xs },
  railItem: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: GUTTER + INSET - SPACE.sm,
  },
  railMarker: {
    position: 'absolute',
    left: 0,
    top: SPACE.sm,
    bottom: SPACE.sm,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  railLabel: { flex: 1, fontFamily: FONT.bold },
});
