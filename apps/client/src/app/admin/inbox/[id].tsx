import { REPORT_COPY } from '@app/core';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { ReportPanel } from '@/components/admin/report-panel';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { COLUMNS_MIN, RAIL } from '@/theme';

/** One report on a phone: the Inbox's side panel as a page of its own. */
export default function InboxReportPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // On a laptop it opens beside the list, so the page never sits in one column with the room blank beside it.
  const laptop = useWindowDimensions().width - RAIL >= COLUMNS_MIN;
  if (laptop) return <Redirect href={{ pathname: '/admin/inbox', params: { open: id } }} />;
  return (
    <Screen bar={<TitleBar title={REPORT_COPY.inbox} back="/admin/inbox" backLabel={REPORT_COPY.inbox} />} testID="admin-inbox-report">
      <ReportPanel id={id} />
    </Screen>
  );
}
