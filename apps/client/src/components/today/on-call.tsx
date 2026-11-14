import { dueInLine, firstName, heldDoneIt, sinceLabel, type HouseRules, type OnCallItem } from '@app/core';
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
import { useWords } from '@/hooks/use-words';
import { useShownZone } from '@/hooks/use-shown-zone';

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
  const words = useWords();
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const zone = useShownZone();
  if (items.length === 0) return null;
  const nameOf = (id: string) => firstName(members.find((m) => m.userId === id)?.name ?? 'Someone');
  const scene: Scene = { userId, zone, now, nameOf, move, offer };

  return (
    <Section label={words('today.onCall.section')} testID="on-call">
      {items.map((item) => (
        <OnCallRow key={item.johnId} item={item} scene={scene} />
      ))}
      {move.problem ? <Alert message={move.problem} /> : null}
    </Section>
  );
}

/** What every on-call row is drawn from: who is looking, when, and the section's one move. */
interface Scene {
  userId: string;
  /** The zone times are said in: the reader's own clock, or the house's. */
  zone: string;
  now: Date;
  nameOf: (id: string) => string;
  move: ReturnType<typeof useMove>;
  offer: ReturnType<typeof useUndoOffer>;
}

/** One on-call John: flagged, just done by whoever is on call, or waiting to be asked for. */
function OnCallRow({ item, scene }: { item: OnCallItem; scene: Scene }) {
  const words = useWords();
  const sheet = useJohnSheet();
  const { userId, zone, now, nameOf } = scene;
  const flag = item.openFlag;
  if (flag) {
    const withMe = flag.userId === userId;
    return (
      <Row
        title={item.name}
        lid={item.kindColour ?? 'other'}
        meta={`${withMe ? words('today.onCall.flaggedYou') : words('today.onCall.flagged', { name: nameOf(flag.userId) })}, due ${dueInLine(flag.dueAt, now, zone, words)}`}
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
        title={item.name}
        lid={item.kindColour ?? 'other'}
        meta={words('today.onCall.didIt', { time: sinceLabel(held.doneAt, now, zone, words) })}
        trailing={<Chip label={words('today.onCall.done')} icon={CheckIcon} tone="good" />}
        onPress={() => sheet.open(held.id)}
        testID="on-call-done-it"
      />
    );
  }
  return <WaitingRow item={item} scene={scene} />;
}

/** An on-call John nobody has flagged: "Needs doing", or "Done it" for whoever is on call. */
function WaitingRow({ item, scene }: { item: OnCallItem; scene: Scene }) {
  const words = useWords();
  const { move, offer, nameOf } = scene;
  const mine = item.holderId === scene.userId;
  const meta = `${mine ? words('today.onCall.youreOnCall') : words('today.onCall.holder', { name: nameOf(item.holderId) })}, ${words('today.onCall.times', { n: item.times })}`;
  // The flag's id, once raised: what the toast's Undo takes back.
  const raised = { id: '' };
  const flagIt = async () => {
    if (await move.run(async () => (raised.id = await raiseFlag(item.johnId)))) {
      offer(words('wall.history.flagged'), 'flag', raised.id);
    }
  };
  // Whoever is on call did it before anyone asked: flag it and tick it. A
  // photo John is only flagged, and lands on Today to tick with the photo.
  const doneIt = async () => {
    const ok = await move.run(async () => {
      raised.id = await raiseFlag(item.johnId);
      if (!item.needsPhoto) await markDone(raised.id);
    });
    if (ok && !item.needsPhoto) offer(words('wall.history.doneIt'), 'tick', raised.id);
    else if (ok) offer(words('wall.history.flagged'), 'flag', raised.id);
  };
  const label = mine ? words('today.onCall.tookItOut') : words('today.onCall.needsDoing');
  return (
    <Row
      title={item.name}
      lid={item.kindColour ?? 'other'}
      meta={meta}
      trailing={
        <TextButton
          label={move.pending ? words('today.onCall.flagging') : label}
          icon={mine ? CheckIcon : BellRingIcon}
          align="end"
          disabled={move.pending}
          onPress={() => void (mine ? doneIt() : flagIt())}
          accessibilityLabel={`${label}: ${item.name}`}
          testID={mine ? 'on-call-done' : 'on-call-flag'}
        />
      }
      testID="on-call-row"
    />
  );
}
