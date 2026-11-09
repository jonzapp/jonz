import {
  AUDIT_WHAT_ACTION,
  auditSearchFilter,
  CHAT_SAVED_TURNS,
  chatTitle,
  humanError,
  NOTICE_KINDS,
  noticeFromRow,
  OWNER_PERMISSION_NAMES,
  OwnerAskResponse,
  noticeSearchFilter,
  qrShape,
  savedTurns,
  type AuditEntry,
  type AuditWhat,
  type AuditWho,
  type ChatMessage,
  type ListAsk,
  type Notice,
  type NoticeKind,
  type OwnerPermission,
  type PendingDeletion,
  type QrShape,
  type SavedTurn,
} from '@app/core';

import type { ChatStore } from './ask-chats';
import { apiPost } from './http';
import { supabase } from './supabase';

// The owner's admin page (docs/specs/owner-admin.md). Every read and write
// here goes through the owner's own session, and the database decides: it
// answers an owner who has passed their code, and refuses everyone else.

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
  const { data, error } = await supabase.rpc('owner_status');
  if (error) throw new Error(humanError(error));
  const status = data as { owner?: unknown; mfa?: unknown; permissions?: unknown } | null;
  const permissions = Array.isArray(status?.permissions)
    ? status.permissions.filter((p): p is OwnerPermission => (OWNER_PERMISSION_NAMES as readonly unknown[]).includes(p))
    : [];
  return { owner: status?.owner === true, mfa: status?.mfa === true, permissions };
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

/** Every admin list reads this many at a time (and one more, to know there's another page). */
const PAGE = 50;
const NOTICE_COLUMNS = 'id, kind, title, body, link_label, link_url, starts_at, ends_at';

