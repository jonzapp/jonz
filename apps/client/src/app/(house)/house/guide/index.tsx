import { GUIDE_COPY, GUIDE_TOPIC, guideSections } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { AskRow } from '@/components/guide/ask-row';
import { HousePage } from '@/components/house/house-page';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Body } from '@/components/text';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SECTION_GAP } from '@/theme';
import { ListPageOutline } from '@/components/page-outlines';

/**
 * The guide, from Help's Read the guide (and House's Help): how Jonz works,
 * page by page and rule by rule, in groups. Each opens its page, written
 * with this house's own numbers; Jonz reads the same words (how_it_works),
 * so reading and asking agree. Not here? Ask Jonz, at the foot.
 */
export default function GuideScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  const { query, view } = useHouse(house!.id, session!.user.id);
  return (
    <HousePage
      title={GUIDE_COPY.title}
      testID="guide"
      outline={<ListPageOutline sections={[4, 3]} />}
      ready={view !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
    >
      {() => (
        <View style={styles.stack}>
          <Body style={styles.lead}>{GUIDE_COPY.lead}</Body>
          {guideSections(view!.snapshot.house.kind === 'family').map((section) => (
            <Section key={section.label} label={section.label}>
              {section.topics.map((topic) => (
                <Row
                  key={topic}
                  title={GUIDE_TOPIC[topic].title}
                  meta={GUIDE_TOPIC[topic].meta}
                  href={`/house/guide/${topic}` as never}
                  chevron
                  testID={`guide-${topic}`}
                />
              ))}
            </Section>
          ))}
          <AskRow me={view!.me} title={GUIDE_COPY.ask} />
        </View>
      )}
    </HousePage>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SECTION_GAP },
  lead: { paddingHorizontal: INSET },
});
