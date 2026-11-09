import {
  humanError,
  type ListAsk,
  REPORT_KINDS,
  REPORT_LIMITS,
  REPORT_STATES,
  REPORT_SOURCES,
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

import { supabase } from './supabase';
import { callV1 } from './v1';

export type { ReportDetails, SupportDraft };

// Report a problem (docs/specs/report-a-problem.md), on /v1. Sending or
// writing back tells the owner; the owner's replies tell the sender. The
// Inbox's operations are the owner's alone. Screenshots live in the private
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
  fromOwner: boolean;
  authorName: string | null;
  body: string;
  at: string;
}

function conversation(first: { name: string | null; at: string; words: string; shots: string[] }, rows: readonly MessageRow[]): ReportMessage[] {
  return [
    { from: 'them', name: first.name, at: first.at, text: first.words, ...(first.shots.length ? { shots: first.shots } : {}) },
    ...rows.map((m) => ({ from: m.fromOwner ? ('jonz' as const) : ('them' as const), name: m.fromOwner ? m.authorName : first.name, at: m.at, text: m.body })),
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
  const { id } = await callV1('send_report', { kind: report.kind, words: report.words.trim(), details: report.details, shots });
  return id;
}

/** Your reports, newest first. */
export async function myReports(): Promise<MyReport[]> {
  const rows = await callV1('my_reports', {});
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    state: r.state,
    words: r.words,
    sentAt: r.createdAt,
    replies: r.replies,
    unread: r.unread,
  }));
}

/** One of yours, with the conversation; null when it isn't there (or isn't yours). */
export async function myReport(id: string): Promise<Report | null> {
  const found = await callV1('my_report', { reportId: id });
  if (!found) return null;
  const { report: row, messages } = found;
  const shots = await signed(row.shots);
  return {
    id: row.id,
    kind: kindOf(row.kind),
    state: stateOf(row.state),
    userId: row.userId,
    name: null,
    email: null,
    house: null,
    role: null,
    sentAt: row.createdAt,
    words: row.words,
    details: detailsOf(row.details),
    messages: conversation(
      { name: null, at: row.createdAt, words: row.words, shots },
      messages.map((m) => ({ fromOwner: m.fromOwner, authorName: m.authorName, body: m.body, at: m.createdAt })),
    ),
    source: sourceOf(row.source),
    subject: row.subject,
    sameAs: null,
    also: [],
  };
}

/** You've read it: its replies stop counting as new. */
export async function seeReport(id: string): Promise<void> {
  await callV1('see_report', { reportId: id });
}

/** Write back on your own report. */
export async function writeBack(id: string, body: string): Promise<void> {
  await callV1('write_back', { reportId: id, body: body.trim() });
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

/** Where a page of the Inbox starts: what /v1 answered with the last one. */
export type InboxCursor = string;

const PAGE = 50;

/** The Inbox's filter as /v1 takes it: where it came from is `from`. */
const filterArgs = ({ source, ...filter }: InboxFilter) => ({ ...filter, from: source });

/** A page of reports, newest first, narrowed by the database. */
export async function inboxPage(after: InboxCursor | null, filter: InboxFilter): Promise<{ items: InboxRow[]; more: boolean; next: InboxCursor | null }> {
  const page = await callV1('owner_reports_page', { ...filterArgs(filter), limit: PAGE, startingAfter: after ?? undefined });
  return {
    items: page.data.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: r.email,
      house: r.houseName,
      kind: r.kind,
      state: r.state,
      words: r.words,
      sentAt: r.createdAt,
      source: sourceOf(r.source),
      subject: r.subject,
      folded: r.sameAsReportId !== null,
      also: r.also,
    })),
    more: page.hasMore,
    next: page.startingAfter,
  };
}

/** How many match. */
export async function inboxCount(filter: InboxFilter): Promise<number> {
  return callV1('owner_reports_count', filterArgs(filter));
}

/** One report, whole, for the owner. Opening a new one marks it read. */
export async function openReport(id: string): Promise<Report> {
  const row = await callV1('owner_open_report', { reportId: id });
  const shots = await signed(row.shots);
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    userId: row.userId,
    name: row.name,
    email: row.email,
    house: row.houseName,
    role: row.role,
    sentAt: row.createdAt,
    words: row.words,
    details: detailsOf(row.details),
    messages: conversation({ name: row.name, at: row.createdAt, words: row.words, shots }, row.messages),
    source: sourceOf(row.source),
    subject: row.subject,
    sameAs: linkOf(row.sameAs),
    also: row.also.flatMap((one) => linkOf(one) ?? []),
  };
}

/** Reply, as the owner: its sender gets a push and an email. */
export async function replyToReport(id: string, body: string): Promise<void> {
  await callV1('owner_reply_report', { reportId: id, body: body.trim() });
}

/** Mark it fixed, or open it again. */
export async function setReportState(id: string, state: 'fixed' | 'open'): Promise<void> {
  await callV1('owner_set_report_state', { reportId: id, state });
}

/**
 * Mark it fixed, with every report folded into it; with `tell`, each sender
 * gets the note (or a plain "it's fixed") in the app and by email. Answers
 * how many were fixed and how many people were told.
 */
export async function fixReport(id: string, note: string, tell: boolean): Promise<{ fixed: number; told: number }> {
  const { fixed, told } = await callV1('owner_fix_report', { reportId: id, note: note.trim() || null, tell });
  return { fixed, told };
}

/** Fold it into the report that says the same thing, or (null) take it back out. */
export async function setSameAs(id: string, main: string | null): Promise<void> {
  await callV1('owner_same_as', { reportId: id, mainId: main });
}

/** The reports it might be the same as, newest first: words, or an id's start. */
export async function sameAsFind(id: string, q: string): Promise<ReportLink[]> {
  const rows = await callV1('owner_same_as_find', { reportId: id, q });
  return rows.map((r) => ({ id: r.id, name: r.name, words: r.words, state: stateOf(r.state) }));
}

/**
 * The support agent's suggestion on a report waiting for the owner: written
 * now (a few seconds) or kept from before. Null when there's none to give.
 */
export async function supportDraft(id: string): Promise<SupportDraft | null> {
  const { draft } = await callV1('claim_support_draft', { reportId: id });
  return draft;
}

/** The owner used the suggestion (sent it, maybe with its step), or set it aside. */
export async function setSupportDraft(id: string, state: 'used' | 'dismissed'): Promise<void> {
  await callV1('owner_set_support_draft', { draftId: id, state });
}
