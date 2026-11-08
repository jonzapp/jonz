import "server-only";

import { DEFAULT_RULES, howItWorks, SUPPORT_DRAFTS_PER_DAY, SupportDraft, tidySuggestion, type SupportDraftResponse } from "@app/core";

import { canAsk, type AgentAnswer } from "@/lib/ai/agent";
import { askSupportClaude, type ReportForAgent, type SupportAnswer, type SupportReads } from "@/lib/ai/support-draft";
import type { Caller, Refusal } from "@/lib/moves/disputes";
import { ownerReads } from "@/lib/moves/owner-ask";

// The support agent (lib/ai/support-draft.ts) on one report, as the owner's
// own session: every read, and the suggestion's own record
// (support_drafts), go through it, so the database's owner check (a second
// factor this session) holds for all of it, and nothing uses the service
// role. One suggestion for each thing the sender said: opening the report
// again gives back the one already written.

/** How many rows a read gives Claude. */
const ROWS = 10;
/** The owner's timezone, for "today" and the times Claude reads. */
const OWNER_TZ = "Europe/London";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fromPeople = (text: string | null | undefined) => `<from_people>${(text ?? "").replaceAll("<", "‹")}</from_people>`;
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: OWNER_TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** A report as owner_open_report answers it (only what the agent reads). */
interface OpenedReport {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  house_id: string | null;
  house_name: string | null;
  role: string | null;
  kind: string;
  state: string;
  words: string;
  details: Record<string, unknown> | null;
  created_at: string;
  source: string;
  subject: string | null;
  messages: { id: number; from_owner: boolean; body: string; at: string }[];
}

/** owner_house's answer (only what the agent reads). */
interface HouseRead {
  name: string;
  passPlan: string | null;
  passUntil: string | null;
  passBuyer: string | null;
  billed: boolean;
  lastActive: string | null;
  johns: number;
  people: { name: string; role: string; onTime: number; settled: number; awayUntil: string | null; movingOutOn: string | null }[];
}

/** A draft as the database answers it (support_draft_json). */
interface DraftRow {
  id: string;
  state: SupportDraft["state"];
  reply: string;
  action: SupportDraft["action"];
  why: string;
  same_as: { id: string; name: string | null; words: string; state: string } | null;
}

function draftOf(row: DraftRow): SupportDraft {
  return SupportDraft.parse({
    id: row.id,
    state: row.state,
    reply: row.reply,
    action: row.action,
    why: row.why,
    sameAs: row.same_as,
  });
}

/** The report's reads, as the owner's session. A refusal throws. */
export function supportReads(caller: Caller, report: OpenedReport, now: Date): SupportReads {
  const db = caller.db;
  const owner = ownerReads(caller, now);
  const fail = (what: string, error: { message: string }) => new Error(`${what}: ${error.message}`);
  return {
    async theirHouse() {
      if (!report.house_id) return "They're in no house.";
      const { data, error } = await db.rpc("owner_house", { p_house: report.house_id });
      if (error) throw fail("their_house", error);
      const h = data as unknown as HouseRead | null;
      if (!h) return "Their house is gone.";
      const pass = h.passPlan
        ? `House Pass: ${h.passPlan}${h.passUntil ? ` until ${when(h.passUntil)}` : ""}, bought by ${fromPeople(h.passBuyer ?? "someone who left")}${h.billed ? ", paying through Stripe" : ""}.`
        : "No House Pass.";
      return [
        `${fromPeople(h.name)}: ${h.people.length} people, ${h.johns} Johns, last John done ${h.lastActive ? when(h.lastActive) : "never"}.`,
        pass,
        ...h.people.map(
          (p) =>
            `- ${fromPeople(p.name)}, ${p.role}, ${p.settled > 0 ? `${Math.round((100 * p.onTime) / p.settled)}% on time over 4 weeks` : "no Johns due in 4 weeks"}${p.awayUntil ? `, away until ${p.awayUntil}` : ""}${p.movingOutOn ? `, moving out ${p.movingOutOn}` : ""}`,
        ),
      ].join("\n");
    },
    async theirReports() {
      const q = report.email ?? report.user_id;
      if (!q) return "No other reports.";
      const { data, error } = await db.rpc("owner_reports_page", { p_q: q, p_limit: ROWS + 1 });
      if (error) throw fail("their_reports", error);
      const others = data.filter((r) => r.id !== report.id).slice(0, ROWS);
      if (others.length === 0) return "No other reports.";
      return [`${others.length} other reports:`, ...others.map((r) => `- ${when(r.created_at)}, ${r.kind}, ${r.state}: ${fromPeople(r.words)} [id ${r.id}]`)].join("\n");
    },
    async similar(q) {
      const { data, error } = await db.rpc("owner_same_as_find", { p_report: report.id, p_q: q });
      if (error) throw fail("similar_reports", error);
      if (data.length === 0) return "No reports like it.";
      return [
        `${data.length} reports:`,
        ...data.slice(0, ROWS).map((r) => `- ${when(r.created_at)}, ${r.state}: ${fromPeople(r.name)} wrote ${fromPeople(r.words)} [id ${r.id}]`),
      ].join("\n");
    },
    deletions: (q) => owner.deletions(q),
    audit: (q) => owner.audit(q, null, null),
    howItWorks(topic, family) {
      return howItWorks(topic, { rules: { ...DEFAULT_RULES, timezone: OWNER_TZ, currency: "GBP" }, family, awayMakeup: 100 });
    },
  };
}

