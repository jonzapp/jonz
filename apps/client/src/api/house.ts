import { CreateHouse, type Currency, type HouseKind, humanError, JoinCode } from '@app/core';

import { apiBase } from './base';
import { callV1 } from './v1';

/** The house you're in, as the app needs to know it before any screen. */
export interface MyHouse {
  id: string;
  name: string;
  /** Housemates or a family (houses.kind): which words the app uses. */
  kind: HouseKind;
}

/** Your house, read through your own session; null when you're in none. */
export async function getMyHouse(userId: string): Promise<MyHouse | null> {
  const house = await callV1('my_house', {});
  return house && { id: house.houseId, name: house.name, kind: house.kind };
}

/** What a join link shows a signed-in visitor: the house's name and size, and what it plays for. */
export interface Invite {
  id: string;
  name: string;
  members: number;
  kind: HouseKind;
  currency: Currency;
  /** The monthly stake and the fines, in minor units; 0 is no money. */
  stakeMinor: number;
  lateMinor: number;
  missedMinor: number;
}

/** A house as its join link shows it to someone who hasn't signed in: no more than the link's card in a chat. */
export interface InvitePreview {
  name: string;
  members: number;
  kind: HouseKind;
}

/**
 * The house a join link opens, before signing in. `null` for a code that
 * opens nothing; `undefined` when the house isn't to be named (or the read
 * failed), so the page goes straight to signing in, as it always did.
 */
export async function invitePreview(code: string): Promise<InvitePreview | null | undefined> {
  const parsed = JoinCode.safeParse(code);
  if (!parsed.success) return null;
  try {
    const response = await fetch(`${apiBase()}/api/invites/${encodeURIComponent(parsed.data)}`);
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { names?: boolean; invite?: InvitePreview | null };
    if (!payload.names) return undefined;
    const invite = payload.invite;
    if (!invite) return null;
    if (typeof invite.name !== 'string' || typeof invite.members !== 'number') return undefined;
    return { name: invite.name, members: invite.members, kind: invite.kind === 'family' ? 'family' : 'housemates' };
  } catch {
    return undefined;
  }
}

/** The house a join code opens, or null for a code that matches none (or can't be one). */
export async function houseByCode(code: string): Promise<Invite | null> {
  const parsed = JoinCode.safeParse(code);
  if (!parsed.success) return null;
  const [row] = await callV1('house_by_code', { code: parsed.data });
  return row
    ? {
        id: row.id,
        name: row.name,
        members: row.members,
        kind: row.kind,
        currency: row.currency,
        stakeMinor: row.stakeMinor,
        lateMinor: row.lateForfeitMinor,
        missedMinor: row.missedForfeitMinor,
      }
    : null;
}

/** Join a house by its code. A refusal throws the sentence to show. */
export async function joinHouse(code: string): Promise<string> {
  const parsed = JoinCode.safeParse(code);
  if (!parsed.success) throw new Error(humanError({ message: 'unknown_code' }));
  return callV1('join_house', { code: parsed.data });
}

/** Set up a house, with you as its admin. A refusal throws the sentence to show. */
export async function createHouse(input: CreateHouse): Promise<string> {
  const parsed = CreateHouse.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { name, timezone, currency, weekStarts, kind } = parsed.data;
  return callV1('create_house', { name, timezone, currency, weekStarts, kind: kind ?? 'housemates' });
}

/**
 * Catch the house up before showing it (apps/api's POST /api/fresh), as a
 * page load does on the web. True when the server ticked.
 */
export async function catchUp(houseId: string): Promise<boolean> {
  const { ticked } = await callV1('catch_up', { houseId });
  return ticked;
}
