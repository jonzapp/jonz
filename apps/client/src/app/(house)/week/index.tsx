import {
  canSwap,
  CREW_COPY,
  oneRowPerJob,
  passUnlocked,
  liveWeekFilter,
  ON_CALL_COPY,
  PAGE_TITLE,
  RECORD_COPY,
  toggleWeekFilter,
  WEEK_SUMMARY_COPY,
  weekAwayLine,
  weekAwayNote,
  weekFairness,
  weekList,
  weekLookAhead,
  weekPeople,
  weekRangeLine,
  weekSummary,
  weekTogether,
  weekUnticked,
  whoDeals,
  type JohnDef,
  type WeekPart,
} from '@app/core';
import { RepeatIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { JohnRow, type JohnRowContext } from '@/components/john-row';
import { PageTitle } from '@/components/page-title';
import { Reading, ReadFailed } from '@/components/read-state';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-mark';
import { TextButton } from '@/components/text-button';
import { MoreButton, TitleBar } from '@/components/title-bar';
import { TableSection } from '@/components/house-page/table-section';
import { ComingUpSection } from '@/components/week/coming-up';
import { FairnessFooter } from '@/components/week/fair-shares';
import { AheadWeeks, TurnsNextSection, WaitingSection } from '@/components/week/look-ahead';
import { PersonSection } from '@/components/week/person-section';
import { WeekSummaryBar } from '@/components/week/summary';
import { WeekEmpty } from '@/components/week/week-empty';
import { WeekMenu } from '@/components/week/week-menu';
import { WeekTable } from '@/components/week/week-table';
import { TourSpot } from '@/components/tour/tour-spot';
import { useAway } from '@/hooks/use-away';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { useStake } from '@/hooks/use-stake';
import { useTable } from '@/hooks/use-table';
import { INSET, WIDE } from '@/theme';

/**
 * Week: how the whole house's week is going. The title bar's "•••" holds
 * time away and, for admins, the John list and re-dealing. Then the summary,
 * whose legend filters the list; Johns done together, one row each; one
 * group per person, you first, finished Johns folded (from WIDE on the web, one table row per John instead, with
 * who's away and your swap under the summary); then what the deal looked
 * ahead to: the Johns waiting their turn, and whose turn is next (in
 * Classic, the next two weeks person by person); the long Johns coming up
 * that nothing else has named yet; and the deal's fairness in a sentence,
 * which opens the fair shares, and the way to the track record.
 * Tapping any John opens its sheet.
 */
export default function Week() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <WeekFor houseId={house!.id} userId={session!.user.id} />;
}

function WeekFor({ houseId, userId }: { houseId: string; userId: string }) {
  const wide = useWindowDimensions().width >= WIDE;
  const { query, view } = useHouse(houseId, userId);
  // Time away isn't on Realtime: read it again on coming back to Week. A pull reads it and the fair shares too.
  const away = useAway(houseId, view?.snapshot);
  const shares = useTable(houseId, view?.snapshot);
  // Before the first deal an admin's Week offers it as Today's checklist does, which counts the John list.
  const forDeal = view?.board.notStarted === true && view.me?.role === 'admin';
  // Once a week is dealt, the list says what's coming up.
  const list = useJohnList(houseId, forDeal || view?.board.week != null);
  useReadOnFocus(away.refetch, { skipFirst: true });
  const { refreshing, pull } = usePull(houseId, () =>
    Promise.all([query.refetch(), ...(view ? [away.refetch(), shares.refetch()] : [])]),
  );
  const [menu, setMenu] = useState(false);
  const board = view?.board;

  return (
    <Screen
      bar={
        <>
          <TitleBar
            title={PAGE_TITLE.week}
            right={
              <TourSpot id="week.more">
                <MoreButton onPress={() => setMenu(true)} />
              </TourSpot>
            }
            ask={view?.me?.role === 'admin'}
          />
          <WeekMenu
            visible={menu}
            onClose={() => setMenu(false)}
            houseId={houseId}
            admin={view?.me?.role === 'admin'}
            canRedeal={board?.week != null && weekUnticked(board.items)}
            weekId={board?.week?.id ?? null}
            userId={userId}
          />
        </>
      }
      spreads
      refreshing={refreshing}
      onRefresh={pull}
      testID="week-screen"
    >
      <PageTitle page={PAGE_TITLE.week} />
      {view ? (
        <Board view={view} wide={wide} away={away} shares={shares} johns={forDeal ? (list.data?.johns ?? null) : null} list={list.data?.johns ?? null} />
      ) : query.isError ? (
        <ReadFailed onRetry={() => void query.refetch()} />
      ) : (
        <Reading />
      )}
    </Screen>
  );
}

