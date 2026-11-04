import { clockState, databaseState, needRow, noticeToShow, OVERVIEW_COPY, ownerFigures, type Overview } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, TriangleAlertIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ownerOverview } from '@/api/houses';
import { liveNotices } from '@/api/owner';
import { WeekChart } from '@/components/admin/week-chart';
import { Figures, type Figure } from '@/components/figures';
import { Group } from '@/components/group';
import { NoticePreview } from '@/components/notice-banner';
import { ReadFailed, Reading } from '@/components/read-state';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Chip } from '@/components/status-mark';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TitleBar } from '@/components/title-bar';
import { SPACE } from '@/theme';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${new Date(iso).getDate()} ${MONTH[new Date(iso).getMonth()]}`;

/** Where each figure opens: the houses it counts, where there's a list of them. */
const FIGURE_HREF: Record<string, string | undefined> = {
  houses: '/admin/houses',
  active: '/admin/houses?active=week',
  passes: '/admin/houses?pass=paid',
};

/**
 * Overview: is Jonz healthy, and does anything need me? What's waiting
 * first, then how the database and the clock are, then the week's (or
 * month's) figures and ten weeks of active houses. No buttons: every row
 * opens its page. On a laptop how things are right now, and the notice
 * people see, sit beside the figures.
 */
export default function OverviewPage() {
  return (
    <Screen spreads bar={<TitleBar title={OVERVIEW_COPY.page} />} testID="admin-overview">
      <OverviewBody />
    </Screen>
  );
}

function OverviewBody() {
  const two = useColumns();
  const [days, setDays] = useState<7 | 30>(7);
  const read = useQuery({ queryKey: ['owner-overview', days], queryFn: () => ownerOverview(days), refetchInterval: 60_000 });
  if (read.isPending) return <Reading />;
  if (read.isError) return <ReadFailed message={read.error.message} onRetry={() => void read.refetch()} />;
  const { overview, ms } = read.data;
  const now = new Date();
  const needs = <NeedsYou overview={overview} now={now} />;
  const health = <RightNow overview={overview} ms={ms} now={now} />;
  const numbers = <Numbers overview={overview} days={days} onDays={setDays} />;
  if (two) {
    return (
      <Columns
        main={
          <View style={styles.stack}>
            {needs}
            {numbers}
          </View>
        }
        side={
          <View style={styles.stack}>
            {health}
            <InTheApp />
          </View>
        }
      />
    );
  }
  return (
    <View style={styles.stack}>
      {needs}
      {health}
      {numbers}
      <InTheApp />
    </View>
  );
}

function NeedsYou({ overview, now }: { overview: Overview; now: Date }) {
  return (
    <Section
      label={OVERVIEW_COPY.needsYou}
      right={<TextButton label={OVERVIEW_COPY.openInbox(overview.reports)} href={'/admin/inbox' as never} testID="overview-inbox" />}
      testID="overview-needs"
    >
      {overview.needs.length === 0 ? (
        <Row title={OVERVIEW_COPY.nothingNeeds} meta={OVERVIEW_COPY.nothingNeedsBody} metaLines={2} />
      ) : (
        overview.needs.map((need) => {
          const row = needRow(need, now);
          return <Row key={`${need.kind}-${need.id}`} title={row.title} meta={row.meta} metaLines={2} href={row.href as never} chevron testID={`need-${need.id}`} />;
        })
      )}
    </Section>
  );
}

function RightNow({ overview, ms, now }: { overview: Overview; ms: number; now: Date }) {
  const db = databaseState(ms);
  const clock = clockState(overview.clock, now);
  const mark = (up: boolean, bad: string) =>
    up ? <Chip label={OVERVIEW_COPY.up} icon={CheckIcon} tone="good" /> : <Chip label={bad} icon={TriangleAlertIcon} tone="hazard" />;
  return (
    <Section label={OVERVIEW_COPY.rightNow} testID="overview-health">
      <Row title={OVERVIEW_COPY.database} meta={db.meta} trailing={mark(db.up, OVERVIEW_COPY.slow)} testID="health-database" />
      <Row title={OVERVIEW_COPY.clock} meta={clock.meta} trailing={mark(clock.up, OVERVIEW_COPY.late)} testID="health-clock" />
    </Section>
  );
}

function Numbers({ overview, days, onDays }: { overview: Overview; days: 7 | 30; onDays: (days: 7 | 30) => void }) {
  const figures: Figure[] = ownerFigures(overview).map((f) => ({
    key: f.key,
    value: f.value,
    label: f.label,
    note: f.meta,
    href: FIGURE_HREF[f.key] as never,
  }));
  const weeks = overview.weeks;
  return (
    <>
      <Section
        label={OVERVIEW_COPY.thisWindow(days)}
        right={
          <Segmented
            label={OVERVIEW_COPY.windowLabel}
            options={[
              { value: '7', label: OVERVIEW_COPY.windows[7] },
              { value: '30', label: OVERVIEW_COPY.windows[30] },
            ]}
            value={String(days)}
            onChange={(value) => onDays(value === '30' ? 30 : 7)}
            testID="overview-days"
          />
        }
        bare
      >
        <Figures figures={figures} label={OVERVIEW_COPY.thisWindow(days)} testID="overview-figures" />
      </Section>
      <Section label={OVERVIEW_COPY.chart} right={OVERVIEW_COPY.chartNote} bare>
        <WeekChart
          values={weeks.map((w) => Number(w.active))}
          first={weeks.length > 0 ? day(new Date(new Date(weeks[0].ends).getTime() - 7 * 86_400_000).toISOString()) : ''}
          last={OVERVIEW_COPY.thisWeek}
          label={OVERVIEW_COPY.chart}
          testID="overview-chart"
        />
      </Section>
    </>
  );
}

/** The notice people see now, as they see it, and the way to change it. */
function InTheApp() {
  const live = useQuery({ queryKey: ['owner-notices', 'live'], queryFn: () => liveNotices() });
  const showing = live.data ? noticeToShow(live.data, {}, new Date()) : null;
  return (
    <Section label={OVERVIEW_COPY.inTheApp} bare testID="overview-notice">
      {showing ? <NoticePreview notice={showing} /> : <Group><Row title={OVERVIEW_COPY.noNotice} /></Group>}
      <TextButton label={OVERVIEW_COPY.changeNotice} href={'/admin/notices' as never} align="start" testID="overview-notices" />
      {live.isError ? <Meta>{live.error.message}</Meta> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.xxl },
});
