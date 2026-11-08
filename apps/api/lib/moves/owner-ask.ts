import "server-only";

import {
  auditSearchFilter,
  DEFAULT_RULES,
  howItWorks,
  OWNER_ASK_COPY,
  OWNER_MOVES_MAX,
  OWNER_PERMISSION_NAMES,
  OwnerMove,
  ownerCan,
  promotionTitle,
  termsOf,
  type EditResult,
  type OwnerPermission,
  type OwnerRole,
  OWNER_ASK_TURNS_PER_DAY,
  tidyAsk,
  tidyReply,
  type ChatMessage,
  type OwnerAskResponse,
} from "@app/core";

import { canAsk, type AgentAnswer } from "@/lib/ai/agent";
import { askOwnerClaude, type OwnerReads, type OwnerWrites } from "@/lib/ai/owner-ask";
import type { Caller, Refusal } from "@/lib/moves/disputes";

// The owner's Ask Jonz (lib/ai/owner-ask.ts): one turn, as the owner's own
// session. Every read and the turn's own record go through that session, so
// the database's owner check (a second factor this session) holds for all of
// it, and nothing here uses the service role. Jonz's writes only put moves
// on the card (ownerWrites); the owner's tap does them, through the admin
// pages' own calls.

/** How many rows a read gives Claude: enough to answer from, few enough to read. */
const ROWS = 20;
/** How much of one house Claude reads: plenty for a question about it. */
const HOUSE_CHARS = 8000;
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
        .select("id, kind, title, body, link_label, link_url, starts_at, ends_at")
        .or(`ends_at.is.null,ends_at.gt.${now.toISOString()}`)
        .order("starts_at", { ascending: false })
        .limit(ROWS);
      if (error) throw fail("notices", error);
      return rows(
        "notices showing or starting later",
        data.map(
          (n) =>
            `- ${new Date(n.starts_at) > now ? `starts ${when(n.starts_at)}` : "showing now"}${n.ends_at ? `, ends ${when(n.ends_at)}` : ""}, ${n.kind}: “${n.title}” ${n.body}${n.link_label ? ` [${n.link_label} → ${n.link_url}]` : ""} [id ${n.id}]`,
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
    async house(id) {
      const { data, error } = await db.rpc("owner_house", { p_house: id.trim() });
      if (error) throw fail("house", error);
      if (data === null) return "No house has that id: find_houses gives it.";
      // The page's own read, whole; names and the rest are people's words.
      const whole = JSON.stringify(data);
      return `The house, as its admin page reads it: ${fromPeople(whole.length > HOUSE_CHARS ? `${whole.slice(0, HOUSE_CHARS)}…` : whole)}`;
    },
    async promotions(q) {
      const { data, error } = await db.rpc("owner_promotions_page", { p_q: q, p_limit: ROWS + 1 });
      if (error) throw fail("promotions", error);
      return rows(
        "promotions",
        data
          .slice(0, ROWS)
          .map(
            (p) =>
              `- ${p.code}, ${fromPeople(p.name)}: ${promotionTitle(termsOf(p))}, ${p.audience === "named" ? `for ${p.people} named people` : "for anyone with the code"}, used ${p.uses}${p.max_uses ? ` of ${p.max_uses}` : ""}, ${p.state}, made ${when(p.made_at)} [id ${p.id}]`,
          ),
        data.length > ROWS,
      );
    },
    howItWorks(topic, family) {
      return howItWorks(topic, { rules: { ...DEFAULT_RULES, timezone: OWNER_TZ, currency: "GBP" }, family, awayMakeup: 100 });
    },
  };
}

/** Whether a full id (or its start, eight letters on) is this row's. */
const isId = (given: string, id: string) => {
  const g = given.trim().toLowerCase();
  return g.length >= 8 && id.toLowerCase().startsWith(g);
};
const ONE_OF = (what: string, read: string) => ({ ok: false, said: `No ${what} has that id: ${read} gives it.` }) as EditResult;

/**
 * The moves Jonz can put on the owner's card, into `moves`. Each looks up
 * what it names as the owner first, as the admin page would show it, so the
 * card only offers what the page's own call will take; that call checks
 * again when the owner taps. A move the owner's role can't make isn't given
 * to Jonz (`may`), and is refused here too.
 */
