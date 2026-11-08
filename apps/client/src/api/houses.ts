import { humanError, type HouseDetail, type HouseRow, type ListAsk, type Overview, type OverviewSpan, type PassPlan } from '@app/core';

import { supabase } from './supabase';

// The owner's Overview and Houses (docs/specs/owner-admin.md): one read for
// the Overview, and every house as a busy list, read only.

/** The Overview for this week or this month in the owner's zone, and how long the read took. */
export async function ownerOverview(span: OverviewSpan, zone: string): Promise<{ overview: Overview; ms: number }> {
  const started = Date.now();
  const { data, error } = await supabase.rpc('owner_overview', { p_span: span, p_zone: zone });
  if (error) throw new Error(humanError(error));
  return { overview: data as unknown as Overview, ms: Date.now() - started };
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

export interface HouseCursor {
  at: string;
  id: string;
}

const PAGE = 50;

const filterArgs = (filter: HouseFilter) => ({
  p_q: filter.q,
  p_pass: filter.pass ?? undefined,
  p_active: filter.active ?? undefined,
  p_after: filter.after ?? undefined,
  p_before: filter.before ?? undefined,
});

/** A page of houses, most recently active first, narrowed by the database. */
export async function housesPage(after: HouseCursor | null, filter: HouseFilter): Promise<{ items: HouseRow[]; more: boolean }> {
  const { data, error } = await supabase.rpc('owner_houses_page', {
    ...filterArgs(filter),
    p_cursor_at: after?.at,
    p_cursor_id: after?.id,
    p_limit: PAGE + 1,
  });
  if (error) throw new Error(humanError(error));
  const rows = data ?? [];
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      name: r.name,
      joinCode: r.join_code,
      people: Number(r.people),
      passPlan: r.pass_plan as PassPlan,
      passUntil: r.pass_ends_at,
      lastActive: r.last_active,
      onTime: Number(r.on_time),
      settled: Number(r.settled),
      createdAt: r.created_at,
      sortAt: r.sort_at,
    })),
    more: rows.length > PAGE,
  };
}

/** How many houses match. */
export async function housesCount(filter: HouseFilter): Promise<number> {
  const { data, error } = await supabase.rpc('owner_houses_count', filterArgs(filter));
  if (error) throw new Error(humanError(error));
  return Number(data ?? 0);
}

/** One house, read only; null when it's gone. */
export async function ownerHouse(id: string): Promise<HouseDetail | null> {
  const { data, error } = await supabase.rpc('owner_house', { p_house: id });
  if (error) throw new Error(humanError(error));
  return (data as unknown as HouseDetail | null) ?? null;
}