/** The notices on now, for What people see: never more than a handful. */
export async function liveNotices(now: Date = new Date()): Promise<Notice[]> {
  const at = now.toISOString();
  const { data, error } = await supabase
    .from('notices')
    .select(NOTICE_COLUMNS)
    .lte('starts_at', at)
    .or(`ends_at.is.null,ends_at.gt."${at}"`)
    .order('starts_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(humanError(error));
  return data.map(noticeFromRow).filter((notice): notice is Notice => notice !== null);
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

/** Where a page of notices starts: after the last one shown, newest start first. */
export interface NoticeCursor {
  at: string;
  id: string;
}

/**
 * The database narrows the notices. PostgREST takes one `or`, so the
 * groups that need one (Showing, the words, where the page starts) go in
 * together under `and`.
 */
function narrowedNotices<T extends NoticeNarrowable<T>>(query: T, filter: NoticeFilter, now: Date, after: NoticeCursor | null = null): T {
  const at = `"${now.toISOString()}"`;
  let narrow = query;
  const ors: string[] = [];
  if (filter.kind) narrow = narrow.eq('kind', filter.kind);
  if (filter.state === 'scheduled') narrow = narrow.gt('starts_at', now.toISOString());
  if (filter.state === 'live') {
    narrow = narrow.lte('starts_at', now.toISOString());
    ors.push(`ends_at.is.null,ends_at.gt.${at}`);
  }
  if (filter.state === 'ended') narrow = narrow.lte('ends_at', now.toISOString());
  if (filter.after) narrow = narrow.gt('starts_at', filter.after);
  if (filter.before) narrow = narrow.lte('starts_at', filter.before);
  const search = noticeSearchFilter(filter.q);
  if (search) ors.push(search);
  if (after) ors.push(`starts_at.lt."${after.at}",and(starts_at.eq."${after.at}",id.lt.${after.id})`);
  if (ors.length === 1) narrow = narrow.or(ors[0]);
  if (ors.length > 1) narrow = narrow.or(`and(${ors.map((group) => `or(${group})`).join(',')})`);
  return narrow;
}

interface NoticeNarrowable<T> {
  eq(column: string, value: unknown): T;
  gt(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  or(filters: string): T;
}

/** A page of every notice, newest start first, narrowed by the database. */
export async function noticesPage(
  after: NoticeCursor | null,
  filter: NoticeFilter,
  now: Date = new Date(),
): Promise<{ notices: Notice[]; more: boolean }> {
  const { data, error } = await narrowedNotices(supabase.from('notices').select(NOTICE_COLUMNS), filter, now, after)
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (error) throw new Error(humanError(error));
  return {
    notices: data.slice(0, PAGE).map(noticeFromRow).filter((notice): notice is Notice => notice !== null),
    more: data.length > PAGE,
  };
}

/** How many notices match. */
export async function noticesCount(filter: NoticeFilter, now: Date = new Date()): Promise<number> {
  const { count, error } = await narrowedNotices(supabase.from('notices').select('id', { count: 'exact', head: true }), filter, now);
  if (error) throw new Error(humanError(error));
  return count ?? 0;
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
  const { data, error } = await supabase.rpc('save_notice', {
    p_id: notice.id,
    p_kind: notice.kind,
    p_title: notice.title,
    p_body: notice.body,
    p_link_label: notice.linkLabel,
    p_link_url: notice.linkUrl,
    p_starts_at: notice.startsAt?.toISOString() ?? null,
    p_ends_at: notice.endsAt?.toISOString() ?? null,
  });
  if (error) throw new Error(humanError(error));
  return { id: data, copied: await refreshCopy() };
}

export async function endNotice(id: string): Promise<{ copied: boolean }> {
  const { error } = await supabase.rpc('end_notice', { p_id: id });
  if (error) throw new Error(humanError(error));
  return { copied: await refreshCopy() };
}

const CopyResponse = {
  parse: (value: unknown) => ({ copied: (value as { copied?: unknown } | null)?.copied === true }),
};

/** POST /api/notices/copy. False when it didn't go; the notice itself is saved either way. */
async function refreshCopy(): Promise<boolean> {
  try {
    await apiPost('/api/notices/copy', {}, CopyResponse);
    return true;
  } catch {
    return false;
  }
}

const AUDIT_COLUMNS = 'id, at:created_at, actor, action, target_kind, target_id, reason, before, after';

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

/** The filter methods both of the audit log's reads share, whatever they select. */
interface Narrowable<T> {
  eq(column: string, value: unknown): T;
  neq(column: string, value: unknown): T;
  not(column: string, operator: string, value: unknown): T;
  is(column: string, value: null): T;
  like(column: string, pattern: string): T;
  gt(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  or(filters: string): T;
}

/** The database does the narrowing, so the log reads as fast with a million entries as with fifty. */
function narrowed<T extends Narrowable<T>>(query: T, filter: AuditFilter): T {
  let narrow = query;
  if (filter.who === 'you' && filter.ownerId) narrow = narrow.eq('actor', filter.ownerId);
  if (filter.who === 'others') {
    narrow = narrow.not('actor', 'is', null);
    if (filter.ownerId) narrow = narrow.neq('actor', filter.ownerId);
  }
  if (filter.who === 'jonz') narrow = narrow.is('actor', null);
  const action = AUDIT_WHAT_ACTION[filter.what];
  if (action) narrow = narrow.like('action', `${action}%`);
  if (filter.after) narrow = narrow.gt('created_at', filter.after);
  if (filter.before) narrow = narrow.lte('created_at', filter.before);
  const search = auditSearchFilter(filter.q);
  if (search) narrow = narrow.or(search);
  return narrow;
}

/** A page of the audit log, newest first, older than `before` (an entry's id) when given, narrowed by `filter`. */
export async function auditPage(
  before: number | null,
  filter: AuditFilter = ALL_OF_THE_AUDIT,
): Promise<{ entries: AuditEntry[]; more: boolean }> {
  let query = narrowed(supabase.from('admin_audit').select(AUDIT_COLUMNS), filter)
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (before !== null) query = query.lt('id', before);
  const { data, error } = await query;
  if (error) throw new Error(humanError(error));
  return { entries: data.slice(0, PAGE).map(entryFromRow), more: data.length > PAGE };
}

/** How many entries match: the database's own count, estimated once there are too many to count quickly. */
export async function auditCount(filter: AuditFilter = ALL_OF_THE_AUDIT): Promise<number> {
  const { count, error } = await narrowed(supabase.from('admin_audit').select('id', { count: 'estimated', head: true }), filter);
  if (error) throw new Error(humanError(error));
  return count ?? 0;
}

/** One entry of the audit log, for its own page on a phone; null when there's none with that id. */
export async function auditEntry(id: number): Promise<AuditEntry | null> {
  const { data, error } = await supabase.from('admin_audit').select(AUDIT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(humanError(error));
  return data ? entryFromRow(data) : null;
}

function entryFromRow(row: {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  target_kind: string;
  target_id: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    targetKind: row.target_kind,
    targetId: row.target_id,
    reason: row.reason,
    before: row.before,
    after: row.after,
  };
}

// --- Deletions -----------------------------------------------------------------------

type DeletionRow = {
  user_id: string;
  name: string;
  email: string | null;
  house_name: string | null;
  requested_at: string;
  deletes_at: string;
  requested_by: string;
};

function deletionFromRow(row: DeletionRow): PendingDeletion {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email ?? null,
    house: row.house_name ?? null,
    requestedAt: row.requested_at,
    deleteAfter: row.deletes_at,
    requestedBy: row.requested_by === 'owner' ? 'owner' : 'self',
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

/** Where a page of Deletions starts: after the last one shown, which goes soonest first. */
export interface DeletionCursor {
  at: string;
  userId: string;
}

const filterArgs = (filter: DeletionFilter) => ({
  p_q: filter.q,
  p_by: filter.by ?? undefined,
  p_goes: filter.goes ?? undefined,
  p_after: filter.after ?? undefined,
  p_before: filter.before ?? undefined,
});

/** A page of who is waiting, soonest first, narrowed by the database. */
export async function deletionsPage(
  after: DeletionCursor | null,
  filter: DeletionFilter,
): Promise<{ people: PendingDeletion[]; more: boolean }> {
  const { data, error } = await supabase.rpc('owner_deletions_page', {
    ...filterArgs(filter),
    p_cursor_at: after?.at,
    p_cursor_user: after?.userId,
    p_limit: PAGE + 1,
  });
  if (error) throw new Error(humanError(error));
  const rows = data ?? [];
  return { people: rows.slice(0, PAGE).map(deletionFromRow), more: rows.length > PAGE };
}

/** How many are waiting and match. */
export async function deletionsCount(filter: DeletionFilter): Promise<number> {
  const { data, error } = await supabase.rpc('owner_deletions_count', filterArgs(filter));
  if (error) throw new Error(humanError(error));
  return Number(data ?? 0);
}

/** Delete now: the clock takes it within ten minutes. */
export async function deleteNow(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('owner_delete_now', { p_user: userId, p_reason: reason.trim() || undefined });
  if (error) throw new Error(humanError(error));
}

/** Stop: as if they'd pressed Keep my account. */
export async function stopDeletion(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('owner_stop_deletion', { p_user: userId, p_reason: reason.trim() || undefined });
  if (error) throw new Error(humanError(error));
}

/** Starts the 30 days for whoever has this email, who asked by email. */
export async function deleteByEmail(email: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('owner_request_deletion', { p_email: email.trim(), p_reason: reason.trim() || undefined });
  if (error) throw new Error(humanError(error));
}

/** POST /api/admin/ask: one turn of the owner's Ask Jonz, the chat so far ending with what they asked. */
export function askOwner(messages: ChatMessage[]): Promise<OwnerAskResponse> {
  return apiPost('/api/admin/ask', { messages }, OwnerAskResponse);
}

/**
 * The owner's own chats (owner_ask_chats), through their session with their
 * code: the database lets only the owner read, keep or delete their own.
 */
export const ownerChats: ChatStore = {
  key: ['owner-ask-chats'],
  async list() {
    const { data, error } = await supabase
      .from('owner_ask_chats')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(humanError(error));
    return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
  },
  async load(id) {
    const { data, error } = await supabase.from('owner_ask_chats').select('id, title, turns').eq('id', id).single();
    if (error) throw new Error(humanError(error));
    return { id: data.id, title: data.title, turns: savedTurns(data.turns) };
  },
  async keep(id, turns: readonly SavedTurn[]) {
    const kept = turns.slice(-CHAT_SAVED_TURNS);
    const title = chatTitle(turns);
    if (id) {
      const { error } = await supabase.from('owner_ask_chats').update({ title, turns: kept }).eq('id', id);
      if (error) throw new Error(humanError(error));
      return id;
    }
    const { data, error } = await supabase.from('owner_ask_chats').insert({ title, turns: kept }).select('id').single();
    if (error) throw new Error(humanError(error));
    return data.id;
  },
  async remove(id) {
    const { error } = await supabase.from('owner_ask_chats').delete().eq('id', id);
    if (error) throw new Error(humanError(error));
  },
};
