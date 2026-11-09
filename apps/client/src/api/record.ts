import type { RecordInput } from '@app/core';

import { snakeKeys } from './base';
import { callV1 } from './v1';

// The track record's rows: every week the house has had, each one's shares,
// every John handed out in them, and everyone's time away, read in one go on
// /v1 (house_record) and summed by core.

export type RecordRows = Omit<RecordInput, 'memberIds' | 'now' | 'zone'>;

export async function loadRecord(houseId: string): Promise<RecordRows> {
  const record = await callV1('house_record', { houseId });
  // core reads each row by its columns' own names. Shares and Johns of weeks
  // older than the ones read fall away in core, with their weeks.
  return {
    weeks: record.weeks.map((w) => snakeKeys(w) as RecordRows['weeks'][number]),
    shares: record.shares.map((r) => ({ week_id: r.weekId, user_id: r.userId, share: r.share })),
    johns: record.assignments.map((j) => snakeKeys(j) as RecordRows['johns'][number]),
    crew: record.crew.map((c) => snakeKeys(c) as NonNullable<RecordRows['crew']>[number]),
    away: record.away,
  };
}
