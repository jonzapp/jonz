import {
  doneFold,
  forfeitRoom,
  JOHN_COPY,
  JOHN_SHEET_COPY,
  johnRow,
  monthOf,
  NEXT_UP_COPY,
  pocketMoney,
  pointsLabel,
  undoWarning,
  WEEK_SUMMARY_COPY,
  type BoardItem,
  type Currency,
  type HouseRules,
  type JohnRowPlan,
  type StakeView,
  BUSY_COPY,
} from '@app/core';
import { ClockIcon, ShieldIcon, Undo2Icon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { undoCover, undoDone } from '@/api/johns';
import { Alert } from '@/components/alert';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Fold } from '@/components/fold';
import { GroupItem } from '@/components/group';
import { useJohnSheet } from '@/components/john-sheet';
import { useCached } from '@/components/john-sheet/cached';
import { Row, RowIcon } from '@/components/row';
import { StatusMark } from '@/components/status-mark';
import { Body } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TickBox } from '@/components/tick-box';
import { stakeKey } from '@/hooks/keys';
import { useMove } from '@/hooks/use-move';
import { useTick } from '@/hooks/use-tick';
import { FONT, SPACE, useTheme } from '@/theme';

/** Who's looking, and how to name everyone: what every John's row needs. */
export interface JohnRowContext {
  houseId: string;
  userId: string;
  zone: string;
  /** The house's rules: what lateness costs, for an undo that would make a John late. */
  rules: HouseRules;
  now: Date;
  /** Anyone's full name by id, or null for someone who has left. */
  nameOf: (userId: string) => string | null;
}

/**
 * One John as a row, wherever it's drawn (Today, Week's groups and its
 * table): its plan from core's johnRow (what the tick box shows and whether
 * it ticks, the meta line, the one trailing item, what the sheet opens on),
 * the tick box, the trailing item, and opening its John sheet. `problem` is
 * the refusal of a tick or an undo made here. An undo that would make the
 * John late (after its due time) asks first: `confirm` is that sheet, to
 * draw beside the row.
 */
export function useJohnRow(item: BoardItem, context: JohnRowContext) {
  const sheet = useJohnSheet();
  const tick = useTick(context.houseId, item.id);
  const undo = useMove(context.houseId);
  const [asking, setAsking] = useState(false);
  // What lateness can still cost is capped at the stake, once a screen has read it.
  const stake = useCached<StakeView>(stakeKey(context.houseId)) ?? null;
  const plan = johnRow(item, context.userId, context.now, context.zone, context.nameOf);
  const open = () => sheet.open(item.id, plan.focus ?? undefined);
  const warning =
    plan.trailing === 'undo'
      ? undoWarning(item, context.rules, context.now, forfeitRoom(stake, item.userId, monthOf(item.dueAt, context.zone)))
      : null;
  // The confirm lasts only while the row offers Undo: when the John moves on
  // under it (a dispute lands, the tick stands), the question goes, and
  // stays gone should Undo come back. (Set while rendering, as React
  // suggests for state that follows other state.)
  if (asking && warning === null) setAsking(false);
  const undoNow = async () => {
    if (await undo.run(() => (item.coveredBy ? undoCover(item.id) : undoDone(item.id)))) setAsking(false);
  };

  // A photo John's tick box goes to the camera (the file chooser, on the web) first.
  const leading = plan.ticks ? (
    <TickBox
      state={tick.busy ? 'busy' : 'open'}
      label={plan.tickLabel}
      onPress={() => void (item.needsPhoto ? tick.tickWithPhoto('camera') : tick.tick())}
    />
  ) : plan.tick === 'excused' ? (
    <RowIcon icon={ShieldIcon} />
  ) : (
    <TickBox state={plan.tick} label={plan.tickLabel} />
  );

  return {
    plan,
    open,
    leading,
    trailing: trailingFor(plan, item, {
      undo: () => (warning ? setAsking(true) : void undoNow()),
      undoing: undo.pending,
      vote: open,
    }, context.rules.currency),
    // A refusal from the confirm is said in it, and under the row once it has gone.
    problem: tick.problem ?? (asking ? null : undo.problem),
    confirm: warning ? (
      <ConfirmSheet
        visible={asking}
        title={JOHN_SHEET_COPY.undoTitle(item.name)}
        body={warning}
        confirmLabel={JOHN_SHEET_COPY.undoIt}
        icon={Undo2Icon}
        busy={undo.pending}
        busyLabel={BUSY_COPY.undoing}
        problem={undo.problem}
        onConfirm={() => void undoNow()}
        onClose={() => setAsking(false)}
        testID="undo-confirm"
      />
    ) : null,
  };
}

/** The row's one trailing item, from its plan. */
function trailingFor(
  plan: JohnRowPlan,
  item: BoardItem,
  moves: { undo: () => void; undoing: boolean; vote: () => void },
  currency: Currency,
): ReactNode {
  switch (plan.trailing) {
    case 'undo':
      return (
        <TextButton
          label={JOHN_COPY.undo}
          align="end"
          accessibilityLabel={NEXT_UP_COPY.undo(item.name)}
          disabled={moves.undoing}
          onPress={moves.undo}
        />
      );
    case 'vote':
      return (
        <TextButton
          label={WEEK_SUMMARY_COPY.vote}
          chevron
          align="end"
          accessibilityLabel={WEEK_SUMMARY_COPY.voteOn(item.name)}
          onPress={moves.vote}
        />
      );
    case 'points':
      // A kid's John in a family says what it earns.
      return item.payMinor ? pocketMoney(item.payMinor, currency) : pointsLabel(plan.points);
    case 'status':
      return <StatusMark status={item.status} />;
    default:
      return null;
  }
}

/**
 * A John as a row: the tick box (yours ticks from it), the name, the meta
 * line, and one trailing item; the 4pt hazard edge when it's overdue or
 * missed. Tapping it opens the John sheet. A refusal shows under it, where
 * the move was made.
 */
export function JohnRow({ item, context, testID }: { item: BoardItem; context: JohnRowContext; testID: string }) {
  const john = useJohnRow(item, context);
  return (
    <>
      {/* A John's name is never cut short, nor when it's due. */}
      <Row
        title={item.name}
        titleLines={2}
        meta={john.plan.meta}
        metaLines={2}
        lid={john.plan.lid ? item.category : undefined}
        leading={john.leading}
        trailing={john.trailing}
        hazardEdge={john.plan.hazardEdge}
        onPress={john.open}
        testID={testID}
      />
      {john.confirm}
      {john.problem ? (
        <GroupItem>
          <Alert message={john.problem} />
        </GroupItem>
      ) : null}
    </>
  );
}

/**
 * Finished Johns, folded away at the end of a group: "Done (2)", then how
 * many of those were late in hazard words after late's clock. Nothing when
 * there are none.
 */
export function DoneFold({ items, children }: { items: readonly BoardItem[]; children: ReactNode }) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  const fold = doneFold(items);
  return (
    <Fold
      label={fold.label}
      meta={
        fold.late ? (
          <View style={styles.late}>
            <ClockIcon size={16} color={colors.hazard} aria-hidden />
            <Body numberOfLines={1} style={[styles.lateWords, { color: colors.hazard }]}>
              {fold.late}
            </Body>
          </View>
        ) : undefined
      }
      testID="done-fold"
    >
      {children}
    </Fold>
  );
}

const styles = StyleSheet.create({
  late: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  lateWords: { fontFamily: FONT.bold },
});
