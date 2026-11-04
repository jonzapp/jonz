import {
  REACTION_LABEL,
  struckAt,
  WALL_COPY,
  WALL_FEED_COPY,
  type ReactionKind,
  type StatusIcon,
  type WallEvent,
  type WallFamily,
  type WallFeedRow,
  type WallIcon,
  type WallScene,
} from '@app/core';
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
  MegaphoneIcon,
  PlaneIcon,
  RepeatIcon,
  ShieldIcon,
  SmilePlusIcon,
  SparklesIcon,
  ThumbsUpIcon,
  TruckIcon,
  Undo2Icon,
  UserPlusIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { GroupItem } from '@/components/group';
import { Row } from '@/components/row';
import { STATUS_ICON } from '@/components/status-mark';
import { Meta } from '@/components/text';
import type { HouseView } from '@/hooks/use-house';
import { FONT, INSET, LEADING, RADIUS, ROW_GAP, SPACE, TABULAR, TAP, useTheme, type Theme } from '@/theme';

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
export function WallPlate({ family, icon, badge = false }: { family: WallFamily; icon: WallIcon; badge?: boolean }) {
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
export function wallScene(view: HouseView, userId: string, events: readonly WallEvent[], clock = false): WallScene {
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
    family: view.snapshot.house.kind === 'family',
  };
}

/**
 * One thing the house did, as a row: whoever did it leads (an icon for the
 * house's own news), one sentence, and the meta line's words with the time,
 * which always shows. Tapping it (`onPress`) opens this week's John in the
 * John sheet, or else the event in full; holding it down (`onReactions`)
 * shows the event with all four reactions. Where an event takes reactions,
 * its trailing item is a control of its own, so the reactions are a key
 * press away too: a housemate's tick trails the "Nice one" toggle with the
 * way to all four beside it; anything else, what the house gave it most,
 * or, on a row whose tap opens the John, a way to react at all. `problem`
 * is a reaction's refusal, said under the row it was made on. A John that
 * went wrong wears its status mark, as everywhere else.
 */
