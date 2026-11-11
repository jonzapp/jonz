import "server-only";

import {
  askRef,
  actionLine,
  houseKind,
  wordsFor,
  addDaysTo,
  buildStake,
  buildWeekBoard,
  howItWorks,
  jobPlaces,
  johnWhy,
  monthOf,
  DOW_LABEL,
  firstName,
  formatMoney,
  historyItems,
  localDate,
  weekWindow,
  type HouseRules,
  type HowTopic,
  type LedgerRow,
} from "@app/core";

import type { Caller } from "./disputes";

/**
 * Ask Jonz's reads (Ask Jonz step 2): what Claude may look at in the house,
 * whenever it wants, without asking. Every read goes through the caller's
 * own session, so the database's row rules decide what it sees: exactly what
 * the person could open in the app, nothing more. Each answers in short
 * plain lines, with first names ("me" for the person asking) and the
 * house's local times, because that's what Claude reads best.
 */
export interface HouseReads {
  week(which: "this" | "last" | "next"): Promise<string>;
  people(): Promise<string>;
  timeAway(): Promise<string>;
  history(): Promise<string>;
  balances(): Promise<string>;
  rules(): Promise<string>;
  /** The Stake: this month's forfeits so far and what they'd come to, and what's owed from closed months. */
  stake(): Promise<string>;
  /** Why the deal gave a John (this week or last, by name) to whom it did, and how it added up. */
  whyJohn(name: string, who: string | null): Promise<string>;
  /** How part of the app works, with this house's numbers (core how-it-works.ts). */
  howItWorks(topic: HowTopic): string;
  /** The Wall's latest posts, with refs and who reacted how. */
  wall(): Promise<string>;
  /** Questioned ticks still open, with refs and the votes so far. */
  disputes(): Promise<string>;
  /** Swap asks still waiting for an answer, with refs. */
  swaps(): Promise<string>;
}

/** PostgREST's most rows a read (max_rows); the ledger is read in pages of it. */
const LEDGER_PAGE = 1000;

type House = { name: string; kind: string; awayMakeup: number };

export interface ReadsContext {
  house: House;
  rules: HouseRules;
  /** Everyone in the house, the person asking first. */
  people: { userId: string; name: string; role: string }[];
  now: Date;
}

function status(a: { done_at: string | null; outcome: string | null; flagged_at: string | null; excused: boolean; awaits_ok: boolean | null }): string {
  if (a.outcome === "excused" || a.excused) return "let off";
  if (a.outcome) return a.outcome;
  if (a.awaits_ok) return "ticked, waiting for a parent's OK";
  if (a.flagged_at) return "flagged";
  return a.done_at ? "ticked, being checked" : "open";
}

