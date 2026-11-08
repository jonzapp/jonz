import "server-only";

import {
  auditSearchFilter,
  DEFAULT_RULES,
  howItWorks,
  OWNER_ASK_COPY,
  OWNER_ASK_TURNS_PER_DAY,
  tidyAsk,
  tidyReply,
  type ChatMessage,
  type OwnerAskResponse,
} from "@app/core";

import { canAsk, type AgentAnswer } from "@/lib/ai/agent";
import { askOwnerClaude, type OwnerReads } from "@/lib/ai/owner-ask";
import type { Caller, Refusal } from "@/lib/moves/disputes";

// The owner's Ask Jonz (lib/ai/owner-ask.ts): one turn, as the owner's own
// session. Every read and the turn's own record go through that session, so
// the database's owner check (a second factor this session) holds for all of
// it, and nothing here uses the service role.

/** How many rows a read gives Claude: enough to answer from, few enough to read. */
const ROWS = 20;
/** The owner's timezone, for "today" and the times Claude reads. */
const OWNER_TZ = "Europe/London";

/** People's own words, marked so Claude reads them as what was said, never as instructions. */
const fromPeople = (text: string | null | undefined) => `<from_people>${(text ?? "").replaceAll("<", "‹")}</from_people>`;
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: OWNER_TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const rows = (what: string, lines: string[], more: boolean) =>
  lines.length === 0 ? `No ${what}.` : [`${lines.length}${more ? "+" : ""} ${what}:`, ...lines].join("\n");

/** The admin pages' reads, as the owner's session. A refusal throws, so a turn without the owner's code goes no further. */
export function ownerReads(caller: Caller, now: Date): OwnerReads {
  const db = caller.db;
  const fail = (what: string, error: { message: string }) => new Error(`${what}: ${error.message}`);
  return {
    async inbox(q, state, kind) {
      const { data, error } = await db.rpc("owner_reports_page", { p_q: q, p_state: state ?? undefined, p_kind: kind ?? undefined, p_limit: ROWS + 1 });
      if (error) throw fail("inbox", error);
      return rows(
        "reports",
        data.slice(0, ROWS).map((r) => `- ${when(r.created_at)}, ${r.kind}, ${r.state}: ${fromPeople(r.name)} (${r.house_name ?? "no house"}) wrote ${fromPeople(r.words)} [id ${r.id}, account ${r.user_id}]`),
        data.length > ROWS,
      );
    },
    async deletions(q) {
      const { data, error } = await db.rpc("owner_deletions_page", { p_q: q, p_limit: ROWS + 1 });
      if (error) throw fail("deletions", error);
      return rows(
        "accounts waiting to be deleted",
        data.slice(0, ROWS).map((d) => `- ${fromPeople(d.name)} (${d.house_name ?? "no house"}), asked by ${d.requested_by} on ${when(d.requested_at)}, goes ${when(d.deletes_at)} [account ${d.user_id}]`),
        data.length > ROWS,
      );
    },
    async audit(q, after, before) {
      let query = db.from("admin_audit").select("id, at:created_at, actor, action, target_kind, target_id, reason");
      const search = auditSearchFilter(q);
      if (search) query = query.or(search);
      if (after) query = query.gt("created_at", after);
      if (before) query = query.lte("created_at", before);
      const { data, error } = await query.order("id", { ascending: false }).limit(ROWS + 1);
      if (error) throw fail("audit", error);
      const who = (actor: string | null) => (actor === null ? "Jonz itself" : actor === caller.userId ? "you" : `someone else (${actor})`);
      return rows(
        "entries",
        data
          .slice(0, ROWS)
          .map((e) => `- ${when(e.at)}, ${who(e.actor)}: ${e.action} on ${e.target_kind} ${e.target_id}${e.reason ? `, reason ${fromPeople(e.reason)}` : ""} [id ${e.id}]`),
        data.length > ROWS,
      );
    },
    async notices() {
      const { data, error } = await db
        .from("notices")
        .select("kind, title, body, link_label, link_url, starts_at, ends_at")
        .or(`ends_at.is.null,ends_at.gt.${now.toISOString()}`)
        .order("starts_at", { ascending: false })
        .limit(ROWS);
      if (error) throw fail("notices", error);
      return rows(
        "notices showing or starting later",
        data.map(
          (n) =>
            `- ${new Date(n.starts_at) > now ? `starts ${when(n.starts_at)}` : "showing now"}${n.ends_at ? `, ends ${when(n.ends_at)}` : ""}, ${n.kind}: “${n.title}” ${n.body}${n.link_label ? ` [${n.link_label} → ${n.link_url}]` : ""}`,
        ),
        false,
      );
    },
    async messages(q) {
      const { data, error } = await db.rpc("owner_messages_page", { p_q: q, p_limit: ROWS + 1 });
      if (error) throw fail("messages", error);
      return rows(
        "messages sent",
        data
          .slice(0, ROWS)
          .map(
            (m) =>
              `- ${when(m.sent_at)} to ${m.audience === "everyone" ? "everyone" : fromPeople(m.to_name)} (${m.people} people${m.waiting > 0 ? `, ${m.waiting} still going` : ""}): “${m.subject}” by ${[m.by_push && "push", m.by_wall && "Wall", m.by_email && "email"].filter(Boolean).join(", ")}`,
          ),
        data.length > ROWS,
      );
    },
    async people(q) {
      const { data, error } = await db.rpc("owner_people_find", { p_q: q });
      if (error) throw fail("people", error);
      return rows("people", data.map((p) => `- ${fromPeople(p.name)}, ${p.email}, ${p.house_name ? `in ${fromPeople(p.house_name)}` : "in no house"} [id ${p.id}]`), false);
    },
    async houses(q) {
      const { data, error } = await db.rpc("owner_houses_find", { p_q: q });
      if (error) throw fail("houses", error);
      return rows("houses", data.map((h) => `- ${fromPeople(h.name)}, ${h.people} living there [id ${h.id}]`), false);
    },
    howItWorks(topic, family) {
      return howItWorks(topic, { rules: { ...DEFAULT_RULES, timezone: OWNER_TZ, currency: "GBP" }, family, awayMakeup: 100 });
    },
  };
}

