import { guideTopic, guideSections, type HowTopic } from '@app/core';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AskRow } from '@/components/guide/ask-row';
import { TopicWords } from '@/components/guide/topic-words';
import { HousePage } from '@/components/house/house-page';
import { Pair, useSideBySide } from '@/components/page-columns';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Body } from '@/components/text';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SECTION_GAP } from '@/theme';
import { ListPageOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * The guide, from Help's Read the guide (and House's Help): how Jonz works,
 * page by page and rule by rule, in groups. Each opens its page, written
 * with this house's own numbers; Jonz reads the same words (how_it_works),
 * so reading and asking agree. On a phone a topic is a page of its own, and
 * Ask Jonz is at the list's foot for what isn't here. On a laptop the topic
 * you click (?topic=, the first to start) opens beside the list, with Ask
 * Jonz about this under its words.
 */
export default function GuideScreen() {
  const words = useWords();
  const { session, house } = useMembership();
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  // The layout's guard only shows the house's screens with a house and a session.
  const { query, view } = useHouse(house!.id, session!.user.id);
  return (
    <HousePage
      title={words('door.guide.title')}
      testID="guide"
      outline={<ListPageOutline sections={[4, 3]} />}
      ready={view !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      fills
    >
      {() => <Guide view={view!} open={topic ?? null} />}
    </HousePage>
  );
}

function Guide({ view, open }: { view: HouseView; open: string | null }) {
  const words = useWords();
  const beside = useSideBySide();
  const sections = guideSections(view.snapshot.house.kind === 'family');
  // A topic this house's guide doesn't have (a family's, in a house of housemates) opens the first.
  const chosen: HowTopic = sections.flatMap((s) => s.topics).find((t) => t === open) ?? sections[0].topics[0];
  const list = (
    <View style={styles.stack}>
      <Body style={styles.lead}>{words('door.guide.lead')}</Body>
      {sections.map((section) => (
        <Section key={section.label} label={section.label}>
          {section.topics.map((topic) => (
            <Row
              key={topic}
              title={guideTopic(topic, words).title}
              meta={guideTopic(topic, words).meta}
              {...(beside
                ? { onPress: () => router.setParams({ topic }), current: topic === chosen }
                : { href: `/house/guide/${topic}` as never, chevron: true })}
              testID={`guide-${topic}`}
            />
          ))}
        </Section>
      ))}
      {beside ? null : <AskRow me={view.me} title={words('door.guide.ask')} />}
    </View>
  );
  if (!beside) return list;
  return (
    <Pair
      testID="guide-pair"
      start={list}
      end={
        <View style={styles.stack} testID="guide-open">
          <Section label={guideTopic(chosen, words).title} bare>
            <TopicWords key={chosen} topic={chosen} view={view} />
          </Section>
          <AskRow me={view.me} title={words('door.guide.askAbout')} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: SECTION_GAP },
  lead: { paddingHorizontal: INSET },
});
