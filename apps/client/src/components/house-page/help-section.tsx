import { REPORT_COPY, TOUR_COPY, type ReportKind } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BugIcon, CompassIcon, LightbulbIcon, MessagesSquareIcon } from 'lucide-react-native';
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

/**
 * Help, on House between You and Leave: the tours (Tours and guides opens
 * the Help sheet, as the title bar's question mark does), report a problem
 * or send an idea (one sheet, either way in), and Your reports with the
 * replies to read.
 * Under it, the support address for anyone who'd rather email.
 */
export function HelpSection({ house }: { house: string }) {
  const client = useQueryClient();
  const tours = useTour();
  const [open, setOpen] = useState<ReportKind | null>(null);
  const mine = useQuery({ queryKey: ['my-reports'], queryFn: myReports });
  // Sent: it's under Your reports, where the reply will come.
  const sent = (id: string) => {
    setOpen(null);
    void client.invalidateQueries({ queryKey: ['my-reports'] });
    router.push(`/house/reports/${id}` as never);
  };
  const unread = mine.data?.filter((r) => r.unread).length ?? 0;
  return (
    <View style={styles.stack} testID="help-section">
      <Section label={REPORT_COPY.help}>
        {tours ? (
          <Row
            leading={<RowIcon icon={CompassIcon} />}
            title={TOUR_COPY.guidesRow}
            meta={TOUR_COPY.guidesMeta}
            onPress={tours.openHelp}
            chevron
            testID="to-guides"
          />
        ) : null}
        <Row leading={<RowIcon icon={BugIcon} />} title={REPORT_COPY.report} onPress={() => setOpen('problem')} chevron testID="to-report" />
        <Row leading={<RowIcon icon={LightbulbIcon} />} title={REPORT_COPY.idea} onPress={() => setOpen('idea')} chevron testID="to-idea" />
        <Row
          leading={<RowIcon icon={MessagesSquareIcon} />}
          title={REPORT_COPY.yours}
          meta={REPORT_COPY.yoursMeta(mine.data?.length ?? 0, unread)}
          trailing={<CountBadge count={unread} />}
          href="/house/reports"
          chevron
          testID="to-reports"
        />
      </Section>
      <Meta style={styles.email}>{REPORT_COPY.orEmail}</Meta>
      <Sheet visible={open !== null} title={open ? REPORT_COPY.title[open] : undefined} onClose={() => setOpen(null)} testID="report-sheet">
        {open ? <ReportForm key={open} start={open} house={house} onSent={sent} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  email: { paddingLeft: INSET },
});
