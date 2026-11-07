import type { Currency } from "./domain";
import { dateRange, firstName, monthLabel } from "./format";
import { undoneWhat } from "./history";
import { resetWhat } from "./resets";
import { monthWord } from "./house-page";
import { formatMoney } from "./money";
import { pocketMoney } from "./pocket";

// The Wall as both apps show it: each event in words, built from the rows
// they read (events, with their John's photo path and their reactions), so
// the web and the app tell the house's story the same way.

/** Reactions are icons, never emoji (the house style); these are their names. */
export const REACTIONS = ["nice", "fire", "sparkle", "eyes"] as const;
export type ReactionKind = (typeof REACTIONS)[number];

/** What a screen reader says for each reaction, and what its tooltip shows. */
export const REACTION_LABEL: Record<ReactionKind, string> = {
  nice: "Nice one",
  fire: "On fire",
  sparkle: "Spotless",
  eyes: "Side-eye",
};

/** The events a housemate can react to: the ones about how a John went. */
export const REACTABLE: ReadonlySet<string> = new Set([
  "done",
  "late",
  "missed",
  "covered",
  "rejected",
  "upheld",
  "immunity_earned",
  "swap_earned",
]);

export const WALL_COPY = {
  title: "The Wall",
  empty: "Ticks, misses, disputes and perks land here as they happen.",
  photoOf: (john: string) => `Photo of ${john}`,
} as const;

/** An event's row, as read: `events` with its John's photo path and its reactions. */
export interface WallRow {
  id: string;
  kind: string;
  user_id: string | null;
  assignment_id: string | null;
  data: unknown;
  created_at: string;
  assignments: { photo_path: string | null } | null;
  reactions: { user_id: string; kind: string }[] | null;
}

export interface WallEvent {
  id: string;
  kind: string;
  userId: string | null;
  assignmentId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
  /** The receipt's path in `proofs`, for a tick that has one; the app signs it to show it. */
  photoPath: string | null;
  reactions: Record<ReactionKind, { count: number; mine: boolean }>;
}

/** Rows into events, with each reaction counted and yours marked. */
export function wallEvents(rows: readonly WallRow[], userId: string): WallEvent[] {
  return rows.map((e) => {
    const reactions = Object.fromEntries(
      REACTIONS.map((k) => {
        const of = (e.reactions ?? []).filter((r) => r.kind === k);
        return [k, { count: of.length, mine: of.some((r) => r.user_id === userId) }];
      }),
    ) as WallEvent["reactions"];
    const photo = e.assignments?.photo_path ?? null;
    return {
      id: e.id,
      kind: e.kind,
      userId: e.user_id,
      assignmentId: e.assignment_id,
      data: (e.data ?? {}) as Record<string, unknown>,
      createdAt: new Date(e.created_at),
      photoPath: photo && (e.kind === "done" || e.kind === "late" || e.kind === "covered") ? photo : null,
      reactions,
    };
  });
}

/** The receipts worth signing, once each. */
export function photoPaths(events: readonly WallEvent[]): string[] {
  return [...new Set(events.flatMap((e) => (e.photoPath ? [e.photoPath] : [])))];
}

/** Flip your reaction, as the screen shows it before the database answers. */
export function toggled(reactions: WallEvent["reactions"], kind: ReactionKind): WallEvent["reactions"] {
  const r = reactions[kind];
  return { ...reactions, [kind]: { count: r.count + (r.mine ? -1 : 1), mine: !r.mine } };
}

/** A run of words, some of them a person's name, which the screen sets in bold. */
export type Part = { text: string; bold?: boolean };

export type WallIcon =
  | "check"
  | "x"
  | "flag"
  | "gavel"
  | "shield"
  | "repeat"
  | "plane"
  | "user-plus"
  | "truck"
  | "calendar-check"
  | "banknote"
  | "bell-ring"
  | "badge-check"
  | "megaphone"
  | "undo"
  | "home";

export interface WallLine {
  icon: WallIcon;
  tone?: "good" | "hazard" | "hivis";
  parts: Part[];
}

