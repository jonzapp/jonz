import {
  clearUntil,
  dateRange,
  JOHN_COPY,
  NEXT_UP_COPY,
  nextUpMeta,
  NOT_DEALT_COPY,
  plannable,
  type BestTime,
  type BoardItem,
  type HouseRules,
  type NextUpState,
} from '@app/core';
import { CameraIcon, CheckIcon, ImagesIcon, TriangleAlertIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { useJohnSheet } from '@/components/john-sheet';
import { LidBar } from '@/components/lid';
import { PlanIt } from '@/components/plan-it';
import { StreetPlate } from '@/components/street-plate';
import { Lead, Meta, SectionLabel } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useTick } from '@/hooks/use-tick';
import { CONTENT_MAX, GUTTER, INSET, NARROW, SPACE, TAP, useTheme } from '@/theme';

/** What the card shows beside a John: the tokens you hold that can skip or swap it. */
export interface CantHeld {
  immunity: boolean;
  swap: boolean;
}

/**
 * Today's one card, Next up: your next open John with the screen's one
 * amber button, or what takes its place (all clear, a tick of yours the
 * house is voting on, time away, before the first deal). Never stacked: one
 * state at a time. The setup checklist is its own card (SetupCard).
 */
export function NextUp({
  houseId,
  state,
  rules,
  now,
  cant,
  room,
  awayMakeup,
  bestTime = null,
}: {
  houseId: string;
  state: Exclude<NextUpState, { kind: 'setup' }>;
  rules: HouseRules;
  now: Date;
  /** What you hold that could skip or swap the next John. */
  cant: CantHeld;
  /** What's left of your stake this month, which caps what lateness costs (null when not known). */
  room: number | null;
  /** How much of your share time away still counts (houses.away_makeup). */
  awayMakeup: number;
  /** Your best time (House, You, Preferences), which Plan it offers first. */
  bestTime?: BestTime | null;
}) {
  switch (state.kind) {
    case 'john':
      // Keyed by the John, so a tick under way never carries over to the next one.
      return (
        <NextJohn
          key={state.item.id}
          houseId={houseId}
          item={state.item}
          rules={rules}
          now={now}
          cant={cant}
          room={room}
          bestTime={bestTime}
        />
      );
    case 'clear':
      return (
        <NextUpCard
          lead={clearUntil(state.until, rules.timezone, now)}
          body={state.nothingYours ? NEXT_UP_COPY.nothingYours : NEXT_UP_COPY.clearBody}
        />
      );
    case 'voting':
      // Not clear yet: the disputed John is in the rest of the week, below.
      return <NextUpCard lead={NEXT_UP_COPY.voting} body={NEXT_UP_COPY.votingBody(state.item.name)} />;
    case 'away':
      return (
        <NextUpCard lead={NEXT_UP_COPY.away(dateRange(state.until, state.until))} body={NEXT_UP_COPY.awayBody(awayMakeup)}>
          <TextButton label={NEXT_UP_COPY.changeDates} href="/house/away" chevron align="start" testID="change-dates" />
        </NextUpCard>
      );
    case 'waiting':
      return <NextUpCard lead={NEXT_UP_COPY.waiting(state.admin)} />;
    case 'undealt':
      return <NextUpCard lead={NOT_DEALT_COPY.nothingThisWeek} body={NOT_DEALT_COPY.nothingThisWeekBody} />;
  }
}

/**
 * The card's shell, for the states that aren't a John: "Next up", the Lead,
 * a line under it, and a quiet way onward. No amber.
 */
export function NextUpCard({ lead, body, children }: { lead: string; body?: string; children?: ReactNode }) {
  return (
    <Card testID="next-up" style={children ? styles.quietEnd : undefined}>
      <SectionLabel style={styles.label}>{NEXT_UP_COPY.label}</SectionLabel>
      <Lead style={styles.lead}>{lead}</Lead>
      {body ? <Meta>{body}</Meta> : null}
      {children ? <View style={styles.onward}>{children}</View> : null}
    </Card>
  );
}

/**
 * Your next John, posted on the pavement rather than in a card: its name on
 * a street-name plate (which opens the John sheet), what it is, when it's
 * due and what being late costs, Plan it (or when it's planned for), then amber "Mark done" with a photo beside
 * it (a photo John leads with the camera), and, while you hold a token, the
 * way to skip or swap it. The plate says it's next, so there's no "Next up"
 * over it to read, only to hear. Overdue, the plate's border turns hazard
 * and a line of its own says since when.
 */
