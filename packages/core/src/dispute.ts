/**
 * Housemate check: when a disputed tick is struck or stands.
 *
 * Everyone but the person whose tick it is gets a vote, and raising the
 * dispute counts as a vote to strike it. Striking a tick takes a majority of
 * everyone who may vote, not just of those who did: housemates who say
 * nothing leave it standing, so one objection on its own never strikes a tick
 * in a house of three or more. The tick stands as soon as a strike can no
 * longer reach a majority, or when the vote closes without one. "The tick
 * stands unless the house says otherwise."
 *
 * With only one voter (a house of two, or a cover in a house of three) the
 * one who questioned it can't decide alone: whoever ticked it has until the
 * vote closes to answer with a photo (answer_dispute, which settles it), and
 * only then is it struck. A struck John gets 12 hours to be done again
 * (resolve_dispute), so a late question never turns into a miss on its own.
 */

export type Verdict = "upheld" | "rejected";

export interface Tally {
  /** Housemates allowed to vote: everyone except the person who ticked. */
  eligible: number;
  uphold: number;
  reject: number;
  closesAt: Date;
}

/**
 * Who may vote on a questioned tick: everyone in the house but whoever
 * ticked it and, on a cover, whoever's John it was. dispute_voters in the
 * database counts the same.
 */
export function votersOn(memberIds: readonly string[], a: { userId: string; coveredBy: string | null }): string[] {
  const ticker = a.coveredBy ?? a.userId;
  return memberIds.filter((id) => id !== ticker && !(a.coveredBy && id === a.userId));
}

/** The hours a struck John gets to be done again (resolve_dispute's redo_hours). */
export const REDO_HOURS = 12;

export function verdict(t: Tally, now: Date): Verdict | null {
  const eligible = Math.max(1, t.eligible);
  const majority = Math.floor(eligible / 2) + 1;
  if (eligible === 1) {
    if (now < t.closesAt) return null;
    return t.uphold >= 1 ? "upheld" : "rejected";
  }
  if (t.uphold >= majority) return "upheld";
  const cannotStrike = eligible - t.reject < majority;
  if (cannotStrike || now >= t.closesAt) return "rejected";
  return null;
}
