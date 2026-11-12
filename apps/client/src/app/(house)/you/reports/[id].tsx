import { reportSentAt, reportGist } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { MessagesSquareIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { myReport, seeReport, writeBack, type Report } from '@/api/reports';
import { ChatLog } from '@/components/chat/chat';
import { EmptyState } from '@/components/empty-state';
import { PageTitle } from '@/components/page-title';
import { ReplyBox, ReportChip, ReportThread, said } from '@/components/report/report-parts';
import { Lead, Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { GUTTER, SPACE, useTheme } from '@/theme';
import { Waiting } from '@/components/waiting';
import { ArticleOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * One of your reports, as a chat: what it's about and where it's got to at
 * the top, the conversation under it, and Ask Jonz's message box at the
 * foot to write back. Not a HousePage: the conversation scrolls over a box
 * that stays put above the keyboard.
 */
export default function ReportScreen() {
  const words = useWords();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const client = useQueryClient();
  const report = useQuery({ queryKey: ['my-report', id], queryFn: () => myReport(id) });
  // Reading it here reads its replies: House stops counting them.
  const seen = report.data?.id;
  useEffect(() => {
    if (!seen) return;
    void seeReport(seen).then(() => client.invalidateQueries({ queryKey: ['my-reports'] }));
  }, [client, seen]);
  const send = async (text: string) => {
    await writeBack(id, text);
    await Promise.all([report.refetch(), client.invalidateQueries({ queryKey: ['my-reports'] })]);
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="your-report">
      <TitleBar title={words('common.report.yourReport')} back="/you/reports" backLabel={words('common.report.yours')} />
      <PageTitle page={words('common.report.yourReport')} />
      {report.data === undefined ? (
        <View style={styles.reading}>
          <Waiting ready={false} failed={report.isError} onRetry={() => void report.refetch()} outline={<ArticleOutline />} />
        </View>
      ) : report.data === null ? (
        <View style={styles.reading}>
          <EmptyState icon={MessagesSquareIcon} title={words('common.report.missing')} body={words('common.report.missingBody')} />
        </View>
      ) : (
        <YourReport report={report.data} onSend={send} />
      )}
    </View>
  );
}

function YourReport({ report, onSend }: { report: Report; onSend: (text: string) => Promise<void> }) {
  const words = useWords();
  return (
    <ChatLog foot={<ReplyBox placeholder={words('common.report.writeBack')} onSend={onSend} testID="write-back" />}>
      <View style={styles.head}>
        <View style={styles.titleLine}>
          <Lead header style={styles.title}>
            {reportGist(report.words)}
          </Lead>
          <ReportChip state={report.state} testID="your-report-state" />
        </View>
        <Meta>{reportSentAt(report.kind, said(report.sentAt), words)}</Meta>
      </View>
      <ReportThread report={report} viewer="them" />
    </ChatLog>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  reading: { padding: GUTTER },
  head: { gap: SPACE.xs },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  title: { flex: 1 },
});