function NextJohn({
  houseId,
  item,
  rules,
  now,
  cant,
  room,
  bestTime,
}: {
  houseId: string;
  item: BoardItem;
  rules: HouseRules;
  now: Date;
  cant: CantHeld;
  room: number | null;
  bestTime: BestTime | null;
}) {
  const { colors, type } = useTheme();
  const sheet = useJohnSheet();
  const tick = useTick(houseId, item.id);
  const [pressed, setPressed] = useState(false);
  const meta = nextUpMeta(item, rules, now, room);
  const working = tick.pending ? JOHN_COPY.ticking : tick.uploading ? JOHN_COPY.uploading : null;
  const offersCant = cant.immunity || cant.swap;
  // On a small phone the photo button beside Mark done is just its icon, so Mark done keeps to one line.
  const narrow = useWindowDimensions().width < NARROW;

  return (
    <View testID="next-up" style={styles.posted}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${NEXT_UP_COPY.label}: ${item.name}`}
        onPress={() => sheet.open(item.id)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={pressed && styles.pressed}
        testID="next-up-name"
      >
        <StreetPlate tone={meta.overdue ? 'hazard' : 'ink'}>{item.name}</StreetPlate>
      </Pressable>
      {/* Not a row: the meta may wrap to a second line on a narrow phone rather than lose the cost. */}
      <View style={[styles.meta, styles.underPlate]}>
        <View style={styles.mark}>
          <LidBar category={item.category} />
        </View>
        <Meta numberOfLines={2} style={styles.shrink} testID="next-up-meta">
          {meta.due ? `${meta.kind}, ${meta.due}` : meta.kind}
        </Meta>
      </View>
      {meta.overdue ? (
        <View style={[styles.meta, styles.words]} testID="next-up-overdue">
          <View style={styles.mark}>
            <TriangleAlertIcon size={14} color={colors.hazard} aria-hidden />
          </View>
          <Text numberOfLines={2} style={[type.meta, styles.shrink]}>
            <Text style={{ color: colors.hazard }}>{meta.overdue.since}</Text>
            {meta.overdue.cost ? `, ${meta.overdue.cost}` : ''}
          </Text>
        </View>
      ) : null}
      {plannable(item, item.userId) ? (
        <View style={styles.words}>
          <PlanIt houseId={houseId} item={item} zone={rules.timezone} now={now} bestTime={bestTime} />
        </View>
      ) : null}

      {/* eslint-disable-next-line jonz/no-hand-made-button-row -- Today's one exception (docs/style/controls.md): Mark done fills the line, Photo keeps its own width. */}
      <View style={styles.buttons}>
        <View style={styles.grow}>
          {item.needsPhoto ? (
            // eslint-disable-next-line jonz/button-in-row -- Today's one exception (docs/style/controls.md)
            <Button
              icon={CameraIcon}
              label={working ?? NEXT_UP_COPY.takePhoto}
              disabled={tick.busy}
              onPress={() => void tick.tickWithPhoto('camera')}
              testID="mark-done"
            />
          ) : (
            // eslint-disable-next-line jonz/button-in-row -- Today's one exception (docs/style/controls.md)
            <Button icon={CheckIcon} label={working ?? JOHN_COPY.markDone} disabled={tick.busy} onPress={() => void tick.tick()} testID="mark-done" />
          )}
        </View>
        {item.needsPhoto ? (
          <Button
            variant="outline"
            icon={ImagesIcon}
            label={NEXT_UP_COPY.library}
            iconOnly={narrow}
            disabled={tick.busy}
            onPress={() => void tick.tickWithPhoto('library')}
            testID="choose-photo"
          />
        ) : (
          <Button
            variant="outline"
            icon={CameraIcon}
            label={NEXT_UP_COPY.photo}
            iconOnly={narrow}
            disabled={tick.busy}
            onPress={() => void tick.tickWithPhoto('camera')}
            testID="done-with-photo"
          />
        )}
      </View>
      {tick.problem ? (
        <View style={styles.problem}>
          <Alert message={tick.problem} />
        </View>
      ) : null}

      {offersCant ? (
        <View style={[styles.onward, styles.words]}>
          <TextButton
            label={NEXT_UP_COPY.cant(cant.immunity, cant.swap)}
            chevron
            align="start"
            // Only a swap to spend: straight to the swap.
            onPress={() => sheet.open(item.id, cant.swap && !cant.immunity ? 'swap' : 'cant')}
            testID="skip-or-swap"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Where a card would be, without one: the plate and the buttons span it,
  // no wider than a phone's page, so neither runs the width of a laptop's main column.
  posted: { alignSelf: 'stretch', maxWidth: CONTENT_MAX - 2 * GUTTER },
  // The lines under the plate start where its words do, on the page's leading edge.
  words: { paddingHorizontal: INSET },
  underPlate: { paddingHorizontal: INSET, marginTop: SPACE.md },
  // A quiet text button ends the card: its own 48 target is the room below.
  quietEnd: { paddingBottom: SPACE.sm },
  // Overpass's caps sit high in their line.
  label: { paddingTop: 2 },
  pressed: { opacity: 0.6 },
  lead: { marginTop: SPACE.sm },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  // The dot or the sign, centred on the first line of words.
  mark: { height: 20, justifyContent: 'center' },
  shrink: { flexShrink: 1 },
  buttons: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg, minHeight: TAP },
  grow: { flex: 1 },
  problem: { marginTop: SPACE.sm },
  onward: { marginTop: SPACE.xs },
});
