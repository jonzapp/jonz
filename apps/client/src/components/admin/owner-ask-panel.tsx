import { OWNER_ASK_COPY } from '@app/core';
import { usePathname } from 'expo-router';
import { SparklesIcon } from 'lucide-react-native';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OwnerAsk } from '@/components/admin/owner-ask';
import { IconButton } from '@/components/icon-button';
import { BarEdgeContext } from '@/components/title-bar';
import { LookContext, useTheme, WIDE } from '@/theme';

/** The panel's width beside the page, as the house's chat; a little less on a narrow laptop. */
const PANEL = 400;
const PANEL_SHARE = 0.36;

const OwnerAskContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

/**
 * Where the owner's Ask Jonz opens (docs/specs/owner-admin.md, "Ask Jonz,
 * owner"): the sparkles at the edge of every admin title bar. From WIDE it
 * docks down the right beside the page, as the house's does; on a phone it
 * covers the screen, tabs and all, until it's closed or a chip opens a page.
 * The chat is kept while the owner's pages are open, so closing it and
 * opening it again picks up where it was.
 */
export function OwnerAskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <OwnerAskContext.Provider value={value}>
      <BarEdgeContext.Provider value={<OwnerAskButton />}>{children}</BarEdgeContext.Provider>
    </OwnerAskContext.Provider>
  );
}

/** The sparkles: open and close the owner's chat. A screen reader hears whether it's open. */
export function OwnerAskButton() {
  const ask = useContext(OwnerAskContext);
  if (!ask) return null;
  return (
    <IconButton
      icon={SparklesIcon}
      label={OWNER_ASK_COPY.open}
      expanded={ask.open}
      onPress={() => ask.setOpen(!ask.open)}
      testID="owner-ask-open"
    />
  );
}

/** From WIDE: the chat down the right of the window while it's open. */
export function OwnerAskDock() {
  const ask = useContext(OwnerAskContext);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const opened = useOpened(ask?.open ?? false);
  if (!ask || width < WIDE || !opened) return null;
  return (
    <View
      style={[
        styles.dock,
        { width: Math.min(PANEL, width * PANEL_SHARE), borderLeftColor: colors.border },
        !ask.open && styles.hidden,
      ]}
      testID="owner-ask-panel"
    >
      <OwnerAsk onClose={() => ask.setOpen(false)} />
    </View>
  );
}

/** On a phone: the chat over the whole screen while it's open; a chip that opens a page puts it away. */
export function OwnerAskSheet() {
  const ask = useContext(OwnerAskContext);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const opened = useOpened(ask?.open ?? false);
  const was = useRef(pathname);
  const setOpen = ask?.setOpen;
  useEffect(() => {
    if (was.current !== pathname) setOpen?.(false);
    was.current = pathname;
  }, [pathname, setOpen]);
  if (!ask || width >= WIDE || !opened) return null;
  return (
    <LookBackground style={[styles.cover, { paddingBottom: insets.bottom }, !ask.open && styles.hidden]}>
      <OwnerAsk onClose={() => ask.setOpen(false)} />
    </LookBackground>
  );
}

/** The cover's own ground, Night's like the chat, so nothing of the page shows round its edges. */
function LookBackground({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <LookContext.Provider value="dark">
      <NightGround style={style}>{children}</NightGround>
    </LookContext.Provider>
  );
}

function NightGround({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[style, { backgroundColor: colors.background }]} testID="owner-ask-sheet">
      {children}
    </View>
  );
}

/** True from the first time it opens: the chat is made then, and kept (hidden) after it's closed. */
function useOpened(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}

const styles = StyleSheet.create({
  dock: { borderLeftWidth: StyleSheet.hairlineWidth },
  cover: { ...StyleSheet.absoluteFill, zIndex: 10 },
  hidden: { display: 'none' },
});
