import { DISPUTE_COPY, FOCUS_SHELL_COPY, JOHN_SHEET_COPY, voteTally, type BoardItem, type DisputeView } from '@app/core';
import { CheckIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { castVote } from '@/api/disputes';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Body, Meta } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { SPACE } from '@/theme';

import type { JohnSheetContext } from './body';
import { SheetLines } from './parts';

/**
 * A disputed John: the reason in body ink (a house decision, not an error)
 * beside whoever raised it, the tally, and, for anyone but the owner, the
 * vote in the tally's order. The owner only hears that the house is voting.
 */
export function Disputed({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const dispute = item.dispute;
  const mine = item.userId === context.userId;
  if (!dispute) return null;
  return (
    <SheetLines testID="dispute-note">
      <View style={styles.reason}>
        <Avatar
          name={dispute.raisedBy ? context.nameOf(dispute.raisedBy) : FOCUS_SHELL_COPY.formerHousemate}
          userId={dispute.raisedBy}
          me={dispute.raisedBy === context.userId}
        />
        <Body style={styles.shrink}>{`“${dispute.reason}”`}</Body>
      </View>
      <Meta testID="tally">{voteTally(dispute, context.now)}</Meta>
      {mine ? (
        <Body>{JOHN_SHEET_COPY.yourTick}</Body>
      ) : (
        <SheetVote houseId={context.houseId} dispute={dispute} onVoted={context.close} />
      )}
    </SheetLines>
  );
}

/**
 * Two equal outline buttons, "It's fine" then "Not done", your vote shown
 * chosen, with a tick in place of its thumb so it shows at a glance. A vote
 * counted closes the sheet and says where to change it.
 */
function SheetVote({ houseId, dispute, onVoted }: { houseId: string; dispute: DisputeView; onVoted: () => void }) {
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);

  async function vote(uphold: boolean) {
    if (await move.run(() => castVote(dispute.id, uphold))) {
      onVoted();
      offer(JOHN_SHEET_COPY.voted, 'vote', dispute.id);
    }
  }

  return (
    <>
      <View style={styles.pair}>
        <ButtonRow>
          <Button
            variant="outline"
            chosen={dispute.myVote === false}
            icon={dispute.myVote === false ? CheckIcon : ThumbsUpIcon}
            label={DISPUTE_COPY.done}
            disabled={move.pending}
            onPress={() => void vote(false)}
            testID="vote-fine"
          />
          <Button
            variant="outline"
            chosen={dispute.myVote === true}
            icon={dispute.myVote === true ? CheckIcon : ThumbsDownIcon}
            label={DISPUTE_COPY.notDone}
            disabled={move.pending}
            onPress={() => void vote(true)}
            testID="vote-not-done"
          />
        </ButtonRow>
      </View>
      {move.problem ? <Alert message={move.problem} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  shrink: { flexShrink: 1 },
  pair: { marginTop: SPACE.sm },
});
