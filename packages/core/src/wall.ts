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
