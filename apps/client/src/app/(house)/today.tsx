import { askWhosMovingIn, dayLabel, localDate, memberCan, monthWord, movingLine, onCallItems, hasPass, pocketMoney, rulesAsStaked, todayPage, type HouseRules, type PocketView, type StakeView, switchChoices } from '@app/core';
import { useState, type ReactNode } from 'react';

import type { AwayView } from '@/api/away';
import type { JohnList } from '@/api/settings';
import { Pair, useSideBySide } from '@/components/page-columns';
import { PageTitle } from '@/components/page-title';
import { PickMenu } from '@/components/pick-menu';
import { TodayOutline } from '@/components/page-outlines';
import { Columns, Screen, useColumns } from '@/components/screen';
import { TitleBar, TopLine } from '@/components/title-bar';
import { ZoneLine } from '@/components/zone-line';
import { MoveInAsk } from '@/components/today/move-in-ask';
import { CouldCover, NeedsYou } from '@/components/today/needs-you';
import { NeedsYourOk } from '@/components/today/needs-your-ok';
import { NextUp } from '@/components/today/next-up';
import { OnCall } from '@/components/today/on-call';
import { PageLine, PageLines, PendingLine } from '@/components/today/page-line';
import { RestOfWeek } from '@/components/today/rest-of-week';
import { SetupCard } from '@/components/today/setup-card';
import { SwapOfferCard, SwapSuggestion } from '@/components/today/swap-ask';
import { WeekGlance } from '@/components/today/week-glance';
import { TourOffer } from '@/components/tour/tour-offer';
import { TourSpot } from '@/components/tour/tour-spot';
import { Waiting } from '@/components/waiting';
import { useAway } from '@/hooks/use-away';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useMembership } from '@/hooks/use-membership';
import { usePocket } from '@/hooks/use-pocket';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { useStake } from '@/hooks/use-stake';
import { useWords } from '@/hooks/use-words';
import { useZones } from '@/hooks/use-zones';

