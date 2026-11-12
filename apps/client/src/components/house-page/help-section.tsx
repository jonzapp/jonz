import { type ReportKind } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BookOpenIcon, BugIcon, CompassIcon, LightbulbIcon, MessagesSquareIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { myReports } from '@/api/reports';
import { CountBadge } from '@/components/badge';
import { ReportForm } from '@/components/report/report-form';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useTour } from '@/components/tour/tour-context';
import { INSET, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Help, on House between You and Leave: Read the guide, the tours (Show me
 * around opens the Help sheet, as the title bar's question mark does), report a problem
 * or send an idea (one sheet, either way in), and Your reports with the
 * replies to read.
 * Under it, the support address for anyone who'd rather email.
 */
export function HelpSection({ house }: { house: string }) {
  const words = useWords();
  const client = useQueryClient();
  const tours = useTour();
  const [open, setOpen] = useState<ReportKind | null>(null);
  const mine = useQuery({ queryKey: ['my-reports'], queryFn: myReports });
  // Sent: it's under Your reports, where the reply will come.
  const sent = (id: string) => {
    setOpen(null);
    void client.invalidateQueries({ queryKey: ['my-reports'] });
    router.push(`/you/reports/${id}` as never);
  };
  const unread = mine.data?.filter((r) => r.unread).length ?? 0;
  return (
    <View style={styles.stack} testID="help-section">
      <Section label={words('common.report.help')}>
        <Row
          leading={<RowIcon icon={BookOpenIcon} />}
          title={words('door.tour.guide')}
          meta={words('door.tour.guideMeta')}
          href="/house/guide"
          chevron
          testID="to-guide"
        />
        {tours ? (
          <Row
            leading={<RowIcon icon={CompassIcon} />}
            title={words('door.tour.guidesRow')}
            meta={words('door.tour.guidesMeta')}
            onPress={tours.openHelp}
            chevron
            testID="to-guides"
          />
        ) : null}
        <Row leading={<RowIcon icon={BugIcon} />} title={words('common.report.report')} onPress={() => setOpen('problem')} chevron testID="to-report" />
        <Row leading={<RowIcon icon={LightbulbIcon} />} title={words('common.report.idea')} onPress={() => setOpen('idea')} chevron testID="to-idea" />
        <Row
          leading={<RowIcon icon={MessagesSquareIcon} />}
          title={words('common.report.yours')}
          meta={words('common.report.yoursMeta', { count: mine.data?.length ?? 0, replies: unread })}
          trailing={<CountBadge count={unread} />}
          href="/you/reports"
          chevron
          testID="to-reports"
        />
      </Section>
      <Meta style={styles.email}>{words('common.report.orEmail')}</Meta>
      <Sheet visible={open !== null} title={open ? words(`common.report.title.${open}` as const) : undefined} onClose={() => setOpen(null)} testID="report-sheet">
        {open ? <ReportForm key={open} start={open} house={house} onSent={sent} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  email: { paddingLeft: INSET },
});
