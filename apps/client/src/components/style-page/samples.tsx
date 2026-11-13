import { CalendarIcon, CameraIcon, CheckIcon, ClockIcon, ListChecksIcon, PlaneIcon, ScaleIcon, UsersIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ListTable, ListTableRow, type ListColumn } from '@/components/list-table';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { useColumns } from '@/components/screen';
import { TodayOutline } from '@/components/page-outlines';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-mark';
import { Body, Meta, RowTitle } from '@/components/text';
import { TickBox } from '@/components/tick-box';
import { SPACE } from '@/theme';

const none = () => {};

/**
 * Today as a housemate sees it, made from the kit with made-up Johns: what's
 * next, then the rest of the day. Next up keeps Focus's layout, Mark done
 * filling the line beside Photo (docs/style/controls.md).
 */
export function TodaySample() {
  return (
    <Section label="Sample: Today" testID="sample-today">
      <Card>
        <View style={styles.next}>
          <Meta>Next up, due tonight 8pm</Meta>
          <RowTitle>Take the bins out</RowTitle>
          <Body muted>Green bin this week. Bring it back in on Thursday.</Body>
          {/* eslint-disable-next-line jonz/no-hand-made-button-row -- Next up's documented layout (docs/style/controls.md) */}
          <View style={styles.nextButtons}>
            <View style={styles.grow}>
              {/* eslint-disable-next-line jonz/button-in-row -- Next up's documented exception (docs/style/controls.md) */}
              <Button icon={CheckIcon} label="Mark done" onPress={none} />
            </View>
            {/* eslint-disable-next-line jonz/button-in-row -- Next up's documented exception (docs/style/controls.md) */}
            <Button variant="outline" icon={CameraIcon} label="Photo" onPress={none} />
          </View>
        </View>
      </Card>
      <Group>
        <Row
          title="Wipe the hob"
          meta="By 9pm"
          lid="kitchen"
          leading={<TickBox state="open" label="Wipe the hob" onPress={none} />}
          leadingControl
          onPress={none}
        />
        <Row
          title="Clean the bath"
          meta="Done 2pm, Sam is checking it"
          lid="bathroom"
          leading={<TickBox state="checking" label="Clean the bath" onPress={none} />}
          leadingControl
          onPress={none}
        />
        <Row
          title="Hoover the stairs"
          meta="Done 10am"
          lid="floors"
          leading={<TickBox state="done" label="Hoover the stairs" onPress={none} />}
          leadingControl
          onPress={none}
        />
      </Group>
    </Section>
  );
}

/** Today while it first reads: the page's own shape in outline (page-outlines.tsx), as Waiting shows it. */
export function TodayReadingSample() {
  return (
    <Section label="Sample: Today, while it reads" bare testID="sample-today-reading">
      <TodayOutline stacked />
    </Section>
  );
}

/** The week, a day at a time, with who has what. */
export function WeekSample() {
  return (
    <Section label="Sample: Week" testID="sample-week">
      <Group>
        <Row title="Monday" meta="3 Johns, all done" trailing={<Chip label="Done" icon={CheckIcon} tone="good" />} onPress={none} chevron />
        <Row title="Tuesday" meta="Ava, Sam" trailing={<Chip label="2 left" icon={ClockIcon} />} onPress={none} chevron />
        <Row title="Wednesday" meta="Priya" onPress={none} chevron />
        <Row title="Thursday" meta="Nobody, Glyn is away" onPress={none} chevron />
      </Group>
    </Section>
  );
}

/** House's own pages, a row each. */
export function HouseSample() {
  return (
    <Section label="Sample: House" testID="sample-house">
      <Group>
        <Row title="Johns" meta="14 in the house" leading={<RowIcon icon={ListChecksIcon} />} onPress={none} chevron />
        <Row title="Housemates" meta="4 people" leading={<RowIcon icon={UsersIcon} />} onPress={none} chevron />
        <Row title="Time away" meta="Glyn, 3 to 9 Nov" leading={<RowIcon icon={PlaneIcon} />} onPress={none} chevron />
        <Row title="Fair shares" meta="Everyone within 4 points" leading={<RowIcon icon={ScaleIcon} />} onPress={none} chevron />
        <Row title="Repeats" meta="Weekly on Mondays" leading={<RowIcon icon={CalendarIcon} />} onPress={none} chevron />
      </Group>
    </Section>
  );
}

const COLUMNS: readonly ListColumn[] = [
  { key: 'when', label: 'When', width: 120 },
  { key: 'who', label: 'Who', flex: 1 },
  { key: 'what', label: 'What', flex: 2 },
  { key: 'count', label: 'Rows', width: 64, end: true },
];

const ENTRIES = [
  { id: '1', when: '1 Nov 09:12', who: 'Ava Brook', what: 'Changed the house rules', count: '3' },
  { id: '2', when: '1 Nov 08:40', who: 'Sam Ortiz', what: 'Reported a problem', count: '1' },
  { id: '3', when: '31 Oct 22:05', who: 'Priya Shah', what: 'Joined Bin Street', count: '12' },
];

/** An admin list: one line a row in columns on a page in two columns, Rows otherwise (busy-list.tsx). */
export function AdminListSample() {
  const wide = useColumns();
  return (
    <Section label="Sample: Admin list" testID="sample-admin">
      {wide ? (
        <ListTable columns={COLUMNS}>
          {ENTRIES.map((entry, index) => (
            <ListTableRow
              key={entry.id}
              columns={COLUMNS}
              cells={entry}
              quiet={['when', 'count']}
              strong={['who']}
              chosen={index === 1}
              onPress={none}
              accessibilityLabel={`${entry.who}, ${entry.what}`}
            />
          ))}
        </ListTable>
      ) : (
        <Group>
          {ENTRIES.map((entry) => (
            <Row key={entry.id} title={entry.who} sentence={entry.what} meta={entry.when} onPress={none} chevron />
          ))}
        </Group>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  next: { gap: SPACE.sm },
  nextButtons: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  grow: { flex: 1 },
});
