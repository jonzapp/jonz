import { type Database, type PushKind, type HouseKind, type Language, type Words, wordsFor } from "@app/core";
import type { SupabaseClient } from "@supabase/supabase-js";


// What every part of the engine shares: the client, a house's rows, pushes, and reading an answer or failing.

export type Db = SupabaseClient<Database>;
export type HouseRow = Database["public"]["Tables"]["houses"]["Row"];
export type MemberRow = Pick<
  Database["public"]["Tables"]["members"]["Row"],
  "user_id" | "role" | "joined_at" | "streak" | "immunity_tokens" | "swap_tokens" | "suits_days" | "rather" | "moving_out_on" | "born_year"
>;

/**
 * A line of a push: what someone wrote, as they wrote it, or Jonz's words,
 * said in each reader's own language when it's sent (lib/push.ts), with any
 * time in it on the reader's own clock (`zone`: their phone's, saved with
 * their settings, or the house's until they have).
 */
export type PushLine = string | ((words: Words, zone: string) => string);

export interface PushMessage {
  title: PushLine;
  body: PushLine;
  /** Whose words its lines read: a family's or housemates' (housemates when left out). */
  houseKind?: HouseKind;
  url: string;
  /** Which setting it answers to (@app/core notify.ts); `support` has none. */
  kind: PushKind | "support";
  /** The house's zone: for quiet hours, and the times a line says, for someone whose settings have none. */
  zone: string;
  /** A button to answer it from the notification: tick this John, or vote on this dispute. */
  act?: { assignmentId: string } | { disputeId: string };
  /** A later push with the same tag replaces this one, rather than stacking. */
  tag?: string;
}

/** A push as one reader gets it: each line said in their language. */
export type SaidPush = Omit<PushMessage, "title" | "body"> & { title: string; body: string; language: Language };

/** A push said in one reader's language, its times on their clock (the house's when left out). */
export function pushIn(message: PushMessage, language: Language, zone = message.zone): SaidPush {
  const words = wordsFor(language, message.houseKind ?? "housemates");
  const say = (line: PushLine) => (typeof line === "string" ? line : line(words, zone));
  return { ...message, title: say(message.title), body: say(message.body), language };
}

/** Sends a push to some housemates. Absent when nothing should be sent. */
export type Notify = (userIds: string[], message: PushMessage) => Promise<void>;

export interface TickSummary {
  dealt: string | null;
  disputes: number;
  settled: number;
  weeksClosed: number;
  monthsClosed: string[];
  reminders: number;
  /** The house became what Rules said it would on the 1st. */
  kindChanged?: boolean;
}

// The house's rules from its row live in core, beside the board both apps build.

type Ok<R> = Extract<R, { error: null }>;

/** Unwrap a Supabase response, or throw with what was being attempted. */
export function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string,
): Ok<R>["data"] {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as Ok<R>["data"];
}

export async function loadHouse(db: Db, houseId: string) {
  const house = must(await db.from("houses").select("*").eq("id", houseId).single(), "house");
  const members = must(
    await db
      .from("members")
      .select("user_id, role, joined_at, streak, immunity_tokens, swap_tokens, suits_days, rather, moving_out_on, born_year")
      .eq("house_id", houseId)
      .order("joined_at")
      .order("user_id"),
    "members",
  );
  return { house, members };
}
