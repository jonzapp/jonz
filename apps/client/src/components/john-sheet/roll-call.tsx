import {
  CREW_COPY,
  firstName,
  FOCUS_SHELL_COPY,
  JOHN_SHEET_COPY,
  jobPlaces,
  pointsLabel,
  rollCallPlace,
  rollCallPlan,
  rollCallStart,
  shareLabel,
  type BoardItem,
} from '@app/core';
import { CameraIcon, CheckIcon, ImagesIcon, PlusIcon } from 'lucide-react-native';
import { useState } from 'react';

import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { GroupItem } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { StatusMark } from '@/components/status-mark';
import { Body, Meta } from '@/components/text';
import { useTick } from '@/hooks/use-tick';

import type { JohnSheetContext } from './body';
import { SheetLines, SheetSection } from './parts';

/**
 * The roll call, in place of the sheet's content: "Who did it?". You first
 * (whoever ticks it did it), then everyone else with a place in it, all
 * ticked; untick someone who wasn't there and it says what that means
 * ("Counts as a miss for Sam"). "Add someone who helped" lists the rest of
 * the house to add. Under the list, how the points split ("12 pts ÷ 3,
 * 4 pts each"), then Mark done (with a photo, for a photo John) and Cancel.
 */
export function RollCall({ item, context, onCancel }: { item: BoardItem; context: JohnSheetContext; onCancel: () => void }) {
  const places = jobPlaces(item, context.board.items).map(rollCallPlace);
  const [holders] = useState(() => rollCallStart(places, context.userId));
  const [helpers, setHelpers] = useState<string[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const crew = [...holders, ...helpers].filter((id) => !off.includes(id));
  const plan = rollCallPlan(places, crew);
  const tick = useTick(context.houseId, item.id, { crew });
  const others = context.members.filter((m) => !holders.includes(m.userId) && !helpers.includes(m.userId));
  const name = (id: string) => (id === context.userId ? JOHN_SHEET_COPY.you : context.nameOf(id));

  const toggle = (id: string) => setOff((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  const add = (id: string) => {
    setHelpers((was) => [...was, id]);
    setAdding(false);
  };

  return (
    <>
      <SheetLines>
        <Body testID="roll-call-sub">{CREW_COPY.sub(pointsLabel(plan.total))}</Body>
      </SheetLines>
      <SheetSection>
        <Section label={CREW_COPY.title} testID="roll-call">
          {holders.map((id) => {
            const you = id === context.userId;
            const on = !off.includes(id);
            return (
              <ChoiceRow
                key={id}
                role="checkbox"
                leading={<Avatar name={context.nameOf(id)} me={you} />}
                label={name(id)}
                meta={you ? CREW_COPY.youDidIt : on ? undefined : CREW_COPY.leftOff(firstName(context.nameOf(id)))}
                checked={on}
                // Whoever ticks it did it: you can't leave yourself off.
                disabled={you}
                onPress={() => toggle(id)}
                testID="roll-call-holder"
              />
            );
          })}
          {helpers.map((id) => (
            <ChoiceRow
              key={id}
              role="checkbox"
              leading={<Avatar name={context.nameOf(id)} />}
              label={name(id)}
              meta={CREW_COPY.helped}
              checked
              // Unticked, a helper comes off the list again.
              onPress={() => setHelpers((was) => was.filter((x) => x !== id))}
              testID="roll-call-helper"
            />
          ))}
          {adding ? (
            others.length > 0 ? (
              <>
                <GroupItem>
                  <Meta>{CREW_COPY.pickHelper}</Meta>
                </GroupItem>
                {others.map((m) => (
                  <Row
                    key={m.userId}
                    leading={<Avatar name={m.name} />}
                    title={m.name}
                    onPress={() => add(m.userId)}
                    accessibilityLabel={m.name}
                    testID="helper-choice"
                  />
                ))}
              </>
            ) : (
              <GroupItem>
                <Meta>{CREW_COPY.noMoreHelpers}</Meta>
              </GroupItem>
            )
          ) : (
            <Row
              leading={<RowIcon icon={PlusIcon} />}
              title={CREW_COPY.addHelper}
              onPress={() => setAdding(true)}
              testID="add-helper"
            />
          )}
          <GroupItem>
            <Meta testID="roll-call-split">
              {`${CREW_COPY.split(pointsLabel(plan.total), crew.length)}, ${CREW_COPY.splitEach(shareLabel(plan.each))}`}
            </Meta>
          </GroupItem>
        </Section>
      </SheetSection>
      <SheetLines testID="roll-call-actions">
        {item.needsPhoto ? (
          <>
            <Button
              icon={CameraIcon}
              label={CREW_COPY.photoDone}
              busy={tick.waiting === 'camera'}
              busyLabel={tick.busyLabel}
              disabled={tick.held('camera')}
              onPress={() => void tick.tickWithPhoto('camera')}
              testID="roll-call-done"
            />
            <Button
              variant="outline"
              icon={ImagesIcon}
              label={JOHN_SHEET_COPY.fromLibrary}
              busy={tick.waiting === 'library'}
              busyLabel={tick.busyLabel}
              disabled={tick.held('library')}
              onPress={() => void tick.tickWithPhoto('library')}
            />
          </>
        ) : (
          <Button
            icon={CheckIcon}
            label={CREW_COPY.markDone}
            busy={tick.waiting === 'tick'}
            busyLabel={tick.busyLabel}
            disabled={tick.held('tick')}
            onPress={() => void tick.tick()}
            testID="roll-call-done"
          />
        )}
        <Button variant="ghost" label={FOCUS_SHELL_COPY.cancel} disabled={tick.waiting !== null} onPress={onCancel} testID="roll-call-cancel" />
        {tick.problem ? <Alert message={tick.problem} /> : null}
      </SheetLines>
    </>
  );
}

/**
 * Who's on a John done together, or with help: before its roll call, "On
 * it" (everyone with a place in it, and where their place has got to);
 * once ticked, "Who did it", each with their share, helpers marked, and
 * anyone left off as not there. Nothing on a John done by one alone.
 */
export function CrewPart({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const places = jobPlaces(item, context.board.items);
  if (!item.crew && places.length <= 1) return null;
  const avatar = (id: string) => <Avatar name={context.nameOf(id)} me={id === context.userId} />;
  const name = (id: string) => (id === context.userId ? JOHN_SHEET_COPY.you : context.nameOf(id));
  if (!item.crew) {
    return (
      <SheetSection>
        <Section label={CREW_COPY.onIt} testID="crew-part">
          {places.map((p) => (
            <Row
              key={p.id}
              leading={avatar(p.userId)}
              title={name(p.userId)}
              trailing={<StatusMark status={p.status} />}
              testID="crew-place"
            />
          ))}
        </Section>
      </SheetSection>
    );
  }
  const left = places.filter((p) => p.absentAt);
  return (
    <SheetSection>
      <Section label={CREW_COPY.didIt} testID="crew-part">
        {item.crew.people.map((c) => (
          <Row
            key={c.userId}
            leading={avatar(c.userId)}
            title={name(c.userId)}
            meta={c.helper ? CREW_COPY.helped : undefined}
            trailing={shareLabel(c.points)}
            testID="crew-member"
          />
        ))}
        {left.map((p) => (
          <Row
            key={p.id}
            leading={avatar(p.userId)}
            title={name(p.userId)}
            meta={CREW_COPY.wasntThere}
            trailing={<StatusMark status={p.status} />}
            testID="crew-absent"
          />
        ))}
      </Section>
    </SheetSection>
  );
}
