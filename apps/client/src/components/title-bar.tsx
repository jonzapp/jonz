import { FOCUS_SHELL_COPY, HOUSE_DRAFT_COPY, TOUR_COPY } from '@app/core';
import { useRouter, type Href } from 'expo-router';
import { ChevronLeftIcon, CircleQuestionMarkIcon, EllipsisIcon, SparklesIcon } from 'lucide-react-native';
import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHouseWorkspace } from '@/components/house/workspace';
import { useContentWidth } from '@/components/screen';
import { Meta, Title } from '@/components/text';
import { IconButton } from '@/components/icon-button';
import { useTour } from '@/components/tour/tour-context';
import { TourSpot } from '@/components/tour/tour-spot';
import { useAskJonz, useAskPanelOpen } from '@/hooks/use-ask-jonz';
import { FONT, GUTTER, INSET, SECTION_GAP, SPACE, TAP, TITLE_BAR, useTheme, WIDE } from '@/theme';

/**
 * A button a part of the app puts at the edge of every title bar inside it,
 * where a house's sparkles go: the owner's pages put the sparkles that open
 * the owner's Ask Jonz there. Nothing elsewhere.
 */
export const BarEdgeContext = createContext<ReactNode>(null);

/**
 * The top of every house screen, in place of the old wordmark strip: the
 * screen's one Title (caps, one line) on the pavement with a hairline under
 * it, and on the right one group of buttons in a fixed order: the screen's
 * own button (`right`, a MoreButton or Today's "You ▾"), Help's question
 * mark, then the sparkles that open Jonz (`ask`: Describe your house, or Ask
 * Jonz once there's a list) at the edge. The buttons' squares touch, so the
 * gaps between them are even, and switching tabs moves nothing: every tab's bar
 * is the same 52 tall. What a tab says about itself (Today's date, House's
 * housemates) is its page's TopLine, not a second line here. A pushed page
 * passes `back`, the page its back goes to, whatever came before it: a
 * link-like "‹ House" (`backLabel`, the place it goes back to) sits on its
 * own line above the Title, which stays on the leading edge, and may carry
 * `sub` as a Meta line under the Title (74 tall, with its own room above
 * the Title and under the sub). It keeps clear of the notch. On a phone it
 * lines up with the content below it; from WIDE it holds the edges of the
 * page beside the rail, as a desktop app's toolbar does: the Title where the
 * page's words start, the sparkles at the window's right edge.
 * A house's tabs (a bar with no `back`, inside the tour player) carry Help's
 * question mark just inside the sparkles, or at the edge without them (a
 * housemate): it opens the Help sheet, with a tour of the page.
 * `lead` is a button on the leading edge before the Title, its glyph on the
 * content's edge as the last one's is on the trailing edge: Ask Jonz's Your
 * chats, where chat apps put the way to your chats. `onBack` is a back link
 * that doesn't leave the page (Your chats back to the chat), in place of `back`.
 * `end` is a panel's Close, the last thing at the edge, after Help: what puts
 * the panel away is always the outermost button.
 * `docked` is a panel's bar beside the page: it stays the page bar's 52 so
 * the two read as one strip across the window, so its back (`onBack`) is a
 * chevron on the leading edge rather than a line of its own above the Title.
 */
