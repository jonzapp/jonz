// House setup's pages: the rules as label and value, the Johns by category, a John's schedule line and the admins' names.
import { isoDayOf, shiftMonth, type AwayPeriod } from "./away";
import type { BoardItem, JohnDef } from "./board";
import { CREW_COPY, FOCUS_SHELL_COPY, GROUPS_COPY, JOHN_LIST_COPY, PARENT_OK_COPY, POCKET_COPY, RULES_COPY, SETUP_COPY, STEADY_COPY } from "./copy";
import { MAKEUP_LABEL } from "./deal";
import { CATEGORIES, CATEGORY_LABEL, DOW_LABEL, type Category, type Currency, type DealMode, type HouseKind, type HouseRules, type IsoDow, type SettleIn } from "./domain";
import { familyHides } from "./family";
import { humanError } from "./errors";
import { dateRange, firstName, joinRange, monthLabel, pointsLabel } from "./format";
import { formatMoney, formatSigned, moneyInput, parseMoney } from "./money";
import { HouseSettings } from "./schemas";
import type { Words } from "./words-for";
import { dueWords, oftenWords, placeWord } from "./repeat";
import { addDaysTo } from "./week";

const capitalise = (word: string) => word.charAt(0).toLocaleUpperCase() + word.slice(1);

/** A line of a read-out: what it is, and what it's set to ("Stake", "£20 a month"). */
export interface LabelValue {
  label: string;
  value: string;
}

/** One kind of John on the list, as its own section: "Kitchen, 3". */
export interface JohnKind {
  category: Category;
  label: string;
  johns: JohnDef[];
}

/** The John list by kind, in the kinds' usual order, each kind's Johns as the list has them. Kinds with none are left out. */
export function johnsByKind(johns: readonly JohnDef[]): JohnKind[] {
  return CATEGORIES.flatMap((category) => {
    const mine = johns.filter((j) => j.category === category);
    return mine.length === 0 ? [] : [{ category, label: SETUP_COPY.kind(CATEGORY_LABEL[category], mine.length), johns: mine }];
  });
}

/** "Every 2 weeks", "Every 3 months", "Twice a year": how often a John comes round. */
function cadence(john: Pick<JohnDef, "everyWeeks"> & Partial<Pick<JohnDef, "everyMonths">>): string {
  return oftenWords({ everyWeeks: john.everyWeeks, everyMonths: john.everyMonths ?? null });
}

/** When it's due: "Sun 21:00", or "first Sat 21:00" for a John that repeats in months. */
function dueLine(john: Pick<JohnDef, "dueDow" | "dueTime"> & Partial<Pick<JohnDef, "weekOfMonth">>): string {
  return dueWords({ weekOfMonth: john.weekOfMonth ?? null }, john.dueTime, DOW_LABEL[john.dueDow].slice(0, 3));
}

