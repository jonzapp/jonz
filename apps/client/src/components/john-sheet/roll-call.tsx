import { firstName, jobPlaces, pointsLabel, rollCallPlace, rollCallPlan, rollCallStart, shareLabel, type BoardItem } from '@app/core';
import { CheckIcon, PlusIcon } from 'lucide-react-native';
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
import { PhotoTick } from '@/components/john-sheet/photo-tick';
import { useTick } from '@/hooks/use-tick';

import type { JohnSheetContext } from './body';
import { SheetLines, SheetSection } from './parts';
import { useWords } from '@/hooks/use-words';

/**
 * The roll call, in place of the sheet's content: "Who did it?". You first
 * (whoever ticks it did it), then everyone else with a place in it, all
 * ticked; untick someone who wasn't there and it says what that means
 * ("Counts as a miss for Sam"). "Add someone who helped" lists the rest of
 * the house to add. Under the list, how the points split ("12 pts ÷ 3,
 * 4 pts each"), then Mark done (with a photo, for a photo John) and Cancel.
 */
export function RollCall({ item, context, onCancel }: { item: BoardItem; context: JohnSheetContext; onCancel: () => void }) {
  const words = useWords();
  const places = jobPlaces(item, context.board.items).map(rollCallPlace);
  const [holders] = useState(() => rollCallStart(places, context.userId));
  const [helpers, setHelpers] = useState<string[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const crew = [...holders, ...helpers].filter((id) => !off.includes(id));
  const plan = rollCallPlan(places, crew);
  const tick = useTick(context.houseId, item.id, { crew });
  const others = context.members.filter((m) => !holders.includes(m.userId) && !helpers.includes(m.userId));
  const name = (id: string) => (id === context.userId ? words('john.sheet.you') : context.nameOf(id));

  const toggle = (id: string) => setOff((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  const add = (id: string) => {
    setHelpers((was) => [...was, id]);
    setAdding(false);
  };

  return (
    <>
      <SheetLines>
        <Body testID="roll-call-sub">{words('john.crew.sub', { total: pointsLabel(plan.total, words) })}</Body>
      </SheetLines>
      <SheetSection>
        <Section label={words('john.crew.title')} testID="roll-call">
          {holders.map((id) => {
            const you = id === context.userId;
            const on = !off.includes(id);
            return (
              <ChoiceRow
                key={id}
                role="checkbox"
                leading={<Avatar name={context.nameOf(id)} me={you} />}
                label={name(id)}
                meta={you ? words('john.crew.youDidIt') : on ? undefined : words('john.crew.leftOff', { name: firstName(context.nameOf(id)) })}
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
              meta={words('john.crew.helped')}
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
                  <Meta>{words('john.crew.pickHelper')}</Meta>
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
                <Meta>{words('john.crew.noMoreHelpers')}</Meta>
              </GroupItem>
            )
          ) : (
            <Row
              leading={<RowIcon icon={PlusIcon} />}
              title={words('john.crew.addHelper')}
              onPress={() => setAdding(true)}
              testID="add-helper"
            />
          )}
          <GroupItem>
            <Meta testID="roll-call-split">
              {words('common.join.comma', { first: words('john.crew.split', { total: pointsLabel(plan.total, words), people: crew.length }), second: words('john.crew.splitEach', { each: shareLabel(plan.each, words) }) })}
            </Meta>
          </GroupItem>
        </Section>
      </SheetSection>
      <SheetLines testID="roll-call-actions">
        {item.needsPhoto ? (
          <PhotoTick tick={tick} label={words('john.crew.photoDone')} testID="roll-call-done" />
        ) : (
          <Button
            icon={CheckIcon}
            label={words('john.crew.markDone')}
            busy={tick.waiting === 'tick'}
            busyLabel={tick.busyLabel}
            disabled={tick.held('tick')}
            onPress={() => void tick.tick()}
            testID="roll-call-done"
          />
        )}
        <Button variant="ghost" label={words('common.shell.cancel')} disabled={tick.waiting !== null} onPress={onCancel} testID="roll-call-cancel" />
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
  const words = useWords();
  const places = jobPlaces(item, context.board.items);
  if (!item.crew && places.length <= 1) return null;
  const avatar = (id: string) => <Avatar name={context.nameOf(id)} me={id === context.userId} />;
  const name = (id: string) => (id === context.userId ? words('john.sheet.you') : context.nameOf(id));
  if (!item.crew) {
    return (
      <SheetSection>
        <Section label={words('john.crew.onIt')} testID="crew-part">
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
      <Section label={words('john.crew.didIt')} testID="crew-part">
        {item.crew.people.map((c) => (
          <Row
            key={c.userId}
            leading={avatar(c.userId)}
            title={name(c.userId)}
            meta={c.helper ? words('john.crew.helped') : undefined}
            trailing={shareLabel(c.points, words)}
            testID="crew-member"
          />
        ))}
        {left.map((p) => (
          <Row
            key={p.id}
            leading={avatar(p.userId)}
            title={name(p.userId)}
            meta={words('john.crew.wasntThere')}
            trailing={<StatusMark status={p.status} />}
            testID="crew-absent"
          />
        ))}
      </Section>
    </SheetSection>
  );
}
