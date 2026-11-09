import {
  CHAT_SAVED_TURNS,
  NOTICE_KINDS,
  OWNER_PERMISSION_NAMES,
  qrShape,
  savedTurns,
  type AuditEntry,
  type AuditWhat,
  type AuditWho,
  type ChatMessage,
  type ListAsk,
  type Notice,
  type NoticeKind,
  type OwnerAskResponse,
  type OwnerPermission,
  type PendingDeletion,
  type QrShape,
  type SavedTurn,
} from '@app/core';

import type { ChatStore } from './ask-chats';
import { supabase } from './supabase';
import { snakeKeys } from './base';
import { callV1 } from './v1';

// The owner's admin page (docs/specs/owner-admin.md), on /v1. The database
// decides: it answers an owner who has passed their code, and refuses
// everyone else. The code itself (the second factor) is Supabase Auth's.

/**
 * Whether this account has an app role (owner, or support), whether this
 * session has passed the code, and, once it has, what the role may do
 * (packages/core owner-moves.ts), so the pages offer only that.
 */
export interface OwnerStatus {
  owner: boolean;
  mfa: boolean;
  permissions: OwnerPermission[];
}

export async function ownerStatus(): Promise<OwnerStatus> {
  const status = await callV1('owner_status', {});
  const permissions = status.permissions.filter((p): p is OwnerPermission => (OWNER_PERMISSION_NAMES as readonly string[]).includes(p));
  return { owner: status.owner, mfa: status.mfa, permissions };
}

/** The account's authenticator, if it has one that has been checked. */
export async function verifiedFactor(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.totp.find((factor) => factor.status === 'verified')?.id ?? null;
}

export interface NewFactor {
  id: string;
  /** The QR code for the app to scan, or null if Supabase's couldn't be read. */
  qr: QrShape | null;
  /** The key to type in by hand. */
  secret: string;
  /** otpauth://, which a phone's passwords app opens. */
  uri: string;
}

/** Starts adding an authenticator: a QR code and key for the app, checked by the first code. */
export async function enrollFactor(): Promise<NewFactor> {
  // An earlier try that was never checked would block a new one: take it away first.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Jonz admin' });
  if (error) throw new Error(error.message);
  return { id: data.id, qr: qrShape(data.totp.qr_code), secret: data.totp.secret, uri: data.totp.uri };
}

/** Checks a code; afterwards the session has passed the second factor. False for a wrong code. */
export async function checkCode(factorId: string, code: string): Promise<boolean> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  return !error;
}

/** Every admin list reads this many at a time. */
const PAGE = 50;

/** The notices on now, for What people see: never more than a handful. */
export async function liveNotices(): Promise<Notice[]> {
  return callV1('live_notices', {});
}

/** What Every notice is narrowed to: the search box's words, a kind, a state, and when it started. */
export interface NoticeFilter {
  q: string;
  kind: NoticeKind | null;
  state: 'live' | 'scheduled' | 'ended' | null;
  after: string | null;
  before: string | null;
}

/** Notices' filter from what its search box asks. */
export function noticeFilter(ask: ListAsk): NoticeFilter {
  const { kind, state } = ask.picks;
  return {
    q: ask.q,
    kind: (NOTICE_KINDS as readonly string[]).includes(kind ?? '') ? (kind as NoticeKind) : null,
    state: state === 'live' || state === 'scheduled' || state === 'ended' ? state : null,
    after: ask.after,
    before: ask.before,
  };
}

/** Where a page of notices starts: what /v1 answered with the last one. */
export type NoticeCursor = string;

/** A page of every notice, newest start first, narrowed by the database. */
export async function noticesPage(after: NoticeCursor | null, filter: NoticeFilter): Promise<{ notices: Notice[]; more: boolean; next: NoticeCursor | null }> {
  const page = await callV1('owner_notices_page', { ...filter, limit: PAGE, startingAfter: after ?? undefined });
  return { notices: page.data, more: page.hasMore, next: page.startingAfter };
}

