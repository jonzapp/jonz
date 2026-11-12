import { reportSentAt, reportGist } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { BugIcon, CircleHelpIcon, LightbulbIcon, MessagesSquareIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { myReports, type MyReport } from '@/api/reports';
import { CountBadge } from '@/components/badge';
import { EmptyState } from '@/components/empty-state';
import { Group } from '@/components/group';
import { HousePage } from '@/components/house/house-page';
import { ReportChip, said } from '@/components/report/report-parts';
import { Row, RowIcon } from '@/components/row';
import { Meta } from '@/components/text';
import { INSET, SPACE } from '@/theme';
import { ListPageOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

const KIND_ICON = { problem: BugIcon, idea: LightbulbIcon, question: CircleHelpIcon } as const;

/** Your reports: what you've sent, newest first, each with where it's got to and any reply to read. */
export default function ReportsScreen() {
  const words = useWords();
  const mine = useQuery({ queryKey: ['my-reports'], queryFn: myReports });
  return (
    <HousePage
      title={words('common.report.yours')}
      back="/you"
      backLabel={words('common.section.you')}
      testID="your-reports"
      outline={<ListPageOutline sections={[4]} lead="circle" />}
      ready={!!mine.data}
      failed={mine.isError}
      onRetry={() => void mine.refetch()}
      fills
    >
      {() => <YourReports reports={mine.data!} />}
    </HousePage>
  );
}

function YourReports({ reports }: { reports: MyReport[] }) {
  const words = useWords();
  if (reports.length === 0) return <EmptyState icon={MessagesSquareIcon} title={words('common.report.noneYet')} body={words('common.report.noneYetBody')} />;
  return (
    <View style={styles.stack}>
      <Group>
        {reports.map((report) => (
          <Row
            key={report.id}
            leading={<RowIcon icon={KIND_ICON[report.kind]} />}
            title={reportGist(report.words)}
            titleLines={2}
            meta={report.unread ? words('common.report.yoursMeta', { count: 1, replies: 1 }) : reportSentAt(report.kind, said(report.sentAt), words)}
            trailing={report.unread ? <CountBadge count={1} /> : <ReportChip state={report.state} />}
            href={`/you/reports/${report.id}` as never}
            testID={`report-${report.id}`}
          />
        ))}
      </Group>
      <Meta style={styles.email}>{words('common.report.orEmail')}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  email: { paddingLeft: INSET },
});
