import {
  termsOf,
  type ListAsk,
  type PromotionAudience,
  type PromotionMade,
  type PromotionPerson,
  type PromotionRequest,
  type PromotionRow,
  type PromotionState,
  type PromotionTerms,
} from '@app/core';

import { callV1 } from './v1';

/** Where the owner's promotions sit in the cache. */
export const PROMOTIONS_KEY = ['owner-promotions'] as const;

// The owner's Promotions (docs/specs/promotions.md), on /v1: making one, its
// Stripe set-up tried again, stopping it and emailing the people it names,
// and reading them, each checked as the owner with their code.

/** Makes it; answers its id, and whether Stripe has it yet. */
export function makePromotion(request: PromotionRequest): Promise<PromotionMade> {
  return callV1('owner_make_promotion', request);
}

/** Try again: sets money off up in Stripe; answers whether it's live now. */
export async function retryPromotion(id: string): Promise<boolean> {
  return (await callV1('retry_promotion', { promotionId: id })).ready;
}

export async function stopPromotion(id: string): Promise<void> {
  await callV1('owner_stop_promotion', { promotionId: id });
}

/** Email them: answers how many it went to now. */
export async function emailPromotion(id: string): Promise<number> {
  return (await callV1('owner_promotion_emails', { promotionId: id })).sent;
}

/** A promotion's money off, as /v1 names it, in the shape termsOf reads. */
const terms = (r: { kind: string; percentOff: number | null; amountOff: unknown; duration: string | null; months: number | null; plans: readonly string[] | null; endsAt: string | null }) =>
  termsOf({ kind: r.kind, percent_off: r.percentOff, amount_off: r.amountOff, duration: r.duration, months: r.months, plans: r.plans, ends_at: r.endsAt });

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

/** Where the next page starts: what /v1 answered with the last one. */
export type PromotionCursor = string;

const PAGE = 50;

const stateOf = (s: string): PromotionState => (STATES.includes(s) ? (s as PromotionState) : 'live');

/** A page of promotions, newest first. */
export async function promotionsPage(
  after: PromotionCursor | null,
  filter: PromotionFilter,
  size = PAGE,
): Promise<{ items: PromotionRow[]; more: boolean; next: PromotionCursor | null }> {
  const page = await callV1('owner_promotions_page', { ...filter, limit: size, startingAfter: after ?? undefined });
  return {
    items: page.data.map((r) => ({
      id: r.id,
      madeAt: r.madeAt,
      code: r.code,
      name: r.name,
      terms: terms(r),
      audience: r.audience === 'named' ? 'named' : 'anyone',
      people: r.people,
      uses: r.uses,
      maxUses: r.maxUses,
      state: stateOf(r.state),
    })),
    more: page.hasMore,
    next: page.startingAfter,
  };
}

export async function promotionsCount(filter: PromotionFilter): Promise<number> {
  return callV1('owner_promotions_count', { ...filter });
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

/** One promotion, with its people and its last 20 uses; null when it isn't there. */
export async function promotion(id: string): Promise<PromotionDetail | null> {
  const r = await callV1('owner_promotion', { promotionId: id });
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    note: r.note,
    terms: terms(r),
    audience: r.audience === 'named' ? 'named' : 'anyone',
    maxUses: r.maxUses,
    state: stateOf(r.state),
    uses: r.uses,
    madeAt: r.madeAt,
    people: r.people,
    recent: r.recent,
  };
}
