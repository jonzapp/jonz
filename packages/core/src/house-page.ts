import { format } from "date-fns";

import { currentOrNext, shiftMonth, type AwayPeriod } from "./away";
import { weeklyEffort, type JohnDef } from "./board";
import { FOCUS_SHELL_COPY, HOUSE_LOWER_COPY, HOUSE_PAGE_COPY, PERSON_COPY, STAKE_HISTORY_COPY } from "./copy";
import type { BalanceRow } from "./deal";
import type { Currency, HouseRules, SettleIn } from "./domain";
import { dateRange, dayLabel, firstName, formatBalance, monthLabel, pointsLabel, STATUS_MARK, type StatusIcon } from "./format";
import { formatMoney, formatSigned, moneyInput } from "./money";
import type { TableRow } from "./points";
import type { LedgerRow, StakeView, Transfer } from "./stake";
import { IMMUNITY_CAP, IMMUNITY_EVERY } from "./streak";

// House's money half, shaped for its screens: the month card's lines,
// settling up from your side, the Table's rows with points and money
// together, a housemate's page, and Stake history by month. Pure: whatever
// depends on the day takes it (`today`, a `zone`).

/** A piece of a meta line. `hazard` is for late and missed, said in words, on the card colour only. */
export interface MetaPart {
  text: string;
  hazard?: boolean;
  /** The hazard mark drawn before these words, from the status map: late's clock, missed's X. */
  icon?: StatusIcon;
}

/** Someone who lives here, as the board's read has them. */
export interface PageMember {
  userId: string;
  name: string;
  role?: string;
  streak: number;
  immunityTokens: number;
  swapTokens: number;
}

type Named = Pick<PageMember, "userId" | "name">;

const COMMA = ", ";

/** The 15th of a `yyyy-MM` month at noon UTC: the same month in every time zone. */
function midMonth(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15, 12));
}

/** "October" from "2026-10". */
export function monthWord(month: string): string {
  return format(midMonth(month), "MMMM");
}

/** "Oct" from "2026-10": the Table's switch, and "in Oct". */
export function monthAbbr(month: string): string {
  return format(midMonth(month), "MMM");
}

/** When a month's forfeits are shared out: the 1st of the next, "1 Nov". */
export function shareOutDay(month: string): string {
  return `1 ${monthAbbr(shiftMonth(month, 1))}`;
}

/** A housemate's whole name, or "A former housemate" for someone who has left. */
function nameIn(members: readonly Named[], userId: string | null): string {
  return (userId ? members.find((m) => m.userId === userId)?.name : undefined) ?? FOCUS_SHELL_COPY.formerHousemate;
}

/** A housemate's first name, or "A former housemate" for someone who has left. */
function firstNameIn(members: readonly Named[], userId: string | null): string {
  const member = userId ? members.find((m) => m.userId === userId) : undefined;
  return member ? firstName(member.name) : FOCUS_SHELL_COPY.formerHousemate;
}

/** As firstNameIn, mid-sentence: "a former housemate". */
function firstNameMid(members: readonly Named[], userId: string | null): string {
  return members.some((m) => m.userId === userId) ? firstNameIn(members, userId) : HOUSE_PAGE_COPY.formerHousemate;
}

/** As firstNameIn, but "You" for you. */
function called(members: readonly Named[], userId: string | null, me: string): string {
  return userId === me ? HOUSE_PAGE_COPY.you : firstNameIn(members, userId);
}

/** Segments joined by commas, neighbours of the same tone merged into one part. */
export function joinParts(segments: readonly (readonly MetaPart[])[]): MetaPart[] {
  const out: MetaPart[] = [];
  const push = (part: MetaPart) => {
    if (!part.text) return;
    const last = out[out.length - 1];
    if (last && Boolean(last.hazard) === Boolean(part.hazard)) last.text += part.text;
    else out.push({ ...part });
  };
  segments
    .filter((segment) => segment.some((part) => part.text))
    .forEach((segment, i) => {
      if (i > 0) push({ text: COMMA });
      segment.forEach(push);
    });
  return out;
}

