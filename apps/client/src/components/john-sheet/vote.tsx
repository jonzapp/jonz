import {
  DISPUTE_COPY,
  FOCUS_SHELL_COPY,
  JOHN_COPY,
  JOHN_SHEET_COPY,
  voteCloses,
  votersOn,
  voteTally,
  type BoardItem,
  type DisputeView,
  BUSY_COPY,
} from '@app/core';
import { CameraIcon, CheckIcon, ImagesIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { answerDispute, castVote } from '@/api/disputes';
import { pickPhoto, uploadProof } from '@/api/photos';
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
 * beside whoever raised it, the tally, and, for whoever may vote, the vote
 * in the tally's order. Whoever ticked it can answer with a photo: with only
 * one voter that settles it. On a cover, whoever's John it was only hears
 * that the rest of the house is checking it (dispute.ts votersOn).
 */
export function Disputed({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const dispute = item.dispute;
  const ticker = item.coveredBy ?? item.userId;
  const mine = ticker === context.userId;
  const ownsCover = Boolean(item.coveredBy) && item.userId === context.userId;
  if (!dispute) return null;
  const voters = votersOn(
    context.members.map((m) => m.userId),
    { userId: item.userId, coveredBy: item.coveredBy },
  );
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
        <>
          <Body testID="your-tick">
            {dispute.answered
              ? JOHN_SHEET_COPY.answered
              : voters.length === 1
                ? JOHN_SHEET_COPY.onlyVoter(context.nameOf(voters[0]), voteCloses(dispute.closesAt, context.now))
                : JOHN_SHEET_COPY.yourTick}
          </Body>
          {dispute.answered ? null : <AnswerWithPhoto houseId={context.houseId} assignmentId={dispute.assignmentId} disputeId={dispute.id} onDone={context.close} />}
        </>
      ) : ownsCover ? (
        <Body testID="cover-of-yours">{JOHN_SHEET_COPY.coverOfYours(context.nameOf(ticker))}</Body>
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
  // Which vote is waiting: the two share one move.
  const [upholding, setUpholding] = useState(false);
  const offer = useUndoOffer(houseId);

  async function vote(uphold: boolean) {
    setUpholding(uphold);
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
            busy={move.pending && !upholding}
            busyLabel={BUSY_COPY.voting}
            onPress={() => void vote(false)}
            testID="vote-fine"
          />
          <Button
            variant="outline"
            chosen={dispute.myVote === true}
            icon={dispute.myVote === true ? CheckIcon : ThumbsDownIcon}
            label={DISPUTE_COPY.notDone}
            busy={move.pending && upholding}
            busyLabel={BUSY_COPY.voting}
            onPress={() => void vote(true)}
            testID="vote-not-done"
          />
        </ButtonRow>
      </View>
      {move.problem ? <Alert message={move.problem} /> : null}
    </>
  );
}

/**
 * A photo of it done, from the camera or the library, for a question on
 * your tick: uploaded to the John's folder, then answer_dispute.
 */
function AnswerWithPhoto({
  houseId,
  assignmentId,
  disputeId,
  onDone,
}: {
  houseId: string;
  assignmentId: string;
  disputeId: string;
  onDone: () => void;
}) {
  const move = useMove(houseId);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [from, setFrom] = useState<'camera' | 'library'>('camera');

  async function answer(source: 'camera' | 'library') {
    setProblem(null);
    setFrom(source);
    let uri: string | null;
    try {
      uri = await pickPhoto(source);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : JOHN_COPY.photoFailed);
      return;
    }
    if (!uri) return;
    setUploading(true);
    let path: string;
    try {
      path = await uploadProof(houseId, assignmentId, uri);
    } catch {
      setProblem(JOHN_COPY.photoFailed);
      return;
    } finally {
      setUploading(false);
    }
    if (await move.run(() => answerDispute(disputeId, path))) onDone();
  }

  const busy = move.pending || uploading;
  return (
    <>
      <View style={styles.pair}>
        <ButtonRow>
          <Button
            variant="outline"
            icon={CameraIcon}
            label={JOHN_SHEET_COPY.answerPhoto}
            busy={busy && from === 'camera'}
            busyLabel={uploading ? JOHN_COPY.uploading : BUSY_COPY.sending}
            onPress={() => void answer('camera')}
            testID="answer-photo"
          />
          <Button
            variant="outline"
            icon={ImagesIcon}
            label={JOHN_SHEET_COPY.fromLibrary}
            busy={busy && from === 'library'}
            busyLabel={uploading ? JOHN_COPY.uploading : BUSY_COPY.sending}
            onPress={() => void answer('library')}
            testID="answer-library"
          />
        </ButtonRow>
      </View>
      {problem ?? move.problem ? <Alert message={(problem ?? move.problem)!} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  shrink: { flexShrink: 1 },
  pair: { marginTop: SPACE.sm },
});
