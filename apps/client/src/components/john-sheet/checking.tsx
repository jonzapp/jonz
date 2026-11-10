import { forfeitRoom, monthOf, tickedLine, undoWarning, type BoardItem } from '@app/core';
import { FlagIcon, Undo2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { undoCover, undoDone } from '@/api/johns';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { DisputeForm } from '@/components/dispute';
import { Body } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';

import type { JohnSheetContext } from './body';
import { AwaitsOk } from './parent-ok';
import { SheetLines } from './parts';
import { useWords } from '@/hooks/use-words';

/**
 * Your tick, being checked: when it stands, and Undo meanwhile. Past the
 * John's due time an undo makes it late, so Undo turns into the sentence
 * that says so, with "Undo it" and "Cancel", in place. A cover of a
 * housemate's John is yours to undo too, with nothing to warn about: it
 * just goes back to them.
 */
export function YoursChecking({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const move = useMove(context.houseId);
  const [asking, setAsking] = useState(false);
  const warning = undoWarning(item, context.rules, context.now, words, forfeitRoom(context.stake, item.userId, monthOf(item.dueAt, context.zone)));
  // A roll call is taken back from the place it was ticked from, and with it every place it settled.
  const undo = () => void move.run(() => (item.coveredBy ? undoCover(item.id) : undoDone(item.crew?.tickedFrom ?? item.id)));
  return (
    <SheetLines>
      <Body testID="ticked-line">{tickedLine(item, context.members, context.userId, context.rules, context.now, words)}</Body>
      {asking && warning ? (
        <View style={styles.asking} testID="undo-warning">
          <Body>{warning}</Body>
          <ButtonRow>
            <Button
              variant="hazard"
              icon={Undo2Icon}
              label={words('john.sheet.undoIt')}
              busy={move.pending}
              busyLabel={words('common.busy.undoing')}
              onPress={undo}
              testID="sheet-undo-it"
            />
            <Button variant="ghost" label={words('common.shell.cancel')} onPress={() => setAsking(false)} />
          </ButtonRow>
        </View>
      ) : (
        <Button
          variant="outline"
          icon={Undo2Icon}
          label={words('john.row.undo')}
          busy={move.pending}
          busyLabel={words('common.busy.undoing')}
          onPress={warning ? () => setAsking(true) : undo}
          testID="sheet-undo"
        />
      )}
      {move.problem ? <Alert message={move.problem} /> : null}
    </SheetLines>
  );
}

/**
 * A housemate's fresh tick: who ticked it and when it stands, and an
 * outline Dispute, which opens "What's wrong with it" and "Put it to the
 * house" in place. Only that press opens the form (and its keyboard), even
 * when the sheet was opened to dispute: most who look are just looking. In
 * a family, a kid's tick waits for a parent's OK instead (parent-ok.tsx).
 */
export function TheirsChecking({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const [disputing, setDisputing] = useState(false);
  // In a family a kid's tick waits for a parent's OK instead: nobody disputes it.
  if (item.awaitsOk) return <AwaitsOk item={item} context={context} />;
  return (
    <SheetLines>
      <Body testID="ticked-line">{tickedLine(item, context.members, context.userId, context.rules, context.now, words)}</Body>
      {item.coveredBy && item.userId === context.userId ? (
        // A housemate covered your John: the rest of the house checks the cover, not you.
        <Body testID="cover-of-yours">{words('john.sheet.coverOfYours', { name: context.nameOf(item.coveredBy) })}</Body>
      ) : disputing ? (
        <DisputeForm houseId={context.houseId} assignmentId={item.id} />
      ) : (
        <Button variant="outline" icon={FlagIcon} label={words('john.dispute.open')} onPress={() => setDisputing(true)} testID="dispute" />
      )}
    </SheetLines>
  );
}

const styles = StyleSheet.create({
  asking: { gap: SPACE.sm },
});
