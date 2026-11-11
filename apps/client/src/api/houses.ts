import { type DeleteHouseResponse, type HouseDetail, type HouseRow, type ListAsk, type Overview, type OverviewSpan, type PassPlan } from '@app/core';

import { callV1 } from './v1';

// The owner's Overview and Houses (docs/specs/owner-admin.md), on /v1: one
// read for the Overview, every house as a busy list, and deleting one
// (houses:write).

/** The Overview for this week or this month in the owner's zone, and how long the read took. */
export async function ownerOverview(span: OverviewSpan, zone: string): Promise<{ overview: Overview; ms: number }> {
  const started = Date.now();
  const overview = await callV1('owner_overview', { span, zone });
  return { overview: overview as unknown as Overview, ms: Date.now() - started };
}

export interface HouseFilter {
  q: string;
  pass: 'paid' | 'trial' | 'none' | null;
  active: 'week' | 'month' | 'quiet' | null;
  after: string | null;
  before: string | null;
}

const PASSES: readonly string[] = ['paid', 'trial', 'none'];
const ACTIVE: readonly string[] = ['week', 'month', 'quiet'];

/** The Houses list's filter from what its search box asks. */
export function houseFilter(ask: ListAsk): HouseFilter {
  const pass = ask.picks.pass;
  const active = ask.picks.active;
  return {
    q: ask.q,
    pass: pass && PASSES.includes(pass) ? (pass as HouseFilter['pass']) : null,
    active: active && ACTIVE.includes(active) ? (active as HouseFilter['active']) : null,
    after: ask.after,
    before: ask.before,
  };
}

/** Where the next page starts: what /v1 answered with the last one. */
export type HouseCursor = string;

const PAGE = 50;

/** A page of houses, most recently active first, narrowed by the database. */
export async function housesPage(after: HouseCursor | null, filter: HouseFilter): Promise<{ items: HouseRow[]; more: boolean; next: HouseCursor | null }> {
  const page = await callV1('owner_houses_page', { ...filter, limit: PAGE, startingAfter: after ?? undefined });
  return {
    items: page.data.map((r) => ({
      id: r.id,
      name: r.name,
      joinCode: r.joinCode,
      people: r.people,
      passPlan: r.passPlan as PassPlan,
      passUntil: r.passEndsAt,
      lastActive: r.lastActive,
      onTime: r.onTime,
      settled: r.settled,
      createdAt: r.createdAt,
      sortAt: r.sortAt,
    })),
    more: page.hasMore,
    next: page.startingAfter,
  };
}

/** How many houses match. */
export async function housesCount(filter: HouseFilter): Promise<number> {
  return callV1('owner_houses_count', { ...filter });
}

/** One house, read only; null when it's gone. */
export async function ownerHouse(id: string): Promise<HouseDetail | null> {
  return ((await callV1('owner_house', { houseId: id })) as unknown as HouseDetail | null) ?? null;
}

/** Deletes the whole house, for good (houses:write): answers how many lived there, how many were told, and whether its Pass was stopped. */
export function deleteHouse(id: string, reason: string, tell: boolean): Promise<DeleteHouseResponse> {
  return callV1('owner_delete_house', { houseId: id, reason: reason.trim(), tell });
}

/** Resets any house's history, or everything in it, for good (houses:write), with why for the audit log. */
export async function ownerResetHouse(id: string, everything: boolean, reason: string): Promise<void> {
  await callV1('owner_reset_house_data', { houseId: id, everything, reason: reason.trim() });
}
