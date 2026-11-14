import {
  forfeitRoom,
  johnSheetMode,
  monthOf,
  sheetKind,
  sheetWhen,
  STATUS_MARK,
  type BoardItem,
  type HouseRules,
  type StakeView,
  type WeekBoard,
} from '@app/core';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Housemate } from '@/api/board';
import { LidBar } from '@/components/lid';
import { STATUS_ICON } from '@/components/status-mark';
import { Lead, Meta } from '@/components/text';
import { INSET, MARK_GAP, SPACE, useTheme } from '@/theme';

import { ChangeResult } from './change-result';
import { TheirsChecking, YoursChecking } from './checking';
import { TheirsOpen, YoursOpen } from './open';
import { FlagPart } from './flag';
import { CrewPart, RollCall } from './roll-call';
import { Settled } from './settled';
import { PostReactions } from './reactions';
import { UndoPart } from './undo';
import { Disputed } from './vote';
import { JohnWhy } from './why';
import { useWords } from '@/hooks/use-words';
import { viewingOf } from './viewing';

/**
 * What the John sheet was opened for, when it was opened for something in
 * particular: the vote (Today's "Needs you"), a dispute (a housemate's
 * fresh tick on Week: the sheet shows its outline Dispute, and never opens
 * the form, keyboard and all, by itself), "If you can't" (Today's "Skip
 * with immunity ›" opens on the skip's sentence, ready to confirm), or the
 * swap itself.
 */
export type JohnSheetFocus = 'vote' | 'dispute' | 'cant' | 'swap';

/** Everything the John sheet's body knows besides the John: who's looking, the house, and the moment. */
export interface JohnSheetContext {
  houseId: string;
  /** Who's looking. */
  userId: string;
  /** The zone times are said in: the reader's own clock when it's away from the house's, else the house's (`rules.timezone`, which weeks and months keep to). */
  zone: string;
  /** The house's rules: the currency, the stake and what late and missed cost. */
  rules: HouseRules;
  now: Date;
  /** Anyone's name by id; "A former housemate" for someone who has left. */
  nameOf: (userId: string) => string;
  /** Who lives here, for the sentences that name them. */
  members: Housemate[];
  /** You in this house: your role and your tokens. */
  me: Housemate | null;
  /** This week's board, live: the other side of a swap, the house's open Johns. */
  board: WeekBoard;
  /** The Stake, when a screen has read it: it caps what lateness costs. */
  stake: StakeView | null;
  /** What it was opened for (Today's "Needs you" opens it on the vote). */
  focus: JohnSheetFocus | null;
  /** The Wall post it was opened from (an event's id), whose reactions it shows; null from anywhere else. */
  post: string | null;
  /** Put the sheet away (after a vote, say). */
  close: () => void;
}

/**
 * The John sheet's content for one John, live: its header, then what can
 * be done with it from here, by whose it is and where it has got to (core's
 * johnSheetMode). Yours and open: the tick, and "If you can't" while you
 * hold a token. Being checked: when it stands, and Undo for yours or
 * Dispute for a housemate's, under its photo if it has one. Then Undo for
 * any other move about it that can still be taken back (undo.tsx). Disputed: the reason, the tally and the vote.
 * Settled: the photo, if it had one (the header says what happened). An
 * open flag: Remove flag, for whoever raised it or an admin. A John
 * done together, or with help, says who's on it (crew.ts); ticking one is
 * its roll call, "Who did it?", in place of the rest. Then, whatever its
 * state, an admin's "Fix the result", the Wall post's reactions when it
 * was opened from one (reactions.tsx), and "Why?": why it's whose it is, and
 * what's at stake.
 */
export function JohnSheetBody({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const mode = johnSheetMode(item, context.userId);
  // "Who did it?" takes over the content until it's sent or cancelled; once sent, the John is being checked.
  const [rollCalling, setRollCalling] = useState(false);
  const calling = rollCalling && mode === 'yours-open';
  return (
    <View testID="john-sheet-body">
      <JohnSheetHeader item={item} context={context} />
      {calling ? (
        <RollCall item={item} context={context} onCancel={() => setRollCalling(false)} />
      ) : (
        <>
          <ModeContent item={item} context={context} onRollCall={() => setRollCalling(true)} />
          <UndoPart item={item} context={context} />
          <FlagPart item={item} context={context} />
          <CrewPart item={item} context={context} />
          <ChangeResult item={item} context={context} />
          <PostReactions context={context} />
        </>
      )}
      <JohnWhy item={item} context={context} />
    </View>
  );
}

function ModeContent({ item, context, onRollCall }: { item: BoardItem; context: JohnSheetContext; onRollCall: () => void }) {
  switch (johnSheetMode(item, context.userId)) {
    case 'yours-open':
      return <YoursOpen item={item} context={context} onRollCall={onRollCall} />;
    case 'theirs-open':
      return <TheirsOpen item={item} context={context} />;
    // Being checked: its photo first, what anyone deciding whether to dispute it needs to see.
    case 'yours-checking':
      return (
        <>
          <Settled item={item} context={context} />
          <YoursChecking item={item} context={context} />
        </>
      );
    case 'theirs-checking':
      return (
        <>
          <Settled item={item} context={context} />
          <TheirsChecking item={item} context={context} />
        </>
      );
    case 'yours-disputed':
    case 'theirs-disputed':
      return <Disputed item={item} context={context} />;
    case 'settled':
      return <Settled item={item} context={context} />;
  }
}

/**
 * The sheet's head: the lid bar before the kind, then the group, the
 * points and how often; the John's name in full as the Lead; then, while
 * it's to do, when it's due and what lateness costs its owner (capped at
 * what's left of their stake, once the Stake is read), and once it's
 * settled, what happened. The sheet sits on the pavement, so overdue,
 * disputed, late and missed are said in ink after their status's icon in
 * hazard, never in hazard words.
 */
function JohnSheetHeader({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const { colors, type } = useTheme();
  const room = forfeitRoom(context.stake, item.userId, monthOf(item.dueAt, context.rules.timezone));
  const when = sheetWhen(item, viewingOf(context, words), room);
  const icon = when.sign ? STATUS_MARK[when.sign].icon : null;
  const Sign = icon ? STATUS_ICON[icon] : null;
  return (
    <View style={styles.header}>
      {/* In full, as everything in the sheet is: it may take a second line. */}
      <View style={[styles.line, styles.top]}>
        <View style={styles.mark}>
          <LidBar lid={item.kindColour ?? 'other'} />
        </View>
        <Meta numberOfLines={2} style={styles.shrink}>
          {sheetKind(item, words)}
        </Meta>
      </View>
      <Lead header testID="john-sheet-name">
        {item.name}
      </Lead>
      <View style={styles.line}>
        {Sign ? <Sign size={16} color={colors.hazard} aria-hidden /> : null}
        <Text style={[type.meta, styles.shrink, Sign ? { color: colors.foreground } : null]} testID="john-sheet-when">
          {when.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The flush sheet sets content at the gutter; the John's words sit on the leading edge.
  header: { paddingHorizontal: INSET, gap: SPACE.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: MARK_GAP },
  top: { alignItems: 'flex-start' },
  // The dot centred on the first line of words.
  mark: { height: 20, justifyContent: 'center' },
  shrink: { flexShrink: 1 },
});
