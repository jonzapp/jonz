import { wholePercent } from '@app/core';
import { ASK_LOW, askBackOn, type AskUsage } from '@app/core';
import { GaugeIcon, TicketIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { type Href } from 'expo-router';

import { Button } from '@/components/button';
import { ChatNotice, ChatStop } from '@/components/chat/chat-notice';
import { Group, GroupItem } from '@/components/group';
import { Section } from '@/components/section';
import { nearlyUsed, Progress } from '@/components/progress';
import { Meta } from '@/components/text';
import { SECTION_GAP, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

// The week's Ask Jonz, as the chat and the usage page show it: a warning over
// the message box once under a quarter is left, a notice in the box's place
// once it's all used (both the chat's standard pieces, chat-notice.tsx), and
// the page with the house's, your own and each person's use.
// docs/specs/describe-your-house.md.

/** Where the usage page is. */
const ASK_USAGE_HREF = '/house/ask-usage' satisfies Href;

/** What the chat shows for the week: nothing, a warning when low, or the notice once it's all used. */
export function usageState(usage: AskUsage | undefined): 'plenty' | 'low' | 'out' {
  if (!usage) return 'plenty';
  if (usage.left <= 0) return 'out';
  return usage.left < ASK_LOW ? 'low' : 'plenty';
}

/** One person's (or the house's) use: what, how much used, its bar (hazard from 90%), and a note under it. */
function UsageBar({ label, used, note, testID }: { label: string; used: number; note?: string; testID?: string }) {
  const words = useWords();
  return (
    <View style={styles.bar} testID={testID}>
      <Progress value={used} max={1} label={label} amount={words('ask.usage.used', { used: wholePercent(used) })} warn={nearlyUsed(used)} testID={testID ? `${testID}-progress` : undefined} />
      {note ? <Meta>{note}</Meta> : null}
    </View>
  );
}

/** Over the message box once under a quarter is left: how much, whose, and when more comes. Opens the usage page. */
export function LowWarning({ usage, zone }: { usage: AskUsage; zone: string }) {
  const words = useWords();
  return (
    <ChatNotice
      icon={GaugeIcon}
      text={words('ask.usage.low', { left: wholePercent(usage.left), house: usage.house, backOn: askBackOn(usage.resetsAt, zone, words) })}
      label={words('ask.usage.lowLabel')}
      href={ASK_USAGE_HREF}
      testID="chat-low"
    />
  );
}

/**
 * In the message box's place once it's all used: whose ran out (the house's
 * week, your half, or your account's across every house), a full bar, when
 * it's back, and the usage page. When it's the whole house and it has
 * no Pass, the Pass too.
 */
export function OutNotice({ usage, zone }: { usage: AskUsage; zone: string }) {
  const words = useWords();
  const backOn = askBackOn(usage.resetsAt, zone, words);
  const house = usage.limit === 'house';
  const account = usage.limit === 'account';
  return (
    <ChatStop
      title={account ? words('ask.usage.outAccount') : house ? words('ask.usage.outHouse') : words('ask.usage.outMine')}
      note={
        account
          ? words('ask.usage.outAccountNote', { backOn })
          : house
            ? words('ask.usage.outHouseNote', { backOn, pass: usage.pass })
            : words('ask.usage.outMineNote', { backOn })
      }
      limit
      testID="chat-out"
    >
      {house && !usage.pass ? <Button label={words('ask.usage.getPass')} icon={TicketIcon} href="/house/pass" testID="chat-out-pass" /> : null}
      <Button label={words('ask.usage.seeUsage')} variant="outline" href={ASK_USAGE_HREF} testID="chat-out-usage" />
    </ChatStop>
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
  page: { gap: SECTION_GAP },
  bar: { gap: SPACE.xs },
});
