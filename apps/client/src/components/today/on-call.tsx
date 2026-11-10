import {
  dueInLine,
  firstName,
  heldDoneIt,
  HISTORY_COPY,
  ON_CALL_COPY,
  sinceLabel,
  type HouseRules,
  type OnCallItem,
} from '@app/core';
import { BellRingIcon, CheckIcon } from 'lucide-react-native';

import type { Housemate } from '@/api/board';
import { raiseFlag } from '@/api/flags';
import { markDone } from '@/api/johns';
import { Alert } from '@/components/alert';
import { useJohnSheet } from '@/components/john-sheet';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-mark';
import { TextButton } from '@/components/text-button';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';

/**
 * On call: the house's on-call Johns this week (the bins, whenever they're
 * full), each with who has it. Anyone taps "Needs doing" to flag one, and it
 * lands on that housemate's Today. Whoever is on call can say "Done it"
 * without waiting to be asked. A Done it counts once: for ten minutes the
 * row shows it as done (its sheet has Undo), and the toast's Undo takes back
 * the flag with the tick.
 * Once flagged, the row says who has it and opens the flag's sheet. Nothing
 * when the house has none.
 */
export function OnCall({
  houseId,
  items,
  members,
  userId,
  rules,
  now,
}: {
  houseId: string;
  items: OnCallItem[];
  members: Housemate[];
  userId: string;
  rules: HouseRules;
  now: Date;
}) {
  const sheet = useJohnSheet();
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  if (items.length === 0) return null;
  const nameOf = (id: string) => firstName(members.find((m) => m.userId === id)?.name ?? 'Someone');

  return (
    <Section label={ON_CALL_COPY.section} testID="on-call">
      {items.map((item) => {
        const flag = item.openFlag;
        if (flag) {
          const withMe = flag.userId === userId;
          return (
            <Row
              key={item.johnId}
              title={item.name}
              lid={item.category}
              meta={`${withMe ? ON_CALL_COPY.flaggedYou : ON_CALL_COPY.flagged(nameOf(flag.userId))}, due ${dueInLine(flag.dueAt, now, rules.timezone)}`}
              chevron
              onPress={() => sheet.open(flag.id)}
              testID="on-call-flagged"
            />
          );
        }
        const mine = item.holderId === userId;
        const held = mine ? heldDoneIt(item, now) : null;
        if (held?.doneAt) {
          return (
            <Row
              key={item.johnId}
              title={item.name}
              lid={item.category}
              meta={ON_CALL_COPY.didIt(sinceLabel(held.doneAt, now, rules.timezone))}
              trailing={<Chip label={ON_CALL_COPY.done} icon={CheckIcon} tone="good" />}
              onPress={() => sheet.open(held.id)}
              testID="on-call-done-it"
            />
          );
        }
        const meta = `${mine ? ON_CALL_COPY.youreOnCall : ON_CALL_COPY.holder(nameOf(item.holderId))}, ${ON_CALL_COPY.times(item.times)}`;
        // The flag's id, once raised: what the toast's Undo takes back.
        const raised = { id: '' };
        const flagIt = async () => {
          if (await move.run(async () => (raised.id = await raiseFlag(item.johnId)))) {
            offer(HISTORY_COPY.flagged, 'flag', raised.id);
          }
        };
        // Whoever is on call did it before anyone asked: flag it and tick it. A
        // photo John is only flagged, and lands on Today to tick with the photo.
        const doneIt = async () => {
          const ok = await move.run(async () => {
            raised.id = await raiseFlag(item.johnId);
            if (!item.needsPhoto) await markDone(raised.id);
          });
          if (ok && !item.needsPhoto) offer(HISTORY_COPY.doneIt, 'tick', raised.id);
          else if (ok) offer(HISTORY_COPY.flagged, 'flag', raised.id);
        };
        return (
          <Row
            key={item.johnId}
            title={item.name}
            lid={item.category}
            meta={meta}
            trailing={
              <TextButton
                label={move.pending ? ON_CALL_COPY.flagging : mine ? ON_CALL_COPY.tookItOut : ON_CALL_COPY.needsDoing}
                icon={mine ? CheckIcon : BellRingIcon}
                align="end"
                disabled={move.pending}
                onPress={() => void (mine ? doneIt() : flagIt())}
                accessibilityLabel={`${mine ? ON_CALL_COPY.tookItOut : ON_CALL_COPY.needsDoing}: ${item.name}`}
                testID={mine ? 'on-call-done' : 'on-call-flag'}
              />
            }
            testID="on-call-row"
          />
        );
      })}
      {move.problem ? <Alert message={move.problem} /> : null}
    </Section>
  );
}

