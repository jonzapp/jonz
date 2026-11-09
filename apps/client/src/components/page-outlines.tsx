import type { ReactNode } from 'react';
import { View } from 'react-native';

import { OutlineBar, OutlineButton, OutlineGroup, OutlinePlate, OutlineStack, OutlineText } from '@/components/outline';
import { Pair, useSideBySide } from '@/components/page-columns';
import { Columns, useColumns } from '@/components/screen';
import { Group, GroupItem } from '@/components/group';
import { INSET, OUTLINE, ROW_MIN, SECTION_GAP, SPACE } from '@/theme';

// Each page's shape in outline while it first reads (docs/style/states.md,
// "Waiting"), built from the kit in outline.tsx, so its plate, groups and
// rows land where the page's own will. Keep one in step with its page when
// the page's sections move. Give them to `Waiting` (or `HousePage`'s
// `outline`), which shows them after WAIT_DELAY.

/** The page's first line (Today's date, a summary bar), a label's height on the bare page. */
function TopLineBar({ width = 88 }: { width?: number }) {
  return <OutlineBar width={width} height={OUTLINE.label} onCard={false} style={{ marginLeft: INSET }} />;
}

/** A spreading page in outline: two columns on a laptop, one after the other on a phone. */
function Spread({ main, side }: { main: ReactNode; side: ReactNode }) {
  if (useColumns()) return <Columns main={<OutlineStack>{main}</OutlineStack>} side={<OutlineStack>{side}</OutlineStack>} />;
  return (
    <OutlineStack>
      {main}
      {side}
    </OutlineStack>
  );
}

/** A card in outline (Next up, a sign): a title, a sentence, and its button. */
function CardOutline({ lines = 2, button = true }: { lines?: number; button?: boolean }) {
  return (
    <Group>
      <View style={{ padding: INSET, gap: SPACE.md }}>
        <OutlineBar width="45%" height={OUTLINE.title + SPACE.sm} />
        <OutlineText lines={lines} />
        {button ? <OutlineButton onCard /> : null}
      </View>
    </Group>
  );
}

/** Today: the day, Next up's card, the rest of your week; beside it on a laptop, what the house wants and its week. */
export function TodayOutline() {
  return (
    <Spread
      main={
        <>
          <View style={{ gap: SPACE.sm }}>
            <TopLineBar />
            <CardOutline />
          </View>
          <OutlineGroup rows={3} lead="square" />
        </>
      }
      side={
        <>
          <OutlineGroup rows={2} />
          <OutlineGroup rows={3} lead="square" />
        </>
      }
    />
  );
}

/** Week: the summary, each housemate's Johns; beside it on a laptop, the Table. */
export function WeekOutline() {
  return (
    <Spread
      main={
        <>
          <TopLineBar width={140} />
          <OutlineGroup rows={4} lead="square" />
          <OutlineGroup rows={3} lead="square" />
        </>
      }
      side={<OutlineGroup rows={4} end />}
    />
  );
}

/** A housemate's track record: the grid, then its breakdown. */
export function RecordOutline() {
  return (
    <OutlineStack>
      <OutlinePlate height={ROW_MIN * 3} />
      <OutlineGroup rows={4} lead="none" end />
    </OutlineStack>
  );
}

/** The figures' plate: two to a line on a phone, one line where the page fills the room. */
function FiguresOutline() {
  return <OutlinePlate height={useSideBySide() ? ROW_MIN + SPACE.xl : 2 * (ROW_MIN + SPACE.xl)} />;
}

/** House: the figures, then the Table and the Wall (side by side where the page fills the room), then setup. */
export function HouseOutline() {
  return (
    <OutlineStack>
      <FiguresOutline />
      <Pair start={<OutlineGroup rows={4} end />} end={<OutlineGroup rows={4} />} />
      <OutlineGroup rows={3} lead="square" />
    </OutlineStack>
  );
}

/** A housemate's page: who they are, then their sections. */
export function PersonOutline() {
  return (
    <OutlineStack>
      <OutlineGroup rows={1} label={false} />
      <Pair start={<OutlineGroup rows={3} lead="square" />} end={<OutlineGroup rows={3} end />} />
    </OutlineStack>
  );
}

/** The Stake's months: the switch, then each month's group. */
export function StakeOutline() {
  return (
    <OutlineStack>
      <OutlineButton />
      <OutlineGroup rows={3} lead="none" end />
      <OutlineGroup rows={2} lead="none" end />
    </OutlineStack>
  );
}

/** The Wall (and History): a long list of what happened, each with who did it. */
export function WallOutline() {
  return (
    <OutlineStack>
      <OutlineGroup rows={6} />
    </OutlineStack>
  );
}

/** A list page House pushes (Johns, reports, the guide): its sections of rows. */
export function ListPageOutline({ sections = [5, 3], lead = 'square' }: { sections?: readonly number[]; lead?: 'circle' | 'square' | 'none' }) {
  return (
    <OutlineStack>
      {sections.map((rows, i) => (
        <OutlineGroup key={i} rows={rows} lead={lead} />
      ))}
    </OutlineStack>
  );
}

/** A settings page (rules, you, moving, the Pass): a card of words over groups of choices. */
export function SettingsOutline({ card = false, sections = [3, 2] }: { card?: boolean; sections?: readonly number[] }) {
  return (
    <OutlineStack>
      {card ? <CardOutline lines={3} /> : null}
      {sections.map((rows, i) => (
        <OutlineGroup key={i} rows={rows} lead="none" />
      ))}
    </OutlineStack>
  );
}

/** A page of reading (the guide's topic): a heading and paragraphs. */
export function ArticleOutline() {
  return (
    <OutlineStack gap={SECTION_GAP}>
      <Group>
        <GroupItem>
          <OutlineText lines={4} />
          <OutlineText lines={3} />
        </GroupItem>
      </Group>
    </OutlineStack>
  );
}

/** The front door's sign for a link (a join or offer link): the sign, a sentence, the way in. */
export function DoorOutline() {
  return (
    <OutlineStack>
      <CardOutline lines={2} />
    </OutlineStack>
  );
}
