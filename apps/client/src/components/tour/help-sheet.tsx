import { REPORT_COPY, TOUR_COPY, TOURS, tourForPage, tourLength, toursFor, tourSteps, type ReportKind, type TourId } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BugIcon, CheckIcon, CompassIcon, LightbulbIcon, MessagesSquareIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { myReports } from '@/api/reports';
import { CountBadge } from '@/components/badge';
import { Button } from '@/components/button';
import { ReportForm } from '@/components/report/report-form';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Chip } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { useTour } from '@/components/tour/tour-context';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SECTION_GAP, SPACE } from '@/theme';

/**
 * Help, from the title bar's question mark: a tour of the page you're on
 * (the sheet's one amber button), the other tours as Guides (an admin's
 * among them for admins), then the same ways to report a problem or send an
 * idea that the You page's Help section has, and Your reports. Reporting changes
 * the sheet's own content to the report form, as a sheet does, rather than
 * opening a second sheet. Choosing a tour puts the sheet away and starts it
 * once the sheet has gone.
 */
export function HelpSheet({
  visible,
  page,
  onClose,
  onTour,
  onDismissed,
}: {
  visible: boolean;
  /** The page it was opened on: its tour comes first. */
  page: string;
  onClose: () => void;
  onTour: (id: TourId) => void;
  onDismissed: () => void;
}) {
  const [reporting, setReporting] = useState<ReportKind | null>(null);
  const close = () => {
    setReporting(null);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      title={reporting ? REPORT_COPY.title[reporting] : TOUR_COPY.help}
      onClose={close}
      onDismissed={() => {
        setReporting(null);
        onDismissed();
      }}
      flush={!reporting}
      testID="help-sheet"
    >
      {reporting ? (
        <Reporting kind={reporting} onSent={close} />
      ) : visible ? (
        <HelpMenu page={page} onTour={onTour} onReport={setReporting} onClose={close} />
      ) : null}
    </Sheet>
  );
}

function HelpMenu({
  page,
  onTour,
  onReport,
  onClose,
}: {
  page: string;
  onTour: (id: TourId) => void;
  onReport: (kind: ReportKind) => void;
  onClose: () => void;
}) {
  const tours = useTour();
  const mine = useQuery({ queryKey: ['my-reports'], queryFn: myReports });
  if (!tours) return null;
  const here = tourForPage(page);
  const guides = toursFor(tours.facts).filter((id) => id !== here);
  const unread = mine.data?.filter((r) => r.unread).length ?? 0;
  return (
    <View style={styles.menu}>
      {here ? (
        <View style={styles.lead}>
          <Button label={TOURS[here].title} icon={CompassIcon} onPress={() => onTour(here)} testID="help-tour-here" />
          <Meta>{tourLength(tourSteps(here, tours.facts).length)}</Meta>
        </View>
      ) : null}
      {guides.length > 0 ? (
        <Section label={TOUR_COPY.guides} testID="help-guides">
          {guides.map((id) => (
            <Row
              key={id}
              title={TOURS[id].title}
              meta={tourLength(tourSteps(id, tours.facts).length)}
              trailing={tours.saved.seen.includes(id) ? <Chip label={TOUR_COPY.seen} icon={CheckIcon} tone="good" /> : undefined}
              onPress={() => onTour(id)}
              chevron
              testID={`help-tour-${id}`}
            />
          ))}
        </Section>
      ) : null}
      <Section label={TOUR_COPY.somethingWrong}>
        <Row leading={<RowIcon icon={BugIcon} />} title={REPORT_COPY.report} onPress={() => onReport('problem')} chevron testID="help-report" />
        <Row leading={<RowIcon icon={LightbulbIcon} />} title={REPORT_COPY.idea} onPress={() => onReport('idea')} chevron testID="help-idea" />
        <Row
          leading={<RowIcon icon={MessagesSquareIcon} />}
          title={REPORT_COPY.yours}
          meta={REPORT_COPY.yoursMeta(mine.data?.length ?? 0, unread)}
          trailing={<CountBadge count={unread} />}
          onPress={() => {
            onClose();
            router.push('/house/reports' as never);
          }}
          chevron
          testID="help-reports"
        />
      </Section>
      <Meta style={styles.email}>{REPORT_COPY.orEmail}</Meta>
    </View>
  );
}

/** The report form, in the Help sheet: sent, it's under Your reports, where the reply will come. */
function Reporting({ kind, onSent }: { kind: ReportKind; onSent: () => void }) {
  const { house } = useMembership();
  const client = useQueryClient();
  return (
    <ReportForm
      key={kind}
      start={kind}
      house={house?.id ?? null}
      onSent={(id) => {
        onSent();
        void client.invalidateQueries({ queryKey: ['my-reports'] });
        router.push(`/house/reports/${id}` as never);
      }}
    />
  );
}

const styles = StyleSheet.create({
  menu: { gap: SECTION_GAP },
  lead: { gap: SPACE.sm, paddingHorizontal: INSET },
  email: { paddingLeft: INSET },
});
