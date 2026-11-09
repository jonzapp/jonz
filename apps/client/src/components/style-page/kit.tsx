import type { IsoDow } from '@app/core';
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  EllipsisIcon,
  InboxIcon,
  LogOutIcon,
  MegaphoneIcon,
  PlusIcon,
  ShieldIcon,
  SparklesIcon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { CountBadge } from '@/components/badge';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { CodeBoxes } from '@/components/code-boxes';
import { DayChips } from '@/components/day-chips';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Fold } from '@/components/fold';
import { Group, GroupItem } from '@/components/group';
import { HazardTape } from '@/components/hazard-tape';
import { IconButton } from '@/components/icon-button';
import { LidBar } from '@/components/lid';
import { NoticeView } from '@/components/notice-banner';
import { OutlineRows, OutlineText } from '@/components/outline';
import { Photo } from '@/components/photo';
import { ReadFailed } from '@/components/read-state';
import { Row, RowIcon } from '@/components/row';
import { Dimmed, SearchLine } from '@/components/search-line';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Chip } from '@/components/status-mark';
import { StreetPlate } from '@/components/street-plate';
import { Body, Heading, Lead, Meta, RowTitle, Title } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextLink } from '@/components/text-link';
import { TickBox, type TickState } from '@/components/tick-box';
import { RADIUS, SPACE, useTheme } from '@/theme';

const none = () => {};

/** Words, in each of the type scale's styles. */
export function Words() {
  return (
    <Section label="Words" testID="style-words">
      <Group>
        <GroupItem>
          <Heading level={1}>Heading one</Heading>
          <Heading level={2}>Heading two</Heading>
          <Heading level={3}>Heading three</Heading>
          <Title>Title, a page&apos;s name</Title>
          <Lead>Lead, the line under a title that says what the page is for.</Lead>
          <RowTitle>Row title, a John&apos;s name</RowTitle>
          <Body>Body, for sentences. Plain words, as a housemate would say them.</Body>
          <Body muted>Body muted, for the quieter line beside it.</Body>
          <Meta>Meta, for times and counts: due 8pm, 3 left</Meta>
        </GroupItem>
      </Group>
    </Section>
  );
}

const SWATCHES = ['background', 'card', 'secondary', 'foreground', 'mutedForeground', 'border', 'hivis', 'hazard', 'good', 'ring'] as const;
const BINS = ['kitchen', 'bathroom', 'bins', 'floors', 'errands', 'other'] as const;

/** The theme's colours, by name, and the lids' colours. */
export function Colours() {
  const { colors } = useTheme();
  return (
    <Section label="Colours" testID="style-colours">
      <Group>
        <GroupItem>
          <View style={styles.swatches}>
            {SWATCHES.map((name) => (
              <View key={name} style={styles.swatch}>
                <View style={[styles.chip, { backgroundColor: colors[name], borderColor: colors.border }]} />
                <Meta>{name}</Meta>
              </View>
            ))}
          </View>
          <View style={styles.swatches}>
            {BINS.map((name) => (
              <View key={name} style={styles.swatch}>
                <LidBar category={name} />
                <Meta>{name}</Meta>
              </View>
            ))}
          </View>
        </GroupItem>
      </Group>
    </Section>
  );
}

