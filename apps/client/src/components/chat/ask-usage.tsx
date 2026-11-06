import { ASK_LOW, ASK_USAGE_COPY, askBackOn, type AskUsage } from '@app/core';
import { ChevronRightIcon, GaugeIcon, TicketIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';

import { Button } from '@/components/button';
import { ComposerBar } from '@/components/chat/chat';
import { ButtonRow } from '@/components/button-row';
import { Group, GroupItem } from '@/components/group';
import { Section } from '@/components/section';
import { Body, Meta, RowTitle } from '@/components/text';
import { CONTENT_MAX, GROUP_RADIUS, RADIUS, GUTTER, INSET, SECTION_GAP, SPACE, useTheme } from '@/theme';

// The week's Ask Jonz, as the chat and the usage page show it: a warning over
// the message box once under a quarter is left, a notice in the box's place
// once it's all used, and the page with the house's, your own and each
// person's use. docs/specs/describe-your-house.md.

/** Where the usage page is. */
export const ASK_USAGE_HREF = '/house/ask-usage' satisfies Href;

/** What the chat shows for the week: nothing, a warning when low, or the notice once it's all used. */
export function usageState(usage: AskUsage | undefined): 'plenty' | 'low' | 'out' {
  if (!usage) return 'plenty';
  if (usage.left <= 0) return 'out';
  return usage.left < ASK_LOW ? 'low' : 'plenty';
}

/** One person's (or the house's) use: what, how much used, a bar, and a note under it. */
export function UsageBar({ label, used, note, testID }: { label: string; used: number; note?: string; testID?: string }) {
  const { colors } = useTheme();
  const fill = used >= 0.9 ? colors.hazard : colors.primary;
  return (
    <View style={styles.bar} testID={testID}>
      <View style={styles.barTop}>
        <RowTitle>{label}</RowTitle>
        <Meta>{ASK_USAGE_COPY.used(used)}</Meta>
      </View>
      <View
        style={[styles.track, { backgroundColor: colors.muted }]}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used * 100)}
      >
        <View style={[styles.fill, { width: `${Math.min(100, Math.round(used * 100))}%`, backgroundColor: fill }]} />
      </View>
      {note ? <Meta>{note}</Meta> : null}
    </View>
  );
}

/** Over the message box once under a quarter is left: how much, whose, and when more comes. Opens the usage page. */
export function LowWarning({ usage, zone }: { usage: AskUsage; zone: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.lowLine}>
    <Link href={ASK_USAGE_HREF} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.low, { backgroundColor: colors.card, borderColor: colors.border }])}
        role="link"
        aria-label={`${ASK_USAGE_COPY.low(usage.left, usage.house, askBackOn(usage.resetsAt, zone))} ${ASK_USAGE_COPY.lowLabel}`}
        testID="chat-low"
      >
        <GaugeIcon size={18} color={colors.foreground} aria-hidden />
        <Body style={styles.flex}>{ASK_USAGE_COPY.low(usage.left, usage.house, askBackOn(usage.resetsAt, zone))}</Body>
        <ChevronRightIcon size={18} color={colors.mutedForeground} aria-hidden />
      </Pressable>
    </Link>
    </View>
  );
}

/**
 * In the message box's place once it's all used: whose ran out, a full bar,
 * when it's back, and the usage page. When it's the whole house and it has
 * no Pass, the Pass too.
 */
export function OutNotice({ usage, zone }: { usage: AskUsage; zone: string }) {
  const { colors } = useTheme();
  const backOn = askBackOn(usage.resetsAt, zone);
  const house = usage.house;
  return (
    <ComposerBar testID="chat-out">
      <View style={[styles.outCard, { backgroundColor: colors.card }]}>
        <RowTitle>{house ? ASK_USAGE_COPY.outHouse : ASK_USAGE_COPY.outMine}</RowTitle>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { width: '100%', backgroundColor: colors.hazard }]} />
        </View>
        <Meta>{house ? ASK_USAGE_COPY.outHouseNote(backOn, usage.pass) : ASK_USAGE_COPY.outMineNote(backOn)}</Meta>
        <ButtonRow>
          {house && !usage.pass ? <Button label={ASK_USAGE_COPY.getPass} icon={TicketIcon} href="/house/pass" testID="chat-out-pass" /> : null}
          <Button label={ASK_USAGE_COPY.seeUsage} variant="outline" href={ASK_USAGE_HREF} testID="chat-out-usage" />
        </ButtonRow>
      </View>
    </ComposerBar>
  );
}

/** The usage page's body: this week for the house and you, then who used it, then what the Pass gives. */
export function UsageDetail({
  usage,
  zone,
  me,
  nameOf,
}: {
  usage: AskUsage;
  zone: string;
  me: string;
  nameOf: (userId: string) => string;
}) {
  const halves = usage.people >= 2;
  return (
    <View style={styles.page}>
      <Section label={ASK_USAGE_COPY.thisWeek} right={ASK_USAGE_COPY.resets(askBackOn(usage.resetsAt, zone))} testID="usage-week">
        <Group>
          <GroupItem>
            <UsageBar label={ASK_USAGE_COPY.house} used={usage.houseUsed} note={ASK_USAGE_COPY.houseNote(usage.people)} testID="usage-house" />
          </GroupItem>
          {halves ? (
            <GroupItem>
              <UsageBar label={ASK_USAGE_COPY.you} used={usage.mineUsed} note={ASK_USAGE_COPY.youNote} testID="usage-mine" />
            </GroupItem>
          ) : null}
        </Group>
      </Section>
      {halves ? (
        <Section label={ASK_USAGE_COPY.whoUsed} testID="usage-people">
          <Group>
            {usage.usedBy.map((p) => (
              <GroupItem key={p.userId}>
                <UsageBar label={p.userId === me ? ASK_USAGE_COPY.you : nameOf(p.userId)} used={p.used} testID={`usage-${p.userId}`} />
              </GroupItem>
            ))}
          </Group>
        </Section>
      ) : null}
      {usage.pass ? null : <Meta>{ASK_USAGE_COPY.passMore}</Meta>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { gap: SECTION_GAP },
  bar: { gap: SPACE.xs },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
  track: { height: SPACE.sm, borderRadius: RADIUS, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS },
  lowLine: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingHorizontal: GUTTER, paddingBottom: SPACE.sm },
  low: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outCard: { borderRadius: GROUP_RADIUS, padding: INSET, gap: SPACE.sm },
});