/**
 * An event in words. `nameOf` names a housemate ("You" for the viewer, as
 * the web's nameOf does), so the sentences read "You did Bins." or "Ben did
 * Bins.".
 */
export function describeEvent(e: WallEvent, nameOf: (userId: string | null) => string, currency: Currency): WallLine {
  const who = nameOf(e.userId);
  const john = String(e.data.name ?? "a John");
  const against = nameOf((e.data.against as string) ?? null);
  const possessive = (name: string) => (name === "You" ? "your" : `${name}’s`);
  const b = (text: string): Part => ({ text, bold: true });
  const t = (text: string): Part => ({ text });
  // A roll call says who else did it: "Glyn did Garden tidy with Sam and Mo."
  const crew = Array.isArray(e.data.with) ? (e.data.with as unknown[]).filter((id): id is string => typeof id === "string") : [];
  const withWhom = (): Part[] =>
    crew.flatMap((id, i) => [t(i === 0 ? " with " : i === crew.length - 1 ? " and " : ", "), b(nameOf(id).replace(/^You$/, "you"))]);
  switch (e.kind) {
    case "done":
      return { icon: "check", tone: "good", parts: [b(who), t(` did ${john}`), ...withWhom(), t(".")] };
    case "late":
      return { icon: "check", parts: [b(who), t(` did ${john}`), ...withWhom(), t(", late.")] };
    case "missed":
      return { icon: "x", tone: "hazard", parts: [b(who), t(` missed ${john}.`)] };
    case "covered":
      return {
        icon: "check",
        tone: "good",
        parts: [b(who), t(` covered ${possessive(nameOf((e.data.for as string) ?? null))} ${john}.`)],
      };
    case "disputed":
      return {
        icon: "flag",
        tone: "hazard",
        parts: [b(who), t(` disputed ${possessive(against)} ${john}: “${String(e.data.reason ?? "")}”`)],
      };
    case "upheld":
      return { icon: "gavel", tone: "hazard", parts: [t(`The house struck ${possessive(against)} tick on ${john}. It’s open again.`)] };
    case "rejected":
      return { icon: "gavel", tone: "good", parts: [t(`The house backed ${possessive(against)} ${john}. The tick stands.`)] };
    // A parent's answer to a kid's tick, in a family.
    case "okayed":
      return { icon: "badge-check", tone: "good", parts: [b(who), t(` OK’d ${possessive(against)} ${john}.`)] };
    case "not_yet":
      return { icon: "undo", tone: "hazard", parts: [b(who), t(` sent ${possessive(against)} ${john} back. It’s open again.`)] };
    case "immunity_earned":
      return {
        icon: "shield",
        tone: "hivis",
        parts: [b(who), t(` earned a skip: ${String(e.data.streak)} clean weeks in a row.`)],
      };
    case "swap_earned":
      return { icon: "repeat", tone: "hivis", parts: [b(who), t(" topped the week and earned a swap.")] };
    case "immunity_used":
      return { icon: "shield", parts: [b(who), t(` used a skip on ${john}.`)] };
    case "swap_used":
      return {
        icon: "repeat",
        parts: [
          b(who),
          t(` swapped ${String(e.data.gave)} for ${possessive(nameOf((e.data.with as string) ?? null))} ${String(e.data.took)}.`),
        ],
      };
    case "away": {
      const moved = Number(e.data.moved ?? 0);
      const you = who === "You";
      const due = moved > 0 ? ` ${moved} ${moved === 1 ? "John is" : "Johns are"} due before ${you ? "you go" : "they go"}.` : "";
      return {
        icon: "plane",
        parts: [b(who), t(` ${you ? "are" : "is"} away ${dateRange(String(e.data.starts_on), String(e.data.ends_on))}.${due}`)],
      };
    }
    case "flagged": {
      // Who said it needs doing; null when the clock opened it again after a miss.
      const by = (e.data.by as string | null | undefined) ?? null;
      if (by && by === e.userId) return { icon: "bell-ring", parts: [b(who), t(` said ${john} needed doing.`)] };
      return by
        ? { icon: "bell-ring", parts: [b(nameOf(by)), t(` flagged ${john} for `), b(who), t(".")] }
        : { icon: "bell-ring", parts: [t(`${john} still needs doing. It’s with `), b(who), t(" now.")] };
    }
    case "joined":
      return { icon: "user-plus", parts: [b(who), t(" moved in.")] };
    case "moving_out": {
      const on = typeof e.data.on === "string" ? e.data.on : null;
      const you = who === "You";
      return {
        icon: "truck",
        parts: [b(who), t(on ? ` ${you ? "move" : "moves"} out on ${dateRange(on, on)}.` : ` ${you ? "are" : "is"} staying after all.`)],
      };
    }
    case "moved_out": {
      const was = typeof e.data.who === "string" && e.data.who ? firstName(e.data.who) : who;
      // The buyer took the House Pass with them: the day the house's extras last until.
      const until = typeof e.data.pass_until === "string" ? e.data.pass_until : null;
      return until
        ? {
            icon: "truck",
            parts: [b(was), t(` moved out, and their House Pass went with them. The house keeps the extras until ${dateRange(until, until)}.`)],
          }
        : { icon: "truck", parts: [b(was), t(" moved out.")] };
    }
    case "kind_changed": {
      // Rules' Who lives here: a family now, from the 1st, kept, or housemates again.
      const on = typeof e.data.on === "string" ? e.data.on : null;
      const family = e.data.kind === "family";
      if (on) return { icon: "home", parts: [b(who), t(` made the house a family from ${dateRange(on, on)}, once this month is settled up.`)] };
      if (e.data.kept) return { icon: "home", parts: [b(who), t(" kept the house as housemates.")] };
      if (!family) return { icon: "home", parts: [b(who), t(" made the house housemates again.")] };
      return e.userId
        ? { icon: "home", parts: [b(who), t(" made the house a family. Parents say OK, and kids earn pocket money.")] }
        : { icon: "home", parts: [t("The house is a family now. Parents say OK, and kids earn pocket money.")] };
    }
    case "pocket_paid":
      return {
        icon: "banknote",
        tone: "good",
        parts: [
          b(who),
          t(
            ` paid ${nameOf((e.data.to as string) ?? null)} ${pocketMoney(Number(e.data.amount), currency)} for ${monthWord(String(e.data.month))}.`,
          ),
        ],
      };
    case "month_closed":
      return { icon: "calendar-check", parts: [t(`${monthLabel(String(e.data.month))} is closed and its forfeits are split.`)] };
    case "paid":
      return {
        icon: "banknote",
        tone: "good",
        parts: [
          b(nameOf((e.data.to as string) ?? null)),
          // Moved to Splitwise (houses.settle_in), it's owed there now rather than paid.
          e.data.via === "splitwise"
            ? t(` put ${who}’s ${formatMoney(Number(e.data.amount), currency)} into Splitwise.`)
            : t(` got ${formatMoney(Number(e.data.amount), currency)} from ${who}.`),
        ],
      };
    case "undone": {
      // An admin took back someone else's move: told to whoever's move it was.
      const by = nameOf((e.data.by as string) ?? null);
      return {
        icon: "undo",
        parts: [b(by), t(` undid ${possessive(who)} ${undoneWhat(String(e.data.what), (e.data.name as string | null) ?? null)}.`)],
      };
    }
    case "jonz_message":
      // A message from Jonz itself (the owner's Messages): its subject.
      return { icon: "megaphone", parts: [b("Jonz"), t(`: ${String(e.data.subject ?? "")}`)] };
    case "reset":
      // An admin fixed something: who, and what.
      return {
        icon: "undo",
        parts: [b(who), t(` ${resetWhat(e.data, nameOf((e.data.subject as string) ?? null))}.`)],
      };
    default:
      return { icon: "badge-check", parts: [t(e.kind)] };
  }
}
