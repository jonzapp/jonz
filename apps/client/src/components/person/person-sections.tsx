import {
  awayLines,
  familyHides,
  HOUSE_PAGE_COPY,
  moneyLines,
  monthOf,
  monthWord,
  owingLines,
  perkLines,
  PERSON_COPY,
  recordLines,
  shareLine,
} from '@app/core';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AwayView } from '@/api/away';
import type { Housemate } from '@/api/board';
import type { StakeRead } from '@/api/stake';
import type { TableSnapshot } from '@/api/table';
import { GroupItem } from '@/components/group';
import { PersonLines } from '@/components/person/person-lines';
import { Reading, ReadFailed } from '@/components/read-state';
import { Flow, type FlowItem } from '@/components/page-columns';
import { Section } from '@/components/section';
import { Body } from '@/components/text';
import type { HouseView } from '@/hooks/use-house';

/** A section's rows once what they need is read, or the read on its way, or why it failed. */
function Pending({ query, label, unreadable }: { query: UseQueryResult<unknown>; label: string; unreadable: string }) {
  return (
    <GroupItem>
      {query.isError ? <ReadFailed message={unreadable} onRetry={() => void query.refetch()} /> : <Reading label={label} />}
    </GroupItem>
  );
}

/** Their time away from today on, or a sentence saying there's none (as an empty group says it anywhere). */
function AwayLines({ away, personId }: { away: AwayView; personId: string }) {
  const lines = awayLines(away.periods, personId, away.today);
  if (lines.length > 0) return <PersonLines lines={lines} />;
  return (
    <GroupItem>
      <Body>{PERSON_COPY.noAway}</Body>
    </GroupItem>
  );
}

/**
 * A housemate's page, from what House reads: their week and month on the
 * Table, where they stand against their fair share, their streak and
 * tokens, the month's money (forfeited, share, net), anything owed from
 * closed months (only when there is), and their time away; then `admin`,
 * what an admin can do about someone else. On a laptop the sections sit in
 * columns (`Flow`); on a phone, one under another in that order.
 */
export function PersonSections({
  userId,
  person,
  view,
  table,
  stake,
  away,
  admin,
}: {
  userId: string;
  person: Housemate;
  view: HouseView;
  table: UseQueryResult<TableSnapshot>;
  stake: UseQueryResult<StakeRead>;
  away: UseQueryResult<AwayView>;
  admin?: ReactNode;
}) {
  const you = person.userId === userId;
  const { rules, members } = view.snapshot;
  const month = table.data?.month ?? stake.data?.month ?? monthOf(view.now, rules.timezone);
  const week = view.board.table.find((r) => r.userId === person.userId);
  const monthRow = table.data?.monthTable.find((r) => r.userId === person.userId);
  const owing = stake.data
    ? owingLines({
        transfers: stake.data.transfers,
        personId: person.userId,
        me: userId,
        members,
        currency: rules.currency,
        ledger: stake.data.ledger,
        closedMonths: stake.data.closedMonths,
      })
    : [];

  const items: FlowItem[] = [
    {
      key: 'record',
      weight: 3,
      node: (
        <Section label={you ? PERSON_COPY.yourRecord : PERSON_COPY.record} testID="person-record">
          <PersonLines lines={recordLines(week, monthRow, month)} />
          {table.data ? null : (
            <Pending query={table} label={HOUSE_PAGE_COPY.readingTable} unreadable={HOUSE_PAGE_COPY.tableUnreadable} />
          )}
        </Section>
      ),
    },
    {
      key: 'share',
      weight: 2,
      node: (
        <Section label={PERSON_COPY.fairShare} testID="person-share">
          {table.data ? (
            <PersonLines
              lines={[
                shareLine(
                  table.data.balances.find((b) => b.userId === person.userId),
                  you,
                ),
              ]}
            />
          ) : (
            <Pending query={table} label={HOUSE_PAGE_COPY.readingTable} unreadable={HOUSE_PAGE_COPY.tableUnreadable} />
          )}
        </Section>
      ),
    },
    {
      key: 'perks',
      weight: 3,
      node: (
        <Section label={PERSON_COPY.streakAndTokens} testID="person-perks">
          <PersonLines lines={perkLines(person)} />
        </Section>
      ),
    },
  ];
  // A family has no Stake, so nothing about money (familyHides).
  if (!familyHides(view.snapshot.house.kind).stake) {
    items.push(
      {
        key: 'money',
        weight: 4,
        node: (
          <Section label={HOUSE_PAGE_COPY.soFar(monthWord(month))} testID="person-money">
            {stake.data ? (
              <PersonLines
                lines={moneyLines({
                  projection: stake.data.projection.find((p) => p.userId === person.userId),
                  month: stake.data.month,
                  stakeMinor: rules.stakeMinor,
                  record: monthRow,
                  currency: rules.currency,
                })}
              />
            ) : (
              <Pending query={stake} label={HOUSE_PAGE_COPY.readingStake} unreadable={HOUSE_PAGE_COPY.stakeUnreadable} />
            )}
          </Section>
        ),
      },
    );
  }
  if (owing.length) {
    items.push({
      key: 'settling',
      weight: owing.length + 1,
      node: (
        <Section label={PERSON_COPY.settling} testID="person-settling">
          <PersonLines lines={owing} testID="person-owing" />
        </Section>
      ),
    });
  }
  items.push({
    key: 'away',
    weight: 2,
    node: (
      <Section label={PERSON_COPY.away} testID="person-away">
        {away.data ? (
          <AwayLines away={away.data} personId={person.userId} />
        ) : (
          <Pending query={away} label={PERSON_COPY.readingAway} unreadable={PERSON_COPY.awayUnreadable} />
        )}
      </Section>
    ),
  });
  if (admin) items.push({ key: 'admin', weight: 5, node: admin });
  return <Flow items={items} testID="person-sections" />;
}
