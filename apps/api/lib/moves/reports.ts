import "server-only";

import {
  firstName,
  languageOf,
  type Language,
  refOf,
  REPORT_PUSH,
  type ReportFixRequest,
  type ReportMessageRequest,
  type ReportRequest,
  reportGist,
  reportReplyEmail,
  reportUrl,
  topicOf,
} from "@app/core";

import { sendEmail } from "@/lib/email";
import type { Notify } from "@/lib/engine/tick";
import { pushNotifier } from "@/lib/push";
import { type AdminClient, createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

// Report a problem (docs/specs/report-a-problem.md) needs a server for one
// thing: telling the other side. Sending, writing back and replying are the
// caller's own calls to the database, which decides whether they may
// (supabase/migrations/20261112090000_reports.sql); then the owner gets a
// push for each new word from a sender, and a sender gets a push and an
// email for each reply. Email to support@jonz.app comes in here too
// (receiveEmail), and "it's fixed" goes out to everyone who reported it.

/** Where a push or an email is sent, and what with: kept apart so tests can watch. */
export interface Outbox {
  db: AdminClient;
  notify: Notify | undefined;
  email: typeof sendEmail;
}

export function outbox(): Outbox {
  const db = createAdminClient();
  return { db, notify: pushNotifier(db), email: sendEmail };
}

/** Everyone who owns Jonz: they hear about every report. */
async function owners(db: AdminClient): Promise<string[]> {
  const { data } = await db.from("app_owners").select("user_id");
  return (data ?? []).map((o) => o.user_id);
}

async function nameOf(db: AdminClient, userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name ? firstName(data.display_name) : null;
}

/** Send a report; the owner hears "Ava sent a problem: The bins John vanished…". */
export async function sendReport(caller: Caller, report: ReportRequest, out: Outbox = outbox()): Promise<{ refusal: Refusal } | { id: string }> {
  const { data: id, error } = await caller.db.rpc("send_report", {
    p_kind: report.kind,
    p_words: report.words,
    p_details: report.details ?? undefined,
    p_shots: report.shots,
  });
  if (error || !id) return { refusal: error ?? { message: "not_found" } };

  if (out.notify) {
    const [to, name] = await Promise.all([owners(out.db), nameOf(out.db, caller.userId)]);
    await out.notify(to, {
      title: (w) => REPORT_PUSH.sent(report.kind, name, w),
      body: reportGist(report.words),
      url: `/admin/inbox/${id}`,
      kind: "support",
      zone: "UTC",
      tag: `report:${id}`,
    });
  }
  return { id };
}

/** Write back on your own report; the owner hears "Ava wrote back". */
export async function writeBack(caller: Caller, reportId: string, { body }: ReportMessageRequest, out: Outbox = outbox()): Promise<Refusal | null> {
  const { error } = await caller.db.rpc("write_back", { p_report: reportId, p_body: body });
  if (error) return error;

  if (out.notify) {
    const [to, name] = await Promise.all([owners(out.db), nameOf(out.db, caller.userId)]);
    await out.notify(to, {
      title: (w) => REPORT_PUSH.wroteBack(name, w),
      body: reportGist(body),
      url: `/admin/inbox/${reportId}`,
      kind: "support",
      zone: "UTC",
      tag: `report:${reportId}`,
    });
  }
  return null;
}

/** Who a message from Jonz on a report goes to, as the database answers it (report_recipient). */
interface Recipient {
  report: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  kind: ReportRequest["kind"];
  words: string;
  subject: string | null;
  zone: string | null;
}

/**
 * Tell a report's sender what Jonz said on it: a push and an email to their
 * account, or, for an email from someone without one, an email back to the
 * address it came from. Nobody once they've deleted their account.
 */
async function tell(out: Outbox, to: Recipient, said: { body: string; signed: string | null; fixed?: boolean }): Promise<void> {
  if (!to.user_id && !to.email) return;
  const url = to.user_id ? reportUrl(to.report) : null;
  if (to.user_id) {
    await out.notify?.([to.user_id], {
      title: (w) => (said.fixed ? REPORT_PUSH.fixed(w) : REPORT_PUSH.replied(said.signed, w)),
      body: reportGist(said.body),
      url: `/you/reports/${to.report}`,
      kind: "support",
      zone: to.zone ?? "UTC",
      tag: `report:${to.report}`,
    });
  }
  let address = to.email;
  let name = to.name ? firstName(to.name) : null;
  let language: Language = "en";
  if (to.user_id) {
    const [{ data: who }, named, { data: profile }] = await Promise.all([
      out.db.auth.admin.getUserById(to.user_id),
      nameOf(out.db, to.user_id),
      out.db.from("profiles").select("language").eq("id", to.user_id).maybeSingle(),
    ]);
    address = who?.user?.email ?? null;
    name = named;
    language = languageOf(profile?.language);
  }
  if (!address) return;
  // A failed email is logged by sendEmail; what Jonz said is on the report either way.
  await out.email(
    address,
    reportReplyEmail({
      id: to.report,
      name,
      signed: said.signed,
      kind: to.kind,
      words: to.words,
      subject: to.subject,
      reply: said.body,
      url,
      fixed: said.fixed,
      language,
    }),
    { tag: said.fixed ? "report-fixed" : "report-reply" },
  );
}

/**
 * Reply, as the owner (the database checks it is them, with their code).
 * Its sender gets a push and an email, or just the email when it came by
 * email from someone without an account.
 */
export async function replyToReport(
  caller: Caller,
  reportId: string,
  { body }: ReportMessageRequest,
  out: Outbox = outbox(),
): Promise<Refusal | null> {
  const { data, error } = await caller.db.rpc("owner_reply_report", { p_report: reportId, p_body: body });
  if (error) return error;
  const to = data as unknown as Recipient & { signed: string | null };
  await tell(out, to, { body, signed: to.signed });
  return null;
}

/**
 * Mark a report fixed, with every report folded into it ("Same as"). With
 * `tell`, each of their senders gets the note (or a plain "it's fixed") in
 * the app and by email.
 */
export async function fixReport(
  caller: Caller,
  reportId: string,
  { note, tell: telling }: ReportFixRequest,
  out: Outbox = outbox(),
): Promise<{ refusal: Refusal } | { fixed: number; told: number }> {
  const { data, error } = await caller.db.rpc("owner_fix_report", { p_report: reportId, p_note: note ?? undefined, p_tell: telling });
  if (error) return { refusal: error };
  const done = data as unknown as { fixed: number; signed: string | null; body: string; told: Recipient[] };
  let told = 0;
  for (const to of done.told) {
    if (!to.user_id && !to.email) continue;
    await tell(out, to, { body: done.body, signed: done.signed, fixed: true });
    told += 1;
  }
  return { fixed: done.fixed, told };
}

/** An email that came to support@jonz.app, as the inbound webhook read it. */
export interface Inbound {
  emailId: string;
  from: string;
  name: string | null;
  subject: string | null;
  words: string;
  /** It passed DMARC, so its From can be trusted to name a Jonz account. */
  trusted: boolean;
}

/**
 * An email becomes a report, or writes back on the one it answers
 * (receive_email); the owner hears "Ava emailed support" or "Ava wrote back".
 */
export async function receiveEmail(email: Inbound, out: Outbox = outbox()): Promise<{ did: "report" | "message" | "skipped"; report?: string }> {
  const { data, error } = await out.db.rpc("receive_email", {
    p_email_id: email.emailId,
    p_from: email.from,
    p_name: email.name ?? "",
    p_subject: email.subject ?? "",
    p_topic: topicOf(email.subject),
    p_ref: refOf(email.subject) ?? "",
    p_body: email.words,
    p_trusted: email.trusted,
  });
  if (error) throw new Error(`receive_email: ${error.message}`);
  const result = data as unknown as { did: "report" | "message" | "skipped"; report?: string; user_id?: string | null };
  if (result.did === "skipped" || !result.report || !out.notify) return result;
  const name = (result.user_id ? await nameOf(out.db, result.user_id) : null) ?? (email.name ? firstName(email.name) : email.from);
  await out.notify(await owners(out.db), {
    title: (w) => (result.did === "report" ? REPORT_PUSH.emailed(name, w) : REPORT_PUSH.wroteBack(name, w)),
    body: reportGist(email.words),
    url: `/admin/inbox/${result.report}`,
    kind: "support",
    zone: "UTC",
    tag: `report:${result.report}`,
  });
  return result;
}
