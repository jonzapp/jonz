import { REACTION_LABEL, REACTIONS, struckAt, type ReactionKind, type WallEvent, type WallFamily, type WallFeedRow, type WallIcon, type WallScene, type Words } from '@app/core';
import {
  BadgeCheckIcon,
  BanknoteIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  FlagIcon,
  FlameIcon,
  GavelIcon,
  HouseIcon,
  MegaphoneIcon,
  PlaneIcon,
  RepeatIcon,
  ShieldIcon,
  SparklesIcon,
  ThumbsUpIcon,
  TruckIcon,
  Undo2Icon,
  UserPlusIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { GroupItem } from '@/components/group';
import { Row } from '@/components/row';
import { STATUS_ICON } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { Photo } from '@/components/photo';
import type { HouseView } from '@/hooks/use-house';
import { FONT, INSET, LEADING, RADIUS, ROW_GAP, SPACE, TABULAR, useTheme, type Theme } from '@/theme';
import { useWords } from '@/hooks/use-words';

// Core says what happened and which icon fits; these draw it.
const WALL_ICON: Record<WallIcon, LucideIcon> = {
  check: CheckIcon,
  x: XIcon,
  flag: FlagIcon,
  gavel: GavelIcon,
  shield: ShieldIcon,
  repeat: RepeatIcon,
  plane: PlaneIcon,
  'user-plus': UserPlusIcon,
  home: HouseIcon,
  truck: TruckIcon,
  'calendar-check': CalendarCheckIcon,
  banknote: BanknoteIcon,
  'bell-ring': BellRingIcon,
  'badge-check': BadgeCheckIcon,
  megaphone: MegaphoneIcon,
  undo: Undo2Icon,
};

/**
 * A family's plate: its ground, the icon's ink, and the ink border inset
 * from the edge that the road sign has, where the ground needs one.
 */
function plateColours(family: WallFamily, colors: Theme['colors']): { ground: string; ink: string; edge: string | null } {
  switch (family) {
    case 'done':
      return { ground: colors.good, ink: colors.card, edge: null };
    case 'trouble':
      return { ground: colors.hazard, ink: colors.onHazard, edge: null };
    case 'flag':
      return { ground: colors.hivis, ink: colors.onHivis, edge: colors.onHivis };
    case 'perk':
      return { ground: colors.foreground, ink: colors.hivis, edge: null };
    default:
      return { ground: colors.secondary, ink: colors.foreground, edge: colors.border };
  }
}

/**
 * What kind of news a row is, as a square plate in its family's colour with
 * the icon drawn heavy: on the corner of whoever leads the row (`badge`), or
 * on its own where the house's own news leads.
 */
function WallPlate({ family, icon, badge = false }: { family: WallFamily; icon: WallIcon; badge?: boolean }) {
  const { colors } = useTheme();
  const { ground, ink, edge } = plateColours(family, colors);
  const Icon = WALL_ICON[icon];
  const size = badge ? 18 : LEADING;
  return (
    <View
      aria-hidden
      testID={badge ? `wall-badge-${family}` : `wall-plate-${family}`}
      style={[
        badge ? styles.badge : null,
        {
          width: size,
          height: size,
          borderRadius: badge ? 5 : 7,
          backgroundColor: ground,
          alignItems: 'center',
          justifyContent: 'center',
        },
        badge && { borderWidth: 2, borderColor: colors.card },
      ]}
    >
      {edge ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { margin: badge ? 0 : 2, borderRadius: badge ? 3 : 5, borderWidth: 1.5, borderColor: edge }]}
        />
      ) : null}
      <Icon size={badge ? 10 : 18} color={ink} strokeWidth={3} strokeLinecap="square" strokeLinejoin="miter" />
    </View>
  );
}

/** Icons, not emoji: the house style has none. */
export const REACTION_ICON: Record<ReactionKind, LucideIcon> = {
  nice: ThumbsUpIcon,
  fire: FlameIcon,
  sparkle: SparklesIcon,
  eyes: EyeIcon,
};

/**
 * What the Wall's rows need from the house: who's looking, who lives here,
 * its clock, where this week's Johns have got to, and which ticks among
 * `events` the house struck out. `clock` sets the time as "14:10" (the
 * whole Wall, by day) rather than "3h" (House).
 */
export function wallScene(view: HouseView, userId: string, events: readonly WallEvent[], words: Words, clock = false): WallScene {
  const status = new Map(view.board.items.map((item) => [item.id, item.status]));
  return {
    me: userId,
    members: view.snapshot.members,
    currency: view.snapshot.rules.currency,
    zone: view.snapshot.rules.timezone,
    now: view.now,
    statusOf: (id) => status.get(id),
    struck: struckAt(events),
    clock,
    words,
  };
}

/**
 * One thing the house did, as a row, lined up on its first line of words:
 * whoever did it leads (an icon for the house's own news), one sentence,
 * the time level with it at the trailing edge, and under it the meta line's
 * words, then what the house gave it, counts only. The row holds nothing to
 * press but itself: tapping it (`onPress`) opens this week's John in the
 * John sheet, or else the event in full, where its reactions and Undo are;
 * holding it down (`onReactions`) shows the event with all four reactions.
 * A flag still open says its time left under the words. `problem` is a
 * reaction's refusal, said under the row it was made on. A John that went
 * wrong wears its status mark, as everywhere else.
 */
