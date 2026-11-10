import { clockState, humanError, databaseState, needRow, noticeToShow, ownerFigures, overviewRange, type Overview, type OverviewSpan } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckIcon, TriangleAlertIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ownerOverview } from '@/api/houses';
import { liveNotices } from '@/api/owner';
import { ownerZone } from '@/components/admin/audit-entry';
import { WeekChart } from '@/components/admin/week-chart';
import { Figures, type Figure } from '@/components/figures';
import { Group } from '@/components/group';
import { NoticePreview } from '@/components/notice-banner';
import { ReadFailed } from '@/components/read-state';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Chip } from '@/components/status-mark';
import { OutlinePlate } from '@/components/outline';
import { TextButton } from '@/components/text-button';
import { TitleBar } from '@/components/title-bar';
import { INSET, ROW_MIN, SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { OverviewOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

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
  const words = useWords();
  return (
    <Screen spreads bar={<TitleBar title={words('admin.overview.page')} />} testID="admin-overview">
      <OverviewBody />
    </Screen>
  );
}

function OverviewBody() {
  const words = useWords();
  const two = useColumns();
  const [span, setSpan] = useState<OverviewSpan>('week');
  const zone = ownerZone();
  const read = useQuery({ queryKey: ['owner-overview', span, zone], queryFn: () => ownerOverview(span, zone), refetchInterval: 60_000 });
  if (read.isPending) return <Waiting ready={false} outline={<OverviewOutline />} fill />;
  if (read.isError) return <ReadFailed message={humanError(read.error)} onRetry={() => void read.refetch()} />;
  const { overview, ms } = read.data;
  const now = new Date();
  const needs = <NeedsYou overview={overview} now={now} />;
  const health = <RightNow overview={overview} ms={ms} now={now} />;
  const numbers = <Numbers overview={overview} zone={zone} onSpan={setSpan} />;
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
      {/* On a phone there's no rail to carry it. */}
      <View style={styles.words}>
        <TextButton label={words('admin.shell.backToHouse')} icon={ArrowLeftIcon} href="/" align="start" testID="admin-to-house" />
      </View>
    </View>
  );
}

function NeedsYou({ overview, now }: { overview: Overview; now: Date }) {
  const words = useWords();
  return (
    <Section
      label={words('admin.overview.needsYou')}
      right={<TextButton label={words('admin.overview.openInbox', { count: overview.reports })} href={'/admin/inbox' as never} testID="overview-inbox" />}
      testID="overview-needs"
    >
      {overview.needs.length === 0 ? (
        <Row title={words('admin.overview.nothingNeeds')} meta={words('admin.overview.nothingNeedsBody')} metaLines={2} />
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
  const words = useWords();
  const db = databaseState(ms);
  const clock = clockState(overview.clock, now);
  const mark = (up: boolean, bad: string) =>
    up ? <Chip label={words('admin.overview.up')} icon={CheckIcon} tone="good" /> : <Chip label={bad} icon={TriangleAlertIcon} tone="hazard" />;
  return (
    <Section label={words('admin.overview.rightNow')} testID="overview-health">
      <Row title={words('admin.overview.database')} meta={db.meta} trailing={mark(db.up, words('admin.overview.slow'))} testID="health-database" />
      <Row title={words('admin.overview.clock')} meta={clock.meta} trailing={mark(clock.up, words('admin.overview.late'))} testID="health-clock" />
    </Section>
  );
}

function Numbers({ overview, zone, onSpan }: { overview: Overview; zone: string; onSpan: (span: OverviewSpan) => void }) {
  const words = useWords();
  const figures: Figure[] = ownerFigures(overview, words).map((f) => ({
    key: f.key,
    value: f.value,
    label: f.label,
    note: f.meta,
    href: FIGURE_HREF[f.key] as never,
  }));
  const weeks = overview.weeks;
  const range = overviewRange(overview, zone);
  return (
    <>
      <Section
        label={range}
        right={
          <Segmented
            label={words('admin.overview.spanLabel')}
            options={(['week', 'month'] as const).map((value) => ({ value, label: words(`admin.overview.spans.${value}` as const) }))}
            value={overview.span}
            onChange={onSpan}
            testID="overview-span"
          />
        }
        bare
      >
        <Figures figures={figures} label={range} testID="overview-figures" />
      </Section>
      <Section label={words('admin.overview.chart')} right={words('admin.overview.chartNote')} bare>
        <WeekChart
          values={weeks.map((w) => Number(w.active))}
          first={weeks.length > 0 ? day(new Date(new Date(weeks[0].ends).getTime() - 7 * 86_400_000).toISOString()) : ''}
          last={words('admin.overview.thisWeek')}
          label={words('admin.overview.chart')}
          testID="overview-chart"
        />
      </Section>
    </>
  );
}

/** The notice people see now, as they see it, and the way to change it. */
function InTheApp() {
  const words = useWords();
  const live = useQuery({ queryKey: ['owner-notices', 'live'], queryFn: () => liveNotices() });
  const showing = live.data ? noticeToShow(live.data, {}, new Date()) : null;
  return (
    <Section label={words('admin.overview.inTheApp')} bare testID="overview-notice">
      {live.isError ? (
        <ReadFailed message={humanError(live.error)} onRetry={() => void live.refetch()} />
      ) : live.isPending ? (
        <Waiting ready={false} outline={<OutlinePlate height={ROW_MIN} />} />
      ) : showing ? (
        <NoticePreview notice={showing} />
      ) : (
        <Group>
          <Row title={words('admin.overview.noNotice')} />
        </Group>
      )}
      <View style={styles.words}>
        <TextButton label={words('admin.overview.changeNotice')} href={'/admin/notices' as never} align="start" testID="overview-notices" />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.xxl },
  // Words on the page start where a card's do, as the section labels.
  words: { paddingHorizontal: INSET, alignItems: 'flex-start' },
});