export function WallEventRow({
  row,
  problem,
  onReact,
  onPress,
  onReactions,
}: {
  row: WallFeedRow;
  problem?: string | null;
  onReact: (kind: ReactionKind, on: boolean) => void;
  onPress: () => void;
  onReactions: () => void;
}) {
  const nice = row.reactions.nice;
  let control = null;
  if (row.open) {
    control = <FlagChip left={row.open.left} late={row.open.late} />;
  } else if (row.reactable && row.nice) {
    control = (
      <View style={styles.pair}>
        <ReactButton compact onPress={onReactions} />
        <NiceToggle count={nice.count} mine={nice.mine} onPress={() => onReact('nice', !nice.mine)} onLongPress={onReactions} />
      </View>
    );
  } else if (row.reactable && row.top) {
    control = <ReactionTally kind={row.top.kind} count={row.top.count} onPress={onReactions} />;
  } else if (row.reactable && row.board) {
    control = <ReactButton onPress={onReactions} />;
  }
  return (
    <>
      <Row
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
        meta={<WallMeta detail={row.detail} mark={row.mark} />}
        trailing={<WallSide when={row.when}>{control}</WallSide>}
        trailingControl
        tint={row.open ? 'hivis' : undefined}
        onPress={onPress}
        onLongPress={onReactions}
        accessibilityLabel={row.label}
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

/**
 * The row's trailing column: the time at the top, always shown, and under it
 * the row's one control (a reaction, or an open flag's time left).
 */
function WallSide({ when, children }: { when: string; children: ReactNode }) {
  return (
    <View style={styles.side}>
      <Meta numberOfLines={1} style={styles.when}>
        {when}
      </Meta>
      {children}
    </View>
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
 * The meta line: its words, which are a short sentence of their own. A John
 * that went wrong (`mark`) leads with its status mark, its words in hazard
 * on the card colour.
 */
function WallMeta({ detail, mark }: { detail: string | null; mark: StatusIcon | null }) {
  const { colors } = useTheme();
  const Mark = mark ? STATUS_ICON[mark] : null;
  if (!detail) return null;
  return (
    <View style={styles.meta}>
      {Mark ? <Mark size={14} color={colors.hazard} aria-hidden style={styles.mark} /> : null}
      <Meta numberOfLines={2} style={[styles.detail, Mark && { color: colors.hazard }]}>
        {detail}
      </Meta>
    </View>
  );
}

/** A toggle's state, as each platform hears it: pressed in a browser, selected on a phone, which has no pressed. */
function toggleState(on: boolean): object {
  return Platform.OS === 'web' ? { 'aria-pressed': on } : { 'aria-selected': on };
}

/**
 * A reaction's count beside its icon, or, before anyone gives it, the room
 * for one, so the icons down a group stay in one column.
 */
function Count({ count, color }: { count: number; color: string }) {
  if (count > 0) return <Meta style={{ color }}>{count}</Meta>;
  return (
    <View aria-hidden style={styles.room}>
      <Meta>0</Meta>
    </View>
  );
}

/**
 * The "Nice one" toggle a housemate's tick carries: borderless, the thumb
 * and how many gave it, muted until it's yours, then ink on the tint.
 * Holding it down shows all four, as holding the row does.
 */
export function NiceToggle({
  count,
  mine,
  onPress,
  onLongPress,
}: {
  count: number;
  mine: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const ink = mine ? colors.foreground : colors.mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? WALL_FEED_COPY.tally(REACTION_LABEL.nice, count) : REACTION_LABEL.nice}
      {...toggleState(mine)}
      onPress={onPress}
      onLongPress={onLongPress}
      testID="nice-one"
      style={({ pressed }) => [styles.pill, { backgroundColor: mine || pressed ? colors.secondary : 'transparent' }]}
    >
      <ThumbsUpIcon size={20} color={ink} aria-hidden />
      <Count count={count} color={ink} />
    </Pressable>
  );
}

/** What the house gave an event most, in the toggle's place: pressing it shows all four. */
export function ReactionTally({ kind, count, onPress }: { kind: ReactionKind; count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const Icon = REACTION_ICON[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={WALL_FEED_COPY.tally(REACTION_LABEL[kind], count)}
      onPress={onPress}
      testID="reaction-tally"
      style={({ pressed }) => [styles.pill, pressed && { backgroundColor: colors.secondary }]}
    >
      <Icon size={20} color={colors.mutedForeground} aria-hidden />
      <Count count={count} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * The way to all four reactions on a row whose tap opens its John instead:
 * on its own where nobody has reacted yet, or `compact` (no room for a
 * count, kept clear of the row's edge) beside a "Nice one" toggle.
 */
export function ReactButton({ onPress, compact = false }: { onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={WALL_FEED_COPY.react}
      onPress={onPress}
      testID="react"
      style={({ pressed }) => [compact ? styles.compact : styles.pill, pressed && { backgroundColor: colors.secondary }]}
    >
      <SmilePlusIcon size={20} color={colors.mutedForeground} aria-hidden />
      {compact ? null : <Count count={0} color={colors.mutedForeground} />}
    </Pressable>
  );
}

/** A tick's photo receipt, under its row and in line with its words. */
export function WallPhoto({ uri, john }: { uri: string; john: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.photoRow}>
      <Image
        source={{ uri }}
        accessibilityLabel={WALL_COPY.photoOf(john ?? WALL_FEED_COPY.theJohn)}
        resizeMode="cover"
        style={[styles.photo, { backgroundColor: colors.secondary }]}
        testID="wall-photo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 0 },
  mark: { marginRight: SPACE.xs, marginTop: 3, flexShrink: 0 },
  detail: { flexShrink: 1 },
  bold: { fontFamily: FONT.bold },
  // The time over the control, at the row's trailing edge.
  side: { alignItems: 'flex-end', alignSelf: 'flex-start', paddingTop: SPACE.sm + 2, gap: 2 },
  when: { fontSize: 13, lineHeight: 18 },
  // Sits on the avatar's corner, ringed in the card colour.
  badge: { position: 'absolute', right: -7, bottom: -6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS,
    marginTop: SPACE.xs,
  },
  chipText: { fontFamily: FONT.extrabold, fontSize: 13, lineHeight: 16, paddingTop: 2, ...TABULAR },
  // The icon and its count end at the row's trailing edge, the room for a
  // count kept, so the icons down a group line up.
  pill: {
    minHeight: TAP,
    minWidth: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingHorizontal: 10,
    marginRight: -SPACE.sm,
    borderRadius: RADIUS,
  },
  compact: { minHeight: TAP, minWidth: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS },
  pair: { flexDirection: 'row', alignItems: 'center' },
  room: { opacity: 0 },
  photoRow: { paddingLeft: INSET + LEADING + ROW_GAP, paddingRight: INSET, paddingBottom: SPACE.md },
  photo: { width: '100%', maxWidth: 320, aspectRatio: 4 / 3, borderRadius: RADIUS },
});
