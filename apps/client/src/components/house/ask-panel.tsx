import { router } from 'expo-router';
import { XIcon } from 'lucide-react-native';
import { useContext } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AskJonz } from '@/components/house/ask-jonz';
import { TitleBar } from '@/components/title-bar';
import { IconButton } from '@/components/icon-button';
import { AskPanelContext, askPanelWidth } from '@/hooks/use-ask-jonz';
import { useTheme, WIDE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * The chat with Jonz down the right of the window, from WIDE, while it's
 * open: its own title bar with Close at its edge, the chat under it, and the
 * page still there to its left. Closing it puts the chat away (it's kept,
 * to pick up again from the start); anything applied stays applied.
 */
export function AskPanel({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const panel = useContext(AskPanelContext);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  if (!panel?.open || width < WIDE) return null;
  const close = () => panel.setOpen(false);
  return (
    <View
      style={[styles.panel, { width: askPanelWidth(width), borderLeftColor: colors.border }]}
      testID="ask-panel"
    >
      <AskJonz
        houseId={houseId}
        userId={userId}
        bar={({ title, lead, actions, back }) => (
          <TitleBar
            title={title}
            lead={lead}
            onBack={back?.onPress}
            backLabel={back?.label}
            docked
            // New chat, Help, then Close at the edge.
            right={actions}
            end={<IconButton icon={XIcon} label={words('common.shell.close')} onPress={close} testID="ask-close" />}
          />
        )}
        onOpenList={() => router.navigate('/house/johns')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderLeftWidth: StyleSheet.hairlineWidth },
});
