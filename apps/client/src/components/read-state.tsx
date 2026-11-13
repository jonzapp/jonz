import { RefreshCwIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

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
  failed: { gap: SPACE.lg },
});
