import { guideMarkdown, howItWorks, type HowTopic } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { Reply } from '@/components/reply/reply';
import type { HouseView } from '@/hooks/use-house';
import { INSET } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * A guide topic in this house's own words and numbers (its Stake, its hours,
 * its prices), the same text Jonz reads, drawn as Jonz's replies are: on its
 * own page on a phone, beside the list of topics on a laptop.
 */
export function TopicWords({ topic, view }: { topic: HowTopic; view: HouseView }) {
  const words = useWords();
  const { snapshot } = view;
  const said = howItWorks(topic, {
    rules: snapshot.rules,
    family: snapshot.house.kind === 'family',
    awayMakeup: snapshot.house.awayMakeup,
  }, words);
  return (
    <View style={styles.words}>
      <Reply source={guideMarkdown(said)} testID="guide-words" />
    </View>
  );
}

const styles = StyleSheet.create({
  words: { paddingHorizontal: INSET },
});
