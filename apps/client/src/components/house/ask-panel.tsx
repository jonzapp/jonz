import { SHELL_COPY } from '@app/core';
import { router } from 'expo-router';
import { XIcon } from 'lucide-react-native';
import { useContext } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AskJonz } from '@/components/house/ask-jonz';
import { TitleBar } from '@/components/title-bar';
import { IconButton } from '@/components/icon-button';
import { AskPanelContext } from '@/hooks/use-ask-jonz';
import { useTheme, WIDE } from '@/theme';

/** The panel's width beside the page; a little less on a narrow laptop so the page keeps its room. */
const PANEL = 400;
const PANEL_SHARE = 0.36;

/**
 * The chat with Jonz down the right of the window, from WIDE, while it's
 * open: its own title bar with a close button, the chat under it, and the
 * page still there to its left. Closing it puts the chat away (it's kept,
 * to pick up again from the start); anything applied stays applied.
 */
export function AskPanel({ houseId, userId }: { houseId: string; userId: string }) {
  const panel = useContext(AskPanelContext);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  if (!panel?.open || width < WIDE) return null;
  const close = () => panel.setOpen(false);
  return (
    <View
      style={[styles.panel, { width: Math.min(PANEL, width * PANEL_SHARE), borderLeftColor: colors.border }]}
      testID="ask-panel"
    >
      <AskJonz
        houseId={houseId}
        userId={userId}
        bar={(title, actions) => (
          <TitleBar
            title={title}
            right={
              <View style={styles.actions}>
                {actions}
                <IconButton icon={XIcon} label={SHELL_COPY.close} onPress={close} testID="ask-close" />
              </View>
            }
          />
        )}
        onOpenList={() => router.navigate('/house/johns')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderLeftWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row' },
});