/** Late and missed in hazard words, "7 late, 1 missed", marked with missed's X if any were missed, else late's clock. */
function lateMissedPart(late: number, missed: number): MetaPart {
  const mark = missed > 0 ? STATUS_MARK.missed : STATUS_MARK.late;
  return { text: HOUSE_PAGE_COPY.lateMissed(late, missed), hazard: true, icon: mark.icon ?? undefined };
}

/** Two or more months in words: "September", "August and September", "July, August and September". */
export function monthsInWords(months: readonly string[]): string {
  const words = months.map(monthWord);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} ${HOUSE_PAGE_COPY.and} ${words[words.length - 1]}`;
}

// The month card --------------------------------------------------------------

export interface MonthCardView {
  /** "October so far". */
  label: string;
  /** The Lead's words before its figure: "You’re up". */
  lead: string;
  /** The figure after them, "£4.01", or none when there's nothing to say. */
  figure: string | null;
  /** The figure is green: only when you're up. */
  good: boolean;
  /** "Nothing forfeited, shared out 1 Nov". */
  meta: string;
}

/** Your month so far, as if it ended now: up, down or nothing yet, and when it's shared out. */
export function monthCard(stake: Pick<StakeView, "month" | "projection">, me: string, currency: Currency): MonthCardView {
  const mine = stake.projection.find((p) => p.userId === me);
  const forfeited = mine?.forfeited ?? 0;
  const net = mine?.net ?? 0;
  const day = shareOutDay(stake.month);
  const label = HOUSE_PAGE_COPY.soFar(monthWord(stake.month));
  const meta = [
    forfeited > 0 ? HOUSE_PAGE_COPY.forfeited(formatMoney(forfeited, currency)) : HOUSE_PAGE_COPY.nothingForfeited,
    HOUSE_PAGE_COPY.sharedOut(day),
  ].join(COMMA);
  if (net > 0) return { label, lead: HOUSE_PAGE_COPY.up, figure: formatMoney(net, currency), good: true, meta };
  if (net < 0) return { label, lead: HOUSE_PAGE_COPY.down, figure: formatMoney(-net, currency), good: false, meta };
  if (forfeited === 0) {
    return { label, lead: HOUSE_PAGE_COPY.nothingYet, figure: null, good: false, meta: HOUSE_PAGE_COPY.sharedOutAlone(day) };
  }
  return { label, lead: HOUSE_PAGE_COPY.even, figure: null, good: false, meta };
}

// The Overview's figures --------------------------------------------------------

/** One of the Overview's figures: the figure, what it counts, and a quieter line under them. */
export interface OverviewFigure {
  key: "money" | "stake" | "people" | "johns";
  /** "£4.01", "4", or null while it's still being read. */
  value: string | null;
  label: string;
  note: string | null;
  /** The figure is green: only your month, and only when you're up. */
  good: boolean;
}

/**
 * The Overview's four figures, left to right: your month so far (what
 * you're up or down, else what you've forfeited, and when it's shared
 * out), the stake, how many live here, and the John list with its effort
 * in an average week. Money lost is said in words, not in colour, as the
 * month card did.
 */
export function overviewFigures(input: {
  /** The Stake's month and projection, once read. */
  stake?: Pick<StakeView, "month" | "projection">;
  /** The month to name before the Stake is read, `yyyy-MM`. */
  month: string;
  me: string;
  rules: Pick<HouseRules, "currency" | "stakeMinor">;
  housemates: number;
  /** The John list, once read. */
  johns?: readonly Pick<JohnDef, "points" | "everyWeeks">[];
}): OverviewFigure[] {
  const { stake, me, rules, housemates, johns } = input;
  const money = (minor: number) => formatMoney(minor, rules.currency);
  const month = monthWord(stake?.month ?? input.month);
  let mine: OverviewFigure = { key: "money", value: null, label: HOUSE_PAGE_COPY.forfeitedIn(month), note: null, good: false };
  if (stake) {
    const card = monthCard(stake, me, rules.currency);
    const own = stake.projection.find((p) => p.userId === me);
    const net = own?.net ?? 0;
    const forfeited = own?.forfeited ?? 0;
    mine =
      net > 0
        ? { key: "money", value: money(net), label: HOUSE_PAGE_COPY.upIn(month), note: card.meta, good: true }
        : net < 0
          ? { key: "money", value: money(-net), label: HOUSE_PAGE_COPY.downIn(month), note: card.meta, good: false }
          : {
              key: "money",
              value: money(forfeited),
              label: HOUSE_PAGE_COPY.forfeitedIn(month),
              note: HOUSE_PAGE_COPY.sharedOutAlone(shareOutDay(stake.month)),
              good: false,
            };
  }
  return [
    mine,
    { key: "stake", value: money(rules.stakeMinor), label: HOUSE_PAGE_COPY.stakeEach, note: null, good: false },
    { key: "people", value: String(housemates), label: HOUSE_PAGE_COPY.housemates(housemates), note: null, good: false },
    {
      key: "johns",
      value: johns ? String(johns.length) : null,
      label: HOUSE_PAGE_COPY.johnsListed(johns?.length ?? 0),
      note: johns && johns.length > 0 ? HOUSE_LOWER_COPY.perWeek(Math.round(weeklyEffort(johns))) : null,
      good: false,
    },
  ];
}

// Settling up -----------------------------------------------------------------

type LedgerMoney = Pick<LedgerRow, "user_id" | "kind" | "amount_minor" | "month">;

/**
 * The closed months someone still owes for, oldest first. Each closed
 * month left them owing or owed; what they were owed and what they've paid
 * clears their oldest debts first, and the months not yet cleared are
 * what's left.
 */
export function owedMonths(ledger: readonly LedgerMoney[], closedMonths: readonly string[], userId: string): string[] {
  const closed = new Set(closedMonths);
  const byMonth = new Map<string, number>();
  let credit = 0;
  for (const row of ledger) {
    if (row.user_id !== userId) continue;
    if (row.kind === "payment") credit += row.amount_minor;
    else if (closed.has(row.month)) byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.amount_minor);
  }
  const months = [...byMonth.keys()].sort();
  for (const month of months) credit += Math.max(0, byMonth.get(month)!);
  const owed: string[] = [];
  for (const month of months) {
    const debt = -Math.min(0, byMonth.get(month)!);
    if (debt === 0) continue;
    const cleared = Math.min(Math.max(credit, 0), debt);
    credit -= cleared;
    if (cleared < debt) owed.push(month);
  }
  return owed;
}

export interface SettleRow {
  key: string;
  /** The housemate on the other side. */
  userId: string;
  /** Their whole name, for the avatar's initials. */
  name: string;
  /** They owe you, and you mark it received; otherwise you owe them. */
  owedToYou: boolean;
  amount: number;
  /** "Tom owes you £1.34 for September", "You owe Priya £1.34 for September". */
  title: string;
  /** What happens next: "Waiting for Priya to confirm". */
  meta: string;
  /** "Mark £1.34 received", only on what a housemate owes you. */
  action: string | null;
  /** The same, to a screen reader, naming who paid: "Mark Tom’s £1.34 received". */
  spoken: string | null;
  /** The first of those: the page's one amber button. Later ones are outlined. */
  primary: boolean;
  /**
   * In a house that settles up in Splitwise, what's owed to you as it goes
   * in there: its description and the bare amount to copy ("4.01").
   */
  splitwise: { description: string; amount: string; copy: string; spoken: string } | null;
}

/**
 * What's left to do about a debt from closed months, as its meta line says
 * it wherever it shows (House's settle-up, a housemate's page): owed to you,
 * it's paid however you like; yours, it waits for them to confirm. With
 * someone who has left, neither can happen here: the database only takes a
 * payment between housemates.
 */
function settleMeta(t: Transfer, me: string, members: readonly Named[]): string {
  const other = t.to === me ? t.from : t.to;
  if (!members.some((m) => m.userId === other)) return HOUSE_PAGE_COPY.gone;
  return t.to === me ? HOUSE_PAGE_COPY.paidHowYouLike : HOUSE_PAGE_COPY.waitingFor(firstNameMid(members, t.to));
}

/**
 * Each settle-up between you and a housemate, from your side: what's owed to
 * you first (each with its button, the first one amber), then what you owe.
 * Nothing when you're square. Someone who has left gets no button: the
 * database only takes a payment from a housemate.
 */
export function settleRows(input: {
  transfers: readonly Transfer[];
  me: string;
  members: readonly Named[];
  currency: Currency;
  ledger: readonly LedgerMoney[];
  closedMonths: readonly string[];
  /** Absent: settled here. */
  settleIn?: SettleIn;
}): SettleRow[] {
  const { transfers, me, members, currency, ledger, closedMonths } = input;
  const splitwise = input.settleIn === "splitwise";
  const monthsOf = (userId: string) => monthsInWords(owedMonths(ledger, closedMonths, userId));
  const here = (userId: string) => members.some((m) => m.userId === userId);
  const owed = transfers
    .filter((t) => t.to === me && t.from !== me)
    .map((t): SettleRow => {
      const amount = formatMoney(t.amount, currency);
      const who = firstNameIn(members, t.from);
      const months = monthsOf(t.from);
      const inSplitwise = splitwise && here(t.from);
      const plain = moneyInput(t.amount);
      return {
        key: `${t.from}-${t.to}`,
        userId: t.from,
        name: nameIn(members, t.from),
        owedToYou: true,
        amount: t.amount,
        title: HOUSE_PAGE_COPY.owesYou(who, amount, months),
        meta: inSplitwise ? HOUSE_PAGE_COPY.splitwiseHow(who) : settleMeta(t, me, members),
        action: here(t.from) ? (inSplitwise ? HOUSE_PAGE_COPY.addedToSplitwise : HOUSE_PAGE_COPY.markReceived(amount)) : null,
        spoken: here(t.from)
          ? inSplitwise
            ? HOUSE_PAGE_COPY.addedToSplitwiseFrom(who, amount)
            : HOUSE_PAGE_COPY.markReceivedFrom(who, amount)
          : null,
        primary: false,
        splitwise: inSplitwise
          ? {
              description: HOUSE_PAGE_COPY.splitwiseDescription(months),
              amount: plain,
              copy: HOUSE_PAGE_COPY.copyAmount(plain),
              spoken: HOUSE_PAGE_COPY.copyAmountFrom(who, amount),
            }
          : null,
      };
    });
  const first = owed.find((row) => row.action);
  if (first) first.primary = true;
  const months = monthsOf(me);
  const owing = transfers
    .filter((t) => t.from === me && t.to !== me)
    .map((t): SettleRow => {
      const name = firstNameMid(members, t.to);
      return {
        key: `${t.from}-${t.to}`,
        userId: t.to,
        name: nameIn(members, t.to),
        owedToYou: false,
        amount: t.amount,
        title: HOUSE_PAGE_COPY.youOwe(name, formatMoney(t.amount, currency), months),
        meta: splitwise && here(t.to) ? HOUSE_PAGE_COPY.splitwiseWaiting(name) : settleMeta(t, me, members),
        action: null,
        spoken: null,
        primary: false,
        splitwise: null,
      };
    });
  return [...owed, ...owing];
}

// The Table -------------------------------------------------------------------

export interface TableLine {
  userId: string;
  me: boolean;
  /** "You", or their first name. */
  title: string;
  /** Their whole name, for the avatar's initials. */
  name: string;
  /** Points first, then what fits of: late and missed this month, time away, streak, tokens. */
  meta: MetaPart[];
  /** The month's money so far with its sign, "+£4.01"; null until the Stake is read. */
  money: string | null;
  /** Losing money this month: the figure goes in hazard. */
  losing: boolean;
}

/** A Table row's meta line says at most this many things after the points... */
const TABLE_EXTRAS = 2;
/** ...and no more letters than fit beside the money, in a column as wide as the narrowest phone's when it isn't said. */
const NARROWEST = 360;
/** A hazard mark takes about as much room as this many letters. */
const MARK_LETTERS = 3;
/** About how wide a letter of Meta (Overpass 14) is, and a character of the money in tabular Body. */
const META_LETTER = 7;
const MONEY_CHARACTER = 10;
/** Room kept for the money before the Stake is read, so the line doesn't lose its end when it lands: "+£4.01". */
const MONEY_GUESS = 6;

/** How long a meta line runs, in letters, its hazard mark included. */
function letters(parts: readonly MetaPart[]): number {
  return parts.reduce((n, part) => n + part.text.length + (part.icon ? MARK_LETTERS : 0), 0);
}

/**
 * How many letters of meta a Table row holds beside its money, in a content
 * column this wide: less the gutters and the group's inset each side (64),
 * the avatar and the gaps either side of the words (56), and the money
 * itself (`money`, as it's drawn; the room for a usual figure while it's
 * unread), at about 7 to a letter of Meta.
 */
export function tableMetaFit(columnWidth: number, money: string | null = null): number {
  const room = columnWidth - 120 - (money?.length ?? MONEY_GUESS) * MONEY_CHARACTER;
  return Math.max(0, Math.floor(room / META_LETTER));
}

/**
 * The Table's rows, in the standings' order (most points first): this week's
 * or the month's points, then what matters most about each housemate, and
 * the month's money trailing. Late and missed are always the month's.
 */
export function tableLines(input: {
  rows: readonly TableRow[];
  members: readonly PageMember[];
  me: string;
  /** `yyyy-MM`, for "in Oct". */
  month: string;
  /** The month's standings, for late and missed; null until read. */
  monthRows?: readonly TableRow[] | null;
  projection?: StakeView["projection"] | null;
  currency: Currency;
  away?: readonly AwayPeriod[] | null;
  /** Today in the house's zone, `yyyy-MM-dd`. */
  today: string;
  /** How wide the content column is, for how much of the meta line fits (`tableMetaFit`); the narrowest phone's when left out. */
  column?: number;
}): TableLine[] {
  const { members, me, projection } = input;
  return input.rows.map((row) => {
    const member = members.find((m) => m.userId === row.userId);
    const name = nameIn(members, row.userId);
    const record = input.monthRows?.find((r) => r.userId === row.userId);
    const period = input.away ? currentOrNext(input.away, row.userId, input.today) : null;
    const extras: MetaPart[][] = [
      record && (record.late || record.missed)
        ? [lateMissedPart(record.late, record.missed), { text: HOUSE_PAGE_COPY.inMonth(monthAbbr(input.month)) }]
        : [],
      record && record.covered ? [{ text: HOUSE_PAGE_COPY.covered(record.covered) }] : [],
      period ? [{ text: HOUSE_PAGE_COPY.away(dateRange(period.startsOn, period.endsOn)) }] : [],
      member && member.streak > 0 ? [{ text: HOUSE_PAGE_COPY.streak(member.streak) }] : [],
      member && member.immunityTokens > 0 ? [{ text: HOUSE_PAGE_COPY.immunity(member.immunityTokens) }] : [],
      member && member.swapTokens > 0 ? [{ text: HOUSE_PAGE_COPY.swap }] : [],
    ].filter((parts) => parts.length > 0);
    const net = projection ? (projection.find((p) => p.userId === row.userId)?.net ?? 0) : null;
    const money = net === null ? null : formatSigned(net, input.currency);
    const fit = tableMetaFit(input.column ?? NARROWEST, money);
    // The most important first; after the first, only what still fits.
    const said: MetaPart[][] = [[{ text: pointsLabel(row.points) }]];
    for (const extra of extras) {
      if (said.length > TABLE_EXTRAS) break;
      if (said.length > 1 && letters(joinParts([...said, extra])) > fit) break;
      said.push(extra);
    }
    return {
      userId: row.userId,
      me: row.userId === me,
      title: called(members, row.userId, me),
      name,
      meta: joinParts(said),
      money,
      losing: net !== null && net < 0,
    };
  });
}

/** How points and the stake work, in plain words, from the house's own rules. */
export function stakeRules(
  rules: Pick<HouseRules, "currency" | "stakeMinor" | "lateForfeitMinor" | "missedForfeitMinor">,
  awayMakeup: number,
): { label: string; body: string }[] {
  const money = (minor: number) => formatMoney(minor, rules.currency);
  return [
    { label: HOUSE_PAGE_COPY.rulesPoints, body: HOUSE_PAGE_COPY.rulesPointsBody },
    {
      label: HOUSE_PAGE_COPY.rulesStake,
      body: HOUSE_PAGE_COPY.rulesStakeBody(money(rules.stakeMinor), money(rules.lateForfeitMinor), money(rules.missedForfeitMinor)),
    },
    { label: HOUSE_PAGE_COPY.rulesImmunity, body: HOUSE_PAGE_COPY.rulesImmunityBody(IMMUNITY_EVERY, IMMUNITY_CAP) },
    { label: HOUSE_PAGE_COPY.rulesSwap, body: HOUSE_PAGE_COPY.rulesSwapBody },
    {
      label: HOUSE_PAGE_COPY.rulesShares,
      body: HOUSE_PAGE_COPY.rulesSharesBody(HOUSE_PAGE_COPY.makeup[awayMakeup] ?? HOUSE_PAGE_COPY.makeup[100]),
    },
  ];
}

// A housemate's page ----------------------------------------------------------

/** One row on a housemate's page: a title, one meta line, and maybe a value trailing. */
export interface PersonLine {
  key: string;
  title: string;
  meta: MetaPart[];
  value?: string;
  /** The value is money lost: it goes in hazard. */
  losing?: boolean;
}

function recordLine(key: string, title: string, row: TableRow): PersonLine {
  return {
    key,
    title,
    meta: joinParts([
      [{ text: PERSON_COPY.onTime(row.done) }],
      row.late || row.missed ? [lateMissedPart(row.late, row.missed)] : [],
      row.covered ? [{ text: PERSON_COPY.coveredFor(row.covered) }] : [],
    ]),
    value: pointsLabel(row.points),
  };
}

/** Their week and their month: points, how many on time, and late and missed when there were any. The month once it's read. */
export function recordLines(
  week: TableRow | null | undefined,
  month: TableRow | null | undefined,
  monthKey: string,
): PersonLine[] {
  return [
    week ? recordLine("week", PERSON_COPY.thisWeek, week) : null,
    month ? recordLine("month", monthWord(monthKey), month) : null,
  ].filter((line): line is PersonLine => line !== null);
}

/**
 * Where they stand against their fair share, in words and in points ("−3.5";
 * level has no figure). No balance means nothing has been dealt to them lately: level.
 */
export function shareLine(balance: BalanceRow | null | undefined, you: boolean): PersonLine {
  const points = balance?.balance ?? 0;
  const rounded = Math.round(points * 2) / 2;
  const words = Math.abs(rounded).toString();
  const value = formatBalance(points);
  const weeks = balance?.weeksToEven ?? 0;
  if (rounded < 0) {
    const meta = weeks > 0 ? PERSON_COPY.catchingUp(weeks) : PERSON_COPY.sinceJoining;
    return { key: "share", title: PERSON_COPY.behind(words, you), meta: [{ text: meta }], value };
  }
  if (rounded > 0) return { key: "share", title: PERSON_COPY.ahead(words, you), meta: [{ text: PERSON_COPY.easier }], value };
  // Level says it in the title, so no figure trails it: not the word again, nor a bare 0.
  return { key: "share", title: PERSON_COPY.level(you), meta: [{ text: PERSON_COPY.sinceJoining }] };
}

/** Their streak (and how far to the next immunity token), then the tokens they hold. */
export function perkLines(member: Pick<PageMember, "streak" | "immunityTokens" | "swapTokens">): PersonLine[] {
  const lines: PersonLine[] = [
    member.streak > 0
      ? {
          key: "streak",
          title: PERSON_COPY.streak(member.streak),
          meta: [
            {
              text:
                member.immunityTokens >= IMMUNITY_CAP
                  ? PERSON_COPY.fullImmunity
                  : PERSON_COPY.nextImmunity(IMMUNITY_EVERY - (member.streak % IMMUNITY_EVERY)),
            },
          ],
        }
      : { key: "streak", title: PERSON_COPY.noStreak, meta: [{ text: PERSON_COPY.startsStreak }] },
  ];
  if (member.immunityTokens > 0) {
    lines.push({ key: "immunity", title: PERSON_COPY.immunity(member.immunityTokens), meta: [{ text: PERSON_COPY.immunityMeta }] });
  }
  if (member.swapTokens > 0) lines.push({ key: "swap", title: PERSON_COPY.swap, meta: [{ text: PERSON_COPY.swapMeta }] });
  if (member.immunityTokens <= 0 && member.swapTokens <= 0) {
    lines.push({ key: "tokens", title: PERSON_COPY.noTokens, meta: [{ text: PERSON_COPY.noTokensMeta }] });
  }
  return lines;
}

/** The month's money so far for one housemate: forfeited (capped at the stake), their share, and the net. */
export function moneyLines(input: {
  projection: StakeView["projection"][number] | null | undefined;
  /** `yyyy-MM`, the month so far. */
  month: string;
  stakeMinor: number;
  /** Their month on the Table, for how many late and missed. */
  record?: TableRow | null;
  currency: Currency;
}): PersonLine[] {
  const { month, currency, record } = input;
  const p = input.projection ?? { forfeited: 0, forfeitedRaw: 0, received: 0, net: 0 };
  const why: MetaPart[] =
    p.forfeitedRaw > p.forfeited
      ? [{ text: PERSON_COPY.capped(formatMoney(input.stakeMinor, currency)) }]
      : record && (record.late || record.missed)
        ? [lateMissedPart(record.late, record.missed), { text: HOUSE_PAGE_COPY.inMonth(monthAbbr(month)) }]
        : [{ text: PERSON_COPY.noneForfeited }];
  return [
    {
      key: "forfeited",
      title: PERSON_COPY.forfeited,
      meta: why,
      value: formatSigned(-p.forfeited, currency),
      losing: p.forfeited > 0,
    },
    {
      key: "received",
      title: PERSON_COPY.share,
      meta: [{ text: PERSON_COPY.sharedOut(shareOutDay(month)) }],
      value: formatSigned(p.received, currency),
    },
    { key: "net", title: PERSON_COPY.net, meta: [{ text: PERSON_COPY.ifNow }], value: formatSigned(p.net, currency), losing: p.net < 0 },
  ];
}

/**
 * What a housemate owes you or is owed by you from closed months, as House's
 * settle-up says it. What they owe others, or others owe them, stays
 * between the two of them, as a payment's amount does.
 */
export function owingLines(input: {
  transfers: readonly Transfer[];
  personId: string;
  me: string;
  members: readonly Named[];
  currency: Currency;
  ledger: readonly LedgerMoney[];
  closedMonths: readonly string[];
}): PersonLine[] {
  const { me, members, currency } = input;
  return input.transfers
    .filter((t) => (t.from === input.personId || t.to === input.personId) && (t.from === me || t.to === me) && t.from !== t.to)
    .map((t) => {
      const amount = formatMoney(t.amount, currency);
      const months = monthsInWords(owedMonths(input.ledger, input.closedMonths, t.from));
      const title =
        t.from === me
          ? HOUSE_PAGE_COPY.youOwe(firstNameMid(members, t.to), amount, months)
          : HOUSE_PAGE_COPY.owesYou(firstNameIn(members, t.from), amount, months);
      return { key: `${t.from}-${t.to}`, title, meta: [{ text: settleMeta(t, me, members) }] };
    });
}

/** Their time away from today on, soonest first; none at all when there is none (the page says so). */
export function awayLines(periods: readonly AwayPeriod[], personId: string, today: string): PersonLine[] {
  const theirs = periods
    .filter((p) => p.userId === personId && p.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return theirs.map((p) => ({
    key: p.id,
    title: dateRange(p.startsOn, p.endsOn),
    meta: [{ text: [p.startsOn <= today ? PERSON_COPY.awayNow : PERSON_COPY.booked, p.note ?? ""].filter(Boolean).join(COMMA) }],
  }));
}

// Stake history ---------------------------------------------------------------

/** A ledger row as Stake history reads it: with the John a forfeit was for, while it can be read. */
export interface HistoryRow extends LedgerRow {
  john: { name: string; outcome: string | null; due_at?: string | null } | null;
}

/** When an entry happened: a forfeit on its John's due day (the month it counts in), anything else when it was written. */
function happened(row: HistoryRow): string {
  return (row.kind === "forfeit" && row.john?.due_at) || row.created_at;
}

export type HistoryKind = "late" | "missed" | "forfeit" | "share" | "cap_refund" | "payment" | "correction" | "other";

export interface HistoryLine {
  id: number;
  kind: HistoryKind;
  /** A forfeit names its John; a payment says who paid whom. */
  title: string;
  meta: string;
  /**
   * Signed from the entry's side of the ledger, as the Stake sums it: "−£1"
   * forfeited, "+£4.01" shared out, "+£2" over the stake and returned. A
   * payment you're in has no sign, "£1.34": the ledger books it the other
   * way round from the cash (the payer's row is "+", as it clears what they
   * owed), so a sign would read backwards. Null for a payment between two
   * others: its amount is only theirs to see, as on the Wall.
   */
  amount: string | null;
  /** Money lost: a forfeit, in hazard. */
  losing: boolean;
}

export interface HistoryMonth {
  month: string;
  /** "October 2026". */
  label: string;
  lines: HistoryLine[];
}

function historyLine(row: HistoryRow, input: { me: string; whole: boolean; members: readonly Named[]; currency: Currency; zone: string }): HistoryLine {
  const { me, whole, members, currency } = input;
  const day = dayLabel(new Date(happened(row)), input.zone);
  const whose = (words: string) => (whole ? [called(members, row.user_id, me), words] : [words]).join(COMMA);
  const signed = formatSigned(row.amount_minor, currency);
  switch (row.kind) {
    case "forfeit": {
      const outcome = row.john?.outcome;
      const kind: HistoryKind = outcome === "late" ? "late" : outcome === "missed" ? "missed" : "forfeit";
      const word = kind === "late" ? STAKE_HISTORY_COPY.late : kind === "missed" ? STAKE_HISTORY_COPY.missed : STAKE_HISTORY_COPY.forfeit;
      return {
        id: row.id,
        kind,
        title: row.john?.name ?? STAKE_HISTORY_COPY.aJohn,
        meta: whole ? [called(members, row.user_id, me), word.toLowerCase(), day].join(COMMA) : [word, day].join(COMMA),
        amount: signed,
        losing: row.amount_minor < 0,
      };
    }
    case "share":
      return { id: row.id, kind: "share", title: STAKE_HISTORY_COPY.share, meta: whose(day), amount: signed, losing: false };
    case "cap_refund":
      return { id: row.id, kind: "cap_refund", title: STAKE_HISTORY_COPY.capRefund, meta: whose(day), amount: signed, losing: false };
    case "payment": {
      // Each payment is two rows: + on the payer's side, − on the payee's.
      const payer = row.amount_minor > 0 ? row.user_id : row.counterparty;
      const payee = row.amount_minor > 0 ? row.counterparty : row.user_id;
      const to = payee === me ? STAKE_HISTORY_COPY.yourself : firstNameMid(members, payee);
      return {
        id: row.id,
        kind: "payment",
        title: STAKE_HISTORY_COPY.paid(called(members, payer, me), to),
        meta: STAKE_HISTORY_COPY.received(day),
        // stakeHistory hands over your own row of a payment you're in.
        // Unsigned: the ledger books it the other way round from the cash, so a sign would read backwards.
        amount: row.user_id === me ? formatMoney(Math.abs(row.amount_minor), currency) : null,
        losing: false,
      };
    }
    case "correction":
      // A reset after the month was shared out: the difference, put right this month.
      return {
        id: row.id,
        kind: "correction",
        title: row.john?.name ? STAKE_HISTORY_COPY.correctionOf(row.john.name) : STAKE_HISTORY_COPY.correction,
        meta: whose(day),
        amount: signed,
        losing: row.amount_minor < 0,
      };
    default:
      return { id: row.id, kind: "other", title: row.kind, meta: whose(day), amount: signed, losing: row.amount_minor < 0 };
  }
}

/**
 * The ledger by month, newest first, each month's entries newest first:
 * yours alone, or the whole house's, where a payment shows once rather than
 * twice: from your side if you're in it, otherwise from the payer's.
 */
export function stakeHistory(input: {
  ledger: readonly HistoryRow[];
  me: string;
  whole: boolean;
  members: readonly Named[];
  currency: Currency;
  zone: string;
}): HistoryMonth[] {
  const { me } = input;
  const mine = (r: HistoryRow) => r.user_id === me;
  const yours = (r: HistoryRow) => r.user_id === me || r.counterparty === me;
  const rows = input.ledger
    .filter((r) => (input.whole ? r.kind !== "payment" || (yours(r) ? mine(r) : r.amount_minor > 0) : mine(r)))
    .sort((a, b) => Date.parse(happened(b)) - Date.parse(happened(a)) || b.id - a.id);
  const months = new Map<string, HistoryLine[]>();
  for (const row of rows) {
    const lines = months.get(row.month) ?? [];
    lines.push(historyLine(row, input));
    months.set(row.month, lines);
  }
  return [...months.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({ month, label: monthLabel(month), lines: months.get(month)! }));
}
