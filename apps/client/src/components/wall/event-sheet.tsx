import { REACTION_LABEL, REACTIONS, type ReactionKind, type WallFeedRow } from '@app/core';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { SPACE } from '@/theme';

import { REACTION_ICON } from './wall-row';
import { useWords } from '@/hooks/use-words';

/**
 * One event in full, from a Wall row: its sentence as the sheet's Lead and
 * its meta line's words with the day and the time, none of it cut short.
 * Where it takes reactions, all four follow, each a toggle with its name and
 * how many gave it, yours to give or take back with the sheet staying open
 * for another. Above them, Undo for the move it records, while that can
 * still be undone. `problem` is the database's refusal, shown here where the
 * move was made.
 */
export function WallEventSheet({
  row,
  problem,
  onReact,
  onClose,
  undo,
}: {
  /** Undo for the move the post records, while it can still be undone (UndoMove). */
  undo?: ReactNode;
  /** The event, or null for none: the sheet is put away. */
  row: WallFeedRow | null;
  problem: string | null;
  onReact: (kind: ReactionKind, on: boolean) => void;
  onClose: () => void;
}) {
  const words = useWords();
  return (
    <Sheet visible={row !== null} title={row?.title} description={row?.full} onClose={onClose} testID="wall-sheet">
      {problem ? <Alert message={problem} /> : null}
      {undo ? <View style={styles.list}>{undo}</View> : null}
      {row?.reactable ? (
        <View style={styles.list}>
          {REACTIONS.map((kind) => {
            const r = row.reactions[kind];
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
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm, marginTop: SPACE.sm },
});
