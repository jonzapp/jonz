import {
  type ListAsk,
  type OwnerMessageResponse,
  type MessageAudience,
  type MessageReach,
  type MessageWays,
  type SentAudience,
} from '@app/core';

import { callV1 } from './v1';

// The owner's Messages (docs/specs/owner-admin.md, "Messages"), on /v1: who a
// message would reach, finding a person or a house to send to, sending
// (which pushes and emails), and every message sent.

/** How far a message to these people would reach, by each way. */
export async function messageReach(audience: MessageAudience, personId: string | null, houseId: string | null): Promise<MessageReach> {
  return callV1('owner_message_reach', { audience, personId, houseId });
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
  const people = await callV1('owner_people_find', { q });
  return people.map((p) => ({ id: p.id, name: p.name ?? '', email: p.email, houseName: p.houseName }));
}

export interface FoundHouse {
  id: string;
  name: string;
  people: number;
}

/** Up to eight houses by name, join code or id's start. */
export async function findHouses(q: string): Promise<FoundHouse[]> {
  if (!q.trim()) return [];
  return callV1('owner_houses_find', { q });
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
  return callV1('owner_send_message', {
    audience: message.audience,
    personId: message.personId,
    houseId: message.houseId,
    subject: message.subject.trim(),
    body: message.body.trim(),
    ...message.ways,
  });
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

/** Where the next page starts: what /v1 answered with the last one. */
export type SentCursor = string;

const PAGE = 50;

/** A page of what was sent, newest first, narrowed by the database. */
export async function sentPage(after: SentCursor | null, filter: SentFilter, size = PAGE): Promise<{ items: SentRow[]; more: boolean; next: SentCursor | null }> {
  const page = await callV1('owner_messages_page', { ...filter, limit: size, startingAfter: after ?? undefined });
  return {
    items: page.data.map((r) => ({
      id: r.id,
      sentAt: r.sentAt,
      audience: (AUDIENCES.includes(r.audience) ? r.audience : 'everyone') as SentAudience,
      toName: r.toName,
      subject: r.subject,
      body: r.body,
      push: r.byPush,
      wall: r.byWall,
      email: r.byEmail,
      people: r.people,
      walls: r.walls,
      waiting: r.waiting,
    })),
    more: page.hasMore,
    next: page.startingAfter,
  };
}

/** How many match. */
export async function sentCount(filter: SentFilter): Promise<number> {
  return callV1('owner_messages_count', { ...filter });
}