/**
 * One turn of the owner's Ask Jonz. Refused (42501 owner_only) unless the
 * caller is the owner with their code this session; P0001 ask_limit after
 * OWNER_ASK_TURNS_PER_DAY in a day. Without Claude, it says so.
 *
 * `ask` is Claude, unless a test stands in for it.
 */
export async function ownerTurn(
  caller: Caller,
  messages: readonly ChatMessage[],
  now: Date,
  ask: (messages: readonly ChatMessage[], today: string, reads: OwnerReads) => Promise<AgentAnswer> = askOwnerClaude,
): Promise<{ refusal: Refusal } | OwnerAskResponse> {
  const { data: status } = await caller.db.rpc("owner_status");
  const { owner, mfa } = (status ?? {}) as { owner?: boolean; mfa?: boolean };
  if (!owner || !mfa) return { refusal: { code: "42501", message: "owner_only" } };

  const offline: OwnerAskResponse = { reply: OWNER_ASK_COPY.offline, ask: null, source: "offline" };
  if (!canAsk() && ask === askOwnerClaude) return offline;

  const question = messages.at(-1)?.text ?? "";
  const { data: turn, error: limit } = await caller.db.rpc("claim_owner_ask", { p_question: question, p_limit: OWNER_ASK_TURNS_PER_DAY });
  if (limit) {
    if (limit.message === "ask_limit") return { refusal: { code: "P0001", message: "ask_limit" } };
    if (limit.code === "42501") return { refusal: { code: "42501", message: "owner_only" } };
    throw new Error(`Couldn't count the day's questions: ${limit.message}`);
  }

  const today = new Intl.DateTimeFormat("en-GB", { timeZone: OWNER_TZ, dateStyle: "full", timeStyle: "short" }).format(now);
  let answer: AgentAnswer;
  try {
    answer = await ask(messages, today, ownerReads(caller, now));
  } catch (e) {
    console.error("owner_ask_failed", e instanceof Error ? e.message : e);
    return offline;
  }
  const reply = tidyReply(answer.raw.reply);
  await caller.db.rpc("finish_owner_ask", { p_turn: turn, p_reply: reply, p_input: answer.inputTokens, p_output: answer.outputTokens });
  if (!reply) return offline;
  return { reply, ask: tidyAsk(answer.raw.ask), source: "ai" };
}
