import { wholePercent } from '@app/core';
import { ASK_LOW, askBackOn, type AskUsage } from '@app/core';
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
import { useWords } from '@/hooks/use-words';

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
  const words = useWords();
  const { colors } = useTheme();
  const fill = used >= 0.9 ? colors.hazard : colors.primary;
  return (
    <View style={styles.bar} testID={testID}>
      <View style={styles.barTop}>
        <RowTitle>{label}</RowTitle>
        <Meta>{words('ask.usage.used', { used: wholePercent(used) })}</Meta>
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
  const words = useWords();
  const { colors } = useTheme();
  return (
    <View style={styles.lowLine}>
    <Link href={ASK_USAGE_HREF} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.low, { backgroundColor: colors.card, borderColor: colors.border }])}
        role="link"
        aria-label={words('common.join.then', { first: words('ask.usage.low', { left: wholePercent(usage.left), house: usage.house, backOn: askBackOn(usage.resetsAt, zone, words) }), second: words('ask.usage.lowLabel') })}
        testID="chat-low"
      >
        <GaugeIcon size={18} color={colors.foreground} aria-hidden />
        <Body style={styles.flex}>{words('ask.usage.low', { left: wholePercent(usage.left), house: usage.house, backOn: askBackOn(usage.resetsAt, zone, words) })}</Body>
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
  const words = useWords();
  const { colors } = useTheme();
  const backOn = askBackOn(usage.resetsAt, zone, words);
  const house = usage.house;
  return (
    <ComposerBar testID="chat-out">
      <View style={[styles.outCard, { backgroundColor: colors.card }]}>
        <RowTitle>{house ? words('ask.usage.outHouse') : words('ask.usage.outMine')}</RowTitle>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { width: '100%', backgroundColor: colors.hazard }]} />
        </View>
        <Meta>{house ? words('ask.usage.outHouseNote', { backOn, pass: usage.pass }) : words('ask.usage.outMineNote', { backOn })}</Meta>
        <ButtonRow>
          {house && !usage.pass ? <Button label={words('ask.usage.getPass')} icon={TicketIcon} href="/house/pass" testID="chat-out-pass" /> : null}
          <Button label={words('ask.usage.seeUsage')} variant="outline" href={ASK_USAGE_HREF} testID="chat-out-usage" />
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
  const words = useWords();
  const halves = usage.people >= 2;
  return (
    <View style={styles.page}>
      <Section label={words('ask.usage.thisWeek')} right={words('ask.usage.resets', { backOn: askBackOn(usage.resetsAt, zone, words) })} testID="usage-week">
        <Group>
          <GroupItem>
            <UsageBar label={words('ask.usage.house')} used={usage.houseUsed} note={words('ask.usage.houseNote', { people: usage.people })} testID="usage-house" />
          </GroupItem>
          {halves ? (
            <GroupItem>
              <UsageBar label={words('ask.usage.you')} used={usage.mineUsed} note={words('ask.usage.youNote')} testID="usage-mine" />
            </GroupItem>
          ) : null}
        </Group>
      </Section>
      {halves ? (
        <Section label={words('ask.usage.whoUsed')} testID="usage-people">
          <Group>
            {usage.usedBy.map((p) => (
              <GroupItem key={p.userId}>
                <UsageBar label={p.userId === me ? words('ask.usage.you') : nameOf(p.userId)} used={p.used} testID={`usage-${p.userId}`} />
              </GroupItem>
            ))}
          </Group>
        </Section>
      ) : null}
      {usage.pass ? null : <Meta>{words('ask.usage.passMore')}</Meta>}
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
