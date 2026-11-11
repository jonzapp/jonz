import { cantOptions, coverOffer, firstName, dueInLine, holdable, plannable, swapChoice, type BoardItem, type CantOptions } from '@app/core';
import { CameraIcon, CheckIcon, HandIcon, ImagesIcon, RepeatIcon, ShieldIcon, UsersIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { holdCover, spendImmunity, spendSwap } from '@/api/johns';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { GroupItem } from '@/components/group';
import { PlanIt } from '@/components/plan-it';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { SheetAnchor } from '@/components/sheet';
import { StatusMark } from '@/components/status-mark';
import { Body } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { useTick } from '@/hooks/use-tick';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { SPACE, useTheme } from '@/theme';

import type { JohnSheetContext, JohnSheetFocus } from './body';
import { SheetLines, SheetSection } from './parts';
import { useWords } from '@/hooks/use-words';

/**
 * Your open John: amber "Mark done" and a photo with it (a photo John
 * leads with the camera, then the library), then "Done with help", which
 * opens the roll call; a John done together is ticked by its roll call, so
 * its one button opens that. Then Plan it, or when it's planned for. While you hold a token, "If you can't": skip
 * it with immunity, or swap it for a housemate's. The swap takes over the
 * sheet's content until it's done or cancelled. Opened at "If you can't"
 * with only one of the two to offer, it starts on that one: the skip's
 * sentence, or the swap.
 */
export function YoursOpen({ item, context, onRollCall }: { item: BoardItem; context: JohnSheetContext; onRollCall: () => void }) {
  const words = useWords();
  const tick = useTick(context.houseId, item.id);
  const cant = cantOptions(item, context.board, context.me);
  const atCant = context.focus === 'cant' && cant !== null;
  const [swapping, setSwapping] = useState(context.focus === 'swap' || (atCant && cant.immunity === 0));

  // The swap list follows the house: if every other John goes, so does the swap.
  if (swapping && cant && cant.swapFor.length > 0) {
    return <SwapPicker item={item} cant={cant} context={context} onCancel={() => setSwapping(false)} />;
  }

  return (
    <>
      <SheetLines testID="tick-actions">
        {item.jobId ? (
          <Button
            icon={item.needsPhoto ? CameraIcon : CheckIcon}
            label={words('john.row.markDone')}
            onPress={onRollCall}
            testID="sheet-mark-done"
          />
        ) : item.needsPhoto ? (
          <>
            <Button
              icon={CameraIcon}
label={words('today.nextUp.takePhoto')}
              busy={tick.waiting === 'camera'}
              busyLabel={tick.busyLabel}
              disabled={tick.held('camera')}
              onPress={() => void tick.tickWithPhoto('camera')}
              testID="sheet-mark-done"
            />
            <Button
              variant="outline"
              icon={ImagesIcon}
label={words('john.sheet.fromLibrary')}
              busy={tick.waiting === 'library'}
              busyLabel={tick.busyLabel}
              disabled={tick.held('library')}
              onPress={() => void tick.tickWithPhoto('library')}
            />
          </>
        ) : (
          <>
            <Button
              icon={CheckIcon}
label={words('john.row.markDone')}
              busy={tick.waiting === 'tick'}
              busyLabel={tick.busyLabel}
              disabled={tick.held('tick')}
              onPress={() => void tick.tick()}
              testID="sheet-mark-done"
            />
            <Button
              variant="outline"
              icon={CameraIcon}
label={words('john.sheet.addPhoto')}
              busy={tick.waiting === 'camera'}
              busyLabel={tick.busyLabel}
              disabled={tick.held('camera')}
              onPress={() => void tick.tickWithPhoto('camera')}
            />
          </>
        )}
        {item.jobId ? null : (
          <Button variant="ghost" icon={UsersIcon} label={words('john.crew.withHelp')} disabled={tick.waiting !== null} onPress={onRollCall} testID="done-with-help" />
        )}
        {tick.problem ? <Alert message={tick.problem} /> : null}
        <OnIt item={item} context={context} />
        {plannable(item, context.userId) ? (
          <PlanIt
            houseId={context.houseId}
            item={item}
            zone={context.zone}
            now={context.now}
            bestTime={context.me?.prefs.bestTime ?? null}
            inline
            testID="sheet-plan-it"
          />
        ) : null}
      </SheetLines>
      {cant ? (
        <IfYouCant
          item={item}
          cant={cant}
          context={context}
          skipFirst={atCant && cant.swapFor.length === 0}
          onSwap={() => setSwapping(true)}
        />
      ) : null}
    </>
  );
}

/**
 * Once housemates can cover your overdue John: "I'm on it" holds covers off
 * for 2 hours, once; after that, the line saying until when.
 */
function OnIt({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const move = useMove(context.houseId);
  const { now, rules, userId } = context;
  if (item.heldUntil && item.heldUntil > now && !item.doneAt) {
    return <Body testID="cover-held">{words('john.sheet.held', { when: dueInLine(item.heldUntil, now, rules.timezone, words) })}</Body>;
  }
  if (!holdable({ ...item, excused: item.status === 'excused' }, userId, now, rules.coverGraceHours)) return null;
  return (
    <>
      <Row
        leading={<RowIcon icon={HandIcon} />}
        title={words('john.sheet.onIt')}
        meta={words('john.sheet.onItMeta')}
        disabled={move.pending}
        onPress={() => void move.run(() => holdCover(item.id))}
        testID="on-it"
      />
      {move.problem ? <Alert message={move.problem} /> : null}
    </>
  );
}

/**
 * "If you can't": skipping with immunity turns its row into the sentence it
 * means, with "Skip it" and "Cancel"; swapping opens the swap. Each row only
 * with what it needs (the token; for a swap, a housemate's open John).
 */
function IfYouCant({
  item,
  cant,
  context,
  skipFirst,
  onSwap,
}: {
  item: BoardItem;
  cant: CantOptions;
  context: JohnSheetContext;
  /** Start on the skip's sentence (opened from Today's "Skip with immunity ›"). */
  skipFirst: boolean;
  onSwap: () => void;
}) {
  const words = useWords();
  const move = useMove(context.houseId);
  const offer = useUndoOffer(context.houseId);
  const [skipping, setSkipping] = useState(skipFirst);
  // Opened at "If you can't" with more above it than fits, the sheet starts scrolled here.
  const anchor: JohnSheetFocus = 'cant';
  return (
    <SheetSection>
      <SheetAnchor name={anchor}>
        <Section label={words('john.sheet.cant')} testID="if-you-cant">
          {cant.immunity > 0 ? (
            skipping ? (
              <GroupItem testID="skip-confirm">
                <Body>{words('john.sheet.skipSentence', { john: item.name, left: cant.immunity - 1 })}</Body>
                <ButtonRow>
                  <Button
                    variant="outline"
                    icon={ShieldIcon}
                    label={words('john.sheet.skipIt')}
                    busy={move.pending}
                    busyLabel={words('john.sheet.skipping')}
                    onPress={() =>
                      void move.run(() => spendImmunity(item.id)).then((done) => {
                        if (done) offer(words('wall.history.immunity'), 'immunity', item.id);
                      })
                    }
                    testID="skip-it"
                  />
                  <Button variant="ghost" label={words('common.shell.cancel')} onPress={() => setSkipping(false)} />
                </ButtonRow>
                {move.problem ? <Alert message={move.problem} /> : null}
              </GroupItem>
            ) : (
              <Row
                leading={<RowIcon icon={ShieldIcon} />}
                title={words('john.sheet.skip')}
                meta={words('john.sheet.skipMeta', { skips: cant.immunity })}
                chevron
                onPress={() => setSkipping(true)}
                testID="skip-row"
              />
            )
          ) : null}
          {cant.swapFor.length > 0 ? (
            <Row
              leading={<RowIcon icon={RepeatIcon} />}
              title={words('john.sheet.swap')}
              meta={words('john.sheet.swapMeta')}
              chevron
              onPress={onSwap}
              testID="swap-row"
            />
          ) : null}
        </Section>
      </SheetAnchor>
    </SheetSection>
  );
}

/**
 * The swap: the housemates' open Johns this week to pick one from, one
 * choice of n (an overdue one says so: the hazard edge and its mark, since
 * taking it on takes on what it costs), then "Swap them" (the sheet's one
 * amber). The one picked is ticked at the end of its row, in place of its
 * mark. Done, the sheet goes: the John it was opened on is someone else's
 * now.
 */
function SwapPicker({
  item,
  cant,
  context,
  onCancel,
}: {
  item: BoardItem;
  cant: CantOptions;
  context: JohnSheetContext;
  onCancel: () => void;
}) {
  const words = useWords();
  const move = useMove(context.houseId);
  const offer = useUndoOffer(context.houseId);
  const [take, setTake] = useState<string | null>(null);
  // A pick that has since gone (ticked, or swapped by someone else) is no pick.
  const picked = cant.swapFor.some((i) => i.id === take) ? take : null;

  async function swap() {
    if (picked && (await move.run(() => spendSwap(item.id, picked)))) {
      context.close();
      offer(words('wall.history.swapped'), 'swap', picked);
    }
  }

  return (
    <>
      <SheetLines>
        <Body>{words('john.sheet.swapBody', { john: item.name })}</Body>
      </SheetLines>
      <SheetSection>
        <Section label={words('john.sheet.swapFor')} testID="swap-picker">
          <View accessibilityRole="radiogroup" accessibilityLabel={words('john.sheet.swapFor')}>
            {cant.swapFor.map((theirs) => (
              <SwapChoice
                key={theirs.id}
                item={theirs}
                context={context}
                chosen={theirs.id === picked}
                onChoose={() => setTake(theirs.id)}
              />
            ))}
          </View>
        </Section>
      </SheetSection>
      <SheetLines>
        <Button
          label={words('john.swap.swap')}
          busyLabel={words('john.swap.swapping')}
          icon={RepeatIcon}
          busy={move.pending}
          disabled={!picked}
          onPress={() => void swap()}
          testID="swap-them"
        />
        <Button variant="outline" label={words('common.shell.cancel')} onPress={onCancel} testID="swap-cancel" />
        {move.problem ? <Alert message={move.problem} /> : null}
      </SheetLines>
    </>
  );
}

/**
 * One of the swap's choices: a row to pick, the owner leading, and the tick
 * as its trailing item once chosen. Its status's word is always said, and
 * leads the meta once picked, when the tick takes its mark's place (a
 * hazard mark can't sit on the tint).
 */
function SwapChoice({
  item,
  context,
  chosen,
  onChoose,
}: {
  item: BoardItem;
  context: JohnSheetContext;
  chosen: boolean;
  onChoose: () => void;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const { meta, label } = swapChoice(item, context.members, context.rules, context.now, chosen, words);
  return (
    <Row
      leading={<Avatar name={context.nameOf(item.userId)} userId={item.userId} />}
      title={item.name}
      meta={meta}
      trailing={
        chosen ? (
          <View style={[styles.chosen, { backgroundColor: colors.foreground }]} testID="swap-chosen">
            <CheckIcon size={16} strokeWidth={3} color={colors.card} aria-hidden />
          </View>
        ) : (
          <StatusMark status={item.status} />
        )
      }
      hazardEdge={item.status === 'overdue'}
      selected={chosen}
      onPress={onChoose}
      accessibilityLabel={label}
      testID="swap-choice"
    />
  );
}

/**
 * A housemate's John still to do: whose it is. Once it's overdue past the
 * house's grace, what covering it means and amber "I did this" (with a
 * photo, for a photo John); overdue inside the grace, when that opens.
 */
export function TheirsOpen({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const owner = context.members.find((m) => m.userId === item.userId);
  const offer = coverOffer(item, context.members, context.userId, context.rules, context.now, words);
  return (
    <SheetLines>
      <View style={styles.owner}>
        <Avatar name={context.nameOf(item.userId)} userId={item.userId} />
        <Body style={styles.shrink}>{words('john.sheet.theirs', { owner: owner ? firstName(owner.name) : words('common.shell.formerHousemate') })}</Body>
      </View>
      {offer.kind === 'cover' && offer.text ? (
        <Cover item={item} context={context} body={offer.text} />
      ) : offer.text ? (
        <Body testID="cover-soon">{offer.text}</Body>
      ) : null}
    </SheetLines>
  );
}

/** Covering a housemate's John: what it means, then the sheet's one amber, as ticking your own looks. */
function Cover({ item, context, body }: { item: BoardItem; context: JohnSheetContext; body: string }) {
  const words = useWords();
  const tick = useTick(context.houseId, item.id, { cover: true });
  return (
    <>
      <Body testID="cover-body">{body}</Body>
      {item.needsPhoto ? (
        <>
          <Button
            icon={CameraIcon}
label={words('john.sheet.coverPhoto')}
            busy={tick.waiting === 'camera'}
            busyLabel={tick.busyLabel}
            disabled={tick.held('camera')}
            onPress={() => void tick.tickWithPhoto('camera')}
            testID="sheet-cover"
          />
          <Button
            variant="outline"
            icon={ImagesIcon}
label={words('john.sheet.fromLibrary')}
            busy={tick.waiting === 'library'}
            busyLabel={tick.busyLabel}
            disabled={tick.held('library')}
            onPress={() => void tick.tickWithPhoto('library')}
          />
        </>
      ) : (
        <Button
          icon={CheckIcon}
label={words('john.sheet.coverIt')}
          busy={tick.waiting === 'tick'}
          busyLabel={tick.busyLabel}
          disabled={tick.held('tick')}
          onPress={() => void tick.tick()}
          testID="sheet-cover"
        />
      )}
      {tick.problem ? <Alert message={tick.problem} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  // The pick: an ink disc with a tick, where the row's mark was.
  chosen: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  owner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  shrink: { flexShrink: 1 },
});
