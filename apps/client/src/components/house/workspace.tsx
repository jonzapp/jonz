import { FOCUS_SHELL_COPY, HOUSE_LOWER_COPY, PAGE_TITLE, PASS_COPY, WALL_COPY } from '@app/core';
import { usePathname, useRouter, type Href } from 'expo-router';
import {
  HouseIcon,
  ListTodoIcon,
  MessageSquareIcon,
  PlaneIcon,
  ScrollTextIcon,
  TicketIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Lead, Meta, SectionLabel } from '@/components/text';
import { AskPanelContext } from '@/hooks/use-ask-jonz';
import {
  FONT,
  GUTTER,
  HOUSE_NAV,
  INSET,
  PANEL,
  RADIUS,
  RAIL,
  ROW_GAP,
  SECTION_GAP,
  SPACE,
  TAP,
  TITLE_BAR,
  useTheme,
  WIDE,
  WORKSPACE_MIN,
} from '@/theme';

/** What a panel down the right shows: its title, an optional line under it, and its content. */
export interface PanelContent {
  title: string;
  description?: string;
  content: ReactNode;
  testID?: string;
}

interface Workspace {
  /** House's pages are listed beside them: a page needs no way back to House of its own. */
  listed: boolean;
  /** Opens a panel down the right in place of a sheet, or null where there's no room (a phone). */
  panel: { open: (content: PanelContent) => void; close: () => void } | null;
}

const WorkspaceContext = createContext<Workspace>({ listed: false, panel: null });

/** Where House's pages stand on a laptop: listed beside them, with a panel down the right for a John's details. */
export function useHouseWorkspace(): Workspace {
  return useContext(WorkspaceContext);
}

/**
 * House on a laptop: its pages listed down the left (Overview, the Wall,
 * then the house's setup and the Pass), the page beside them, and a panel
 * down the right where a page opens what a phone puts in a sheet (a John's
 * details), so the page stays in view and the next John is one click away.
 * The House tab measures itself, so a narrow window (or the chat with Jonz
 * beside it) keeps the phone's way: the House page lists its setup, and
 * each page has its way back.
 */