export function TitleBar({
  title,
  sub,
  right,
  back,
  backLabel = FOCUS_SHELL_COPY.back,
  ask = false,
  lead,
  onBack,
  end,
  docked = false,
}: {
  title: string;
  /** A pushed page's line under the Title ("Sam, admin"). */
  sub?: string;
  /** The screen's own button, just inside the sparkles. */
  right?: ReactNode;
  back?: Href;
  /** Where back goes, in words ("House"); "Back" when left out. */
  backLabel?: string;
  /** Show the sparkles that open the chat with Jonz (admins). */
  ask?: boolean;
  /** One button on the leading edge, before the Title. */
  lead?: ReactNode;
  /** A back link (named by `backLabel`) that stays on this page, in place of `back`. */
  onBack?: () => void;
  /** A panel's Close: at the very edge, after Help. */
  end?: ReactNode;
  /** A panel beside the page: always 52 tall, its back a chevron before the Title. */
  docked?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const contentWidth = useContentWidth();
  const maxWidth = useWindowDimensions().width >= WIDE ? undefined : contentWidth;
  // On a laptop House's pages are listed beside them, which is the way back to House.
  const way = useHouseWorkspace().listed && back === '/house' ? undefined : back;
  const tours = useTour();
  const help = tours != null && back == null && onBack == null;
  // A docked panel's back is a chevron on the leading edge, in the bar's one line.
  const inlineBack = docked && onBack != null;
  const pushed = way != null || (onBack != null && !inlineBack);
  const edge = useContext(BarEdgeContext);
  const leading = inlineBack ? (
    <IconButton
      icon={ChevronLeftIcon}
      label={backLabel === FOCUS_SHELL_COPY.back ? backLabel : FOCUS_SHELL_COPY.backTo(backLabel)}
      onPress={onBack}
      testID="back"
    />
  ) : (
    lead
  );
  return (
    <View
      testID="title-bar"
      style={[styles.bar, { paddingTop: insets.top, backgroundColor: colors.background, borderBottomColor: colors.border }]}
    >
      <View style={[styles.inner, { maxWidth }]}>
        {way != null ? <BackLink to={way} label={backLabel} /> : onBack && !inlineBack ? <BackLink onPress={onBack} label={backLabel} /> : null}
        <View style={[styles.line, sub ? styles.withSub : null, pushed && styles.pushed]}>
          {leading != null ? (
            <View testID="bar-lead" style={[styles.tools, styles.lead]}>
              {leading}
            </View>
          ) : null}
          <View style={styles.words}>
            <Title numberOfLines={1} style={styles.title}>
              {title}
            </Title>
            {sub ? <Meta numberOfLines={1}>{sub}</Meta> : null}
          </View>
          {right != null || help || ask || edge != null || end != null ? (
            // One group at the edge, in a fixed order with no gaps of its own: the
            // screen's button, Help, then the sparkles (or a panel's Close) at the edge.
            <View testID="bar-tools" style={[styles.tools, styles.trail]}>
              {right}
              {help ? (
                <TourSpot id="shell.help">
                  <IconButton icon={CircleQuestionMarkIcon} label={TOUR_COPY.open} onPress={tours.openHelp} testID="help-button" />
                </TourSpot>
              ) : null}
              {ask ? <AskButton /> : edge}
              {end}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * What a tab says about itself, first on its page under the bar: Today's
 * date, House's "4 housemates, £20 a month each". Meta on the card's
 * leading edge, 24 tall like Week's range line, with the page's first card
 * 8 under it rather than a section gap.
 */
export function TopLine({ children }: { children: string }) {
  return (
    <View testID="top-line" style={styles.topLine}>
      <Meta numberOfLines={1}>{children}</Meta>
    </View>
  );
}

/**
 * Back to the place it names: a chevron and the place's name in Body Bold,
 * the chevron hanging just left of the leading edge. Spoken as "Back to
 * House". It pops the stack down to `to` when that's under this page, and
 * puts `to` in this page's place when it isn't, so a page reached from
 * another tab (Today's setup card, say) still goes to House, not back to
 * the tab it came from.
 */
function BackLink({ to, onPress, label }: { to?: Href; onPress?: () => void; label: string }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === FOCUS_SHELL_COPY.back ? label : FOCUS_SHELL_COPY.backTo(label)}
      onPress={onPress ?? (() => to && router.dismissTo(to))}
      testID="back"
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <ChevronLeftIcon size={20} color={colors.foreground} aria-hidden />
      <Text numberOfLines={1} style={[type.body, styles.backWords]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The title bar's sparkles: open the chat with Jonz, to start or change the
 * list. From WIDE they open and close the panel beside the page, like a
 * sidebar's button: they look the same either way, since the open panel is
 * the sign (a screen reader hears it as expanded). On a phone they open the
 * chat's page.
 */
function AskButton() {
  const ask = useAskJonz('toggle');
  const open = useAskPanelOpen();
  return (
    <TourSpot id="shell.ask">
      <IconButton
        icon={SparklesIcon}
        label={HOUSE_DRAFT_COPY.open}
        expanded={'onPress' in ask ? open : undefined}
        onPress={'onPress' in ask ? ask.onPress : undefined}
        href={'href' in ask ? ask.href : undefined}
        testID="ask-jonz"
      />
    </TourSpot>
  );
}

/** The title bar's "•••": opens the screen's ActionMenu. */
export function MoreButton({ onPress, testID = 'more' }: { onPress: () => void; testID?: string }) {
  return <IconButton icon={EllipsisIcon} label={FOCUS_SHELL_COPY.more} onPress={onPress} testID={testID} />;
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  inner: { width: '100%', alignSelf: 'center', paddingHorizontal: GUTTER + INSET },
  line: {
    minHeight: TITLE_BAR,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  // With a sub line: the kit's 10 above (the Title's own 4 comes on top) and 8 under it.
  withSub: { paddingTop: 10, paddingBottom: SPACE.sm },
  // Under a back link: no 52 of its own, and a little room under the Title.
  pushed: { minHeight: 0, paddingTop: 0, paddingBottom: SPACE.sm },
  words: { flex: 1, minWidth: 0 },
  // Overpass's caps sit high in their line, so the title comes down a little.
  title: { paddingTop: 4 },
  // The buttons' 48 squares touch, so every glyph is the same 48 from the next;
  // the last one's glyph lines up with the content's edge, and they sit in the
  // bar's own 4 above and below.
  tools: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', marginVertical: -SPACE.xs },
  trail: { marginRight: -SPACE.md },
  // The leading button's glyph on the content's edge, and the Title 4 after its square (the line's gap less 8).
  lead: { marginLeft: -SPACE.md, marginRight: -SPACE.sm },
  back: {
    alignSelf: 'flex-start',
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    // The chevron's own margin hangs it left of the leading edge.
    marginLeft: -SPACE.sm,
    paddingRight: SPACE.sm,
  },
  backWords: { fontFamily: FONT.bold },
  pressed: { opacity: 0.6 },
  topLine: { minHeight: 24, justifyContent: 'center', paddingHorizontal: INSET, marginBottom: SPACE.sm - SECTION_GAP },
});