export function ownerWrites(caller: Caller, role: OwnerRole, now: Date, moves: OwnerMove[]): OwnerWrites {
  const db = caller.db;
  const may = Object.fromEntries(OWNER_PERMISSION_NAMES.map((p) => [p, ownerCan(role, p)])) as Record<OwnerPermission, boolean>;
  const add = (move: unknown): EditResult => {
    const parsed = OwnerMove.safeParse(move);
    if (!parsed.success) return { ok: false, said: `That won't go on the card: ${parsed.error.issues.map((i) => `${i.path.join(".") || "it"} ${i.message}`).join("; ")}.` };
    const m = parsed.data;
    if (moves.length >= OWNER_MOVES_MAX) return { ok: false, said: `That's ${OWNER_MOVES_MAX} on the card already.` };
    if (moves.some((o) => JSON.stringify(o) === JSON.stringify(m))) return { ok: true, said: "Already on the card." };
    moves.push(m);
    return { ok: true, said: "On the card: it happens when the owner taps it." };
  };
  const report = async (id: string) => {
    const { data } = await db.rpc("owner_reports_page", { p_q: id.trim(), p_limit: 5 });
    const found = (data ?? []).filter((r) => isId(id, r.id));
    return found.length === 1 ? found[0] : null;
  };
  const notice = async (id: string) => {
    const { data } = await db.from("notices").select("id, title, ends_at").eq("id", id.trim()).maybeSingle();
    return data;
  };
  const promotion = async (id: string) => {
    const { data } = await db.rpc("owner_promotions_page", { p_q: id.trim(), p_limit: 5 });
    const found = (data ?? []).filter((p) => isId(id, p.id));
    return found.length === 1 ? found[0] : null;
  };
  const waiting = async (userId: string) => {
    const { data } = await db.rpc("owner_deletions_page", { p_q: userId.trim(), p_limit: 5 });
    const found = (data ?? []).filter((d) => isId(userId, d.user_id));
    return found.length === 1 ? found[0] : null;
  };
  const person = async (q: string) => {
    const { data } = await db.rpc("owner_people_find", { p_q: q.trim() });
    return data ?? [];
  };

  return {
    may,
    async replyToReport(id, body) {
      const r = await report(id);
      if (!r) return ONE_OF("report", "inbox");
      return add({ kind: "report_reply", reportId: r.id, who: r.name ?? "them", body });
    },
    async markFixed(id, note, tell) {
      const r = await report(id);
      if (!r) return ONE_OF("report", "inbox");
      if (r.state === "fixed") return { ok: false, said: "That report is fixed already." };
      return add({ kind: "report_fixed", reportId: r.id, who: r.name ?? "their", note, tell });
    },
    async reopenReport(id) {
      const r = await report(id);
      if (!r) return ONE_OF("report", "inbox");
      if (r.state !== "fixed") return { ok: false, said: "That report isn't fixed, so it's open already." };
      return add({ kind: "report_open", reportId: r.id, who: r.name ?? "their" });
    },
    async sameAs(id, mainId) {
      const r = await report(id);
      if (!r) return ONE_OF("report", "inbox");
      if (mainId === null) return add({ kind: "report_same_as", reportId: r.id, who: r.name ?? "their", mainId: null, main: null });
      const main = await report(mainId);
      if (!main) return ONE_OF("report to fold it into", "inbox");
      if (main.id === r.id) return { ok: false, said: "A report can't be the same as itself." };
      return add({ kind: "report_same_as", reportId: r.id, who: r.name ?? "their", mainId: main.id, main: `${main.name ?? "their"}’s report` });
    },
    async saveNotice(n) {
      let id: string | null = null;
      if (n.id) {
        const found = await notice(n.id);
        if (!found) return ONE_OF("notice", "notices");
        id = found.id;
      }
      if (n.endsAt && new Date(n.endsAt) <= (n.startsAt ? new Date(n.startsAt) : now)) return { ok: false, said: "It ends before it starts." };
      if ((n.linkLabel === null) !== (n.linkUrl === null)) return { ok: false, said: "A button needs both its words and where it goes, or neither." };
      return add({ kind: "notice_save", id, notice: n.kind, title: n.title, body: n.body, linkLabel: n.linkLabel, linkUrl: n.linkUrl, startsAt: n.startsAt, endsAt: n.endsAt });
    },
    async endNotice(id) {
      const found = await notice(id);
      if (!found) return ONE_OF("notice", "notices");
      if (found.ends_at && new Date(found.ends_at) <= now) return { ok: false, said: "That notice has ended already." };
      return add({ kind: "notice_end", id: found.id, title: found.title });
    },
    async sendMessage(m) {
      if (!m.push && !m.wall && !m.email) return { ok: false, said: "Pick at least one way: push, the Wall or email." };
      let to = "everyone";
      let personId: string | null = null;
      let houseId: string | null = null;
      if (m.audience === "person") {
        const found = m.personId ? (await person(m.personId)).filter((p) => isId(m.personId as string, p.id)) : [];
        if (found.length !== 1) return ONE_OF("person", "find_people");
        personId = found[0].id;
        to = found[0].name;
      } else if (m.audience === "house") {
        const { data } = m.houseId ? await db.rpc("owner_houses_find", { p_q: m.houseId.trim() }) : { data: [] };
        const found = (data ?? []).filter((h) => isId(m.houseId as string, h.id));
        if (found.length !== 1) return ONE_OF("house", "find_houses");
        houseId = found[0].id;
        to = found[0].name;
      }
      return add({ kind: "message_send", audience: m.audience, personId, houseId, to, subject: m.subject, body: m.body, push: m.push, wall: m.wall, email: m.email });
    },
    async makePromotion(p) {
      const code = p.code.trim().toUpperCase();
      const { data } = await db.rpc("owner_promotions_page", { p_q: code, p_limit: 5 });
      if ((data ?? []).some((o) => o.code === code)) return { ok: false, said: `${code} is taken: pick another code.` };
      return add({ kind: "promotion_make", promotion: { ...p, code } });
    },
    async promotionMove(kind, id) {
      const found = await promotion(id);
      if (!found) return ONE_OF("promotion", "promotions");
      if (kind === "promotion_stop" && (found.state === "stopped" || found.state === "ended")) return { ok: false, said: `${found.code} is ${found.state} already.` };
      if (kind === "promotion_email" && found.audience !== "named") return { ok: false, said: `${found.code} is for anyone with the code, so there's nobody named to email.` };
      if (kind === "promotion_retry" && found.state !== "making") return { ok: false, said: `${found.code} is set up in Stripe already.` };
      return add({ kind, id: found.id, code: found.code });
    },
    async deletionMove(kind, userId, reason) {
      const found = await waiting(userId);
      if (!found) return { ok: false, said: "No account waiting to be deleted has that id: deletions gives it." };
      return add({ kind, userId: found.user_id, who: found.name ?? found.email, reason });
    },
    async startDeletion(email, reason) {
      const e = email.trim().toLowerCase();
      if (!(await person(e)).some((p) => p.email.toLowerCase() === e)) return { ok: false, said: "Nobody has that email: find_people looks them up." };
      return add({ kind: "deletion_start", email: e, reason });
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
  ask: (messages: readonly ChatMessage[], today: string, reads: OwnerReads, writes: OwnerWrites) => Promise<AgentAnswer> = askOwnerClaude,
): Promise<{ refusal: Refusal } | OwnerAskResponse> {
  const { data: status } = await caller.db.rpc("owner_status");
  const { owner, mfa } = (status ?? {}) as { owner?: boolean; mfa?: boolean };
  if (!owner || !mfa) return { refusal: { code: "42501", message: "owner_only" } };
  // Every owner is a full owner today (OWNER_ROLE_PERMISSIONS); the role is what decides Jonz's tools.
  const role: OwnerRole = "owner";

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
  const moves: OwnerMove[] = [];
  let answer: AgentAnswer;
  try {
    answer = await ask(messages, today, ownerReads(caller, now), ownerWrites(caller, role, now, moves));
  } catch (e) {
    console.error("owner_ask_failed", e instanceof Error ? e.message : e);
    return offline;
  }
  const reply = tidyReply(answer.raw.reply);
  await caller.db.rpc("finish_owner_ask", { p_turn: turn, p_reply: reply, p_input: answer.inputTokens, p_output: answer.outputTokens });
  if (!reply && moves.length === 0) return offline;
  return { reply, ask: tidyAsk(answer.raw.ask), ...(moves.length > 0 ? { moves } : {}), source: "ai" };
}
