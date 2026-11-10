import { GUIDE_COPY, GUIDE_TOPIC, isHowTopic } from '@app/core';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AskRow } from '@/components/guide/ask-row';
import { TopicWords } from '@/components/guide/topic-words';
import { HousePage } from '@/components/house/house-page';
import { useOpensBeside } from '@/components/page-columns';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { SECTION_GAP } from '@/theme';
import { ArticleOutline } from '@/components/page-outlines';

import NotFound from '../../../+not-found';

/**
 * One page of the guide on a phone: a topic in this house's own words and
 * numbers (TopicWords), then Ask Jonz about this at the foot. On a laptop it
 * opens beside the list of topics instead, so the page never sits in one
 * column with the room blank beside it.
 */
export default function GuideTopicScreen() {
  const { topic = '' } = useLocalSearchParams<{ topic?: string }>();
  const { session, house } = useMembership();
  const beside = useOpensBeside();
  // The layout's guard only shows the house's screens with a house and a session.
  const { query, view } = useHouse(house!.id, session!.user.id);
  if (!isHowTopic(topic)) return <NotFound />;
  if (beside) return <Redirect href={{ pathname: '/house/guide', params: { topic } }} />;
  return (
    <HousePage
      title={GUIDE_TOPIC[topic].title}
      testID="guide-page"
      outline={<ArticleOutline />}
      back="/house/guide"
      backLabel={GUIDE_COPY.title}
      ready={view !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
    >
      {() => (
        <View style={styles.stack}>
          <TopicWords topic={topic} view={view!} />
          <AskRow me={view!.me} title={GUIDE_COPY.askAbout} />
        </View>
      )}
    </HousePage>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SECTION_GAP },
});
