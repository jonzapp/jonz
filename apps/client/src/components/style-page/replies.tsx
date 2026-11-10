import { weekLabel, NEW_JOHN, REPLY_SAMPLES, wordsFor, type JohnDef } from '@app/core';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Group } from '@/components/group';
import { ThoughtFold } from '@/components/house/thinking';
import { SharesCard } from '@/components/reply/cards';
import { replyPieces, type ReplyData } from '@/components/reply/pieces';
import { Reply, type ReplyPieces } from '@/components/reply/reply';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Body, Meta, Title } from '@/components/text';
import { TickBox } from '@/components/tick-box';
import { CONTENT_MAX, GUTTER, RADIUS, SECTION_GAP, SPACE, useTheme } from '@/theme';

const none = () => {};

const john = (n: string, j: Partial<JohnDef> & Pick<JohnDef, 'name' | 'category'>): JohnDef => ({
  ...NEW_JOHN,
  id: `0000000${n}-0000-4000-8000-000000000000`,
  anchorMonth: null,
  ...j,
});

/** The sample house the replies (packages/core reply-samples.ts) talk about. */
const DATA: ReplyData = {
  viewerId: 'glyn',
  people: [
    { userId: 'glyn', name: 'Glyn Finck' },
    { userId: 'sam', name: 'Sam Ortiz' },
    { userId: 'priya', name: 'Priya Shah' },
    { userId: 'tom', name: 'Tom Reed' },
    { userId: 'maya', name: 'Maya Finck' },
  ],
  johns: [
    john('a', { name: 'Bins out', category: 'bins', points: 1, dueDow: 4, dueTime: '20:00' }),
    john('b', { name: 'Bathroom clean', category: 'bathroom', points: 3, dueDow: 6, dueTime: '18:00' }),
    john('c', { name: 'Kitchen clean', category: 'kitchen', points: 3, dueDow: 3, dueTime: '21:00' }),
    john('d', { name: 'Vacuum the living room', category: 'floors', points: 2, dueDow: 5, dueTime: '18:00' }),
    john('e', { name: 'Fridge clear-out', category: 'kitchen', points: 2, dueDow: 1, everyWeeks: 2 }),
  ],
  groups: [],
  items: [],
  rowContext: null,
  balances: [
    { userId: 'glyn', balance: 1 },
    { userId: 'sam', balance: 1 },
    { userId: 'priya', balance: -6 },
    { userId: 'tom', balance: 4 },
  ],
  awayMakeup: 100,
};

/** This week as the sample house has it: who, what, when, done or not. */
const WEEK = [
  { who: 'sam', name: 'Bins out', lid: 'bins', due: 'Thu 8pm', done: false },
  { who: 'priya', name: 'Bathroom clean', lid: 'bathroom', due: 'Sat 6pm', done: false },
  { who: 'glyn', name: 'Kitchen clean', lid: 'kitchen', due: 'Wed 9pm', done: true },
  { who: 'glyn', name: 'Bathroom clean', lid: 'bathroom', due: 'Sat 6pm', done: false },
  { who: 'glyn', name: 'Fridge clear-out', lid: 'kitchen', due: 'Mon 6pm', done: true },
  { who: 'tom', name: 'Vacuum the living room', lid: 'floors', due: 'Fri 6pm', done: true },
  { who: 'maya', name: 'Feed the cat', lid: 'other', due: 'Today 6pm', done: false },
];

/**
 * The pieces for the sample house: the app's own chip and card lookups
 * (replyPieces), with the week drawn from made-up rows, since the style
 * page has no house to read (the live card is the Week page's JohnRow).
 */
// The style page's sample house is housemates, in English.
const words = wordsFor('en', 'housemates');
const live = replyPieces(DATA, words);
export const SAMPLE_PIECES: ReplyPieces = {
  ...live,
  card(card) {
    if (card.card === 'shares') {
      const nameOf = (id: string) => DATA.people.find((p) => p.userId === id)?.name ?? null;
      const rows = [
        { userId: 'glyn', balance: '+1' },
        { userId: 'sam', balance: '+1' },
        { userId: 'priya', balance: '−6' },
        { userId: 'tom', balance: '+4' },
      ];
      return <SharesCard rows={rows} viewerId="glyn" nameOf={nameOf} />;
    }
    if (card.card !== 'week') return live.card(card);
    const person = card.who === null ? null : card.who === 'me' ? 'glyn' : card.who.toLowerCase();
    const rows = WEEK.filter((w) => (person === null || w.who === person) && (!card.open || !w.done));
    const name = (id: string) => (id === 'glyn' ? 'You' : (DATA.people.find((p) => p.userId === id)?.name.split(' ')[0] ?? ''));
    const who = person === null ? null : name(person);
    return (
      <Section label={weekLabel(who, card.open, words)} count={card.open ? rows.length : undefined}>
        <Group>
          {rows.map((w, i) => (
            <Row
              key={i}
              title={w.name}
              titleLines={2}
              lid={w.lid}
              meta={person === null ? `${name(w.who)}, ${w.done ? 'done' : `due ${w.due}`}` : w.done ? 'Done' : `Due ${w.due}`}
              leading={<TickBox state={w.done ? 'done' : 'open'} label={w.name} onPress={none} />}
              leadingControl
              onPress={none}
              testID="reply-week-row"
            />
          ))}
        </Group>
      </Section>
    );
  },
};

/**
 * Every sample reply as the chat shows it: the question in its bubble, then
 * Jonz's answer. /style/replies; ?only=<id> shows one. The screenshot test
 * (e2e/client-replies.spec.ts) pictures and measures them.
 */
export function ReplyGallery({ only }: { only?: string }) {
  const { colors } = useTheme();
  const samples = only ? REPLY_SAMPLES.filter((s) => s.id === only) : REPLY_SAMPLES;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page} testID="reply-gallery">
      {only ? null : (
        <View style={styles.head}>
          <Title>Ask Jonz replies</Title>
          <Meta>Every sample reply, as the chat draws it.</Meta>
        </View>
      )}
      {samples.map((s) => (
        <View key={s.id} style={styles.sample} testID={`reply-sample-${s.id}`}>
          {only ? null : <Meta>{s.id}</Meta>}
          <View style={[styles.bubble, { backgroundColor: colors.secondary }]}>
            <Body>{s.asked}</Body>
          </View>
          <View style={styles.said}>
            <ThoughtFold seconds={3} steps={['Looking at this week']} />
            <Reply source={s.reply} pieces={SAMPLE_PIECES} testID="chat-reply" />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', padding: GUTTER, paddingBottom: SECTION_GAP, gap: SECTION_GAP * 1.5 },
  head: { gap: SPACE.sm },
  sample: { gap: SPACE.xl },
  said: { gap: SPACE.md },
  bubble: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: RADIUS, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
});
