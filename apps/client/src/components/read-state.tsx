import { RefreshCwIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * The old way to show a first read on its way: a bare spinner, named for a
 * screen reader. Use `Waiting` (waiting.tsx) with the part's outline instead;
 * the lint rule `jonz/no-bare-spinner` lists what still uses this.
 */
export function Reading({ label }: { label?: string }) {
  const words = useWords();
  label ??= words('common.shell.reading');
  const { colors } = useTheme();
  return <ActivityIndicator color={colors.foreground} accessibilityLabel={label} style={styles.reading} />;
}

/** A read that failed (offline, say): the sentence, and "Try again". */
export function ReadFailed({
  message,
  onRetry,
  testID,
}: {
  message?: string;
  onRetry: () => void;
  testID?: string;
}) {
  const words = useWords();
  message ??= words('common.shell.unreadable');
  return (
    <View style={styles.failed} testID={testID}>
      <Alert message={message} />
      <ButtonRow atEdge>
        <Button variant="outline" icon={RefreshCwIcon} label={words('common.shell.retry')} onPress={onRetry} />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  reading: { marginTop: SPACE.xxl },
  failed: { gap: SPACE.lg },
});
