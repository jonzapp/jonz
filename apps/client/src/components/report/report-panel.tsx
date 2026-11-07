import { REPORT_COPY } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, RotateCcwIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { openReport, replyToReport, setReportState, type Report } from '@/api/reports';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Group } from '@/components/group';
import { DetailsList, ReplyBox, ReportChip, ReportThread } from '@/components/report/report-parts';
import { Lead, Meta } from '@/components/text';
import { SPACE, useTheme } from '@/theme';

/** The Inbox's reads, so a reply or a fix can refresh the list, the count and the report together. */
export const INBOX_KEY = ['owner-inbox'] as const;

/**
 * One report, for the owner: who sent it and from where, the conversation,
 * what the app sent with it, a box to reply (in the app and by email), and
 * Mark fixed (or Open it again). Opening a new one marks it read.
 */
export function ReportPanel({ id }: { id: string }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const report = useQuery({ queryKey: [...INBOX_KEY, 'report', id], queryFn: () => openReport(id) });
  // Opening it may have marked it read: the list's chip says so too.
  const opened = report.data?.id;
  useEffect(() => {
    if (opened) void client.invalidateQueries({ queryKey: [...INBOX_KEY, 'rows'] });
  }, [client, opened]);
  const refresh = () => client.invalidateQueries({ queryKey: INBOX_KEY });
  const fix = useMutation({
    mutationFn: (state: 'fixed' | 'open') => setReportState(id, state),
    onSuccess: refresh,
  });

  if (report.isPending) return <ActivityIndicator color={colors.mutedForeground} style={styles.wait} />;
  if (report.isError) return <Alert message={report.error.message} testID="report-panel-problem" />;
  return <ReportBody report={report.data} fixing={fix} onReply={async (text) => {
    await replyToReport(id, text);
    await refresh();
  }} />;
}

function ReportBody({
  report,
  fixing,
  onReply,
}: {
  report: Report;
  fixing: { mutate: (state: 'fixed' | 'open') => void; isPending: boolean; error: Error | null };
  onReply: (text: string) => Promise<void>;
}) {
  const first = report.name?.split(' ')[0] ?? REPORT_COPY.gone;
  const where = [report.house ?? REPORT_COPY.noHouse, report.role ? REPORT_COPY.role[report.role as 'admin' | 'member'] ?? null : null, report.email]
    .filter(Boolean)
    .join(', ');
  const fixed = report.state === 'fixed';
  return (
    <View style={styles.panel} testID="report-panel">
      <View style={styles.head}>
        <View style={styles.titleLine}>
          <Lead header style={styles.name}>
            {report.name ?? REPORT_COPY.gone}
          </Lead>
          <ReportChip state={report.state} owner testID="report-panel-state" />
        </View>
        <Meta>{where}</Meta>
      </View>
      <ReportThread report={report} viewer="owner" />
      {report.details ? (
        <Group>
          <DetailsList details={report.details} />
        </Group>
      ) : null}
      {report.userId ? <ReplyBox placeholder={REPORT_COPY.replyTo(first)} onSend={onReply} testID="report-reply" /> : null}
      <ButtonRow>
        <Button
          label={fixed ? REPORT_COPY.reopen : REPORT_COPY.markFixed}
          icon={fixed ? RotateCcwIcon : CheckIcon}
          variant="outline"
          disabled={fixing.isPending}
          onPress={() => fixing.mutate(fixed ? 'open' : 'fixed')}
          testID={fixed ? 'report-reopen' : 'report-fixed'}
        />
      </ButtonRow>
      {fixing.error ? <Alert message={fixing.error.message} /> : null}
      <Meta>{REPORT_COPY.note}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.lg },
  head: { gap: SPACE.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  name: { flex: 1 },
  wait: { marginTop: SPACE.xl },
});
