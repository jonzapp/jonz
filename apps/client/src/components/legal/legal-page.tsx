import { LEGAL_COPY, type LegalPage as Page, type LegalSection } from '@app/core';
import type { Href } from 'expo-router';
import { useContext, useRef } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';

import { GroupItem } from '@/components/group';
import { Pair, useSideBySide } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { Row } from '@/components/row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Doc } from '@/components/reply/reply';
import { Body, Meta } from '@/components/text';
import { TextLink } from '@/components/text-link';
import { TitleBar } from '@/components/title-bar';
import { reveal, TourScrollContext } from '@/components/tour/tour-spot';
import { CONTENT_MAX, SECTION_GAP, SPACE } from '@/theme';

/**
 * A page to read (Help, the Privacy Policy, the Terms): the date and the
 * lead, then each section under its heading, its words (Markdown, drawn
 * by Doc) in one card and its links under them. On a laptop the sections' headings are listed On this page
 * beside the words, which keep to one column in their order; clicking one
 * jumps to it. Open to anyone, signed in or not; Back goes where you came
 * from, or to the front door (which, signed in, is your house).
 */
export function LegalPage({ page, tab, testID }: { page: Page; tab: string; testID: string }) {
  return (
    <>
      <PageTitle page={tab} />
      <Screen bar={<TitleBar title={page.title} back="/" />} fills testID={testID}>
        <View style={[styles.words, styles.lead]}>
          <Meta>{page.updated}</Meta>
          <Body>{page.lead}</Body>
        </View>
        <Sections sections={page.sections} />
      </Screen>
    </>
  );
}

/** The sections; on a laptop, with the list of them beside, each jumping to its section. */
function Sections({ sections }: { sections: readonly LegalSection[] }) {
  const beside = useSideBySide();
  const scroll = useContext(TourScrollContext);
  const parts = useRef(new Map<string, HostInstance | null>());
  const words = sections.map((section) => (
    <Part key={section.heading} section={section} spot={(view) => parts.current.set(section.heading, view)} />
  ));
  if (!beside) return <>{words}</>;
  return (
    <Pair
      testID="legal-pair"
      start={
        <Section label={LEGAL_COPY.contents} testID="legal-contents">
          {sections.map(({ heading }) => (
            <Row key={heading} title={heading} onPress={() => reveal(parts.current.get(heading) ?? null, scroll?.current ?? null)} />
          ))}
        </Section>
      }
      end={<View style={styles.stack}>{words}</View>}
    />
  );
}

/** One section: its heading, its paragraphs in a card, and its links under them. */
function Part({ section: { heading, body, links }, spot }: { section: LegalSection; spot: (view: HostInstance | null) => void }) {
  return (
    <View ref={spot} collapsable={false}>
      <Section label={heading}>
        <GroupItem>
          <View style={styles.words}>
            <Doc source={body} />
            {links?.map(({ label, href }) => (
              <TextLink key={href} href={href as Href} label={label} muted />
            ))}
          </View>
        </GroupItem>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  words: { gap: SPACE.md },
  // A phone's width for the lead over the columns on a laptop.
  lead: { maxWidth: CONTENT_MAX },
  stack: { gap: SECTION_GAP },
});