/** A John's meta line on the list: "Every week, Sun 21:00, photo", then the group that shares it, if one does. */
export function scheduleLine(
  john: Pick<JohnDef, "everyWeeks" | "dueDow" | "dueTime" | "needsPhoto"> &
    Partial<Pick<JohnDef, "when" | "respondHours" | "perWeek" | "everyMonths" | "weekOfMonth">>,
  groupName?: string | null,
): string {
  const onCall = john.when === "on_call";
  return [
    ...(onCall ? [JOHN_LIST_COPY.onCallWhen(john.respondHours ?? 12, john.perWeek ?? 1)] : [cadence(john), dueLine(john)]),
    john.needsPhoto ? SETUP_COPY.photo : null,
    groupName || null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * A John's line on the John list: when it's due, then only what sets it
 * apart ("Sun 21:00", "Thu 07:00, every 2 weeks, photo, Upstairs bathroom",
 * "On call, within 12 hours"). Every week is the usual, so it goes unsaid.
 */
export function listLine(
  john: Pick<JohnDef, "everyWeeks" | "dueDow" | "dueTime" | "needsPhoto"> &
    Partial<Pick<JohnDef, "when" | "respondHours" | "everyMonths" | "weekOfMonth">>,
  groupName?: string | null,
): string {
  const often = cadence(john);
  const weekly = john.everyWeeks === 1 && !john.everyMonths;
  return [
    ...(john.when === "on_call"
      ? [JOHN_LIST_COPY.onCallWithin(john.respondHours ?? 12)]
      : [dueLine(john), weekly ? null : often.charAt(0).toLowerCase() + often.slice(1)]),
    john.needsPhoto ? SETUP_COPY.photo : null,
    groupName || null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** A John as a housemate who can't edit it reads it: kind, who shares it, effort, how often, when, and the photo. */
export function johnFacts(john: JohnDef, groupName?: string | null): LabelValue[] {
  return [
    { label: SETUP_COPY.kindLabel, value: CATEGORY_LABEL[john.category] },
    { label: JOHN_LIST_COPY.sharedBy, value: groupName || JOHN_LIST_COPY.everyone },
    { label: JOHN_LIST_COPY.effort, value: pointsLabel(john.points) },
    ...(john.crew === 1 ? [] : [{ label: CREW_COPY.doneBy, value: CREW_COPY.choice(john.crew) }]),
    ...(john.when === "on_call"
      ? [
          { label: JOHN_LIST_COPY.whenLabel, value: JOHN_LIST_COPY.onCall },
          { label: JOHN_LIST_COPY.respond, value: JOHN_LIST_COPY.respondHours(john.respondHours) },
          { label: JOHN_LIST_COPY.timesAWeek, value: JOHN_LIST_COPY.perWeekLabel(john.perWeek) },
        ]
      : [
          { label: JOHN_LIST_COPY.often, value: cadence(john) },
          {
            label: JOHN_LIST_COPY.due,
            value:
              john.weekOfMonth === null
                ? `${DOW_LABEL[john.dueDow]} ${john.dueTime}`
                : `${capitalise(placeWord(john.weekOfMonth))} ${DOW_LABEL[john.dueDow]} ${john.dueTime}`,
          },
        ]),
    // Only said when it does: the list's rows leave it to here.
    ...(john.keepDay ? [{ label: STEADY_COPY.keepDay, value: STEADY_COPY.keepDayYes }] : []),
    { label: SETUP_COPY.photoLabel, value: john.needsPhoto ? SETUP_COPY.photoNeeded : SETUP_COPY.photoNot },
  ];
}

/** Where a house's time zone is, as people say it: "London" for Europe/London, "New York" for America/New_York. */
export function zonePlace(timezone: string): string {
  const last = timezone.split("/").filter(Boolean).pop() ?? timezone;
  return last.replaceAll("_", " ");
}

/** A forfeit as the rules show it: "−£1", or nothing at all. */
function forfeit(minor: number, currency: Currency): string {
  return minor === 0 ? SETUP_COPY.nothing : formatSigned(-minor, currency);
}

/** The house rules in plain words, one line each, as everyone reads them. */
export function rulesRows(
  rules: HouseRules,
  awayMakeup: number,
  settleIn?: SettleIn,
  kind: HouseKind = "housemates",
  /** In a family: the most each kid can earn in a month. */
  pocketCapMinor = 0,
): LabelValue[] {
  // A family has no stake, so it reads none of the money's rows: pocket money in their place.
  if (familyHides(kind).stake) {
    // Nor a vote: the check window's row says who OKs a kid's tick instead.
    const rows = rulesRows(rules, awayMakeup)
      .filter((row) => row.label !== SETUP_COPY.stake && row.label !== SETUP_COPY.late && row.label !== SETUP_COPY.missed)
      .map((row) => (row.label === SETUP_COPY.disputes ? { label: PARENT_OK_COPY.rulesLabel, value: PARENT_OK_COPY.rulesValue } : row));
    rows.splice(2, 0, { label: POCKET_COPY.rulesLabel, value: POCKET_COPY.rulesValue(formatMoney(pocketCapMinor, rules.currency)) });
    return rows;
  }
  const rows: LabelValue[] = [
    { label: STEADY_COPY.mode, value: STEADY_COPY.modeName[rules.dealMode] },
    { label: STEADY_COPY.budget, value: STEADY_COPY.budgetEach(rules.dealBudget) },
    {
      label: SETUP_COPY.stake,
      value: rules.stakeMinor === 0 ? SETUP_COPY.noStake : SETUP_COPY.perMonth(formatMoney(rules.stakeMinor, rules.currency)),
    },
    { label: SETUP_COPY.late, value: forfeit(rules.lateForfeitMinor, rules.currency) },
    { label: SETUP_COPY.missed, value: forfeit(rules.missedForfeitMinor, rules.currency) },
    { label: SETUP_COPY.disputes, value: SETUP_COPY.disputeWindow(rules.disputeHours) },
    { label: SETUP_COPY.lateWindow, value: SETUP_COPY.lateFor(rules.lateHours) },
    { label: SETUP_COPY.cover, value: SETUP_COPY.coverWindow(rules.coverGraceHours) },
    { label: SETUP_COPY.away, value: SETUP_COPY.makeup[awayMakeup] ?? MAKEUP_LABEL[awayMakeup] ?? SETUP_COPY.makeupPercent(awayMakeup) },
    { label: SETUP_COPY.weekStarts, value: SETUP_COPY.weekStartsAt(DOW_LABEL[rules.weekStarts], zonePlace(rules.timezone)) },
  ];
  // After the money it's about, when it's known.
  if (settleIn) rows.splice(5, 0, { label: SETUP_COPY.settleIn, value: SETUP_COPY.settleInValue[settleIn] });
  return rows;
}

/** "Sam and Priya", "Sam, Priya and Tom". */
function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${SETUP_COPY.and} ${names[names.length - 1]}`;
}

type Member = { userId: string; name: string; role: string };

/** The admins by first name, "You" first when you're one. */
function adminNames(members: readonly Member[], me: string): string[] {
  const admins = members.filter((m) => m.role === "admin");
  return [
    ...admins.filter((m) => m.userId === me).map(() => SETUP_COPY.you),
    ...admins.filter((m) => m.userId !== me).map((m) => firstName(m.name)),
  ];
}

/** Who can change the rules, under the read-out: "Sam (admin) can change these.", "You and Priya (admins) can change these." */
export function adminsLine(members: readonly Member[], me: string, w: Words): string {
  const names = adminNames(members, me);
  if (names.length === 0) return w("house.setup.adminsNobody");
  if (names.length === 1 && names[0] === SETUP_COPY.you) return SETUP_COPY.youCanChange;
  return w("house.setup.canChange", { names: listed(names), count: names.length });
}

/** An empty John list, to a housemate who can't add to it: who will. "Sam will add the Johns." */
export function johnsComing(members: readonly Member[], me: string, w: Words): string {
  const names = adminNames(members, me).filter((n) => n !== SETUP_COPY.you);
  return names.length === 0 ? w("house.setup.johnsComingAdmin") : SETUP_COPY.johnsComing(listed(names));
}

/**
 * Whether this week can be dealt again: it has been dealt, and nothing in it
 * is ticked or settled yet, as the deal asks (it refuses otherwise).
 */
export function canRedeal(board: { week: unknown; items: readonly Pick<BoardItem, "doneAt" | "outcome">[] }): boolean {
  return board.week != null && board.items.every((i) => i.doneAt === null && i.outcome === null);
}

/** Who's in a group, first names and "You" first: "You, Sam and Megan", or that nobody is. */
export function membersLine(memberIds: readonly string[], people: readonly { userId: string; name: string }[], me: string): string {
  if (memberIds.length === 0) return GROUPS_COPY.nobody;
  const name = (id: string) => {
    const person = people.find((p) => p.userId === id);
    return person ? firstName(person.name) : FOCUS_SHELL_COPY.formerHousemate;
  };
  const ordered = [
    ...memberIds.filter((id) => id === me).map(() => SETUP_COPY.you),
    ...people.filter((p) => p.userId !== me && memberIds.includes(p.userId)).map((p) => name(p.userId)),
    ...memberIds.filter((id) => id !== me && !people.some((p) => p.userId === id)).map(name),
  ];
  // "Sam and a former housemate": only the first name in the line keeps its capital.
  return listed(ordered.map((n, i) => (i > 0 && n === FOCUS_SHELL_COPY.formerHousemate ? n[0].toLowerCase() + n.slice(1) : n)));
}

/** Whether a trip has begun by `today` (a local date): it can then only be ended, not cancelled. */
export function tripStarted(period: Pick<AwayPeriod, "startsOn">, today: string): boolean {
  return period.startsOn <= today;
}

/** The house's trips that aren't over by `today`, soonest first. */
export function upcomingTrips(periods: readonly AwayPeriod[], today: string): AwayPeriod[] {
  return periods.filter((p) => p.endsOn >= today).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** Your own trips that aren't over by `today`, soonest first. */
export function myTrips(periods: readonly AwayPeriod[], userId: string, today: string): AwayPeriod[] {
  return upcomingTrips(periods, today).filter((p) => p.userId === userId);
}

/** Your own trip's meta line under its dates: whether you're away now, and where. */
export function tripMeta(period: AwayPeriod, today: string): string {
  return [tripStarted(period, today) ? SETUP_COPY.awayNow : null, period.note || null].filter(Boolean).join(", ");
}

/** A housemate's time away as a meta line: "28–31 Oct, Mum's 60th in Cork". */
export function awayMeta(period: AwayPeriod): string {
  return [dateRange(period.startsOn, period.endsOn), period.note || null].filter(Boolean).join(", ");
}

/**
 * The weeks a booking calendar shows: `count` weeks of local dates, each
 * starting on the house's first day, from the week that holds `today` moved
 * on by `from` weeks. It opens on the first week you can book.
 */
export function bookingWeeks(today: string, weekStarts: IsoDow, from: number, count: number): string[][] {
  const start = addDaysTo(today, -((isoDayOf(today) - weekStarts + 7) % 7) + from * 7);
  return Array.from({ length: Math.max(0, count) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDaysTo(start, w * 7 + d)),
  );
}

/**
 * The weeks a month calendar shows for a `yyyy-MM` month: each starting on
 * the house's first day, from the week that holds the 1st to the week that
 * holds the last day, with the months either side filling the ends. Four to
 * six weeks.
 */
export function monthWeeks(month: string, weekStarts: IsoDow): string[][] {
  const first = `${month}-01`;
  const last = addDaysTo(`${shiftMonth(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let start = addDaysTo(first, -((isoDayOf(first) - weekStarts + 7) % 7)); start <= last; start = addDaysTo(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDaysTo(start, d)));
  }
  return weeks;
}

/** What a run of dates spans, by month: "October 2026", "October–November 2026", "December 2026–January 2027". */
export function monthsSpanned(first: string, last: string): string {
  const [a, b] = [monthLabel(first.slice(0, 7)), monthLabel(last.slice(0, 7))];
  if (a === b) return a;
  const [aMonth, aYear] = a.split(" ");
  const [, bYear] = b.split(" ");
  return aYear === bYear ? joinRange(aMonth, b) : joinRange(a, b);
}

/** A local date said in full, for a screen reader: "Monday 26 October". */
export function dayName(date: string): string {
  return `${DOW_LABEL[isoDayOf(date)]} ${Number(date.slice(8))} ${monthLabel(date.slice(0, 7)).split(" ")[0]}`;
}

/** The house rules as the form holds them while an admin changes them: amounts as typed. */
export interface RulesDraft {
  name: string;
  timezone: string;
  currency: Currency;
  weekStarts: IsoDow;
  disputeHours: number;
  coverGraceHours: number;
  lateHours: number;
  awayMakeup: number;
  settleIn: SettleIn;
  dealMode: DealMode;
  dealBudget: number;
  stake: string;
  late: string;
  missed: string;
  /** In a family: the most each kid can earn in a month, as typed. Absent for housemates. */
  pocket?: string;
}

/** Where a problem with the form sits: under one of its fields, or (`form`) by Save. */
export type RulesField = "name" | "timezone" | "stake" | "late" | "missed" | "pocket" | "form";

/** The form as it starts, from the house's name, its rules, its make-up rate and where it settles up. */
export function rulesDraft(
  name: string,
  rules: HouseRules,
  awayMakeup: number,
  settleIn: SettleIn = "jonz",
  /** A family's pocket money cap; left out for housemates, whose form has no such field. */
  pocketCapMinor?: number,
): RulesDraft {
  return {
    name,
    timezone: rules.timezone,
    currency: rules.currency,
    weekStarts: rules.weekStarts,
    disputeHours: rules.disputeHours,
    coverGraceHours: rules.coverGraceHours,
    lateHours: rules.lateHours,
    awayMakeup,
    settleIn,
    dealMode: rules.dealMode,
    dealBudget: rules.dealBudget,
    stake: moneyInput(rules.stakeMinor),
    late: moneyInput(rules.lateForfeitMinor),
    missed: moneyInput(rules.missedForfeitMinor),
    ...(pocketCapMinor === undefined ? {} : { pocket: moneyInput(pocketCapMinor) }),
  };
}

/** A typed amount in minor units, or null when it isn't money: a minus sign included, since nothing here is negative. */
function amountOf(typed: string): number | null {
  return /[-\u2212\u2013]/.test(typed) ? null : parseMoney(typed);
}

/** Whether the form says anything the house doesn't already: Save waits for a change. Amounts compare as money. */
export function rulesChanged(draft: RulesDraft, from: RulesDraft): boolean {
  const amount = (typed: string) => amountOf(typed) ?? typed.trim();
  return (
    draft.name.trim() !== from.name.trim() ||
    draft.timezone.trim() !== from.timezone.trim() ||
    draft.currency !== from.currency ||
    draft.weekStarts !== from.weekStarts ||
    draft.disputeHours !== from.disputeHours ||
    draft.coverGraceHours !== from.coverGraceHours ||
    draft.lateHours !== from.lateHours ||
    draft.awayMakeup !== from.awayMakeup ||
    draft.settleIn !== from.settleIn ||
    draft.dealMode !== from.dealMode ||
    draft.dealBudget !== from.dealBudget ||
    (["stake", "late", "missed"] as const).some((k) => amount(draft[k]) !== amount(from[k])) ||
    amount(draft.pocket ?? "") !== amount(from.pocket ?? "")
  );
}

/**
 * The form checked before it's sent: the settings to save, or a sentence
 * under each field that's wrong (an amount that isn't money or is below
 * zero, an empty name, an amount over the most a house can stake). The
 * database still decides.
 */
export function checkRules(
  draft: RulesDraft,
): { settings: HouseSettings; problems: null } | { settings: null; problems: Partial<Record<RulesField, string>> } {
  const problems: Partial<Record<RulesField, string>> = {};
  const amounts = { stake: amountOf(draft.stake), late: amountOf(draft.late), missed: amountOf(draft.missed) };
  for (const key of ["stake", "late", "missed"] as const) if (amounts[key] === null) problems[key] = RULES_COPY.badAmount;
  const pocket = draft.pocket === undefined ? undefined : amountOf(draft.pocket);
  if (pocket === null) problems.pocket = RULES_COPY.badAmount;
  const parsed = HouseSettings.safeParse({
    name: draft.name,
    timezone: draft.timezone,
    currency: draft.currency,
    weekStarts: draft.weekStarts,
    stakeMinor: amounts.stake ?? 0,
    lateForfeitMinor: amounts.late ?? 0,
    missedForfeitMinor: amounts.missed ?? 0,
    disputeHours: draft.disputeHours,
    coverGraceHours: draft.coverGraceHours,
    lateHours: draft.lateHours,
    awayMakeup: draft.awayMakeup,
    settleIn: draft.settleIn,
    dealMode: draft.dealMode,
    dealBudget: draft.dealBudget,
    ...(pocket === undefined ? {} : { pocketCapMinor: pocket ?? 0 }),
  });
  const field: Record<string, RulesField> = {
    name: "name",
    timezone: "timezone",
    stakeMinor: "stake",
    lateForfeitMinor: "late",
    missedForfeitMinor: "missed",
    pocketCapMinor: "pocket",
  };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = field[String(issue.path[0])] ?? "form";
      if (!problems[key]) problems[key] = key === "form" ? RULES_COPY.check : issue.message;
    }
  }
  if (!parsed.success || Object.keys(problems).length > 0) return { settings: null, problems };
  return { settings: parsed.data, problems: null };
}

/** Where the database's refusal of the rules belongs: a time zone it doesn't know under Time zone, anything else by Save. */
export function rulesRefusalField(sentence: string): RulesField {
  return sentence === humanError({ message: "unknown_timezone" }) ? "timezone" : "form";
}