/** How many notices match. */
export async function noticesCount(filter: NoticeFilter): Promise<number> {
  return callV1('owner_notices_count', { ...filter });
}

export interface SavedNotice {
  id: string | null;
  kind: Notice['kind'];
  title: string;
  body: string;
  linkLabel: string | null;
  linkUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Saves a notice (new when id is null), then updates the copy kept for outages. Says whether the copy kept up. */
export async function saveNotice(notice: SavedNotice): Promise<{ id: string; copied: boolean }> {
  const id = await callV1('save_notice', {
    noticeId: notice.id,
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    linkLabel: notice.linkLabel,
    linkUrl: notice.linkUrl,
    startsAt: notice.startsAt?.toISOString() ?? null,
    endsAt: notice.endsAt?.toISOString() ?? null,
  });
  return { id, copied: await refreshCopy() };
}

export async function endNotice(id: string): Promise<{ copied: boolean }> {
  await callV1('end_notice', { noticeId: id });
  return { copied: await refreshCopy() };
}

/** Updates the copy of the notices kept for outages. False when it didn't go; the notice itself is saved either way. */
async function refreshCopy(): Promise<boolean> {
  try {
    return (await callV1('write_notice_copy', {})).copied;
  } catch {
    return false;
  }
}

/** What the audit log is narrowed to: the search box, Who (with whose account "You" is), What, and When's window. */
export interface AuditFilter {
  q: string;
  who: AuditWho;
  what: AuditWhat;
  ownerId: string | null;
  after: string | null;
  before: string | null;
}

export const ALL_OF_THE_AUDIT: AuditFilter = { q: '', who: 'anyone', what: 'anything', ownerId: null, after: null, before: null };

/** The audit log's filter from what its search box asks, with whose account "You" is. */
export function auditFilter(ask: ListAsk, ownerId: string | null): AuditFilter {
  return {
    q: ask.q,
    who: (ask.picks.who ?? 'anyone') as AuditWho,
    what: (ask.picks.what ?? 'anything') as AuditWhat,
    ownerId,
    after: ask.after,
    before: ask.before,
  };
}

/** Where a page of the audit log starts: what /v1 answered with the last one. */
export type AuditCursor = string;

/** The audit filter as /v1 takes it: "You" is whoever asks. */
const auditArgs = ({ ownerId: _you, ...filter }: AuditFilter) => filter;

/** A page of the audit log, newest first, narrowed by `filter`. */
export async function auditPage(
  after: AuditCursor | null,
  filter: AuditFilter = ALL_OF_THE_AUDIT,
): Promise<{ entries: AuditEntry[]; more: boolean; next: AuditCursor | null }> {
  const page = await callV1('owner_audit_page', { ...auditArgs(filter), limit: PAGE, startingAfter: after ?? undefined });
  return { entries: page.data.map(entryFrom), more: page.hasMore, next: page.startingAfter };
}

/** How many entries match: the database's own count, estimated once there are too many to count quickly. */
export async function auditCount(filter: AuditFilter = ALL_OF_THE_AUDIT): Promise<number> {
  return callV1('owner_audit_count', auditArgs(filter));
}

/** One entry of the audit log, for its own page on a phone; null when there's none with that id. */
export async function auditEntry(id: number): Promise<AuditEntry | null> {
  const entry = await callV1('owner_audit_entry', { entryId: id });
  return entry ? entryFrom(entry) : null;
}

function entryFrom(row: {
  id: number;
  createdAt: string;
  actor: string | null;
  action: string;
  targetKind: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}): AuditEntry {
  return {
    id: row.id,
    at: row.createdAt,
    actor: row.actor,
    action: row.action,
    targetKind: row.targetKind,
    targetId: row.targetId,
    reason: row.reason,
    before: snakeKeys(row.before),
    after: snakeKeys(row.after),
  };
}

// --- Deletions -----------------------------------------------------------------------

function deletionFrom(row: {
  userId: string;
  name: string | null;
  email: string | null;
  houseName: string | null;
  requestedAt: string;
  deletesAt: string;
  requestedBy: string;
}): PendingDeletion {
  return {
    userId: row.userId,
    name: row.name ?? '',
    email: row.email,
    house: row.houseName,
    requestedAt: row.requestedAt,
    deleteAfter: row.deletesAt,
    requestedBy: row.requestedBy === 'owner' ? 'owner' : 'self',
  };
}

/** What Deletions is narrowed to: the search box's words, who started it, how soon it goes, and when they asked. */
export interface DeletionFilter {
  q: string;
  by: 'self' | 'owner' | null;
  goes: 'day' | 'week' | null;
  after: string | null;
  before: string | null;
}

/** Deletions' filter from what its search box asks. */
export function deletionFilter(ask: ListAsk): DeletionFilter {
  const by = ask.picks.by;
  const goes = ask.picks.goes;
  return {
    q: ask.q,
    by: by === 'self' || by === 'owner' ? by : null,
    goes: goes === 'day' || goes === 'week' ? goes : null,
    after: ask.after,
    before: ask.before,
  };
}

/** Where a page of Deletions starts: what /v1 answered with the last one. */
export type DeletionCursor = string;

/** A page of who is waiting, soonest first, narrowed by the database. */
export async function deletionsPage(
  after: DeletionCursor | null,
  filter: DeletionFilter,
): Promise<{ people: PendingDeletion[]; more: boolean; next: DeletionCursor | null }> {
  const page = await callV1('owner_deletions_page', { ...filter, limit: PAGE, startingAfter: after ?? undefined });
  return { people: page.data.map(deletionFrom), more: page.hasMore, next: page.startingAfter };
}

/** How many are waiting and match. */
export async function deletionsCount(filter: DeletionFilter): Promise<number> {
  return callV1('owner_deletions_count', { ...filter });
}

/** Delete now: the clock takes it within ten minutes. */
export async function deleteNow(userId: string, reason: string): Promise<void> {
  await callV1('owner_delete_now', { userId, reason: reason.trim() || undefined });
}

/** Stop: as if they'd pressed Keep my account. */
export async function stopDeletion(userId: string, reason: string): Promise<void> {
  await callV1('owner_stop_deletion', { userId, reason: reason.trim() || undefined });
}

/** Starts the 30 days for whoever has this email, who asked by email. */
export async function deleteByEmail(email: string, reason: string): Promise<void> {
  await callV1('owner_request_deletion', { email: email.trim(), reason: reason.trim() || undefined });
}

/** One turn of the owner's Ask Jonz, the chat so far ending with what they asked. */
export function askOwner(messages: ChatMessage[]): Promise<OwnerAskResponse> {
  return callV1('ask_owner', { messages });
}

/**
 * The owner's own chats, through their session with their code: the
 * database lets only the owner read, keep or delete their own.
 */
export const ownerChats: ChatStore = {
  key: ['owner-ask-chats'],
  async list() {
    return callV1('owner_ask_chats', {});
  },
  async load(id) {
    const chat = await callV1('owner_ask_chat', { chatId: id });
    if (!chat) throw new Error('That chat isn’t there any more.');
    return { id: chat.id, title: chat.title, turns: savedTurns(chat.turns) };
  },
  async keep(id, turns: readonly SavedTurn[]) {
    const kept = [...turns.slice(-CHAT_SAVED_TURNS)];
    if (id) {
      await callV1('update_owner_ask_chat', { chatId: id, turns: kept });
      return id;
    }
    return callV1('keep_owner_ask_chat', { turns: kept });
  },
  async remove(id) {
    await callV1('delete_owner_ask_chat', { chatId: id });
  },
};
