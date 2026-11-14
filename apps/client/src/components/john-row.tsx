import { doneFold, forfeitRoom, johnRow, monthOf, pocketMoney, pointsLabel, undoWarning, type BoardItem, type Currency, type HouseRules, type JohnRowPlan, type StakeView, type Words } from '@app/core';
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
import { useWords } from '@/hooks/use-words';

/** Who's looking, and how to name everyone: what every John's row needs. */
export interface JohnRowContext {
  houseId: string;
  userId: string;
  /** The zone times are said in: the reader's own clock when it's away from the house's, else the house's (`rules.timezone`). */
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
  const words = useWords();
  const sheet = useJohnSheet();
  const tick = useTick(context.houseId, item.id);
  const undo = useMove(context.houseId);
  const [asking, setAsking] = useState(false);
  // What lateness can still cost is capped at the stake, once a screen has read it.
  const stake = useCached<StakeView>(stakeKey(context.houseId)) ?? null;
  const plan = johnRow(item, { viewerId: context.userId, now: context.now, zone: context.zone, nameOf: context.nameOf, words });
  const open = () => sheet.open(item.id, plan.focus ?? undefined);
  const warning =
    plan.trailing === 'undo'
      ? undoWarning(item, context.rules, context.now, words, forfeitRoom(stake, item.userId, monthOf(item.dueAt, context.rules.timezone)))
      : null;
  // The confirm lasts only while the row offers Undo: when the John moves on
  // under it (a dispute lands, the tick stands), the question goes, and
  // stays gone should Undo come back. (Set while rendering, as React
  // suggests for state that follows other state.)
  if (asking && warning === null) setAsking(false);
  const undoNow = async () => {
    if (await undo.run(() => (item.coveredBy ? undoCover(item.id) : undoDone(item.id)))) setAsking(false);
  };

  return {
    plan,
    open,
    leading: leadingFor(plan, item, tick),
    trailing: trailingFor(plan, item, {
      undo: () => (warning ? setAsking(true) : void undoNow()),
      undoing: undo.pending,
      vote: open,
    }, context.rules.currency, words),
    // A refusal from the confirm is said in it, and under the row once it has gone.
    problem: tick.problem ?? (asking ? null : undo.problem),
    confirm: warning ? (
      <ConfirmSheet
        visible={asking}
        title={words('john.sheet.undoTitle', { john: item.name })}
        body={warning}
        confirmLabel={words('john.sheet.undoIt')}
        icon={Undo2Icon}
        busy={undo.pending}
        busyLabel={words('common.busy.undoing')}
        problem={undo.problem}
        onConfirm={() => void undoNow()}
        onClose={() => setAsking(false)}
        testID="undo-confirm"
      />
    ) : null,
  };
}

/** The row's leading item: the tick box, or a shield when excused. */
function leadingFor(plan: JohnRowPlan, item: BoardItem, tick: ReturnType<typeof useTick>): ReactNode {
  // A photo John's tick box goes to the camera (the file chooser, on the web) first.
  if (plan.ticks) {
    return (
      <TickBox
        state={tick.busy ? 'busy' : 'open'}
        label={plan.tickLabel}
        onPress={() => void (item.needsPhoto ? tick.tickWithPhoto('camera') : tick.tick())}
      />
    );
  }
  if (plan.tick === 'excused') return <RowIcon icon={ShieldIcon} />;
  return <TickBox state={plan.tick} label={plan.tickLabel} />;
}

/** The row's one trailing item, from its plan. */
function trailingFor(
  plan: JohnRowPlan,
  item: BoardItem,
  moves: { undo: () => void; undoing: boolean; vote: () => void },
  currency: Currency, words: Words,
): ReactNode {
  switch (plan.trailing) {
    case 'undo':
      return (
        <TextButton
          label={words('john.row.undo')}
          align="end"
          accessibilityLabel={words('today.nextUp.undo', { john: item.name })}
          disabled={moves.undoing}
          onPress={moves.undo}
        />
      );
    case 'vote':
      return (
        <TextButton
          label={words('week.summary.vote')}
          chevron
          align="end"
          accessibilityLabel={words('week.summary.voteOn', { john: item.name })}
          onPress={moves.vote}
        />
      );
    case 'points':
      // A kid's John in a family says what it earns.
      return item.payMinor ? pocketMoney(item.payMinor, currency, words) : pointsLabel(plan.points, words);
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
        lid={john.plan.lid ? (item.kindColour ?? 'other') : undefined}
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
  const words = useWords();
  const { colors } = useTheme();
  if (items.length === 0) return null;
  const fold = doneFold(items, words);
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