/**
 * Today, for doing: your next John in the one card (or what takes its
 * place), the disputes that need your vote (in a family, a parent's
 * Needs your OK instead), the on-call Johns anyone can
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

function TodayFor({ houseId, userId: me }: { houseId: string; userId: string }) {
  const words = useWords();
  // A parent can switch to a kid who doesn't sign in, and tick for them (family step 4).
  const [viewing, setViewing] = useState(me);
  const { query: mine } = useHouse(houseId, me);
  const snap = mine.data;
  const choices = snap ? switchChoices(snap.members, me, snap.house.kind === 'family', words) : [];
  const userId = choices.some((c) => c.value === viewing) ? viewing : me;
  const { query, view } = useHouse(houseId, userId);
  const away = useAway(houseId, query.data);
  const stake = useStake(houseId, query.data);
  const pocket = usePocket(houseId, query.data);
  // The setup checklist counts the list.
  const list = useJohnList(houseId);
  // Time away isn't followed live: read it again whenever Today comes back into view.
  useReadOnFocus(away.refetch, { skipFirst: true });
  const { refreshing, pull } = usePull(houseId, () =>
    Promise.all([query.refetch(), away.refetch(), stake.refetch(), list.refetch(), pocket.refetch()]),
  );

  return (
    <Screen
      bar={
        <TitleBar
          title={words('common.title.today')}
          ask={userId === me && memberCan(view?.me, 'house:read')}
          right={
            choices.length > 0 ? (
              <PickMenu options={choices} value={userId} onChange={setViewing} label={words('people.kids.switchLabel')} testID="kid-switch" />
            ) : undefined
          }
        />
      }
      spreads
      refreshing={refreshing}
      onRefresh={pull}
      testID="today-screen"
    >
      <PageTitle page={words('common.title.today')} />
      <Waiting ready={view != null} failed={query.isError} onRetry={() => void query.refetch()} outline={<TodayOutline />} fill>
        {() => (
          <TodayView
            view={view!}
            reading={away.isLoading || stake.isLoading || pocket.isLoading}
            away={away.data ?? null}
            stake={stake.data ?? null}
            list={list.data ?? null}
            pocket={pocket.data ?? null}
          />
        )}
      </Waiting>
    </Screen>
  );
}

function TodayView({
  view,
  reading,
  away,
  stake,
  list,
  pocket,
}: {
  view: HouseView;
  /** Where you stand, your time away or what you've earned is still being read: its line waits in outline. */
  reading: boolean;
  away: AwayView | null;
  stake: StakeView | null;
  list: JohnList | null;
  /** In a family: the pocket money, for a kid's line on what they've earned. */
  pocket: PocketView | null;
}) {
  const words = useWords();
  const { snapshot, board, today, me, now } = view;
  const { house, members } = snapshot;
  // Without the Stake (a House Pass extra), nothing late costs anything.
  const rules = rulesAsStaked(snapshot.rules, hasPass(house.pass, now));
  const userId = me?.userId ?? '';
  const page = todayPage({ board, mine: today.mine, userId, me, members, rules, away, stake, offers: snapshot.offers, now }, words);
  // A kid in a family sees what they've earned this month in place of where they stand.
  const earned =
    house.kind === 'family' && me?.role !== 'admin' && pocket
      ? words('house.pocket.kidMonth', { money: pocketMoney(pocket.earned[userId] ?? 0, rules.currency, words), month: monthWord(pocket.month, words) })
      : null;
  const standing = earned ?? page.standing;
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? null;
  // Times on your own clock when it's away from the house's, said once under the date (Your time, said once).
  const zones = useZones(rules.timezone, now);
  const zone = zones.shown;
  const day = (
    <>
      <TopLine>{dayLabel(now, zone, words)}</TopLine>
      <ZoneLine zones={zones} now={now} underTopLine />
    </>
  );

  const next = <NextSpot view={view} page={page} rules={rules} johns={list?.johns ?? null} />;
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
  const needsYou = today.toVote.length === 0 ? null : (
    <TourSpot id="today.needsYou">
      <NeedsYou items={today.toVote} members={members} now={now} />
    </TourSpot>
  );
  // Housemates' overdue Johns sit low, so covering is never the top task.
  const couldCover = (
    <CouldCover items={today.toCover} members={members} userId={userId} zone={zone} now={now} />
  );
  // In a family, a parent's Needs your OK takes the vote's place (there is no vote).
  const needsOk = today.toOk.length === 0 ? null : (
    <TourSpot id="today.needsYou">
      <NeedsYourOk items={today.toOk} members={members} now={now} />
    </TourSpot>
  );
  const onCallList = onCallItems(snapshot.onCall, board);
  const onCall = (
    <OnCall
      houseId={house.id}
      items={onCallList}
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
        context={{ houseId: house.id, userId, zone, rules, now, nameOf }}
      />
    </TourSpot>
  );
  // Someone new is offered a look round, once; it never starts by itself.
  const offer = <TourOffer now={now} />;
  const mover = members.find((m) => m.userId === userId)?.movingOutOn ?? null;
  const localToday = localDate(now, rules.timezone);
  const moving = movingLine(mover, localToday, house.name, words);
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
    standing || page.away || moving || reading ? (
      <QuietLines
        standing={standing ? { text: standing, earned: earned !== null } : null}
        away={page.away}
        // On the day it's time to leave, from the foot of You; before it, the date can change.
        moving={moving ? { text: moving, href: mover && mover <= localToday ? '/you' : '/you/moving' } : null}
        reading={reading}
      />
    ) : null;

  // Whether the panel has anything to show. Before the first deal (and in a week not yet out) the house's week
  // isn't there for WeekGlance, and often nothing else is either: then there's no panel, and Next up runs across.
  const panel =
    today.toOk.length + today.toVote.length + onCallList.length + today.toCover.length > 0 ||
    ask != null ||
    (board.week != null && board.items.length > 0);
  return (
    <Laid
      mine={{ day, offer, next, swap, rest, lines }}
      theirs={{ needsOk, needsYou, ask, onCall, couldCover }}
      glance={<WeekGlance view={view} away={away} />}
      panel={panel}
    />
  );
}