/** Every button: each kind alone (as a lone ButtonRow places it), then rows of them, then icon buttons and text buttons. */
export function Buttons() {
  return (
    <Section label="Buttons" testID="style-buttons">
      <Group>
        <GroupItem>
          <Meta>Each kind on its own on the page: across the column on a phone, its own width in a wide laptop column. In a card, sheet or form it fills on a laptop too.</Meta>
          <View style={styles.stack}>
            <ButtonRow atEdge testID="lone-button">
              <Button label="Primary, one a screen" icon={PlusIcon} onPress={none} testID="button-primary" />
            </ButtonRow>
            <ButtonRow atEdge>
              <Button variant="outline" label="Outline" icon={CopyIcon} onPress={none} />
            </ButtonRow>
            <ButtonRow atEdge>
              <Button variant="ghost" label="Ghost" onPress={none} />
            </ButtonRow>
            <ButtonRow atEdge>
              <Button variant="hazard" label="Hazard, for undoing" icon={Undo2Icon} onPress={none} />
            </ButtonRow>
            <ButtonRow atEdge>
              <Button variant="outline" label="Chosen" icon={CheckIcon} chosen onPress={none} />
            </ButtonRow>
            <ButtonRow atEdge>
              <Button label="Disabled" disabled onPress={none} />
            </ButtonRow>
          </View>
        </GroupItem>
        <GroupItem>
          <Meta>Rows: equal widths, stacked when a label would wrap.</Meta>
          <ButtonRow testID="button-row-short">
            <Button label="Save" onPress={none} />
            <Button variant="ghost" label="Cancel" onPress={none} />
          </ButtonRow>
          <ButtonRow testID="button-row-long">
            <Button variant="outline" icon={CheckIcon} label="Mark fixed" onPress={none} />
            <Button variant="outline" icon={CopyIcon} label="Same as earlier report" onPress={none} />
          </ButtonRow>
          <ButtonRow testID="button-row-hazard">
            <Button variant="hazard" icon={Undo2Icon} label="Undo it" onPress={none} />
            <Button variant="ghost" label="Cancel" onPress={none} />
          </ButtonRow>
          <ButtonRow stacked testID="button-row-stacked">
            <Button icon={ShieldIcon} label="Skip it" onPress={none} />
            <Button variant="ghost" label="Keep it" onPress={none} />
          </ButtonRow>
        </GroupItem>
        <GroupItem>
          <Meta>Icon buttons: one size, a 48 square.</Meta>
          <View style={styles.across}>
            <IconButton icon={XIcon} label="Close" onPress={none} testID="icon-close" />
            <IconButton icon={EllipsisIcon} label="More" onPress={none} testID="icon-more" />
            <IconButton icon={SparklesIcon} label="Ask Jonz" expanded={false} onPress={none} testID="icon-ask" />
            <IconButton icon={XIcon} label="Close" outline onPress={none} testID="icon-outline" />
          </View>
        </GroupItem>
        <GroupItem>
          <Meta>Text buttons and links.</Meta>
          <TextButton label="Text button" icon={PlusIcon} onPress={none} />
          <TextButton label="Text button with a chevron" chevron onPress={none} />
          <TextButton label="Text button, hazard" tone="hazard" onPress={none} />
          <TextLink href="/privacy" label="A link in words" />
        </GroupItem>
      </Group>
    </Section>
  );
}

const TICKS: readonly TickState[] = ['open', 'checking', 'done', 'disputed', 'busy'];

/** Picking and typing: segments, day chips, tick boxes, fields, code boxes and a fold. */
export function Choosing() {
  const [scope, setScope] = useState<'me' | 'house'>('me');
  const [days, setDays] = useState<IsoDow[]>([1, 3, 5]);
  const [code, setCode] = useState('4829');
  return (
    <Section label="Choosing and typing" testID="style-choosing">
      <Group>
        <GroupItem>
          <Segmented
            label="Whose Johns"
            options={[
              { value: 'me', label: 'Mine' },
              { value: 'house', label: 'Everyone' },
            ]}
            value={scope}
            onChange={setScope}
          />
          <DayChips label="Days" value={days} onChange={setDays} />
          <View style={styles.across}>
            {TICKS.map((state) => (
              <View key={state} style={styles.tick}>
                <TickBox state={state} label={state} onPress={none} />
                <Meta>{state}</Meta>
              </View>
            ))}
          </View>
        </GroupItem>
        <GroupItem>
          <Field label="House name" defaultValue="Bin Street" hint="Housemates see this on the invite." />
          <Field label="Join code" defaultValue="AB12" problem="That code has been used up. Ask for a new one." />
          <CodeBoxes label="Code" hint="It's in the email we sent." value={code} onChangeText={setCode} testID="style-code" />
        </GroupItem>
        <Fold label="Done today" meta={<Meta>1</Meta>} initiallyOpen>
          <Row title="Hoover the stairs" meta="Done 10am" lid="floors" leading={<TickBox state="done" label="Hoover the stairs" />} leadingControl />
        </Fold>
      </Group>
    </Section>
  );
}

