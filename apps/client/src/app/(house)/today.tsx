import { askWhosMovingIn, dayLabel, localDate, movingLine, NEXT_UP_COPY, onCallItems, PAGE_TITLE, todayPage, type StakeView } from '@app/core';

import type { AwayView } from '@/api/away';
import type { JohnList } from '@/api/settings';
import { PageTitle } from '@/components/page-title';
import { Reading, ReadFailed } from '@/components/read-state';
import { Columns, Screen, useColumns } from '@/components/screen';
import { TitleBar, TopLine } from '@/components/title-bar';
import { MoveInAsk } from '@/components/today/move-in-ask';
import { NeedsYou } from '@/components/today/needs-you';
import { NextUp } from '@/components/today/next-up';
import { OnCall } from '@/components/today/on-call';
import { PageLine, PageLines } from '@/components/today/page-line';
import { RestOfWeek } from '@/components/today/rest-of-week';
import { SetupCard } from '@/components/today/setup-card';
import { SwapOfferCard, SwapSuggestion } from '@/components/today/swap-ask';
import { WeekGlance } from '@/components/today/week-glance';
import { TourOffer } from '@/components/tour/tour-offer';
import { TourSpot } from '@/components/tour/tour-spot';
import { useAway } from '@/hooks/use-away';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { useStake } from '@/hooks/use-stake';

/**
 * Today, for doing: your next John in the one card (or what takes its
 * place), the disputes that need your vote, the on-call Johns anyone can
 * flag, the rest of your week, and one
 * line on where you stand (with your time away, when a trip is coming, and
 * your moving-out day, once you've said). When a housemate is moving out,
 * the people who stay are asked who's moving in. Fits one phone screen.
 */
export default function Today() {
  const { session, house } = useMembership();
  // The layout's guard only shows Today with a house and a session.
  return <TodayFor houseId={house!.id} userId={session!.user.id} />;
}

function TodayFor({ houseId, userId }: { houseId: string; userId: string }) {
  const { query, view } = useHouse(houseId, userId);
  const away = useAway(houseId, query.data);
  const stake = useStake(houseId, query.data);
  // The setup checklist counts the list.
  const list = useJohnList(houseId);
  // Time away isn't followed live: read it again whenever Today comes back into view.
  useReadOnFocus(away.refetch, { skipFirst: true });
  const { refreshing, pull } = usePull(houseId, () =>
    Promise.all([query.refetch(), away.refetch(), stake.refetch(), list.refetch()]),
  );

  return (
    <Screen
      bar={<TitleBar title={PAGE_TITLE.today} ask={view?.me?.role === 'admin'} />}
      spreads
      refreshing={refreshing}
      onRefresh={pull}
      testID="today-screen"
    >
      <PageTitle page={PAGE_TITLE.today} />
      {view ? (
        <TodayView view={view} away={away.data ?? null} stake={stake.data ?? null} list={list.data ?? null} />
      ) : query.isError ? (
        <ReadFailed onRetry={() => void query.refetch()} />
      ) : (
        <Reading />
      )}
    </Screen>
  );
}

