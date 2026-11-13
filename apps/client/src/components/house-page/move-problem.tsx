import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { SPACE } from '@/theme';

/** Why a row's move didn't go through, under the row and in line with it; nothing when it did. */
export function MoveProblem({ message, inset }: { message: string | null; inset: number }) {
  if (!message) return null;
  return (
    <View style={[styles.problem, { paddingHorizontal: inset }]}>
      <Alert message={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  problem: { marginBottom: SPACE.lg },
});
