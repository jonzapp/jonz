import type { AwayPeriod } from "./away";
import { dateRange } from "./format";
import type { Words } from "./words-for";

/**
 * Bring Jonz to your next house (docs/specs/moving-on.md): what a moving-out
 * date means to the deal, to Today and to the people who stay. Dates are the
 * house's local `yyyy-MM-dd`, which compare correctly as strings. Pure; every
 * function takes "today" or the week it's about.
 */

/** Anyone with a moving-out date: `members.moving_out_on`. */
export interface Mover {
  userId: string;
  movingOutOn: string | null;
}

/**
 * Who a week is dealt to: everyone but those who have moved out by its first
 * day. Someone moving out part-way through is still dealt the week, up to
 * the day before they go (movingOutAway).
 */
export function stillHere<T extends Mover>(members: readonly T[], startsOn: string): T[] {
  return members.filter((m) => m.movingOutOn === null || m.movingOutOn > startsOn);
}

/**
 * From the day someone moves out to `until`, the deal treats them as away,
 * so nothing lands on a day they won't be there. Only for those still dealt
 * the week (stillHere): after that they aren't in it at all.
 */
export function movingOutAway(members: readonly Mover[], startsOn: string, until: string): AwayPeriod[] {
  return members.flatMap((m) =>
    m.movingOutOn !== null && m.movingOutOn > startsOn && m.movingOutOn <= until
      ? [{ id: `moving-out:${m.userId}`, userId: m.userId, startsOn: m.movingOutOn, endsOn: until, note: null }]
      : [],
  );
}

/** Today's line for whoever is moving out: the day ahead, or (on it and after) that it's time to leave. */
export function movingLine(movingOutOn: string | null, today: string, houseName: string, words: Words): string | null {
  if (movingOutOn === null) return null;
  return movingOutOn <= today ? words('house.moving.movingDay', { house: houseName }) : words('house.moving.youMoveOut', { day: dateRange(movingOutOn, movingOutOn, words) });
}

/** How long after someone moves out the people who stay are still asked who's moving in. */
export const ASK_DAYS = 30;

/**
 * Whether to ask the people who stay "Someone moving in?": while a housemate
 * has a moving-out date, and for ASK_DAYS after the last one left, until
 * someone moves in. Never asked of the one moving out.
 */
export function askWhosMovingIn(args: {
  me: string;
  members: readonly Mover[];
  /** When someone last moved out, and when someone last moved in (the Wall's 'moved_out' and 'joined'). */
  lastMovedOut: Date | null;
  lastJoined: Date | null;
  now: Date;
}): boolean {
  const { me, members, lastMovedOut, lastJoined, now } = args;
  if (members.find((m) => m.userId === me)?.movingOutOn) return false;
  if (members.some((m) => m.userId !== me && m.movingOutOn !== null)) return true;
  if (!lastMovedOut) return false;
  if (lastJoined && lastJoined.getTime() > lastMovedOut.getTime()) return false;
  return now.getTime() - lastMovedOut.getTime() <= ASK_DAYS * 86_400_000;
}

/** How long after leaving the one reminder goes, if they haven't started or joined a house. */
export const REMIND_AFTER_DAYS = 14;
/** And how long it stays worth sending: past this, it would come out of nowhere. */
export const REMIND_UNTIL_DAYS = 30;

/** Whether a move is due its one reminder now. */
export function remindMoverNow(leftAt: Date, now: Date): boolean {
  const days = (now.getTime() - leftAt.getTime()) / 86_400_000;
  return days >= REMIND_AFTER_DAYS && days < REMIND_UNTIL_DAYS;
}
