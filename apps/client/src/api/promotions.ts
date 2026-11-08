import {
  humanError,
  MoveResponse,
  PromotionEmailed,
  PromotionMade,
  PromotionReady,
  termsOf,
  type ListAsk,
  type PromotionAudience,
  type PromotionPerson,
  type PromotionRequest,
  type PromotionRow,
  type PromotionState,
  type PromotionTerms,
} from '@app/core';
import { apiPost } from './http';
import { supabase } from './supabase';

/** Where the owner's promotions sit in the cache. */
export const PROMOTIONS_KEY = ['owner-promotions'] as const;

// The owner's Promotions (docs/specs/promotions.md): making one, its Stripe
// set-up tried again, stopping it and emailing the people it names go
// through apps/api; reading them is the owner_ functions, which check it's
// the owner with their code.

/** Makes it; answers its id, and whether Stripe has it yet. */
export function makePromotion(request: PromotionRequest): Promise<PromotionMade> {
  return apiPost('/api/admin/promotions', request, PromotionMade);
}

/** Try again: sets money off up in Stripe; answers whether it's live now. */
export async function retryPromotion(id: string): Promise<boolean> {
  return (await apiPost(`/api/admin/promotions/${id}/retry`, {}, PromotionReady)).ready;
}

export async function stopPromotion(id: string): Promise<void> {
  await apiPost(`/api/admin/promotions/${id}/stop`, {}, MoveResponse);
}

/** Email them: answers how many it went to now. */
export async function emailPromotion(id: string): Promise<number> {
  return (await apiPost(`/api/admin/promotions/${id}/email`, {}, PromotionEmailed)).sent;
}

// --- Every promotion: a busy list -------------------------------------------------------

export interface PromotionFilter {
  q: string;
  who: PromotionAudience | null;
  state: PromotionState | null;
}

const WHO: readonly string[] = ['anyone', 'named'];
const STATES: readonly string[] = ['making', 'live', 'ended', 'stopped'];

/** The list's filter from what its search box asks. */
export function promotionFilter(ask: ListAsk): PromotionFilter {
  const who = ask.picks.who;
  const state = ask.picks.state;
  return {
    q: ask.q,
    who: who && WHO.includes(who) ? (who as PromotionAudience) : null,
    state: state && STATES.includes(state) ? (state as PromotionState) : null,
  };
}

export interface PromotionCursor {
  at: string;
  id: string;
}

const PAGE = 50;

const filterArgs = (f: PromotionFilter) => ({ p_q: f.q, p_who: f.who ?? undefined, p_state: f.state ?? undefined });

const stateOf = (s: string): PromotionState => (STATES.includes(s) ? (s as PromotionState) : 'live');

/** A page of promotions, newest first. */
export async function promotionsPage(after: PromotionCursor | null, filter: PromotionFilter, size = PAGE): Promise<{ items: PromotionRow[]; more: boolean }> {
  const { data, error } = await supabase.rpc('owner_promotions_page', {
    ...filterArgs(filter),
    p_cursor_at: after?.at,
    p_cursor_id: after?.id,
    p_limit: size + 1,
  });
  if (error) throw new Error(humanError(error));
  const rows = data ?? [];
  return {
    items: rows.slice(0, size).map((r) => ({
      id: r.id,
      madeAt: r.made_at,
      code: r.code,
      name: r.name,
      terms: termsOf(r),
      audience: r.audience === 'named' ? 'named' : 'anyone',
      people: Number(r.people),
      uses: Number(r.uses),
      maxUses: r.max_uses,
      state: stateOf(r.state),
    })),
    more: rows.length > size,
  };
}

export async function promotionsCount(filter: PromotionFilter): Promise<number> {
  const { data, error } = await supabase.rpc('owner_promotions_count', filterArgs(filter));
  if (error) throw new Error(humanError(error));
  return Number(data ?? 0);
}

// --- One promotion ------------------------------------------------------------------------

export interface PromotionUse {
  house: string | null;
  houseId: string | null;
  plan: string | null;
  at: string;
}

export interface PromotionDetail {
  id: string;
  code: string;
  name: string;
  note: string | null;
  terms: PromotionTerms;
  audience: PromotionAudience;
  maxUses: number | null;
  state: PromotionState;
  uses: number;
  madeAt: string;
  people: PromotionPerson[];
  recent: PromotionUse[];
}

interface Raw {
  id: string;
  code: string;
  name: string;
  note: string | null;
  kind: string;
  percent_off: number | null;
  amount_off: unknown;
  duration: string | null;
  months: number | null;
  plans: string[] | null;
  ends_at: string | null;
  audience: string;
  max_uses: number | null;
  state: string;
  uses: number;
  made_at: string;
  people: { email: string; name: string | null; opened_at: string | null; emailed_at: string | null; used_at: string | null }[];
  recent: { house: string | null; house_id: string | null; plan: string | null; at: string }[];
}

/** One promotion, with its people and its last 20 uses; null when it isn't there. */
export async function promotion(id: string): Promise<PromotionDetail | null> {
  const { data, error } = await supabase.rpc('owner_promotion', { p_id: id });
  if (error) throw new Error(humanError(error));
  if (!data) return null;
  const r = data as unknown as Raw;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    note: r.note,
    terms: termsOf(r),
    audience: r.audience === 'named' ? 'named' : 'anyone',
    maxUses: r.max_uses,
    state: stateOf(r.state),
    uses: Number(r.uses),
    madeAt: r.made_at,
    people: (r.people ?? []).map((p) => ({ email: p.email, name: p.name, openedAt: p.opened_at, emailedAt: p.emailed_at, usedAt: p.used_at })),
    recent: (r.recent ?? []).map((u) => ({ house: u.house, houseId: u.house_id, plan: u.plan, at: u.at })),
  };
}
