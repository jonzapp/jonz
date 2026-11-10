import { z } from "zod";

import type { Currency } from "./domain";
import { firstName, monthLabel, weekRange } from "./format";
import { formatMoney } from "./money";
import { signedPoints } from "./record";
import { whomOf, whoseOf } from "./word-keys";
import type { Words } from "./words-for";

// Resets: an admin fixing a week that went wrong. The database works out
// what each would change (admin_reset, 20261101100000_admin_resets.sql) and
// this says it, the same way on the reset sheet and in Ask Jonz.

export const RESET_KINDS = ["result", "person_week", "week", "redeal", "skip", "letoff"] as const;
export type ResetKind = (typeof RESET_KINDS)[number];

/** What "Fix the result" can make a John. */
export const RESULT_CHOICES = ["done", "late", "missed", "excused"] as const;
export type ResultChoice = (typeof RESULT_CHOICES)[number];

/** POST /api/resets: what to reset, and whether to do it or only say what it would do. */
export const ResetRequest = z.object({
  houseId: z.uuid(),
  kind: z.enum(RESET_KINDS),
  week: z.uuid().optional(),
  user: z.uuid().optional(),
  assignment: z.uuid().optional(),
  outcome: z.enum(RESULT_CHOICES).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  apply: z.boolean().default(false),
});
export type ResetRequest = z.infer<typeof ResetRequest>;

const Tally = z.object({
  ticks: z.number().optional(),
  points: z.number().optional(),
  forfeit: z.number().optional(),
});

/** What a reset would change: admin_reset's answer without p_apply. */
export const ResetPreview = z.object({
  kind: z.enum(RESET_KINDS),
  week: z.object({ id: z.string(), starts_on: z.string(), starts_at: z.string(), ends_at: z.string() }).nullable(),
  month: z.string().nullable(),
  /** Each person's change: ticks cleared, balance points, forfeit back (+) or now owed (−), in minor units. */
  people: z.record(z.string(), Tally),
  /** Who hears about it: everyone touched but the admin. */
  told: z.array(z.string()),
  reopened: z.number(),
  past_due: z.number(),
  flags: z.number(),
  disputes: z.number(),
  /** Some of the money is in a month already shared out: it goes in as a correction. */
  correction: z.boolean(),
  nothing: z.boolean(),
});
export type ResetPreview = z.infer<typeof ResetPreview>;

export const ResetResponse = z.object({
  preview: ResetPreview.optional(),
  /** The house_actions row, for Undo. */
  action: z.string().optional(),
});
export type ResetResponse = z.infer<typeof ResetResponse>;

/** What Ask Jonz offers an admin to reset, worked out by the server: a reset with its numbers, or an undo from History. */
export const ChatReset = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reset"),
    ask: ResetRequest.omit({ houseId: true, apply: true }),
    preview: ResetPreview,
    words: z.object({
      person: z.string().optional(),
      john: z.string().optional(),
      outcome: z.enum(RESULT_CHOICES).optional(),
      was: z.string().nullable().optional(),
      month: z.string().optional(),
    }),
  }),
  z.object({
    kind: z.literal("undo"),
    /** The History row. */
    action: z.string(),
    /** What it was, in History's words: "Sam ticked Bathroom clean". */
    line: z.string(),
    /** Whose move it was, to say who is told. */
    actor: z.string().nullable(),
  }),
]);
export type ChatReset = z.infer<typeof ChatReset>;

/** The most resets one answer offers. */
export const CHAT_RESETS_MAX = 6;

export interface ResetLine {
  key: "ticks" | "balances" | "stake" | "track" | "cleared";
  label: string;
  value: string;
}

export interface ResetSheet {
  title: string;
  body: string;
  lines: ResetLine[];
  told: string;
  undo: string;
  /** The hazard button: says what it does. */
  confirm: string;
}

export interface ResetWords {
  kind: ResetKind;
  /** Anyone's name by id; the viewer's is "You". */
  nameOf: (userId: string) => string;
  viewerId: string;
  currency: Currency;
  zone: string;
  /** The person, for one person's week or one John's result. */
  person?: string;
  /** The John, for a result. */
  john?: string;
  outcome?: ResultChoice;
  /** The John's result now, for a result: "missed". */
  was?: string | null;
  /** The month, for letting one off: "2026-10". */
  month?: string;
}

