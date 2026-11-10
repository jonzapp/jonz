import { REPORT_COPY, TOURS, tourForPage, tourLength, toursFor, tourSteps, type ReportKind, type TourId } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BookOpenIcon, BugIcon, CheckIcon, LightbulbIcon, MessagesSquareIcon, SparklesIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { myReports } from '@/api/reports';
import { CountBadge } from '@/components/badge';
import { ReportForm } from '@/components/report/report-form';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Chip } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { useTour } from '@/components/tour/tour-context';
import { useAskJonz } from '@/hooks/use-ask-jonz';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SECTION_GAP } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Help, from the title bar's question mark. First the two ways to find
 * something out, as help centres lead: Ask Jonz (the chat, when you may use
 * it) and Read the guide (the same words Jonz reads). Then Show me around:
 * the tours, the page you're on first (an admin's among them for admins).
 * Then the same ways to report a problem or send an idea that the You
 * page's Help section has, and Your reports. Reporting changes
 * the sheet's own content to the report form, as a sheet does, rather than
 * opening a second sheet. Choosing a tour puts the sheet away and starts it
 * once the sheet has gone.
 */
export function HelpSheet({
  visible,
  page,
  canAsk = false,
  onClose,
  onTour,
  onDismissed,
}: {
  visible: boolean;
  /** The page it was opened on: its tour comes first. */
  page: string;
  /** Whether this person may use Ask Jonz. */
  canAsk?: boolean;
  onClose: () => void;
  onTour: (id: TourId) => void;
  onDismissed: () => void;
}) {
  const words = useWords();
  const [reporting, setReporting] = useState<ReportKind | null>(null);
  const close = () => {
    setReporting(null);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      title={reporting ? REPORT_COPY.title[reporting] : words('door.tour.help')}
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
        <HelpMenu page={page} canAsk={canAsk} onTour={onTour} onReport={setReporting} onClose={close} />
      ) : null}
    </Sheet>
  );
}

function HelpMenu({
  page,
  canAsk,
  onTour,
  onReport,
  onClose,
}: {
  page: string;
  canAsk: boolean;
  onTour: (id: TourId) => void;
  onReport: (kind: ReportKind) => void;
  onClose: () => void;
}) {
  const words = useWords();
  const tours = useTour();
  const ask = useAskJonz('open');
  const mine = useQuery({ queryKey: ['my-reports'], queryFn: myReports });
  if (!tours) return null;
  const here = tourForPage(page);
  // The page's own tour first, then the rest.
  const all = toursFor(tours.facts);
  const listed = here ? [here, ...all.filter((id) => id !== here)] : all;
  const unread = mine.data?.filter((r) => r.unread).length ?? 0;
  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };
  return (
    <View style={styles.menu}>
      <Section label={words('door.tour.findOut')} testID="help-find-out">
        {canAsk ? (
          <Row
            leading={<RowIcon icon={SparklesIcon} />}
            title={words('door.tour.ask')}
            meta={words('door.tour.askMeta')}
            onPress={() => {
              if ('href' in ask) go(ask.href as string);
              else {
                onClose();
                ask.onPress();
              }
            }}
            chevron
            testID="help-ask"
          />
        ) : null}
        <Row
          leading={<RowIcon icon={BookOpenIcon} />}
          title={words('door.tour.guide')}
          meta={words('door.tour.guideMeta')}
          onPress={() => go('/house/guide')}
          chevron
          testID="help-guide"
        />
      </Section>
      {listed.length > 0 ? (
        <Section label={words('door.tour.showMeAround')} testID="help-guides">
          {listed.map((id) => {
            const length = tourLength(tourSteps(id, tours.facts).length);
            return (
              <Row
                key={id}
                title={TOURS[id].name}
                meta={id === here ? words('door.tour.thisPage', { length }) : length}
                trailing={tours.saved.seen.includes(id) ? <Chip label={words('door.tour.seen')} icon={CheckIcon} tone="good" /> : undefined}
                onPress={() => onTour(id)}
                chevron
                testID={`help-tour-${id}`}
              />
            );
          })}
        </Section>
      ) : null}
      <Section label={words('door.tour.somethingWrong')}>
        <Row leading={<RowIcon icon={BugIcon} />} title={REPORT_COPY.report} onPress={() => onReport('problem')} chevron testID="help-report" />
        <Row leading={<RowIcon icon={LightbulbIcon} />} title={REPORT_COPY.idea} onPress={() => onReport('idea')} chevron testID="help-idea" />
        <Row
          leading={<RowIcon icon={MessagesSquareIcon} />}
          title={REPORT_COPY.yours}
          meta={REPORT_COPY.yoursMeta(mine.data?.length ?? 0, unread)}
          trailing={<CountBadge count={unread} />}
          onPress={() => go('/house/reports')}
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
  email: { paddingLeft: INSET },
});
