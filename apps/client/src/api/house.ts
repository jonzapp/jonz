import { CreateHouse, type Currency, FreshResponse, houseKind, type HouseKind, humanError, JoinCode } from '@app/core';

import { apiPost } from './http';
import { supabase } from './supabase';

/** The house you're in, as the app needs to know it before any screen. */
export interface MyHouse {
  id: string;
  name: string;
  /** Housemates or a family (houses.kind): which words the app uses. */
  kind: HouseKind;
}

/** Your house, read through your own session; null when you're in none. */
export async function getMyHouse(userId: string): Promise<MyHouse | null> {
  const { data, error } = await supabase
    .from('members')
    .select('house_id, houses(name, kind)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.house_id, name: data.houses?.name ?? '', kind: houseKind(data.houses?.kind) };
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

/** The house a join code opens, or null for a code that matches none (or can't be one). */
export async function houseByCode(code: string): Promise<Invite | null> {
  const parsed = JoinCode.safeParse(code);
  if (!parsed.success) return null;
  const { data, error } = await supabase.rpc('house_by_code', { p_code: parsed.data });
  if (error) throw error;
  const row = data?.[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        members: Number(row.members),
        kind: houseKind(row.kind),
        currency: row.currency as Currency,
        stakeMinor: row.stake_minor,
        lateMinor: row.late_forfeit_minor,
        missedMinor: row.missed_forfeit_minor,
      }
    : null;
}

/** Join a house by its code. A refusal throws the sentence to show. */
export async function joinHouse(code: string): Promise<string> {
  const parsed = JoinCode.safeParse(code);
  if (!parsed.success) throw new Error(humanError({ message: 'unknown_code' }));
  const { data, error } = await supabase.rpc('join_house', { p_code: parsed.data });
  if (error) throw new Error(humanError(error));
  return data;
}

/** Set up a house, with you as its admin. A refusal throws the sentence to show. */
export async function createHouse(input: CreateHouse): Promise<string> {
  const parsed = CreateHouse.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { data, error } = await supabase.rpc('create_house', {
    p_name: parsed.data.name,
    p_timezone: parsed.data.timezone,
    p_currency: parsed.data.currency,
    p_week_starts: parsed.data.weekStarts,
    p_kind: parsed.data.kind ?? 'housemates',
  });
  if (error) throw new Error(humanError(error));
  return data;
}

/**
 * Catch the house up before showing it (apps/api's POST /api/fresh), as a
 * page load does on the web. True when the server ticked.
 */
export async function catchUp(houseId: string): Promise<boolean> {
  const { ticked } = await apiPost('/api/fresh', { houseId }, FreshResponse);
  return ticked;
}
