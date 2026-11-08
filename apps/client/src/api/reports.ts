import {
  humanError,
  type ListAsk,
  REPORT_KINDS,
  REPORT_LIMITS,
  REPORT_STATES,
  REPORT_SOURCES,
  ReportFixResponse,
  ReportMessageResponse,
  ReportResponse,
  SupportDraftResponse,
  type SupportDraft,
  type ReportDetails,
  type ReportKind,
  type ReportSource,
  type ReportState,
} from '@app/core';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { apiPost } from './http';
import { supabase } from './supabase';

export type { ReportDetails, SupportDraft };

// Report a problem (docs/specs/report-a-problem.md). The sender's side reads
// their own reports through RLS and sends through apps/api, which tells the
// owner. The owner's Inbox reads through owner-only functions and replies
// through apps/api, which tells the sender. Screenshots live in the private
// `report-shots` bucket, under the sender's own folder; the app shows them
// by short-lived signed links.

const SHOTS = 'report-shots';
/** How long a screenshot's link works: long enough to read a report. */
const SHOT_LINK_SECONDS = 60 * 60;
/** A screenshot's longest side once shrunk, and its JPEG quality: readable, and far under the bucket's 5 MB. */
const SHOT_EDGE = 1600;
const SHOT_QUALITY = 0.8;

/** One thing said on a report: its first words, a reply, or its sender writing back. */
export interface ReportMessage {
  from: 'them' | 'jonz';
  /** Who: the sender's name, or the owner's first name a reply was signed with. */
  name: string | null;
  at: string;
  text: string;
  /** Signed links to its screenshots: only the first words have any. */
  shots?: string[];
}

/** A report, whole, as Your reports and the owner's Inbox show one. */
export interface Report {
  id: string;
  kind: ReportKind;
  state: ReportState;
  userId: string | null;
  name: string | null;
  email: string | null;
  house: string | null;
  role: string | null;
  sentAt: string;
  words: string;
  messages: ReportMessage[];
  details: ReportDetails | null;
  /** Where it came from: the app, or an email to support. */
  source: ReportSource;
  /** An emailed one's subject. */
  subject: string | null;
  /** The report it's folded into ("Same as"), for the owner. */
  sameAs: ReportLink | null;
  /** The reports folded into it, for the owner. */
  also: ReportLink[];
}

/** Another report, as a line that leads to it. */
export interface ReportLink {
  id: string;
  name: string | null;
  words: string;
  state: ReportState;
}

/** A row of Your reports. */
export interface MyReport {
  id: string;
  kind: ReportKind;
  state: ReportState;
  words: string;
  sentAt: string;
  replies: number;
  unread: boolean;
}

/** A row of the owner's Inbox. */
export interface InboxRow {
  id: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  house: string | null;
  kind: ReportKind;
  state: ReportState;
  words: string;
  sentAt: string;
  source: ReportSource;
  subject: string | null;
  /** Folded into another report. */
  folded: boolean;
  /** How many reports are folded into this one. */
  also: number;
}

const kindOf = (value: string): ReportKind => (REPORT_KINDS as readonly string[]).includes(value) ? (value as ReportKind) : 'problem';
const stateOf = (value: string): ReportState => (REPORT_STATES as readonly string[]).includes(value) ? (value as ReportState) : 'new';
const sourceOf = (value: string | null | undefined): ReportSource => (value === 'email' ? 'email' : 'app');

function linkOf(value: unknown): ReportLink | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { id?: string; name?: string | null; words?: string; state?: string };
  if (!v.id) return null;
  return { id: v.id, name: v.name ?? null, words: v.words ?? '', state: stateOf(v.state ?? 'new') };
}

function detailsOf(value: unknown): ReportDetails | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const line = (key: string) => (typeof v[key] === 'string' && v[key] ? (v[key] as string) : undefined);
  const details: ReportDetails = { pages: line('pages'), app: line('app'), house: line('house'), error: line('error') };
  return Object.values(details).some(Boolean) ? details : null;
}

async function signed(paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(SHOTS).createSignedUrls([...paths], SHOT_LINK_SECONDS);
  if (error) return [];
  return (data ?? []).flatMap((d) => (d.signedUrl ? [d.signedUrl] : []));
}

interface MessageRow {
  from_owner: boolean;
  author_name: string | null;
  body: string;
  at: string;
}

function conversation(first: { name: string | null; at: string; words: string; shots: string[] }, rows: readonly MessageRow[]): ReportMessage[] {
  return [
    { from: 'them', name: first.name, at: first.at, text: first.words, ...(first.shots.length ? { shots: first.shots } : {}) },
    ...rows.map((m) => ({ from: m.from_owner ? ('jonz' as const) : ('them' as const), name: m.from_owner ? m.author_name : first.name, at: m.at, text: m.body })),
  ];
}

