import { ASSISTANTS, type AssistantId } from '@app/core';
import { ExternalLinkIcon, PlugZapIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { mcpAddress } from '@/api/base';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Doc } from '@/components/reply/reply';
import { Row, RowIcon } from '@/components/row';
import { Segmented } from '@/components/segmented';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';

/** How many assistants share one row of the choice before it wraps (more can be added to ASSISTANTS). */
const PER_ROW = 3;

/**
 * Connect your AI assistant, last under Connected apps: a row that opens
 * one sheet for every assistant in ASSISTANTS. The choice at the top
 * (Claude, ChatGPT) switches the steps under it: that assistant's own
 * words, in Markdown, with Jonz's MCP address to copy, its note, and a way
 * into its settings.
 */
export function ConnectAssistant() {
  const words = useWords();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<AssistantId>(ASSISTANTS[0].id);
  const assistant = ASSISTANTS.find((a) => a.id === chosen) ?? ASSISTANTS[0];
  return (
    <>
      <Row
        leading={<RowIcon icon={PlugZapIcon} />}
        title={words('people.connectApp.title')}
        meta={words('people.connectApp.meta')}
        chevron
        onPress={() => setOpen(true)}
        testID="connect-assistant"
      />
      <Sheet visible={open} title={words('people.connectApp.title')} onClose={() => setOpen(false)} testID="connect-assistant-sheet">
        <View style={styles.steps}>
          <Segmented
            label={words('people.connectApp.which')}
            options={ASSISTANTS.map((a) => ({ value: a.id, label: a.name }))}
            value={assistant.id}
            onChange={setChosen}
            perRow={Math.min(ASSISTANTS.length, PER_ROW)}
            testID="assistant-choice"
          />
          <Doc source={words(`people.connectApp.${assistant.id}.steps`, { address: mcpAddress() })} testID={`assistant-steps-${assistant.id}`} />
          <Meta>{words(`people.connectApp.${assistant.id}.note`)}</Meta>
          <Meta>{words('people.connectApp.other')}</Meta>
        </View>
        <ButtonRow>
          <Button
            variant="outline"
            icon={ExternalLinkIcon}
            label={words(`people.connectApp.${assistant.id}.open`)}
            onPress={() => void Linking.openURL(assistant.settings)}
            testID="open-assistant"
          />
        </ButtonRow>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  steps: { gap: SPACE.md, marginBottom: SPACE.lg },
});