export function WallEventRow({
  row,
  problem,
  onPress,
  onReactions,
}: {
  row: WallFeedRow;
  problem?: string | null;
  onPress: () => void;
  onReactions: () => void;
}) {
  const words = useWords();
  const given = REACTIONS.filter((kind) => row.reactions[kind].count > 0);
  const said = given.map((kind) => words('wall.feed.tally', { label: REACTION_LABEL[kind], count: row.reactions[kind].count }));
  return (
    <>
      <Row
        top
        leading={
          row.actor ? (
            <View>
              <Avatar name={row.actor.name} userId={row.actor.userId} me={row.actor.me} />
              <WallPlate family={row.family} icon={row.icon} badge />
            </View>
          ) : (
            <WallPlate family={row.family} icon={row.icon} />
          )
        }
        title={row.title}
        sentence={<Sentence parts={row.parts} />}
        // A sentence: two lines, so it isn't cut off mid-way.
        titleLines={2}
        meta={<WallMeta row={row} given={given} />}
        trailing={
          <Meta numberOfLines={1} style={styles.when}>
            {row.when}
          </Meta>
        }
        tint={row.open ? 'hivis' : undefined}
        onPress={onPress}
        onLongPress={onReactions}
        accessibilityLabel={[row.label, ...said].join(', ')}
        testID="wall-event"
      />
      {problem ? (
        <GroupItem>
          <Alert message={problem} />
        </GroupItem>
      ) : null}
    </>
  );
}

/** A row's sentence: the names and Johns in bold, the rest in regular. */
function Sentence({ parts }: { parts: WallFeedRow['parts'] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <Text key={i} style={styles.bold}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** An open flag's time left, on an amber plate; how late it is, on hazard. */
function FlagChip({ left, late }: { left: string; late: boolean }) {
  const { colors } = useTheme();
  const ground = late ? colors.hazard : colors.hivis;
  const ink = late ? colors.onHazard : colors.onHivis;
  return (
    <View
      testID="flag-left"
      style={[styles.chip, { backgroundColor: ground }, !late && { borderWidth: 1.5, borderColor: colors.onHivis }]}
    >
      <ClockIcon size={13} color={ink} strokeWidth={3} aria-hidden />
      <Text style={[styles.chipText, { color: ink }]}>{left}</Text>
    </View>
  );
}

/**
 * The meta line: its words, a short sentence of their own, then what the
 * house gave the event, each reaction's icon and count, yours in ink, so
 * a row that took reactions is no taller than one that didn't. A John that
 * went wrong (`mark`) leads with its status mark, its words in hazard on the
 * card colour. An open flag's time left follows on a line of its own.
 */
function WallMeta({ row, given }: { row: WallFeedRow; given: readonly ReactionKind[] }) {
  const { colors } = useTheme();
  const Mark = row.mark ? STATUS_ICON[row.mark] : null;
  if (!row.detail && given.length === 0 && !row.open) return null;
  return (
    <View style={styles.metaBlock}>
      {row.detail || given.length > 0 ? (
        <View style={styles.meta}>
          {Mark ? <Mark size={14} color={colors.hazard} aria-hidden style={styles.mark} /> : null}
          {row.detail ? (
            <Meta numberOfLines={2} style={[styles.detail, Mark && { color: colors.hazard }]}>
              {row.detail}
            </Meta>
          ) : null}
          {given.map((kind) => {
            const Icon = REACTION_ICON[kind];
            const r = row.reactions[kind];
            const ink = r.mine ? colors.foreground : colors.mutedForeground;
            return (
              <View key={kind} aria-hidden style={[styles.count, !row.detail && kind === given[0] && styles.first]} testID={`count-${kind}`}>
                <Icon size={14} color={ink} aria-hidden />
                <Meta style={{ color: ink }}>{r.count}</Meta>
              </View>
            );
          })}
        </View>
      ) : null}
      {row.open ? <FlagChip left={row.open.left} late={row.open.late} /> : null}
    </View>
  );
}

/** A tick's photo receipt, under its row and in line with its words. */
export function WallPhoto({ uri, john }: { uri: string; john: string | null }) {
  const words = useWords();
  return (
    <View style={styles.photoRow}>
      <Photo uri={uri} label={words('wall.page.photoOf', { john: john ?? words('wall.feed.theJohn') })} style={styles.photo} onCard={false} testID="wall-photo" />
    </View>
  );
}

const styles = StyleSheet.create({
  metaBlock: { alignItems: 'flex-start', gap: SPACE.xs },
  meta: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 0 },
  mark: { marginRight: SPACE.xs, marginTop: 3, flexShrink: 0 },
  detail: { flexShrink: 1 },
  // Each count after the words, as tall as their first line.
  count: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, height: 20, marginLeft: SPACE.md, flexShrink: 0 },
  first: { marginLeft: 0 },
  bold: { fontFamily: FONT.bold },
  // As tall as the sentence's first line, so the time sits level with it.
  when: { fontSize: 13, lineHeight: 24 },
  // Sits on the avatar's corner, ringed in the card colour.
  badge: { position: 'absolute', right: -7, bottom: -6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS,
  },
  chipText: { fontFamily: FONT.extrabold, fontSize: 13, lineHeight: 16, paddingTop: 2, ...TABULAR },
  photoRow: { paddingLeft: INSET + LEADING + ROW_GAP, paddingRight: INSET, paddingBottom: SPACE.md },
  photo: { width: '100%', maxWidth: 320, aspectRatio: 4 / 3, borderRadius: RADIUS },
});