export function HouseWorkspace({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const windowWidth = useWindowDimensions().width;
  const wide = windowWidth >= WIDE;
  // Until the tab has measured itself, the window less the rail.
  const [width, setWidth] = useState<number | null>(null);
  const [panel, setPanel] = useState<PanelContent | null>(null);
  const pathname = usePathname();
  const listed = wide && (width ?? windowWidth - RAIL) >= WORKSPACE_MIN;
  // One panel down the right at a time: opening a John closes the chat with Jonz, and opening the chat closes the John.
  const ask = useContext(AskPanelContext);
  const askOpen = ask?.open ?? false;
  const closeAsk = ask?.setOpen;

  // A panel belongs to the page that opened it.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (panel && (openedOn !== pathname || askOpen)) setPanel(null);

  const value = useMemo<Workspace>(
    () => ({
      listed,
      panel: listed
        ? {
            open: (content) => {
              closeAsk?.(false);
              setOpenedOn(pathname);
              setPanel(content);
            },
            close: () => setPanel(null),
          }
        : null,
    }),
    [listed, pathname, closeAsk],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <View
        style={styles.row}
        testID="house-workspace"
        onLayout={wide ? (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width) : undefined}
      >
        {listed ? <HouseNav /> : null}
        <View style={styles.page}>{children}</View>
        {listed && panel ? (
          <SidePanel content={panel} onClose={() => setPanel(null)} border={colors.border} />
        ) : null}
      </View>
    </WorkspaceContext.Provider>
  );
}

/** House's pages in the list, in House's order: its top and the Wall, then its setup, then the Pass and you. */
const PAGES: { group: string | null; items: { href: Href; label: string; icon: LucideIcon; testID: string }[] }[] = [
  {
    group: null,
    items: [
      { href: '/house', label: HOUSE_LOWER_COPY.overview, icon: HouseIcon, testID: 'nav-overview' },
      { href: '/house/wall', label: WALL_COPY.title, icon: MessageSquareIcon, testID: 'nav-wall' },
    ],
  },
  {
    group: FOCUS_SHELL_COPY.setup,
    items: [
      { href: '/house/johns', label: HOUSE_LOWER_COPY.johns, icon: ListTodoIcon, testID: 'nav-johns' },
      { href: '/house/rules', label: HOUSE_LOWER_COPY.rules, icon: ScrollTextIcon, testID: 'nav-rules' },
      { href: '/house/away', label: HOUSE_LOWER_COPY.away, icon: PlaneIcon, testID: 'nav-away' },
    ],
  },
  {
    group: null,
    items: [
      { href: '/house/pass', label: PASS_COPY.title, icon: TicketIcon, testID: 'nav-pass' },
      { href: '/house/you', label: PAGE_TITLE.you, icon: UserRoundIcon, testID: 'nav-you' },
    ],
  },
];

/** The list of House's pages, the one you're on marked; any other page under House (a housemate's) marks none. */
function HouseNav() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const atTop = pathname === '/house';
  return (
    <View
      accessibilityRole="navigation"
      accessibilityLabel={HOUSE_LOWER_COPY.pages}
      testID="house-nav"
      style={[styles.nav, { borderRightColor: colors.border }]}
    >
      <ScrollView contentContainerStyle={styles.navList}>
        {PAGES.map((part, i) => (
          <View key={i} style={styles.navGroup}>
            {part.group ? <SectionLabel style={styles.navLabel}>{part.group}</SectionLabel> : null}
            {part.items.map((item) => (
              <NavItem key={item.testID} {...item} current={pathname === item.href} replace={!atTop} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * One of House's pages in the list. From House's top it opens on the stack,
 * from one of its pages it takes that page's place, and Overview goes back
 * down to the top: the stack stays one page deep, as a phone's would.
 */
function NavItem({
  href,
  label,
  icon: Icon,
  current,
  replace,
  testID,
}: {
  href: Href;
  label: string;
  icon: LucideIcon;
  current: boolean;
  replace: boolean;
  testID: string;
}) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const go = () => {
    if (href === '/house') router.dismissTo(href);
    else if (replace) router.replace(href);
    else router.push(href);
  };
  return (
    <Pressable
      accessibilityRole="link"
      aria-current={current ? 'page' : undefined}
      onPress={go}
      testID={testID}
      style={({ pressed }) => [styles.navItem, current && { backgroundColor: colors.secondary }, pressed && styles.pressed]}
    >
      <Icon size={20} color={current ? colors.foreground : colors.mutedForeground} aria-hidden />
      <Text numberOfLines={1} style={[type.body, styles.navWords, current && styles.navCurrent]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A panel down the right of House's pages: its title and a close button in
 * a bar as tall as the title bar, the line under it, then the content,
 * which scrolls. Escape closes it on the web, as it closes a sheet.
 */
function SidePanel({ content, onClose, border }: { content: PanelContent; onClose: () => void; border: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <View
      accessibilityRole="complementary"
      accessibilityLabel={content.title}
      testID={content.testID ?? 'side-panel'}
      style={[styles.panel, { borderLeftColor: border, backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <View style={[styles.panelBar, { borderBottomColor: colors.border }]}>
        <Lead header numberOfLines={1} style={styles.panelTitle}>
          {content.title}
        </Lead>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={HOUSE_LOWER_COPY.closePanel}
          onPress={onClose}
          testID="side-panel-close"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <XIcon size={22} color={colors.foreground} aria-hidden />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.panelBody}>
        {content.description ? <Meta style={styles.panelLine}>{content.description}</Meta> : null}
        {content.content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  page: { flex: 1, minWidth: 0 },
  nav: { width: HOUSE_NAV, borderRightWidth: StyleSheet.hairlineWidth },
  navList: { paddingVertical: GUTTER, paddingHorizontal: SPACE.sm, gap: SPACE.lg },
  navGroup: { gap: 2 },
  navLabel: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.xs },
  navItem: {
    minHeight: TAP - SPACE.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS,
  },
  navWords: { flexShrink: 1 },
  navCurrent: { fontFamily: FONT.bold },
  pressed: { opacity: 0.6 },
  panel: { width: PANEL, borderLeftWidth: StyleSheet.hairlineWidth },
  panelBar: {
    minHeight: TITLE_BAR,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingLeft: GUTTER + INSET,
    paddingRight: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { flex: 1, minWidth: 0 },
  close: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  panelBody: { paddingHorizontal: GUTTER, paddingTop: GUTTER, paddingBottom: SECTION_GAP, gap: SECTION_GAP },
  panelLine: { paddingHorizontal: INSET },
});