/** "October" from "2026-10". */
function monthOnly(month: string): string {
  return monthLabel(month).split(" ")[0];
}

function and(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const RESULT_WORDS: Record<string, string> = {
  done: "done",
  late: "late",
  missed: "missed",
  excused: "let off",
  covered: "covered",
};

/** The reset sheet's words and numbers, from what the database says the reset would do. */
export function resetSheet(preview: ResetPreview, w: ResetWords, words: Words): ResetSheet {
  const short = (id: string) => (id === w.viewerId ? words('house.resets.you') : firstName(w.nameOf(id)));
  const people = Object.entries(preview.people).sort(([a], [b]) => short(a).localeCompare(short(b)));
  const range = preview.week
    ? weekRange(new Date(preview.week.starts_at), new Date(preview.week.ends_at), w.zone)
    : "";
  const monthName = preview.month ? monthOnly(preview.month) : "";
  const { title, body, confirm } = resetHead(w, range, monthName, words);

  const lines: ResetLine[] = [];
  const ticks = people.filter(([, t]) => (t.ticks ?? 0) > 0);
  if (ticks.length > 0) {
    const total = ticks.reduce((n, [, t]) => n + (t.ticks ?? 0), 0);
    lines.push({
      key: "ticks",
      label: words('house.resets.ticks', { n: total }),
      value: ticks.map(([id, t]) => `${short(id)} ${t.ticks}`).join(", "),
    });
  }
  if (w.kind !== "letoff") {
    const moved = people.filter(([, t]) => Math.round((t.points ?? 0) * 10) !== 0);
    lines.push({
      key: "balances",
      label: words('house.resets.balances'),
      value:
        w.kind === "redeal" && moved.length === 0
          ? "From the new deal"
          : moved.length === 0
            ? words('house.resets.noChange')
            : `${moved.map(([id, t]) => `${short(id)} ${signedPoints(t.points ?? 0)}`).join(", ")} ${words('house.resets.pts')}`,
    });
  }
  const back = people.reduce((n, [, t]) => n + Math.max(t.forfeit ?? 0, 0), 0);
  const owed = people.reduce((n, [, t]) => n + Math.max(-(t.forfeit ?? 0), 0), 0);
  const money: string[] = [];
  if (back > 0) money.push(words('house.resets.removed', { money: formatMoney(back, w.currency) }));
  if (owed > 0) money.push(words('house.resets.added', { money: formatMoney(owed, w.currency) }));
  lines.push({
    key: "stake",
    label: words('house.resets.stake'),
    value:
      money.length === 0
        ? words('house.resets.noChange')
        : `${money.join(", ")}${preview.correction ? `, ${words('house.resets.asCorrection')}` : ""}`,
  });
  lines.push({ key: "track", label: words('house.resets.track'), value: trackLine(preview, w) });
  const cleared: string[] = [];
  if (preview.flags > 0) cleared.push(preview.flags === 1 ? "1 flag" : `${preview.flags} flags`);
  if (preview.disputes > 0) cleared.push(preview.disputes === 1 ? "1 dispute" : `${preview.disputes} disputes`);
  if (cleared.length > 0) lines.push({ key: "cleared", label: words('house.resets.cleared'), value: and(cleared) });

  const told = preview.told.filter((id) => id !== w.viewerId).map((id) => firstName(w.nameOf(id)));
  return {
    title,
    body,
    lines,
    told: told.length === 0 ? words('house.resets.toldNobody') : resetTold(and(told.sort()), words),
    undo: words('house.resets.undo', { until: preview.month ? monthOnly(preview.month) : "this month" }),
    confirm,
  };
}

/** A reset's question before its numbers are in: the sheet's title while it works them out. */
export function resetTitle(w: ResetWords, words: Words): string {
  return resetHead(w, "", w.month ? monthOnly(w.month) : "", words).title;
}

function resetHead(w: ResetWords, range: string, monthName: string, words: Words): { title: string; body: string; confirm: string } {
  const person = w.person ? firstName(w.person) : "";
  const john = w.john ?? "this John";
  switch (w.kind) {
    case "result": {
      const to = RESULT_WORDS[w.outcome ?? "done"];
      return {
        title: w.outcome === "excused" ? `Let ${person} off ${john}?` : `Mark ${john} ${to}?`,
        body: w.was
          ? `${person}’s ${john} changes from ${RESULT_WORDS[w.was] ?? w.was} to ${to}.`
          : `${person}’s ${john} is marked ${to} now, without waiting.`,
        confirm: w.outcome === "excused" ? "Let it off" : `Mark it ${to}`,
      };
    }
    case "person_week":
      return {
        title: `Reset ${person}’s week?`,
        body: `${person} keeps the Johns they were dealt. Their ticks from ${range} are cleared.`,
        confirm: words('house.resets.resetPerson', { name: person }),
      };
    case "week":
      return {
        title: "Reset this week?",
        body: `Everyone keeps the Johns they were dealt. Ticks, covers and flags from ${range} are cleared.`,
        confirm: "Reset this week",
      };
    case "redeal":
      return {
        title: "Re-deal this week?",
        body: `Ticks, covers and flags from ${range} are cleared, then the week is dealt again from the list as it is now.`,
        confirm: "Re-deal this week",
      };
    case "skip":
      return {
        title: "Skip this week?",
        body: `${range} counts for nothing: no shares, no points and no forfeits. Streaks don’t grow or break.`,
        confirm: "Skip this week",
      };
    case "letoff":
      return {
        title: `Let everyone off ${monthName}?`,
        body: `${monthName}’s forfeits go. Everyone’s marks stay, and the month shows “Let off”.`,
        confirm: `Let off ${monthName}`,
      };
  }
}

function trackLine(preview: ResetPreview, w: ResetWords): string {
  switch (w.kind) {
    case "result":
      return "New mark, with an amber dot: “Changed by you”";
    case "person_week":
    case "week":
      return preview.past_due > 0
        ? `Shows open again. ${preview.past_due} past due: late if ticked now, missed at the week’s end`
        : "This week shows open again";
    case "redeal":
      return "Shows the new deal";
    case "skip":
      return "This week shows grey, “Skipped”";
    case "letoff":
      return "Marks stay; the month shows “Let off”";
  }
}

/** One row of Ask Jonz's Resets card: what it is, and its numbers in a line. */
export function resetItemLine(
  item: ChatReset,
  w: Pick<ResetWords, "nameOf" | "viewerId" | "currency" | "zone">, words: Words,
): { title: string; meta: string; told: string[] } {
  if (item.kind === "undo") {
    return { title: words('house.resets.undoLine', { line: item.line }), meta: words('house.resets.undoMeta'), told: item.actor && item.actor !== w.viewerId ? [item.actor] : [] };
  }
  const sheet = resetSheet(item.preview, { ...w, ...item.words, kind: item.ask.kind }, words);
  const parts = sheet.lines
    .filter((l) => l.key !== "track" && l.value !== words('house.resets.noChange'))
    .map((l) => (l.key === "ticks" ? l.label : l.key === "cleared" ? `${l.value} cleared` : l.value));
  return {
    title: sheet.confirm,
    meta: parts.length > 0 ? parts.join(", ") : words('house.resets.noChange'),
    told: item.preview.told.filter((id) => id !== w.viewerId),
  };
}

/** "Ada and Sam get a notification", for a whole card. */
export function toldLine(ids: readonly string[], nameOf: (id: string) => string, words: Words): string {
  const names = [...new Set(ids)].map((id) => firstName(nameOf(id))).sort();
  return names.length === 0 ? words('house.resets.toldNobody') : resetTold(and(names), words);
}

/** History's and the Wall's words for a reset: "reset Sam’s week", "marked Bins done". */
export function resetWhat(data: Record<string, unknown>, subject: string, words: Words): string {
  const john = String(data.name ?? words("wall.feed.aJohn"));
  const whose = whoseOf(subject, words);
  switch (data.what) {
    case "result":
      return data.outcome === "excused"
        ? words("wall.history.reset.excused", { whom: whomOf(subject, words), john })
        : words("wall.history.reset.result", { whose, john, outcome: String(data.outcome) });
    case "person_week":
      return words("wall.history.reset.personWeek", { whose });
    case "week":
    case "redeal":
    case "skip":
      return words(`wall.history.reset.${data.what}`);
    case "letoff":
      return data.month ? words("wall.history.reset.letoff", { month: monthOnly(String(data.month)) }) : words("wall.history.reset.letoffAny");
    default:
      return words("wall.history.reset.other");
  }
}

/** Who a reset tells: "Sam gets a notification", "Sam and Priya get one". */
export function resetTold(names: string, words: Words): string {
  return words("house.resets.told", { names, many: names.includes(" and ") });
}
