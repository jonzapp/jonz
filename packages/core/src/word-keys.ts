import { IMMUNITY_EVERY } from "./streak";
import type { RecordCounts } from "./record";
import type { Words } from "./words-for";

// Small choices between lines in the words files, where a number picks the
// line and ICU can't (it matches exact values, not ranges).

/** How a house makes up time away (houses.away_makeup) as a line's key: in full, by half, or not at all. Anything else reads as in full. */
export function makeupKey(makeup: number): "100" | "50" | "0" {
  return makeup === 50 ? "50" : makeup === 0 ? "0" : "100";
}

/** A month's slips, without the zeros: "1 late", "2 missed", "1 late, 2 missed". */
export function lateMissedLine(late: number, missed: number, words: Words): string {
  return [late ? words("house.page.lateCount", { n: late }) : "", missed ? words("house.page.missedCount", { n: missed }) : ""].filter(Boolean).join(", ");
}

/** "about 4 pts a week", or "less than 1 pt a week" under one. */
export function perWeekLine(points: number, words: Words): string {
  return points < 1 ? words("house.lower.perWeekLess") : words("house.lower.perWeek", { points });
}

/** A house's rules in a line: "£20 stake, £2 late, £5 missed", or "No stake, …". */
export function rulesLine(stake: string | null, late: string, missed: string, words: Words): string {
  return stake ? words("house.lower.rulesValue", { stake, late, missed }) : words("house.lower.rulesValueNoStake", { late, missed });
}

/** A record without the zeros: "3 done", "0 done, 1 late, 2 missed". */
export function recordLine(r: { done: number; late: number; missed: number; covered?: number }, words: Words): string {
  return words("house.table.record", { done: r.done, late: r.late, missed: r.missed, covered: r.covered ?? 0 });
}

/** Where you stand against your share: behind (and for how long), ahead, or on it. */
export function shareStanding(balance: number, weeksToEven: number, words: Words): string {
  const state = balance <= -0.5 ? "behind" : balance >= 0.5 ? "ahead" : "even";
  return words("house.table.shareLine", { state, weeks: weeksToEven });
}

/** "Every 2 weeks, due Sun 21:00". */
export function johnWhen(everyWeeks: number, day: string, time: string, words: Words): string {
  return words("house.johns.when", { weeks: everyWeeks, day: day.slice(0, 3), time });
}

/** What booking time away did to your Johns: moved before you go, handed on, or skipped. */
export function awayMovedLine(n: number, handed: number, skipped: number, words: Words): string {
  return [
    n > 0 ? words("house.away.movedBefore", { n }) : "",
    handed > 0 ? words("house.away.movedHanded", { n: handed }) : "",
    skipped > 0 ? words("house.away.movedSkipped", { n: skipped }) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The month calendar's key for a day: "1 away", "2 away", "3 or more". */
export function awayShade(away: number, words: Words): string {
  return words("house.away.shade", { away: Math.min(away, 3) });
}

/** Whether your share catches up after time away, under Today's away banner. */
export function awayBannerBody(makeup: number, words: Words): string {
  return words("house.away.bannerBody", { share: makeup >= 100 ? "full" : makeup > 0 ? "half" : "none" });
}

/** What happens to someone's share while they're away, under the Rules' choice. */
export function makeupHint(makeup: number, words: Words): string {
  return words(`house.rules.makeupHint.${makeupKey(makeup)}`);
}

/** "Use this phone’s: America/New York". */
export function phoneZoneLine(zone: string, words: Words): string {
  return words("house.rules.phoneZone", { zone: zone.replaceAll("_", " ") });
}

/** The Table's rules, each a term and what it means. */
export function tableRules(words: Words): { term: string; body: string }[] {
  return [
    { term: words("house.table.rules.points.term"), body: words("house.table.rules.points.body") },
    { term: words("house.table.rules.skips.term"), body: words("house.table.rules.skips.body", { every: IMMUNITY_EVERY }) },
    { term: words("house.table.rules.swap.term"), body: words("house.table.rules.swap.body") },
  ];
}

/** A Track record row's on-time share: "92%", or a dash before anything's due. */
export function recordPct(pct: number | null, words: Words): string {
  return pct === null ? "–" : words("week.record.pct", { pct });
}

/** A Track record row's meta: "6 on time, 1 late, 1 missed, covered 2", leaving out the noughts after on time. */
export function recordCounts(c: RecordCounts, words: Words): string {
  const keys = ["late", "missed", "skipped", "covered", "helped"] as const;
  return [words("week.record.counts.onTime", { n: c.onTime }), ...keys.filter((k) => c[k]).map((k) => words(`week.record.counts.${k}`, { n: c[k] }))].join(", ");
}

/** Names as one phrase: "Sam, Jo and you", and past four "Sam, Jo, Priya, you and 2 more". */
export function nameList(words: Words, names: readonly string[]): string {
  const shown = names.length > 4 ? [...names.slice(0, 4), words("wall.feed.namesMore", { n: names.length - 4 })] : names;
  return shown.length < 2 ? shown.join("") : words("wall.feed.namesAnd", { first: shown.slice(0, -1).join(", "), last: shown[shown.length - 1] });
}

/** A Wall row, to a screen reader: the sentence, its meta line if any, then when. */
export function rowLabel(words: Words, title: string, detail: string | null, when: string): string {
  return detail ? words("wall.feed.rowDetail", { title, detail, when }) : words("wall.feed.row", { title, when });
}

/** Whose, from a name that's "You" for the viewer: "your", "Sam’s". */
export function whoseOf(name: string, words: Words): string {
  return name === words("wall.feed.you") ? words("wall.feed.your") : words("wall.feed.whose", { name });
}

/** A name as a sentence's object: "you" for the viewer, else the name. */
export function whomOf(name: string, words: Words): string {
  return name === words("wall.feed.you") ? words("wall.feed.youObject") : name;
}
