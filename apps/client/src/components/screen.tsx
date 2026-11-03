import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { useHouseWorkspace } from '@/components/house/workspace';
import { TourScrollContext } from '@/components/tour/tour-spot';
import { ASIDE, COLUMNS_MIN, CONTENT_MAX, FILL_MAX, GUTTER, HOUSE_NAV, MAIN_MAX, RAIL, SECTION_GAP, useTheme, WIDE } from '@/theme';

const ContentWidth = createContext(CONTENT_MAX);
const TwoColumns = createContext(false);
const Filled = createContext<number | null>(null);

/** What scrolling the page does, handed to the main column when two columns each scroll on their own. */
interface PageScroll {
  onNearEnd?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}
const PageScrollContext = createContext<PageScroll>({});

/** Calls `onNearEnd` once a scroll comes within a screen of the end, where a timeline reads its next page. */
function nearEnd(onNearEnd?: () => void) {
  return onNearEnd
    ? ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (contentOffset.y + 2 * layoutMeasurement.height >= contentSize.height) onNearEnd();
      }
    : undefined;
}

/** How wide the screen's content may get: a phone's title bar lines up with it, and the Table fits its rows' words to it. */
export function useContentWidth(): number {
  return useContext(ContentWidth);
}

/** Whether this page is in two columns: one that spreads, on a page at least COLUMNS_MIN wide. */
export function useColumns(): boolean {
  return useContext(TwoColumns);
}

/**
 * The content's width when the page fills the room on a laptop (a Screen
 * that `fills`, from WIDE), for `Pair` and `Flow` to share out in columns;
 * null anywhere else, where a page is one column.
 */
export function useFilled(): number | null {
  return useContext(Filled);
}

/**
 * A house screen's page: its title bar (`bar`, a TitleBar) fixed at the top,
 * then the content, which scrolls and pulls to refresh. The content keeps
 * to CONTENT_MAX, sits GUTTER in from the edges, and puts SECTION_GAP
 * between its children. On a phone it's centred; from WIDE it starts at the
 * page's leading edge, beside the rail and under the title bar's Title, as a
 * desktop app's pages do. A page that `spreads` (Today, Week, House) fills
 * the page instead once the page itself is COLUMNS_MIN wide, a laptop's
 * beside the rail, and its content lays itself out in Columns. The page
 * measures itself, so it goes back to one column when something beside it
 * (the chat with Jonz) takes the room. In two columns each scrolls on its
 * own (Columns), so the page itself holds still under the title bar. The
 * title bar keeps clear of the notch; the tabs keep clear of the home bar.
 *
 * A page that `fills` (House's pages beside its list) runs its content
 * across the room from WIDE, up to FILL_MAX, and lays its sections out side
 * by side with `Pair` and `Flow`; on a phone it's one column, as any page.
 */
export function Screen({
  children,
  bar,
  maxWidth = CONTENT_MAX,
  spreads = false,
  fills = false,
  refreshing,
  onRefresh,
  onNearEnd,
  testID,
}: {
  children: ReactNode;
  bar?: ReactNode;
  maxWidth?: number;
  spreads?: boolean;
  /** From WIDE, the content fills the room (up to FILL_MAX) for its sections to sit in columns. */
  fills?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Scrolled to within a screen of the end: a timeline reads its next page. */
  onNearEnd?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const windowWidth = useWindowDimensions().width;
  // Until the page has measured itself, the window less the rail (and House's list, beside House's pages).
  const [measured, setMeasured] = useState<number | null>(null);
  const { listed } = useHouseWorkspace();
  const width = measured ?? (windowWidth >= WIDE ? windowWidth - RAIL - (listed ? HOUSE_NAV : 0) : windowWidth);
  const two = spreads && width >= COLUMNS_MIN;
  const filling = fills && !spreads && windowWidth >= WIDE;
  const max = two ? undefined : filling ? FILL_MAX : maxWidth;
  const onLayout = spreads || filling ? (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width) : undefined;
  // A tour scrolls a spot on this page into view through it.
  const scroll = useRef<ScrollViewInstance>(null);
  return (
    <ContentWidth.Provider value={max ?? MAIN_MAX}>
      <TwoColumns.Provider value={two}>
        <Filled.Provider value={filling ? Math.min(width - 2 * GUTTER, FILL_MAX) : null}>
          <View testID={testID} onLayout={onLayout} style={[styles.screen, { backgroundColor: colors.background }]}>
            {bar}
            <ScrollView
              ref={scroll}
              testID="page-scroll"
              style={styles.scroll}
              scrollEventThrottle={onNearEnd ? 200 : undefined}
              onScroll={nearEnd(onNearEnd)}
              contentContainerStyle={[styles.page, { maxWidth: max }, windowWidth >= WIDE && styles.leading, two && styles.filled]}
              refreshControl={
                // In two columns the main column pulls to refresh, as it's the one that scrolls.
                onRefresh && !two ? (
                  <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.foreground} />
                ) : undefined
              }
            >
              <TourScrollContext.Provider value={scroll}>
                <PageScrollContext.Provider value={{ onNearEnd, refreshing, onRefresh }}>{children}</PageScrollContext.Provider>
              </TourScrollContext.Provider>
            </ScrollView>
          </View>
        </Filled.Provider>
      </TwoColumns.Provider>
    </ContentWidth.Provider>
  );
}

