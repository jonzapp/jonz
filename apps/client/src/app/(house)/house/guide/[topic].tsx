import { GUIDE_COPY, GUIDE_TOPIC, guideMarkdown, howItWorks, isHowTopic } from '@app/core';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AskRow } from '@/components/guide/ask-row';
import { HousePage } from '@/components/house/house-page';
import { Reply } from '@/components/reply/reply';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SECTION_GAP } from '@/theme';

import NotFound from '../../../+not-found';

/**
 * One page of the guide: a topic in this house's own words and numbers
 * (its Stake, its hours, its prices), the same text Jonz reads, drawn as
 * Jonz's replies are. Ask Jonz about this, at the foot.
 */
export default function GuideTopicScreen() {
  const { topic = '' } = useLocalSearchParams<{ topic?: string }>();
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  const { query, view } = useHouse(house!.id, session!.user.id);
  if (!isHowTopic(topic)) return <NotFound />;
  return (
    <HousePage
      title={GUIDE_TOPIC[topic].title}
      testID="guide-page"
      back="/house/guide"
      backLabel={GUIDE_COPY.title}
      ready={view !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
    >
      {() => {
        const { snapshot } = view!;
        const said = howItWorks(topic, {
          rules: snapshot.rules,
          family: snapshot.house.kind === 'family',
          awayMakeup: snapshot.house.awayMakeup,
        });
        return (
          <View style={styles.stack}>
            <View style={styles.words}>
              <Reply source={guideMarkdown(said)} testID="guide-words" />
            </View>
            <AskRow me={view!.me} title={GUIDE_COPY.askAbout} />
          </View>
        );
      }}
    </HousePage>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SECTION_GAP },
  words: { paddingHorizontal: INSET },
});