function Board({
  view,
  wide,
  away: awayRead,
  shares: sharesRead,
  johns,
  list,
}: {
  view: HouseView;
  wide: boolean;
  away: ReturnType<typeof useAway>;
  shares: ReturnType<typeof useTable>;
  johns: readonly unknown[] | null;
  /** The John list, once read: for what's coming up. */
  list: readonly JohnDef[] | null;
}) {
  const away = awayRead.data;
  const shares = sharesRead.data;
  const two = useColumns();
  const { snapshot, board, me, now } = view;
  const { house, members, rules } = snapshot;
  const [filter, setFilter] = useState<WeekPart | null>(null);
  const userId = me?.userId ?? '';
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? null;
  const context: JohnRowContext = { houseId: house.id, userId, zone: rules.timezone, rules, now, nameOf };

  // A week of only on-call Johns has nothing on it until someone flags one, but is dealt.
  if (!board.week || (board.items.length === 0 && snapshot.onCall.length === 0)) {
    return (
      <WeekEmpty
        houseId={house.id}
        notStarted={board.notStarted}
        isAdmin={me?.role === 'admin'}
        adminName={whoDeals(members)}
        johns={johns}
        memberCount={members.length}
      />
    );
  }

  const week = board.week;
  const summary = weekSummary(board.items);
  const shown = liveWeekFilter(summary, filter);
  // A filter whose part has emptied lets go for good, so the part filling up again later doesn't hide the rest.
  if (filter !== null && shown === null) setFilter(null);
  const memberIds = members.map((m) => m.userId);
  const fairness = shares ? weekFairness(shares.balances, board.items.map((i) => i.points), userId, nameOf) : null;
  const pointsOf = (id: string) => board.table.find((r) => r.userId === id)?.points ?? 0;
  const awayOf = (id: string) => (away ? weekAwayNote(away.periods, id, week.startsOn, away.today) : null);
  const onCallOf = (id: string) => {
    const names = snapshot.onCall.filter((r) => r.user_id === id && r.johns).map((r) => r.johns!.name);
    return names.length > 0 ? ON_CALL_COPY.weekLine(names) : null;
  };
  const swapReady = canSwap(board, me);

  const summaryBar = (
    <TourSpot id="week.summary">
    <WeekSummaryBar
      range={weekRangeLine(week.startsAt, week.endsAt, now, rules.timezone)}
      summary={summary}
      filter={shown}
      onFilter={(part) => setFilter(toggleWeekFilter(shown, part))}
      // The table has no person headers, so what they'd say about time away and your swap goes here.
      tag={wide && swapReady ? <Chip label={WEEK_SUMMARY_COPY.swapReady} icon={RepeatIcon} testID="swap-ready" /> : undefined}
      note={
        wide
          ? weekAwayLine(
              weekPeople(board.items, memberIds, userId).map((p) => ({ userId: p.userId, away: awayOf(p.userId) })),
              userId,
              nameOf,
            )
          : null
      }
    />
    </TourSpot>
  );
  // Johns done together: one row each, under Together on a phone, in the table's one list on a laptop.
  const together = weekTogether(board.items, userId, shown);
  const johnRows = wide ? (
    <TourSpot id="week.everyone">
      <WeekTable {...weekList(oneRowPerJob(board.items, userId), shown)} context={context} />
    </TourSpot>
  ) : (
    <>
      {together.length > 0 ? (
        <Section label={CREW_COPY.together} testID="week-together">
          {together.map((item) => (
            <JohnRow key={item.id} item={item} context={context} testID="week-row" />
          ))}
        </Section>
      ) : null}
      {weekPeople(board.items, memberIds, userId, shown).map((person, i) => {
        const section = (
          <PersonSection
            key={person.userId}
            person={person}
            context={context}
            points={pointsOf(person.userId)}
            away={awayOf(person.userId)}
            onCall={onCallOf(person.userId)}
            swapReady={person.userId === userId && swapReady}
          />
        );
        // A tour lights the first (yours): the rest are the same, and all of them would be taller than the screen.
        return i === 0 ? (
          <TourSpot key={person.userId} id="week.everyone">
            {section}
          </TourSpot>
        ) : (
          section
        );
      })}
    </>
  );
  const fair =
    fairness && shares ? (
      <TourSpot id="week.fairness">
      <FairnessFooter
        sentence={fairness}
        balances={shares.balances}
        memberIds={memberIds}
        viewerId={userId}
        nameOf={nameOf}
        awayMakeup={house.awayMakeup}
      />
      </TourSpot>
    ) : null;
  // What the deal looked ahead to, once the list is read to name the Johns.
  const look = list
    ? weekLookAhead({ list, state: snapshot.steady, mode: rules.dealMode, items: board.items, memberIds, viewerId: userId, nameOf })
    : null;
  const ahead = look ? (
    <>
      <WaitingSection rows={look.waiting} />
      <TurnsNextSection rows={look.turns} userId={userId} nameOf={nameOf} />
      <AheadWeeks sections={look.weeks} userId={userId} nameOf={nameOf} />
    </>
  ) : null;
  const coming = look ? <ComingUpSection johns={look.comingUp} startsOn={week.startsOn} weekStarts={rules.weekStarts} /> : null;
  const record = (
    <View style={styles.record}>
      <TextButton label={RECORD_COPY.open} href="/week/record" chevron align="start" testID="week-record" />
    </View>
  );

  // On a laptop the summary heads the board in the main column, and the Table sits in the panel beside it, over
  // the deal's fairness, from the top of the page to its foot.
  if (two) {
    return (
      <Columns
        main={
          <>
            {summaryBar}
            {johnRows}
            {ahead}
            {coming}
          </>
        }
        side={
          <>
            {passUnlocked(house.pass, now) ? (
              <SideTable userId={userId} view={view} table={sharesRead} away={awayRead} />
            ) : null}
            {/* The deal's two quiet lines sit together under the Table, as Today's page lines do. */}
            <View>
              {fair}
              {record}
            </View>
          </>
        }
      />
    );
  }
  return (
    <>
      {summaryBar}
      {johnRows}
      {ahead}
      {coming}
      {fair}
      {record}
    </>
  );
}

/** The Table beside the board on a laptop, with the month's money it reads for itself (a phone's Week never needs it). */
function SideTable({
  userId,
  view,
  table,
  away,
}: {
  userId: string;
  view: HouseView;
  table: ReturnType<typeof useTable>;
  away: ReturnType<typeof useAway>;
}) {
  const stake = useStake(view.snapshot.house.id, view.snapshot);
  return <TableSection userId={userId} view={view} table={table} stake={stake} away={away} />;
}

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start.
  record: { paddingHorizontal: INSET, alignItems: 'flex-start' },
});