/**
 * A page in two columns: what you act on in `main`, what you glance at in
 * `side`, each keeping SECTION_GAP between its sections. The main column
 * grows with the window up to MAIN_MAX. The side is a panel docked to the
 * window's right edge, the page's whole height under the title bar, with a
 * hairline down its leading side, as House's list of its pages is docked on
 * the left: ASIDE wide inside a GUTTER each side. Only for a page in two
 * columns (useColumns); a page in one keeps its phone order, which these two
 * lists may not follow.
 *
 * Each column scrolls on its own, as a mail app's list and message do: a
 * long list never carries the panel beside it away, and a long panel can be
 * read to its end without losing your place in the list. The main column
 * does what scrolling the page would (reads more near the end, pulls to
 * refresh). The two fill the page under the title bar, laid over the
 * page's own scroll, which then has nothing to scroll.
 */
export function Columns({ main, side }: { main: ReactNode; side: ReactNode }) {
  const { colors } = useTheme();
  const scroll = useContext(PageScrollContext);
  const mainRef = useRef<ScrollViewInstance>(null);
  const sideRef = useRef<ScrollViewInstance>(null);
  return (
    <View style={styles.columns} testID="columns">
      <ScrollView
        ref={mainRef}
        testID="column-main-scroll"
        style={styles.mainScroll}
        contentContainerStyle={styles.mainPage}
        scrollEventThrottle={scroll.onNearEnd ? 200 : undefined}
        onScroll={nearEnd(scroll.onNearEnd)}
        refreshControl={
          scroll.onRefresh ? (
            <RefreshControl refreshing={scroll.refreshing ?? false} onRefresh={scroll.onRefresh} tintColor={colors.foreground} />
          ) : undefined
        }
      >
        <ContentWidth.Provider value={CONTENT_MAX}>
          <TourScrollContext.Provider value={mainRef}>
            <View style={styles.main} testID="column-main">
              {main}
            </View>
          </TourScrollContext.Provider>
        </ContentWidth.Provider>
      </ScrollView>
      <ScrollView
        ref={sideRef}
        testID="column-side"
        style={[styles.side, { borderLeftColor: colors.border }]}
        contentContainerStyle={styles.sidePage}
      >
        <ContentWidth.Provider value={ASIDE}>
          <TourScrollContext.Provider value={sideRef}>{side}</TourScrollContext.Provider>
        </ContentWidth.Provider>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  page: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: GUTTER,
    paddingBottom: SECTION_GAP,
    gap: SECTION_GAP,
    flexGrow: 1,
  },
  // From WIDE, on the page's leading edge rather than in the middle.
  leading: { alignSelf: 'flex-start' },
  // Two columns fill the page, the side panel reaching its right edge and its foot.
  filled: { paddingRight: 0, paddingBottom: 0 },
  // Over the whole page, from the title bar's hairline to the foot: the page's padding is the columns' own.
  columns: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'stretch' },
  // The main column's scroll reaches the panel, so its bar sits by the hairline and the room past MAIN_MAX
  // scrolls it too; the words keep to MAIN_MAX.
  mainScroll: { flex: 1, minWidth: 0 },
  mainPage: { paddingLeft: GUTTER, paddingRight: SECTION_GAP, paddingTop: GUTTER, paddingBottom: SECTION_GAP },
  main: { width: '100%', maxWidth: MAIN_MAX, gap: SECTION_GAP },
  // Docked to the right edge, the page's whole height under the title bar.
  side: { flexGrow: 0, flexShrink: 0, width: ASIDE + 2 * GUTTER, borderLeftWidth: StyleSheet.hairlineWidth },
  sidePage: { paddingTop: GUTTER, paddingHorizontal: GUTTER, paddingBottom: SECTION_GAP, gap: SECTION_GAP },
});
