import "server-only";

import { CHAT_MOVES_MAX, ChatMove, type EditResult } from "@app/core";

import type { Caller } from "./disputes";

/**
 * Ask Jonz's time away moves: booking or cancelling the person's own time
 * away, put on a card for them to tap. Checked here as the app's own page
 * would (the dates, the house's today, overlaps, whose it is), so the card
 * only offers what set_away and cancel_away will take; they check again
 * when it's tapped.
 */
export function awayMoves(caller: Caller, houseId: string, today: string, moves: ChatMove[]) {
  const mine = async () => {
    const { data } = await caller.db
      .from("away_periods")
      .select("id, starts_on, ends_on")
      .eq("house_id", houseId)
      .eq("user_id", caller.userId)
      .gte("ends_on", today)
      .order("starts_on");
    return data ?? [];
  };
  const add = (m: ChatMove): EditResult => {
    if (moves.length >= CHAT_MOVES_MAX) return { ok: false, said: `That's ${CHAT_MOVES_MAX} on the card already.` };
    if (moves.some((o) => JSON.stringify(o) === JSON.stringify(m))) return { ok: true, said: "Already on the card." };
    moves.push(m);
    return { ok: true, said: "On the card: they tap to do it." };
  };

  return {
    async offerAway(a: { from: string; to: string; note: string | null }): Promise<EditResult> {
      const parsed = ChatMove.safeParse({ kind: "away", from: a.from.trim(), to: a.to.trim(), note: a.note?.trim() || undefined });
      if (!parsed.success) return { ok: false, said: "Give the first and last day as yyyy-mm-dd, and where in 60 letters at most." };
      const m = parsed.data as Extract<ChatMove, { kind: "away" }>;
      if (m.from < today) return { ok: false, said: `That starts before today (${today}).` };
      if (m.to < m.from) return { ok: false, said: "The last day is before the first." };
      const booked = (await mine()).filter((p) => p.starts_on <= m.to && p.ends_on >= m.from);
      // Booked already, and not being cancelled on this card: it would overlap.
      const clash = booked.find((p) => !moves.some((o) => o.kind === "cancel_away" && o.awayId === p.id));
      if (clash) return { ok: false, said: `That overlaps their time away ${clash.starts_on} to ${clash.ends_on}: cancel that first, or pick other days.` };
      return add(m);
    },
    async offerCancelAway(ref: string): Promise<EditResult> {
      const r = ref.trim().toLowerCase();
      const found = r.length >= 6 ? (await mine()).find((p) => p.id.startsWith(r)) : undefined;
      if (!found) return { ok: false, said: "No time away of theirs from today on has that ref: read time_away for it." };
      return add({ kind: "cancel_away", awayId: found.id, from: found.starts_on, to: found.ends_on });
    },
  };
}
