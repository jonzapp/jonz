import "server-only";

import {
  actionLine,
  houseKind,
  wordsFor,
  CHAT_RESETS_MAX,
  firstName,
  historyItems,
  monthOf,
  rulesOf,
  shiftMonth,
  weekWindow,
  type ChatReset,
  type ResetKind,
  type ResultChoice,
} from "@app/core";

import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller } from "./disputes";
import { resetHouse } from "./resets";
import { loadHouse } from "@/lib/engine/shared";

/**
 * Ask Jonz's resets (docs/specs/admin-resets.md, step 3). Claude is told what
 * the house's last two weeks hold and what in History can still be undone,
 * each by a short ref, and answers with the resets the admin asked for in
 * those refs. Here the refs become ids, and every reset is asked of the
 * database as the reset sheet asks it (resetHouse without `apply`), so the
 * card shows real numbers. A reset the database refuses isn't offered.
 * Nothing changes until the admin taps the card; starting the house over
 * isn't one of the things Claude can ask for.
 */

/** A reset as Claude asks for it: loose, because a model's refs can be anything. */
export interface RawReset {
  what: ResetKind | "undo";
  /** A John this week or last ("j3") for a result, or a History row ("h2") for an undo. */
  ref: string | null;
  /** First name, for one person's week. */
  person: string | null;
  outcome: ResultChoice | null;
  week: "this" | "last" | null;
  month: "this" | "last" | null;
}

interface StateJohn {
  id: string;
  name: string;
  userId: string;
  outcome: string | null;
}

/** What Claude is told, and what its refs stand for. */
export interface ResetState {
  /** The house now, in words, for the model. */
  text: string;
  johns: Map<string, StateJohn>;
  weeks: { this?: string; last?: string };
  months: { this: string; last: string };
  history: Map<string, { id: string; line: string; actor: string | null }>;
  people: { userId: string; name: string }[];
}

/** The most of History Claude is shown: the moves it's likeliest to be asked about. */
const HISTORY_SHOWN = 20;

function status(a: { done_at: string | null; outcome: string | null; flagged_at: string | null; excused: boolean }): string {
  if (a.outcome === "excused" || a.excused) return "let off";
  if (a.outcome) return a.outcome;
  if (a.flagged_at) return "flagged";
  return a.done_at ? "ticked" : "open";
}

/** The last two weeks' Johns and what can be undone, for an admin's chat. */
export async function resetState(caller: Caller, houseId: string, now: Date): Promise<ResetState> {
  const admin = createAdminClient();
  const { house, members } = await loadHouse(admin, houseId);
  const rules = rulesOf(house);
  const thisWeek = weekWindow(now, rules.timezone, rules.weekStarts);
  const lastWeek = weekWindow(new Date(thisWeek.startsAt.getTime() - 86_400_000), rules.timezone, rules.weekStarts);
  const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", members.map((m) => m.user_id));
  const people = (profiles ?? []).map((p) => ({ userId: p.id, name: p.display_name }));
  const nameOf = (id: string | null) => (id === caller.userId ? "me" : firstName(people.find((p) => p.userId === id)?.name ?? "someone"));

  const { data: weeks } = await admin
    .from("weeks")
    .select("id, starts_on, closed_at, skipped_at")
    .eq("house_id", houseId)
    .in("starts_on", [thisWeek.startsOn, lastWeek.startsOn]);
  const johns = new Map<string, StateJohn>();
  const lines: string[] = [];
  const ids: ResetState["weeks"] = {};
  for (const [which, window] of [["This", thisWeek], ["Last", lastWeek]] as const) {
    const week = weeks?.find((w) => w.starts_on === window.startsOn);
    if (!week) continue;
    ids[which === "This" ? "this" : "last"] = week.id;
    const { data: rows } = await admin
      .from("assignments")
      .select("id, name, user_id, done_at, outcome, flagged_at, excused")
      .eq("week_id", week.id)
      .order("due_at");
    const said = (rows ?? []).map((a) => {
      const ref = `j${johns.size + 1}`;
      johns.set(ref, { id: a.id, name: a.name, userId: a.user_id, outcome: a.outcome });
      return `${ref} ${a.name}, ${nameOf(a.user_id)}, ${status(a)}`;
    });
    const state = week.skipped_at ? " (skipped)" : week.closed_at ? " (closed)" : "";
    lines.push(`${which} week, from ${window.startsOn}${state}: ${said.join("; ") || "nothing dealt"}`);
  }

  const { data: rows } = await caller.db.rpc("house_history", { p_house: houseId, p_limit: HISTORY_SHOWN * 2 });
  const history = new Map<string, { id: string; line: string; actor: string | null }>();
  const undoable: string[] = [];
  for (const item of historyItems(rows ?? [])) {
    if (item.undoneAt || !item.reach || history.size >= HISTORY_SHOWN) continue;
    const ref = `h${history.size + 1}`;
    const who = item.actor === caller.userId ? "You" : nameOf(item.actor);
    const line = actionLine(item.kind, item.data, who, nameOf(item.subject), rules.currency, wordsFor("en", houseKind(house.kind)));
    history.set(ref, { id: item.id, line, actor: item.actor });
    undoable.push(`${ref} ${line} (${item.at.toISOString().slice(0, 10)})`);
  }
  lines.push(`Moves that can still be undone, newest first: ${undoable.join("; ") || "none"}`);

  const month = monthOf(now, rules.timezone);
  lines.push(`This month is ${month}; last month is ${shiftMonth(month, -1)}.`);
  return { text: lines.join("\n"), johns, weeks: ids, months: { this: month, last: shiftMonth(month, -1) }, history, people };
}

/** Claude's resets as the card offers them, each with the database's numbers. */
export async function offerResets(
  caller: Caller,
  houseId: string,
  raw: readonly RawReset[],
  state: ResetState,
  now: Date,
): Promise<ChatReset[]> {
  const offered: ChatReset[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, CHAT_RESETS_MAX)) {
    const key = JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);

    if (r.what === "undo") {
      const h = r.ref ? state.history.get(r.ref) : undefined;
      if (h) offered.push({ kind: "undo", action: h.id, line: h.line, actor: h.actor });
      continue;
    }

    const ask: Extract<ChatReset, { kind: "reset" }>["ask"] = { kind: r.what };
    const words: Extract<ChatReset, { kind: "reset" }>["words"] = {};
    if (r.what === "result") {
      const john = r.ref ? state.johns.get(r.ref) : undefined;
      if (!john || !r.outcome) continue;
      ask.assignment = john.id;
      ask.outcome = r.outcome;
      Object.assign(words, { person: nameIn(state, john.userId), john: john.name, outcome: r.outcome, was: john.outcome });
    } else if (r.what === "letoff") {
      ask.month = state.months[r.month ?? "last"];
      words.month = ask.month;
    } else {
      const week = state.weeks[r.week ?? "this"];
      if (!week) continue;
      ask.week = week;
      if (r.what === "person_week") {
        const person = state.people.find((p) => r.person && firstName(p.name).toLowerCase() === r.person.toLowerCase().trim());
        const who = r.person?.toLowerCase().trim() === "me" ? caller.userId : person?.userId;
        if (!who) continue;
        ask.user = who;
        words.person = nameIn(state, who);
      }
    }

    const answer = await resetHouse(caller, { houseId, apply: false, ...ask }, now);
    if (!("preview" in answer) || answer.preview.nothing) continue;
    offered.push({ kind: "reset", ask, preview: answer.preview, words });
  }
  return offered;
}

function nameIn(state: ResetState, userId: string): string {
  return state.people.find((p) => p.userId === userId)?.name ?? "Someone";
}