// --- Sending, and the sender's side --------------------------------------------------

/**
 * A screenshot from the library, shrunk to a JPEG ready to upload, or null
 * when the person backed out. Throws a sentence when the app may not use
 * their photos.
 */
export async function pickScreenshot(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Jonz needs your photos to add a screenshot. Allow it in Settings.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  const { uri, width, height } = result.assets[0];
  const context = ImageManipulator.manipulate(uri);
  const longest = Math.max(width, height);
  if (longest > SHOT_EDGE) {
    const scale = SHOT_EDGE / longest;
    context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: SHOT_QUALITY });
  return saved.uri;
}

/** Uploads screenshots to the sender's own folder; answers their paths, for send_report. */
async function uploadShots(uris: readonly string[]): Promise<string[]> {
  if (uris.length === 0) return [];
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error('Sign in first.');
  const paths: string[] = [];
  for (const uri of uris.slice(0, REPORT_LIMITS.shots)) {
    const bytes = await (await fetch(uri)).arrayBuffer();
    if (bytes.byteLength > REPORT_LIMITS.shotBytes) throw new Error('That picture is too big. Try a smaller one.');
    const path = `${me}/${randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(SHOTS).upload(path, bytes, { contentType: 'image/jpeg' });
    if (error) throw new Error(humanError({ message: 'report_shot' }));
    paths.push(path);
  }
  return paths;
}

/** Sends a report, screenshots first. Answers its id. */
export async function sendReport(report: { kind: ReportKind; words: string; details: ReportDetails | null; shots: readonly string[] }): Promise<string> {
  const shots = await uploadShots(report.shots);
  const { id } = await apiPost('/api/reports', { kind: report.kind, words: report.words.trim(), details: report.details, shots }, ReportResponse);
  return id;
}

/** Your reports, newest first. */
export async function myReports(): Promise<MyReport[]> {
  const { data, error } = await supabase.rpc('my_reports');
  if (error) throw new Error(humanError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: kindOf(r.kind),
    state: stateOf(r.state),
    words: r.words,
    sentAt: r.created_at,
    replies: r.replies,
    unread: r.unread,
  }));
}

/** One of yours, with the conversation; null when it isn't there (or isn't yours). */
export async function myReport(id: string): Promise<Report | null> {
  const [{ data: row, error }, { data: rows, error: messagesError }] = await Promise.all([
    supabase.from('reports').select('id, user_id, kind, state, words, details, shots, created_at, source, subject').eq('id', id).maybeSingle(),
    supabase.from('report_messages').select('from_owner, author_name, body, at:created_at').eq('report_id', id).order('created_at').order('id'),
  ]);
  if (error || messagesError) throw new Error(humanError(error ?? messagesError));
  if (!row) return null;
  const shots = await signed(row.shots);
  return {
    id: row.id,
    kind: kindOf(row.kind),
    state: stateOf(row.state),
    userId: row.user_id,
    name: null,
    email: null,
    house: null,
    role: null,
    sentAt: row.created_at,
    words: row.words,
    details: detailsOf(row.details),
    messages: conversation({ name: null, at: row.created_at, words: row.words, shots }, rows ?? []),
    source: sourceOf(row.source),
    subject: row.subject,
    sameAs: null,
    also: [],
  };
}

/** You've read it: its replies stop counting as new. */
export async function seeReport(id: string): Promise<void> {
  const { error } = await supabase.rpc('see_report', { p_report: id });
  if (error) throw new Error(humanError(error));
}

/** Write back on your own report. */
export async function writeBack(id: string, body: string): Promise<void> {
  await apiPost(`/api/reports/${id}/messages`, { body: body.trim() }, ReportMessageResponse);
}

// --- The owner's Inbox ----------------------------------------------------------------

/** What the Inbox is narrowed to: the words, the state ('waiting' is new or open), where it came from, the kind, and when it was sent. */
export interface InboxFilter {
  q: string;
  state: 'waiting' | ReportState | null;
  source: ReportSource | null;
  kind: ReportKind | null;
  after: string | null;
  before: string | null;
}

/** The Inbox's filter from what its search box asks. It opens on what's waiting. */
export function inboxFilter(ask: ListAsk): InboxFilter {
  const state = ask.picks.state ?? 'waiting';
  const kind = ask.picks.kind;
  const source = ask.picks.source;
  return {
    q: ask.q,
    state: state === 'waiting' || (REPORT_STATES as readonly string[]).includes(state) ? (state as InboxFilter['state']) : null,
    source: source && (REPORT_SOURCES as readonly string[]).includes(source) ? (source as ReportSource) : null,
    kind: kind && (REPORT_KINDS as readonly string[]).includes(kind) ? (kind as ReportKind) : null,
    after: ask.after,
    before: ask.before,
  };
}

/** Where a page of the Inbox starts: after the last one shown, newest first. */
export interface InboxCursor {
  at: string;
  id: string;
}

const PAGE = 50;

const filterArgs = (filter: InboxFilter) => ({
  p_q: filter.q,
  p_state: filter.state ?? undefined,
  p_kind: filter.kind ?? undefined,
  p_from: filter.source ?? undefined,
  p_after: filter.after ?? undefined,
  p_before: filter.before ?? undefined,
});

/** A page of reports, newest first, narrowed by the database. */
export async function inboxPage(after: InboxCursor | null, filter: InboxFilter): Promise<{ items: InboxRow[]; more: boolean }> {
  const { data, error } = await supabase.rpc('owner_reports_page', {
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
      userId: r.user_id,
      name: r.name,
      email: r.email,
      house: r.house_name,
      kind: kindOf(r.kind),
      state: stateOf(r.state),
      words: r.words,
      sentAt: r.created_at,
      source: sourceOf(r.source),
      subject: r.subject,
      folded: r.same_as_report_id !== null,
      also: r.also,
    })),
    more: rows.length > PAGE,
  };
}

/** How many match. */
export async function inboxCount(filter: InboxFilter): Promise<number> {
  const { data, error } = await supabase.rpc('owner_reports_count', filterArgs(filter));
  if (error) throw new Error(humanError(error));
  return Number(data ?? 0);
}

interface OpenedRow {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  house_name: string | null;
  role: string | null;
  kind: string;
  state: string;
  words: string;
  details: unknown;
  shots: string[];
  created_at: string;
  messages: MessageRow[];
  source: string;
  subject: string | null;
  same_as: unknown;
  also: unknown[];
}

/** One report, whole, for the owner. Opening a new one marks it read. */
export async function openReport(id: string): Promise<Report> {
  const { data, error } = await supabase.rpc('owner_open_report', { p_report: id });
  if (error) throw new Error(humanError(error));
  const row = data as unknown as OpenedRow;
  const shots = await signed(row.shots ?? []);
  return {
    id: row.id,
    kind: kindOf(row.kind),
    state: stateOf(row.state),
    userId: row.user_id,
    name: row.name,
    email: row.email,
    house: row.house_name,
    role: row.role,
    sentAt: row.created_at,
    words: row.words,
    details: detailsOf(row.details),
    messages: conversation({ name: row.name, at: row.created_at, words: row.words, shots }, row.messages ?? []),
    source: sourceOf(row.source),
    subject: row.subject ?? null,
    sameAs: linkOf(row.same_as),
    also: (row.also ?? []).flatMap((one) => linkOf(one) ?? []),
  };
}

/** Reply, as the owner: its sender gets a push and an email. */
export async function replyToReport(id: string, body: string): Promise<void> {
  await apiPost(`/api/reports/${id}/reply`, { body: body.trim() }, ReportMessageResponse);
}

/** Mark it fixed, or open it again. */
export async function setReportState(id: string, state: 'fixed' | 'open'): Promise<void> {
  const { error } = await supabase.rpc('owner_set_report_state', { p_report: id, p_state: state });
  if (error) throw new Error(humanError(error));
}

/**
 * Mark it fixed, with every report folded into it; with `tell`, each sender
 * gets the note (or a plain "it's fixed") in the app and by email. Answers
 * how many were fixed and how many people were told.
 */
export async function fixReport(id: string, note: string, tell: boolean): Promise<{ fixed: number; told: number }> {
  const { fixed, told } = await apiPost(`/api/reports/${id}/fixed`, { note: note.trim() || null, tell }, ReportFixResponse);
  return { fixed, told };
}

/** Fold it into the report that says the same thing, or (null) take it back out. */
export async function setSameAs(id: string, main: string | null): Promise<void> {
  const { error } = await supabase.rpc('owner_same_as', { p_report: id, p_main: main as string });
  if (error) throw new Error(humanError(error));
}

/** The reports it might be the same as, newest first: words, or an id's start. */
export async function sameAsFind(id: string, q: string): Promise<ReportLink[]> {
  const { data, error } = await supabase.rpc('owner_same_as_find', { p_report: id, p_q: q });
  if (error) throw new Error(humanError(error));
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, words: r.words, state: stateOf(r.state) }));
}

/**
 * The support agent's suggestion on a report waiting for the owner: written
 * now (a few seconds) or kept from before. Null when there's none to give.
 */
export async function supportDraft(id: string): Promise<SupportDraft | null> {
  const { draft } = await apiPost(`/api/reports/${id}/draft`, {}, SupportDraftResponse);
  return draft;
}

/** The owner used the suggestion (sent it, maybe with its step), or set it aside. */
export async function setSupportDraft(id: string, state: 'used' | 'dismissed'): Promise<void> {
  const { error } = await supabase.rpc('owner_set_support_draft', { p_draft: id, p_state: state });
  if (error) throw new Error(humanError(error));
}