function TodayView({
  view,
  away,
  stake,
  list,
}: {
  view: HouseView;
  away: AwayView | null;
  stake: StakeView | null;
  list: JohnList | null;
}) {
  const { snapshot, board, today, me, now } = view;
  const { house, rules, members } = snapshot;
  const userId = me?.userId ?? '';
  const page = todayPage({ board, mine: today.mine, userId, me, members, rules, away, stake, offers: snapshot.offers, now });
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? null;
  const two = useColumns();
  const day = <TopLine>{dayLabel(now, rules.timezone)}</TopLine>;

  const next = (
    <TourSpot id="today.nextUp">
      {page.state.kind === 'setup' ? (
      <SetupCard
        houseId={house.id}
        houseName={house.name}
        joinCode={house.joinCode}
        johns={list?.johns ?? null}
        memberCount={members.length}
      />
    ) : (
      <NextUp
        houseId={house.id}
        state={page.state}
        rules={rules}
        now={now}
        cant={page.cant}
        room={page.room}
        awayMakeup={house.awayMakeup}
        bestTime={me?.prefs.bestTime ?? null}
      />
      )}
    </TourSpot>
  );
  // A John you'd rather not, and asks to swap made to you.
  const swap = (
    <>
      {page.offers.map((offer) => (
        <SwapOfferCard key={offer.id} houseId={house.id} offer={offer} nameOf={(id) => nameOf(id) ?? ''} />
      ))}
      {page.swap ? <SwapSuggestion houseId={house.id} ask={page.swap} nameOf={(id) => nameOf(id) ?? ''} /> : null}
    </>
  );
  // A spot wraps only what's drawn: an empty one would still take a gap on the page.
  const needsYou = today.toVote.length + today.toCover.length === 0 ? null : (
    <TourSpot id="today.needsYou">
    <NeedsYou
      items={today.toVote}
      toCover={today.toCover}
      members={members}
      userId={userId}
      zone={rules.timezone}
      now={now}
    />
    </TourSpot>
  );
  const onCall = (
    <OnCall
      houseId={house.id}
      items={onCallItems(snapshot.onCall, board)}
      members={members}
      userId={userId}
      rules={rules}
      now={now}
    />
  );
  const rest = page.going.length + page.finished.length === 0 ? null : (
    <TourSpot id="today.rest">
      <RestOfWeek
        going={page.going}
        finished={page.finished}
        context={{ houseId: house.id, userId, zone: rules.timezone, rules, now, nameOf }}
      />
    </TourSpot>
  );
  // Someone new is offered a look round, once; it never starts by itself.
  const offer = <TourOffer now={now} />;
  const mover = members.find((m) => m.userId === userId)?.movingOutOn ?? null;
  const localToday = localDate(now, rules.timezone);
  const moving = movingLine(mover, localToday, house.name);
  const ask = askWhosMovingIn({
    me: userId,
    members: members.map((m) => ({ userId: m.userId, movingOutOn: m.movingOutOn ?? null })),
    lastMovedOut: snapshot.moves?.lastMovedOut ? new Date(snapshot.moves.lastMovedOut) : null,
    lastJoined: snapshot.moves?.lastJoined ? new Date(snapshot.moves.lastJoined) : null,
    now,
  }) ? (
    <MoveInAsk houseName={house.name} joinCode={house.joinCode} />
  ) : null;
  const lines =
    page.standing || page.away || moving ? (
      // The page's quiet lines sit together, under the week.
      <PageLines>
        {page.standing ? <PageLine text={page.standing} href="/house" testID="standing-line" /> : null}
        {page.away ? (
          <PageLine
            text={page.away}
            href="/house/away"
            accessibilityLabel={`${page.away}. ${NEXT_UP_COPY.changeDates}`}
            testID="away-line"
          />
        ) : null}
        {moving ? (
          // On the day it's time to leave, from the foot of House; before it, the date can change.
          <PageLine text={moving} href={mover && mover <= localToday ? '/house' : '/house/moving'} testID="moving-line" />
        ) : null}
      </PageLines>
    ) : null;

  // On a laptop your own Johns keep the main column; what the house wants of you sits beside them, over its week.
  // The day's line heads the main column, a section label's height, so Next up's card and the first group beside
  // it share a top edge.
  if (two) {
    return (
      <Columns
        main={
          <>
            {day}
            {offer}
            {next}
            {swap}
            {rest}
            {lines}
          </>
        }
        side={
          <>
            {needsYou}
            {ask}
            {onCall}
            <WeekGlance view={view} away={away} />
          </>
        }
      />
    );
  }
  return (
    <>
      {day}
      {offer}
      {next}
      {swap}
      {needsYou}
      {ask}
      {onCall}
      {rest}
      {lines}
    </>
  );
}
