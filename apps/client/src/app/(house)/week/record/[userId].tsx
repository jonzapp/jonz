import { readSpan, RECORD_SPANS, type RecordSpan } from '@app/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useOpensBeside } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { TitleBar } from '@/components/title-bar';
import { PersonSections, usePersonRecord } from '@/components/week/person-record';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * One person's track record on a phone, pushed from a row of it: the span,
 * then where their points come from and what happens next
 * (PersonSections). On a laptop it opens beside the grid instead, so the
 * page never sits in one column with the room blank beside it.
 */
export default function RecordPersonScreen() {
  const { session, house } = useMembership();
  const { userId: personId, span } = useLocalSearchParams<{ userId: string; span?: string }>();
  const beside = useOpensBeside();
  if (beside) return <Redirect href={{ pathname: '/week/record', params: { span: readSpan(span), open: personId } }} />;
  // The layout's guard only shows the house's screens with a house and a session.
  return <PersonRecordPage houseId={house!.id} userId={session!.user.id} personId={personId} span={readSpan(span)} />;
}

function PersonRecordPage({ houseId, userId, personId, span }: { houseId: string; userId: string; personId: string; span: RecordSpan }) {
  const words = useWords();
  const record = usePersonRecord(houseId, userId, personId, span);
  return (
    <Screen
      bar={
        <TitleBar
          title={record.name}
          sub={record.breakdown?.range}
          back={{ pathname: '/week/record', params: { span } }}
          backLabel={words('week.record.title')}
        />
      }
      refreshing={record.refreshing}
      onRefresh={record.pull}
      testID="record-person-screen"
    >
      <PageTitle page={record.name} />
      <View style={styles.top}>
        <Segmented
          options={RECORD_SPANS.map((value) => ({ value, label: words(`week.record.spans.${value}` as const) }))}
          value={span}
          onChange={(value) => router.setParams({ span: value })}
          label={words('week.record.span')}
          equal
          testID="record-span"
        />
      </View>
      <PersonSections record={record} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start.
  top: { paddingHorizontal: INSET, gap: SPACE.md },
});
