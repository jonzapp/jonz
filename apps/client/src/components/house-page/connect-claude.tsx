import * as Clipboard from 'expo-clipboard';
import { CopyIcon, ExternalLinkIcon, PlugZapIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { mcpAddress } from '@/api/base';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Row, RowIcon } from '@/components/row';
import { Sheet } from '@/components/sheet';
import { Body, Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';

/** Where Claude adds a custom connector. */
export const CLAUDE_CONNECTORS = 'https://claude.ai/settings/connectors';

/**
 * Connect Jonz to Claude, last under Connected apps: a row that opens the
 * three steps, with Jonz's MCP address to copy and a way into Claude's
 * connector settings.
 */
export function ConnectClaude() {
  const words = useWords();
  const toast = useToastIfAny();
  const [open, setOpen] = useState(false);
  const address = mcpAddress();
  return (
    <>
      <Row
        leading={<RowIcon icon={PlugZapIcon} />}
        title={words('people.connectClaude.title')}
        meta={words('people.connectClaude.meta')}
        chevron
        onPress={() => setOpen(true)}
        testID="connect-claude"
      />
      <Sheet visible={open} title={words('people.connectClaude.title')} onClose={() => setOpen(false)} testID="connect-claude-sheet">
        <View style={styles.steps}>
          <Body>{words('people.connectClaude.step1')}</Body>
          <Body>{words('people.connectClaude.step2')}</Body>
          <View style={styles.copy}>
            <Body style={styles.address} testID="mcp-address">
              {address}
            </Body>
            {/* eslint-disable-next-line jonz/button-in-row -- beside the address it copies, not a lone action */}
            <Button
              variant="outline"
              icon={CopyIcon}
              label={words('people.connectClaude.copy')}
              spoken={words('people.connectClaude.copySpoken')}
              onPress={() => void Clipboard.setStringAsync(address).then(() => toast?.show(words('house.page.copied', { plain: address })))}
              testID="copy-mcp-address"
            />
          </View>
          <Body>{words('people.connectClaude.step3')}</Body>
          <Meta>{words('people.connectClaude.other')}</Meta>
        </View>
        <ButtonRow>
          <Button
            variant="outline"
            icon={ExternalLinkIcon}
            label={words('people.connectClaude.open')}
            onPress={() => void Linking.openURL(CLAUDE_CONNECTORS)}
            testID="open-claude"
          />
        </ButtonRow>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  steps: { gap: SPACE.sm, marginBottom: SPACE.lg },
  copy: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  address: { flex: 1 },
});
