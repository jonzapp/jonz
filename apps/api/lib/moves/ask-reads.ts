import "server-only";

import {
  actionLine,
  addDaysTo,
  DOW_LABEL,
  firstName,
  formatMoney,
  historyItems,
  localDate,
  weekWindow,
  type HouseRules,
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
}

type House = { name: string; kind: string };

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
        .select("name, user_id, due_at, done_at, outcome, flagged_at, excused, awaits_ok, covered_by, points, group_name")
        .eq("week_id", week.id)
        .order("due_at");
      const { data: onCall } = await caller.db.from("on_call").select("user_id, johns(name)").eq("week_id", week.id);
      const state = week.skipped_at ? " (skipped: it counts for nothing)" : week.closed_at ? " (closed)" : "";
      const lines = (rows ?? []).map(
        (a) =>
          `${a.name}: ${nameOf(a.user_id)}${a.covered_by ? `, covered by ${nameOf(a.covered_by)}` : ""}, due ${when(a.due_at)}, ${a.points} pts, ${status(a)}`,
      );
      for (const o of onCall ?? []) lines.push(`${(o.johns as { name: string } | null)?.name ?? "An on-call John"}: ${nameOf(o.user_id)} is on call`);
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
        return `${nameOf(m.user_id)}${m.user_id === caller.userId ? "" : ` (${ctx.people.find((p) => p.userId === m.user_id)?.name ?? ""})`}: ${role}, joined ${m.joined_at.slice(0, 10)}${extra.length ? `, ${extra.join(", ")}` : ""}`;
      });
      const { data: groups } = await caller.db.from("groups").select("name, group_members(user_id)").eq("house_id", houseId).order("name");
      for (const g of groups ?? []) lines.push(`Group ${g.name}: ${(g.group_members ?? []).map((m) => nameOf(m.user_id)).join(", ")}`);
      return lines.join("\n") || "Nobody.";
    },

    async timeAway() {
      const { data } = await caller.db
        .from("away")
        .select("user_id, starts_on, ends_on, note")
        .eq("house_id", houseId)
        .gte("ends_on", addDaysTo(today, -30))
        .order("starts_on");
      const lines = (data ?? []).map((a) => `${nameOf(a.user_id)}: ${a.starts_on} to ${a.ends_on}${a.note ? ` (${a.note})` : ""}${a.starts_on <= today && a.ends_on >= today ? ", away now" : ""}`);
      return [`Today is ${today}.`, ...(lines.length ? lines : ["Nobody has time away booked."])].join("\n");
    },

    async history() {
      const { data: rows } = await caller.db.rpc("house_history", { p_house: houseId, p_limit: 40 });
      const lines = historyItems(rows ?? []).map((item) => {
        const who = item.actor === caller.userId ? "You" : nameOf(item.actor);
        return `${when(item.at.toISOString())}: ${actionLine(item.kind, item.data, who, nameOf(item.subject), ctx.rules.currency)}${item.undoneAt ? " (undone)" : ""}`;
      });
      return lines.join("\n") || "Nothing in History yet.";
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
      const money = (minor: number) => formatMoney(minor, r.currency);
      return [
        `House: ${ctx.house.name} (${ctx.house.kind === "family" ? "a family" : "housemates"}), time zone ${r.timezone}.`,
        `The week starts on ${DOW_LABEL[r.weekStarts]}.`,
        `Stake each month: ${money(r.stakeMinor)}; a late John costs ${money(r.lateForfeitMinor)}, a missed one ${money(r.missedForfeitMinor)}.`,
        `A tick can be questioned for ${r.disputeHours} hours. A John is late after its due time and missed ${r.lateHours} hours after; others may cover it ${r.coverGraceHours} hours after it's due.`,
        `The deal is ${r.dealMode}${r.dealBudget ? `, about ${r.dealBudget} pts a person a week` : ", with no weekly limit"}.`,
      ].join("\n");
    },
  };
}
