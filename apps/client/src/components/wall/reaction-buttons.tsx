import { REACTION_LABEL, REACTIONS, type ReactionKind, type WallEvent } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';

import { REACTION_ICON } from './wall-row';

/**
 * A post's four reactions, each a toggle with its name and how many gave
 * it, yours chosen: yours to give or take back, the sheet staying open for
 * another. In a post's own sheet and in the John sheet a post opens.
 */
export function ReactionButtons({
  reactions,
  onReact,
}: {
  reactions: WallEvent['reactions'];
  onReact: (kind: ReactionKind, on: boolean) => void;
}) {
  const words = useWords();
  return (
    <View style={styles.list} testID="reactions">
      {REACTIONS.map((kind) => {
        const r = reactions[kind];
        return (
          <Button
            key={kind}
            variant="outline"
            icon={REACTION_ICON[kind]}
            label={words('wall.feed.reactionCount', { label: REACTION_LABEL[kind], count: r.count })}
            chosen={r.mine}
            onPress={() => onReact(kind, !r.mine)}
            testID={`react-${kind}`}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
});