/** Marks: chips, counts, lids, people, plates, tape, alerts and notices. */
export function Marks() {
  return (
    <Section label="Marks" testID="style-marks">
      <Group>
        <GroupItem>
          <View style={styles.wrap}>
            <Chip label="Due 8pm" icon={ClockIcon} />
            <Chip label="Late" icon={TriangleAlertIcon} tone="hazard" />
            <Chip label="Checked" icon={CheckIcon} tone="good" />
            <CountBadge count={3} />
            <CountBadge count={12} ring />
          </View>
          <View style={styles.wrap}>
            <Avatar name="Ava Brook" userId="u-ava" />
            <Avatar name="Sam Ortiz" userId="u-sam" />
            <Avatar name="Glyn" userId="u-glyn" me />
            <Avatar name="Priya Shah" userId="u-priya" size={48} />
          </View>
          <StreetPlate>Bin Street</StreetPlate>
          <StreetPlate tone="hazard">Bins out tonight</StreetPlate>
          <HazardTape width={160} />
          <Alert message="Something went wrong. Try again." />
        </GroupItem>
      </Group>
      <NoticeView tone="news" icon={MegaphoneIcon} title="New this week" body="Swaps now ask first." onClose={none} />
      <NoticeView tone="status" icon={TriangleAlertIcon} title="Jonz is slow right now" body="Your ticks are saved." />
    </Section>
  );
}

/** Rows in a group, as every list is built, and an empty list. */
export function Lists() {
  return (
    <Section label="Lists" count={4} testID="style-lists">
      <Group>
        <Row
          title="Take the bins out"
          meta="Due tonight, 8pm"
          lid="bins"
          leading={<TickBox state="open" label="Take the bins out" onPress={none} />}
          leadingControl
          onPress={none}
          chevron
        />
        <Row
          title="Clean the bath"
          meta="Sam is checking it"
          lid="bathroom"
          leading={<TickBox state="checking" label="Clean the bath" onPress={none} />}
          leadingControl
          onPress={none}
        />
        <Row
          title="Wipe the hob"
          meta="Two days late"
          lid="kitchen"
          tone="hazard"
          hazardEdge
          leading={<TickBox state="open" label="Wipe the hob" onPress={none} />}
          leadingControl
          onPress={none}
        />
        <Row title="A row someone picked" leading={<RowIcon icon={InboxIcon} />} selected onPress={none} chevron />
        <Row title="A row on the tint, for yours" leading={<RowIcon icon={ShieldIcon} />} tint onPress={none} />
      </Group>
      <EmptyState icon={InboxIcon} title="Nothing here yet" body="An empty list says what would be here, and how to add the first." />
    </Section>
  );
}

/** While a page reads, and when it couldn't (docs/style/states.md, "Waiting"). */
export function Loading() {
  return (
    <Section label="Waiting" testID="style-reading">
      <View style={styles.stack}>
        <Group>
          <OutlineRows count={2} />
        </Group>
        <Group>
          <OutlineRows count={2} lead="square" end />
          <GroupItem>
            <OutlineText lines={2} />
          </GroupItem>
        </Group>
        <ButtonRow testID="button-row-busy">
          <Button label="Leave Bin Street" busyLabel="Leaving" icon={LogOutIcon} variant="hazard" busy onPress={none} />
          <Button label="Stay" variant="outline" onPress={none} />
        </ButtonRow>
        <SearchLine searching label="Searching" />
        <Dimmed searching>
          <Group>
            <Row title="An old row" meta="Dimmed while it searches" />
          </Group>
        </Dimmed>
        <Photo uri={null} label="A photo on its way" style={styles.photo} />
        <ReadFailed onRetry={none} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  across: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  swatch: { width: 104, gap: SPACE.xs },
  chip: { width: 40, height: 40, borderRadius: SPACE.sm, borderWidth: StyleSheet.hairlineWidth },
  tick: { alignItems: 'center', gap: SPACE.xs, minWidth: 64 },
  photo: { width: 160, aspectRatio: 4 / 3, borderRadius: RADIUS },
});
