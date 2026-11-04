import {
  humanError,
  OwnerMessageResponse,
  type ListAsk,
  type MessageAudience,
  type MessageReach,
  type MessageWays,
  type SentAudience,
} from '@app/core';

import { apiPost } from './http';
import { supabase } from './supabase';

// The owner's Messages (docs/specs/owner-admin.md, "Messages"): who a
// message would reach, finding a person or a house to send to, sending
// (through apps/api, which pushes and emails), and every message sent.

/** How far a message to these people would reach, by each way. */
export async function messageReach(audience: MessageAudience, personId: string | null, houseId: string | null): Promise<MessageReach> {
  const { data, error } = await supabase.rpc('owner_message_reach', {
    p_audience: audience,
    p_person: personId ?? undefined,
    p_house: houseId ?? undefined,
  });
  if (error) throw new Error(humanError(error));
  const reach = (data ?? {}) as Partial<MessageReach>;
  return { people: Number(reach.people ?? 0), push: Number(reach.push ?? 0), email: Number(reach.email ?? 0), houses: Number(reach.houses ?? 0) };
}

export interface FoundPerson {
  id: string;
  name: string;
  email: string | null;
  houseName: string | null;
}

/** Up to eight people by name, email or id's start. */
export async function findPeople(q: string): Promise<FoundPerson[]> {
  if (!q.trim()) return [];
  const { data, error } = await supabase.rpc('owner_people_find', { p_q: q });
  if (error) throw new Error(humanError(error));
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, email: p.email, houseName: p.house_name }));
}

export interface FoundHouse {
  id: string;
  name: string;
  people: number;
}

/** Up to eight houses by name, join code or id's start. */
export async function findHouses(q: string): Promise<FoundHouse[]> {
  if (!q.trim()) return [];
  const { data, error } = await supabase.rpc('owner_houses_find', { p_q: q });
  if (error) throw new Error(humanError(error));
  return (data ?? []).map((h) => ({ id: h.id, name: h.name, people: Number(h.people) }));
}

export interface OutgoingMessage {
  audience: MessageAudience | 'test';
  personId: string | null;
  houseId: string | null;
  subject: string;
  body: string;
  ways: MessageWays;
}

/** Sends it, or a test of it to you; answers how many it's for. */
export async function sendMessage(message: OutgoingMessage): Promise<OwnerMessageResponse> {
  return apiPost(
    '/api/admin/messages',
    {
      audience: message.audience,
      personId: message.personId,
      houseId: message.houseId,
      subject: message.subject.trim(),
      body: message.body.trim(),
      ...message.ways,
    },
    OwnerMessageResponse,
  );
}

// --- Everything sent: a busy list -------------------------------------------------------

export interface SentRow extends MessageWays {
  id: string;
  sentAt: string;
  audience: SentAudience;
  toName: string | null;
  subject: string;
  body: string;
  people: number;
  walls: number;
  waiting: number;
}

export interface SentFilter {
  q: string;
  audience: SentAudience | null;
  way: keyof MessageWays | null;
  after: string | null;
  before: string | null;
}

const AUDIENCES: readonly string[] = ['person', 'house', 'everyone', 'test'];
const WAYS: readonly string[] = ['push', 'wall', 'email'];

/** The sent list's filter from what its search box asks. */
export function sentFilter(ask: ListAsk): SentFilter {
  const to = ask.picks.to;
  const way = ask.picks.way;
  return {
    q: ask.q,
    audience: to && AUDIENCES.includes(to) ? (to as SentAudience) : null,
    way: way && WAYS.includes(way) ? (way as keyof MessageWays) : null,
    after: ask.after,
    before: ask.before,
  };
}

export interface SentCursor {
  at: string;
  id: string;
}

const PAGE = 50;

const filterArgs = (filter: SentFilter) => ({
  p_q: filter.q,
  p_audience: filter.audience ?? undefined,
  p_way: filter.way ?? undefined,
  p_after: filter.after ?? undefined,
  p_before: filter.before ?? undefined,
});

/** A page of what was sent, newest first, narrowed by the database. */
export async function sentPage(after: SentCursor | null, filter: SentFilter, size = PAGE): Promise<{ items: SentRow[]; more: boolean }> {
  const { data, error } = await supabase.rpc('owner_messages_page', {
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
      sentAt: r.sent_at,
      audience: (AUDIENCES.includes(r.audience) ? r.audience : 'everyone') as SentAudience,
      toName: r.to_name,
      subject: r.subject,
      body: r.body,
      push: r.by_push,
      wall: r.by_wall,
      email: r.by_email,
      people: r.people,
      walls: r.walls,
      waiting: Number(r.waiting),
    })),
    more: rows.length > size,
  };
}

/** How many match. */
export async function sentCount(filter: SentFilter): Promise<number> {
  const { data, error } = await supabase.rpc('owner_messages_count', filterArgs(filter));
  if (error) throw new Error(humanError(error));
  return Number(data ?? 0);
}
