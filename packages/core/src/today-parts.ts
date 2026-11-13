import type { BoardItem } from "./board";
import type { HouseRules } from "./domain";
import { firstName } from "./format";
import { formatMoney } from "./money";
import type { LiveStatus } from "./outcome";
import type { Words } from "./words-for";

// What Today (today.ts) and the John sheet (john-sheet.ts) both write
// with: people's names in a sentence, whose tick a John is, and what a
// late or missed John costs. Not part of @app/core's own surface, apart
// from tickerOf, which today.ts hands on.

/** Someone in the house, as far as these words need them. */
export interface Person {
  userId: string;
  name: string;
}

/** A first name to start a sentence with: "Priya", or "A former housemate" for someone who has left. */
export function firstNameIn(people: readonly Person[], userId: string | null, words: Words): string {
  const person = people.find((p) => p.userId === userId);
  return person ? firstName(person.name) : words('common.shell.formerHousemate');
}

/** A first name mid-sentence: "Priya", or "a former housemate". */
export function called(people: readonly Person[], userId: string | null, words: Words): string {
  const person = people.find((p) => p.userId === userId);
  return person ? firstName(person.name) : words('today.nextUp.someoneGone');
}

/** Settled one way or another: nothing more to do or check. A cover is, once its outcome is stamped (johnSheetMode). */
export const SETTLED: ReadonlySet<LiveStatus> = new Set<LiveStatus>(["done", "late", "excused", "missed", "covered"]);

/** Whose tick it is: the housemate who covered it, whoever ticked its roll call, or else whoever it was dealt to. */
export function tickerOf(item: Pick<BoardItem, "userId"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>): string {
  return item.coveredBy ?? item.crew?.tickedBy ?? item.userId;
}

/** The late and missed forfeits as they'd land on you, each capped at `room` when it's known; null when free. */
export function forfeits(rules: HouseRules, room: number | null, words: Words): { late: string | null; missed: string | null } {
  const money = (amount: number) => {
    const capped = Math.max(0, room === null ? amount : Math.min(amount, room));
    return capped > 0 ? formatMoney(capped, rules.currency, words) : null;
  };
  return { late: money(rules.lateForfeitMinor), missed: money(rules.missedForfeitMinor) };
}

/** What an overdue John costs: "£1 now, £3 if missed", or less when a forfeit is zero. */
export function overdueCost(rules: HouseRules, room: number | null, words: Words): string | null {
  const { late, missed } = forfeits(rules, room, words);
  if (late && missed) return words('today.nextUp.nowOrMissed', { late, missed });
  if (late) return words('today.nextUp.now', { late });
  if (missed) return words('today.nextUp.ifMissed', { amount: missed });
  return null;
}