/** The report, as the agent reads it. */
function forAgent(report: OpenedReport): ReportForAgent {
  const details = report.details
    ? Object.entries(report.details)
        .filter(([, v]) => typeof v === "string" && v)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("; ")
    : "";
  return {
    id: report.id,
    kind: report.kind,
    state: report.state,
    source: report.source,
    name: report.name,
    house: report.house_name,
    role: report.role,
    hasAccount: report.user_id !== null,
    subject: report.subject,
    details: details || null,
    sentAt: when(report.created_at),
    conversation: [
      { from: "them" as const, at: when(report.created_at), text: report.words },
      ...report.messages.map((m) => ({ from: m.from_owner ? ("owner" as const) : ("them" as const), at: when(m.at), text: m.body })),
    ],
  };
}

/**
 * The suggestion on a report that's waiting for the owner: the one already
 * written for what its sender said last, or a new one. Null when there's
 * nothing to suggest (it's answered or fixed, there's nobody to reply to,
 * Claude isn't here, or today's drafts are used up). Refused (42501
 * owner_only) unless the caller is the owner with their code this session.
 *
 * `ask` is Claude, unless a test stands in for it.
 */
export async function supportDraft(
  caller: Caller,
  reportId: string,
  now: Date,
  ask: (report: ReportForAgent, today: string, reads: SupportReads) => Promise<AgentAnswer<SupportAnswer>> = askSupportClaude,
): Promise<{ refusal: Refusal } | SupportDraftResponse> {
  const { data: status } = await caller.db.rpc("owner_status");
  const { owner, mfa } = (status ?? {}) as { owner?: boolean; mfa?: boolean };
  if (!owner || !mfa) return { refusal: { code: "42501", message: "owner_only" } };

  const { data: opened, error: openError } = await caller.db.rpc("owner_open_report", { p_report: reportId });
  if (openError) return { refusal: openError };
  const report = opened as unknown as OpenedReport;
  const none: SupportDraftResponse = { draft: null };
  if (report.state !== "new" && report.state !== "open") return none;
  if (!report.user_id && !report.email) return none;
  const last = report.messages.at(-1);
  if (last?.from_owner) return none;
  if (!canAsk() && ask === askSupportClaude) return none;

  const { data: claimed, error: claimError } = await caller.db.rpc("claim_support_draft", {
    p_report: report.id,
    p_message: last ? last.id : null,
    p_limit: SUPPORT_DRAFTS_PER_DAY,
  });
  if (claimError) {
    if (claimError.message === "support_limit") return none;
    if (claimError.code === "42501") return { refusal: { code: "42501", message: "owner_only" } };
    return { refusal: claimError };
  }
  const claim = claimed as unknown as { fresh: boolean; draft: DraftRow };
  if (!claim.fresh) return { draft: draftOf(claim.draft) };

  const today = new Intl.DateTimeFormat("en-GB", { timeZone: OWNER_TZ, dateStyle: "full", timeStyle: "short" }).format(now);
  let answer: AgentAnswer<SupportAnswer> | null = null;
  try {
    answer = await ask(forAgent(report), today, supportReads(caller, report, now));
  } catch (e) {
    console.error("support_draft_failed", e instanceof Error ? e.message : e);
  }
  const tidy = answer
    ? tidySuggestion(answer.raw, { sameAs: (id) => UUID.test(id) && id !== report.id, delete: report.user_id !== null })
    : { reply: "", action: "none" as const, sameAs: null, why: "" };
  const { data: finished, error: finishError } = await caller.db.rpc("finish_support_draft", {
    p_draft: claim.draft.id,
    p_reply: tidy.reply,
    p_action: tidy.action,
    p_same_as: tidy.sameAs,
    p_why: tidy.why,
    p_input: answer?.inputTokens ?? 0,
    p_output: answer?.outputTokens ?? 0,
  });
  if (finishError) return { refusal: finishError };
  return { draft: draftOf(finished as unknown as DraftRow) };
}