type Page = ReturnType<typeof todayPage>;

/** Next up, or the way to set the house up before there's anything to deal. */
function NextSpot({ view, page, rules, johns }: { view: HouseView; page: Page; rules: HouseRules; johns: JohnList['johns'] | null }) {
  const { snapshot, board, me, now } = view;
  const { house, members } = snapshot;
  return (
    <TourSpot id="today.nextUp">
      {page.state.kind === 'setup' ? (
        <SetupCard houseId={house.id} houseName={house.name} joinCode={house.joinCode} johns={johns} memberCount={members.length} />
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
          photos={board.photos !== false}
        />
      )}
    </TourSpot>
  );
}

/** The page's quiet lines, together under the week: where you stand (or what a kid has earned), time away, moving out. */
function QuietLines({
  standing,
  away,
  moving,
  reading,
}: {
  standing: { text: string; earned: boolean } | null;
  away: string | null;
  moving: { text: string; href: '/you' | '/you/moving' } | null;
  reading: boolean;
}) {
  const words = useWords();
  return (
    <PageLines>
      {standing ? (
        <PageLine text={standing.text} href={standing.earned ? '/house/pocket' : '/house'} testID={standing.earned ? 'earned-line' : 'standing-line'} />
      ) : null}
      {away ? (
        <PageLine text={away} href="/house/away" accessibilityLabel={`${away}. ${words('today.nextUp.changeDates')}`} testID="away-line" />
      ) : null}
      {moving ? <PageLine text={moving.text} href={moving.href} testID="moving-line" /> : null}
      {reading && !standing && !away ? <PendingLine label={words('common.shell.reading')} /> : null}
    </PageLines>
  );
}

/**
 * Today's parts, laid out for the room there is. `mine` is yours; `theirs`
 * is what the house wants of you; `glance` is how its week is going.
 * `panel` is whether those two have anything to show (before the first deal,
 * often not): without it there's no panel, and Next up runs across.
 */
function Laid({
  mine,
  theirs,
  glance,
  panel: hasPanel,
}: {
  mine: Record<'day' | 'offer' | 'next' | 'swap' | 'rest' | 'lines', ReactNode>;
  theirs: Record<'needsOk' | 'needsYou' | 'ask' | 'onCall' | 'couldCover', ReactNode>;
  glance: ReactNode;
  panel: boolean;
}) {
  const two = useColumns();
  const beside = useSideBySide();
  const { day, offer, next, swap, rest, lines } = mine;
  const house = (
    <>
      {theirs.needsOk}
      {theirs.needsYou}
      {theirs.ask}
      {theirs.onCall}
      {theirs.couldCover}
    </>
  );
  const top = (
    <>
      {day}
      {offer}
      {next}
      {swap}
    </>
  );
  // What the house wants of you, over how its week is going: the panel beside your own Johns on a laptop.
  const panel = (
    <>
      {house}
      {glance}
    </>
  );
  // On a laptop Next up runs across the main column, with the rest of your week and the quiet lines under it, and
  // what the house wants of you sits in the panel beside them, over its week. The day's line heads the main column,
  // a section label's height, so Next up's plate and the first group in the panel share a top edge.
  if (two) {
    return (
      <Columns
        main={
          <>
            {top}
            {rest}
            {lines}
          </>
        }
        side={hasPanel ? panel : null}
      />
    );
  }
  // On a laptop with no room for the panel (a smaller window, or beside the chat with Jonz) the page still fills
  // the room: Next up across it, then the rest of your week beside what the house wants of you and its week (one
  // under the other when the house has nothing to show, so no column stands empty).
  if (beside) {
    return (
      <>
        {top}
        {(rest || lines) && hasPanel ? (
          <Pair
            testID="today-pair"
            start={
              <>
                {rest}
                {lines}
              </>
            }
            end={panel}
          />
        ) : (
          <>
            {rest}
            {lines}
            {panel}
          </>
        )}
      </>
    );
  }
  return (
    <>
      {top}
      {house}
      {rest}
      {lines}
    </>
  );
}