export function houseReads(caller: Caller, houseId: string, ctx: ReadsContext): HouseReads {
  const zone = ctx.rules.timezone;
  const nameOf = (id: string | null) =>
    id === caller.userId ? "me" : firstName(ctx.people.find((p) => p.userId === id)?.name ?? "someone who left");
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const today = localDate(ctx.now, zone);

  return {
    async week(which) {
      const thisWeek = weekWindow(ctx.now, zone, ctx.rules.weekStarts);
      const shift = which === "this" ? 0 : which === "last" ? -7 : 7;
      const startsOn = addDaysTo(thisWeek.startsOn, shift);
      const { data: week } = await caller.db
        .from("weeks")
        .select("id, starts_on, closed_at, skipped_at")
        .eq("house_id", houseId)
        .eq("starts_on", startsOn)
        .maybeSingle();
      if (!week) return `The week from ${startsOn} hasn't been dealt${which === "next" ? " yet: it's dealt when it starts" : ""}.`;
      const { data: rows } = await caller.db
        .from("assignments")
        .select("id, name, user_id, due_at, done_at, outcome, flagged_at, excused, awaits_ok, covered_by, points, group_name")
        .eq("week_id", week.id)
        .order("due_at");
      const { data: onCall } = await caller.db.from("on_call_picks").select("user_id, john_id, johns(name)").eq("week_id", week.id);
      const state = week.skipped_at ? " (skipped: it counts for nothing)" : week.closed_at ? " (closed)" : "";
      const lines = (rows ?? []).map(
        (a) =>
          `${a.name}: ${nameOf(a.user_id)}${a.covered_by ? `, covered by ${nameOf(a.covered_by)}` : ""}, due ${when(a.due_at)}, ${a.points} pts, ${status(a)}, ref ${askRef(a.id)}`,
      );
      for (const o of onCall ?? []) lines.push(`${(o.johns as { name: string } | null)?.name ?? "An on-call John"}: ${nameOf(o.user_id)} is on call (John ref ${askRef(o.john_id)}, to flag it)`);
      return [`Week from ${startsOn}${state}:`, ...(lines.length ? lines : ["Nothing dealt to anyone."])].join("\n");
    },

    async people() {
      const { data: members } = await caller.db
        .from("members")
        .select("user_id, role, joined_at, moving_out_on, signs_in, born_year, streak")
        .eq("house_id", houseId)
        .order("joined_at");
      const family = ctx.house.kind === "family";
      const lines = (members ?? []).map((m) => {
        const role = family ? (m.role === "admin" ? "parent" : "kid") : m.role;
        const extra = [
          m.moving_out_on ? `moving out ${m.moving_out_on}` : null,
          m.signs_in === false ? "no sign-in of their own (a parent runs it)" : null,
          m.born_year ? `born ${m.born_year}` : null,
          m.streak ? `streak ${m.streak}` : null,
        ].filter(Boolean);
        return `${nameOf(m.user_id)}${m.user_id === caller.userId ? "" : ` (${ctx.people.find((p) => p.userId === m.user_id)?.name ?? ""})`}: ${role}, joined ${m.joined_at.slice(0, 10)}${extra.length ? `, ${extra.join(", ")}` : ""}, ref ${askRef(m.user_id)}`;
      });
      const { data: groups } = await caller.db.from("groups").select("id, name, group_members(user_id)").eq("house_id", houseId).order("name");
      for (const g of groups ?? []) lines.push(`Group ${g.name} (ref ${askRef(g.id)}): ${(g.group_members ?? []).map((m) => nameOf(m.user_id)).join(", ")}`);
      return lines.join("\n") || "Nobody.";
    },

    async timeAway() {
      const { data } = await caller.db
        .from("away_periods")
        .select("id, user_id, starts_on, ends_on, note")
        .eq("house_id", houseId)
        .gte("ends_on", addDaysTo(today, -30))
        .order("starts_on");
      // The person's own, from today on, carry a ref for cancel_away.
      const ref = (a: { id: string; user_id: string; ends_on: string }) => (a.user_id === caller.userId && a.ends_on >= today ? `, ref ${a.id.slice(0, 8)}` : "");
      const lines = (data ?? []).map((a) => `${nameOf(a.user_id)}: ${a.starts_on} to ${a.ends_on}${a.note ? ` (${a.note})` : ""}${a.starts_on <= today && a.ends_on >= today ? ", away now" : ""}${ref(a)}`);
      return [`Today is ${today}.`, ...(lines.length ? lines : ["Nobody has time away booked."])].join("\n");
    },

    async history() {
      const { data: rows } = await caller.db.rpc("house_history", { p_house: houseId, p_limit: 40 });
      const lines = historyItems(rows ?? []).map((item) => {
        const who = item.actor === caller.userId ? "You" : nameOf(item.actor);
        return `${when(item.at.toISOString())}: ${actionLine(item.kind, item.data, who, nameOf(item.subject), ctx.rules.currency, wordsFor("en", houseKind(ctx.house.kind)))}${item.undoneAt ? " (undone)" : ""}, ref ${askRef(item.id)}`;
      });
      return lines.join("\n") || "Nothing in History yet.";
    },

    async wall() {
      const { data } = await caller.db
        .from("events")
        .select("id, kind, user_id, created_at, assignments(name), reactions(user_id, kind)")
        .eq("house_id", houseId)
        .order("created_at", { ascending: false })
        .limit(20);
      const lines = (data ?? []).map((e) => {
        const john = (e.assignments as { name: string } | null)?.name;
        const reacted = (e.reactions ?? []).map((r) => `${nameOf(r.user_id)} ${r.kind}`);
        return `${when(e.created_at)}: ${e.user_id ? `${nameOf(e.user_id)}, ` : ""}${e.kind.replaceAll("_", " ")}${john ? ` (${john})` : ""}${reacted.length ? `; reactions: ${reacted.join(", ")}` : ""}, ref ${askRef(e.id)}`;
      });
      return lines.join("\n") || "Nothing on the Wall yet.";
    },

    async disputes() {
      const { data } = await caller.db
        .from("disputes")
        .select("id, reason, raised_by, closes_at, assignments(name, user_id), dispute_votes(user_id, uphold)")
        .eq("house_id", houseId)
        .is("resolved_at", null)
        .order("closes_at");
      const lines = (data ?? []).map((d) => {
        const a = d.assignments as { name: string; user_id: string } | null;
        const votes = (d.dispute_votes ?? []).map((v) => `${nameOf(v.user_id)} ${v.uphold ? "upholds the question" : "backs the tick"}`);
        return `${a?.name ?? "A John"} ticked by ${nameOf(a?.user_id ?? null)}, questioned by ${nameOf(d.raised_by)}: ${d.reason}. Votes close ${when(d.closes_at)}${votes.length ? `; ${votes.join(", ")}` : "; no votes yet"}, ref ${askRef(d.id)}`;
      });
      return lines.join("\n") || "No questioned ticks open.";
    },

    async swaps() {
      const { data } = await caller.db
        .from("swap_offers")
        .select("id, asked_by, asked_user_id, expires_at, asker:assignments!swap_offers_asker_assignment_id_house_id_fkey(name), asked:assignments!swap_offers_asked_assignment_id_house_id_fkey(name)")
        .eq("house_id", houseId)
        .is("answer", null)
        .order("expires_at");
      const lines = (data ?? []).map((o) => {
        const mine = (o.asker as { name: string } | null)?.name ?? "a John";
        const theirs = (o.asked as { name: string } | null)?.name ?? "a John";
        return `${nameOf(o.asked_by)} asks ${nameOf(o.asked_user_id)} to swap ${mine} for ${theirs}, until ${when(o.expires_at)}, ref ${askRef(o.id)}`;
      });
      return lines.join("\n") || "No swap asks waiting.";
    },

    async balances() {
      const { data } = await caller.db.rpc("house_balances", { p_house: houseId, p_before: addDaysTo(today, 1) });
      const lines = (data ?? []).map((b) => {
        const behind = Number(b.owed) - Number(b.credited);
        return `${nameOf(b.user_id)}: given ${Math.round(Number(b.owed))} pts, done ${Math.round(Number(b.credited))} pts, ${behind > 0.5 ? `${Math.round(behind)} behind` : behind < -0.5 ? `${Math.round(-behind)} ahead` : "even"}`;
      });
      return ["Fair shares since each person joined (points they were given vs points of work they did):", ...lines].join("\n");
    },

    async rules() {
      const r = ctx.rules;
      const money = (minor: number) => formatMoney(minor, r.currency, wordsFor("en", houseKind(ctx.house.kind)));
      return [
        `House: ${ctx.house.name} (${ctx.house.kind === "family" ? "a family" : "housemates"}), time zone ${r.timezone}.`,
        `The week starts on ${DOW_LABEL[r.weekStarts]}.`,
        `Stake each month: ${money(r.stakeMinor)}; a late John costs ${money(r.lateForfeitMinor)}, a missed one ${money(r.missedForfeitMinor)}.`,
        `A tick can be questioned for ${r.disputeHours} hours. A John is late after its due time and missed ${r.lateHours} hours after; others may cover it ${r.coverGraceHours} hours after it's due.`,
        `The deal is ${r.dealMode}${r.dealBudget ? `, about ${r.dealBudget} pts a person a week` : ", with no weekly limit"}.`,
      ].join("\n");
    },

    async stake() {
      const r = ctx.rules;
      if (r.stakeMinor <= 0) return "This house has no Stake: nothing costs money.";
      const money = (minor: number) => formatMoney(minor, r.currency, wordsFor("en", houseKind(ctx.house.kind)));
      const month = monthOf(ctx.now, zone);
      // The whole ledger, a page at a time below the last id read, as the Stake page reads it: every balance is a sum of all of it.
      type Entry = LedgerRow & { assignments: { name: string; outcome: string | null; due_at: string } | null };
      const rows: Entry[] = [];
      for (let below: number | null = null; ; ) {
        const query = caller.db
          .from("ledger_entries")
          .select("id, user_id, kind, amount_minor, month, counterparty_user_id, doers, created_at, assignments(name, outcome, due_at)")
          .eq("house_id", houseId);
        const { data } = await (below === null ? query : query.lt("id", below)).order("id", { ascending: false }).limit(LEDGER_PAGE);
        const got = (data ?? []) as Entry[];
        rows.push(...got);
        if (got.length < LEDGER_PAGE) break;
        below = got[got.length - 1].id;
      }
      const closes = await caller.db.from("month_closes").select("month").eq("house_id", houseId);
      const view = buildStake({
        ledger: rows,
        closedMonths: (closes.data ?? []).map((c) => c.month),
        memberIds: ctx.people.map((p) => p.userId),
        stakeMinor: r.stakeMinor,
        month,
      });
      const forfeits = rows
        .filter((row) => row.month === month && row.kind === "forfeit")
        .map((row) => {
          const john = row.assignments;
          const to = row.counterparty_user_id ? `, goes to ${nameOf(row.counterparty_user_id)} who covered it` : "";
          return `- ${nameOf(row.user_id)}: ${money(-row.amount_minor)} for ${john?.name ?? "a John"} (${john?.outcome ?? "forfeit"}, due ${john ? when(john.due_at) : "?"})${to}`;
        });
      const projection = view.projection
        .filter((p) => p.forfeitedRaw || p.received || p.net)
        .map(
          (p) =>
            `- ${nameOf(p.userId)}: forfeited ${money(p.forfeitedRaw)}${p.forfeited < p.forfeitedRaw ? ` (capped at ${money(p.forfeited)})` : ""}, gets ${money(p.received)} of others', net ${p.net >= 0 ? "+" : "−"}${money(Math.abs(p.net))}`,
        );
      const owed = [...view.outstanding].filter(([, v]) => v !== 0).map(([id, v]) => `- ${nameOf(id)}: ${v < 0 ? "owes" : "is owed"} ${money(Math.abs(v))}`);
      const pay = view.transfers.map((t) => `- ${nameOf(t.from)} pays ${nameOf(t.to)} ${money(t.amount)}`);
      return [
        `Stake ${money(r.stakeMinor)} a month each; late ${money(r.lateForfeitMinor)}, missed ${money(r.missedForfeitMinor)}.`,
        `This month (${month}) so far, shared out when it ends:`,
        ...(forfeits.length ? forfeits : ["- No forfeits yet."]),
        ...(projection.length ? ["If the month ended now:", ...projection] : []),
        "Owed from closed months, after payments:",
        ...(owed.length ? owed : ["- Nothing: everyone is settled."]),
        ...(pay.length ? ["Fewest payments to settle:", ...pay] : []),
      ].join("\n");
    },

    async whyJohn(name, who) {
      const thisWeek = weekWindow(ctx.now, zone, ctx.rules.weekStarts);
      const wanted = name.trim().toLowerCase();
      const whoId =
        who === null ? null : who === "me" ? caller.userId : (ctx.people.find((p) => firstName(p.name).toLowerCase() === who.toLowerCase())?.userId ?? null);
      for (const startsOn of [thisWeek.startsOn, addDaysTo(thisWeek.startsOn, -7)]) {
        const { data: week } = await caller.db.from("weeks").select("id, starts_on, starts_at, ends_at").eq("house_id", houseId).eq("starts_on", startsOn).maybeSingle();
        if (!week) continue;
        const { data: rows } = await caller.db
          .from("assignments")
          .select("*, johns(every_weeks, every_months), crew:crew_members(user_id, helper, points)")
          .eq("week_id", week.id)
          .order("due_at");
        const board = buildWeekBoard({
          week,
          assignments: rows ?? [],
          disputes: [],
          memberIds: ctx.people.map((p) => p.userId),
          userId: caller.userId,
          everDealt: true,
          disputeHours: ctx.rules.disputeHours,
          now: ctx.now,
        });
        const named = board.items.filter((i) => i.name.toLowerCase().includes(wanted));
        const item =
          named.find((i) => whoId !== null && i.userId === whoId) ?? (whoId === null ? (named.find((i) => i.userId === caller.userId) ?? named[0]) : undefined);
        if (!item) continue;
        const why = johnWhy(item, ctx.people, caller.userId, ctx.rules, ctx.now, wordsFor("en", houseKind(ctx.house.kind)), jobPlaces(item, board.items));
        return [
          `${item.name}, week from ${startsOn}, dealt to ${nameOf(item.userId)}:`,
          why.answer,
          ...(why.rows.length
            ? [
                "How it added up (standing against their share, furthest behind first):",
                ...why.rows.map((w) => `- ${w.name}: ${w.value}${w.meta ? ` (${w.meta})` : ""}${w.chosen ? ", dealt it" : ""}`),
                why.key,
              ]
            : []),
          why.stakes ?? "",
        ]
          .filter(Boolean)
          .join("\n");
      }
      return `No John called “${name}”${who ? ` for ${who}` : ""} this week or last. The week read lists what was dealt.`;
    },

    howItWorks(topic) {
      return howItWorks(topic, { rules: ctx.rules, family: ctx.house.kind === "family", awayMakeup: ctx.house.awayMakeup }, wordsFor("en", houseKind(ctx.house.kind)));
    },
  };
}
