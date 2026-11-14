import { currentOrNext, shiftMonth, type AwayPeriod } from "./away";
import { weeklyEffort, type JohnDef } from "./board";
import type { Currency, HouseRules, SettleIn } from "./domain";
import { dateIn, dateRange, firstName, pointsLabel, STATUS_MARK, type StatusIcon } from "./format";
import { formatMoney, formatSigned, moneyInput } from "./money";
import type { TableRow } from "./points";
import type { LedgerRow, StakeView, Transfer } from "./stake";
import { IMMUNITY_CAP, IMMUNITY_EVERY } from "./streak";
import type { Words } from "./words-for";
import { lateMissedLine, makeupKey, perWeekLine } from "./word-keys";

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

export type Named = Pick<PageMember, "userId" | "name">;

export const COMMA = ", ";

/** The 15th of a `yyyy-MM` month at noon UTC: the same month in every time zone. */
function midMonth(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15, 12));
}

/** "October" from "2026-10". */
export function monthWord(month: string, words: Words): string {
  return dateIn(midMonth(month), "month", "UTC", words);
}

/** "Oct" from "2026-10": the Table's switch, and "in Oct". */
export function monthAbbr(month: string, words: Words): string {
  return dateIn(midMonth(month), "monthShort", "UTC", words);
}

/** When a month's forfeits are shared out: the 1st of the next, "1 Nov". */
export function shareOutDay(month: string, words: Words): string {
  return `1 ${monthAbbr(shiftMonth(month, 1), words)}`;
}

/** A housemate's whole name, or "A former housemate" for someone who has left. */
function nameIn(members: readonly Named[], userId: string | null, words: Words): string {
  return (userId ? members.find((m) => m.userId === userId)?.name : undefined) ?? words('common.shell.formerHousemate');
}

/** A housemate's first name, or "A former housemate" for someone who has left. */
export function firstNameIn(members: readonly Named[], userId: string | null, words: Words): string {
  const member = userId ? members.find((m) => m.userId === userId) : undefined;
  return member ? firstName(member.name) : words('common.shell.formerHousemate');
}

/** As firstNameIn, mid-sentence: "a former housemate". */
export function firstNameMid(members: readonly Named[], userId: string | null, words: Words): string {
  return members.some((m) => m.userId === userId) ? firstNameIn(members, userId, words) : words('house.page.formerHousemate');
}

/** As firstNameIn, but "You" for you. */
export function called(members: readonly Named[], userId: string | null, me: string, words: Words): string {
  return userId === me ? words('house.page.you') : firstNameIn(members, userId, words);
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
export function lateMissedPart(late: number, missed: number, words: Words): MetaPart {
  const mark = missed > 0 ? STATUS_MARK.missed : STATUS_MARK.late;
  return { text: lateMissedLine(late, missed, words), hazard: true, icon: mark.icon ?? undefined };
}

/** Two or more months in words: "September", "August and September", "July, August and September". */
export function monthsInWords(months: readonly string[], words: Words): string {
  const names = months.map((month) => monthWord(month, words));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${words('house.page.and')} ${names[names.length - 1]}`;
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
export function monthCard(stake: Pick<StakeView, "month" | "projection">, me: string, currency: Currency, words: Words): MonthCardView {
  const mine = stake.projection.find((p) => p.userId === me);
  const forfeited = mine?.forfeited ?? 0;
  const net = mine?.net ?? 0;
  const day = shareOutDay(stake.month, words);
  const label = words('house.page.soFar', { month: monthWord(stake.month, words) });
  const meta = [
    forfeited > 0 ? words('house.page.forfeited', { amount: formatMoney(forfeited, currency, words) }) : words('house.page.nothingForfeited'),
    words('house.page.sharedOut', { day }),
  ].join(COMMA);
  if (net > 0) return { label, lead: words('house.page.up'), figure: formatMoney(net, currency, words), good: true, meta };
  if (net < 0) return { label, lead: words('house.page.down'), figure: formatMoney(-net, currency, words), good: false, meta };
  if (forfeited === 0) {
    return { label, lead: words('house.page.nothingYet'), figure: null, good: false, meta: words('house.page.sharedOutAlone', { day }) };
  }
  return { label, lead: words('house.page.even'), figure: null, good: false, meta };
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
  /** The reader's words, which count the people. */
  words: Words;
  /** The John list, once read. */
  johns?: readonly Pick<JohnDef, "points" | "everyWeeks">[];
}, words: Words): OverviewFigure[] {
  const { stake, me, rules, housemates, johns } = input;
  const money = (minor: number) => formatMoney(minor, rules.currency, words);
  const month = monthWord(stake?.month ?? input.month, words);
  let mine: OverviewFigure = { key: "money", value: null, label: words('house.page.forfeitedIn', { month }), note: null, good: false };
  if (stake) {
    const card = monthCard(stake, me, rules.currency, words);
    const own = stake.projection.find((p) => p.userId === me);
    const net = own?.net ?? 0;
    const forfeited = own?.forfeited ?? 0;
    mine =
      net > 0
        ? { key: "money", value: money(net), label: words('house.page.upIn', { month }), note: card.meta, good: true }
        : net < 0
          ? { key: "money", value: money(-net), label: words('house.page.downIn', { month }), note: card.meta, good: false }
          : {
              key: "money",
              value: money(forfeited),
              label: words('house.page.forfeitedIn', { month }),
              note: words('house.page.sharedOutAlone', { day: shareOutDay(stake.month, words) }),
              good: false,
            };
  }
  return [
    mine,
    { key: "stake", value: money(rules.stakeMinor), label: words('house.page.stakeEach'), note: null, good: false },
    { key: "people", value: String(housemates), label: input.words("house.page.membersLabel", { count: housemates }), note: null, good: false },
    {
      key: "johns",
      value: johns ? String(johns.length) : null,
      label: words('house.page.johnsListed', { n: johns?.length ?? 0 }),
      note: johns && johns.length > 0 ? perWeekLine(Math.round(weeklyEffort(johns)), words) : null,
      good: false,
    },
  ];
}

// Settling up -----------------------------------------------------------------

export type LedgerMoney = Pick<LedgerRow, "user_id" | "kind" | "amount_minor" | "month">;

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
export function settleMeta(t: Transfer, me: string, members: readonly Named[], words: Words): string {
  const other = t.to === me ? t.from : t.to;
  if (!members.some((m) => m.userId === other)) return words('house.page.gone');
  return t.to === me ? words('house.page.paidHowYouLike') : words('house.page.waitingFor', { name: firstNameMid(members, t.to, words) });
}

/** What the settle-up rows are built from. */
interface SettleInput {
  transfers: readonly Transfer[];
  me: string;
  members: readonly Named[];
  currency: Currency;
  ledger: readonly LedgerMoney[];
  closedMonths: readonly string[];
  /** Absent: settled here. */
  settleIn?: SettleIn;
}

/** The months someone's money is owed for, in words ("" when none). */
const owedFor = (input: SettleInput, userId: string, words: Words) => monthsInWords(owedMonths(input.ledger, input.closedMonths, userId), words);

/** Money someone owes me: what to press once it's come, or how to add it to Splitwise. */
function owedRow(t: Transfer, input: SettleInput, words: Words): SettleRow {
  const { me, members } = input;
  const amount = formatMoney(t.amount, input.currency, words);
  const who = firstNameIn(members, t.from, words);
  const months = owedFor(input, t.from, words);
  const here = members.some((m) => m.userId === t.from);
  const inSplitwise = input.settleIn === "splitwise" && here;
  const plain = moneyInput(t.amount);
  const said = { name: who, amount };
  return {
    key: `${t.from}-${t.to}`,
    userId: t.from,
    name: nameIn(members, t.from, words),
    owedToYou: true,
    amount: t.amount,
    title: months ? words('house.page.owesYouFor', { ...said, months }) : words('house.page.owesYou', said),
    meta: inSplitwise ? words('house.page.splitwiseHow', { name: who }) : settleMeta(t, me, members, words),
    action: here ? (inSplitwise ? words('house.page.addedToSplitwise') : words('house.page.markReceived', { amount })) : null,
    spoken: here ? words(inSplitwise ? 'house.page.addedToSplitwiseFrom' : 'house.page.markReceivedFrom', said) : null,
    primary: false,
    splitwise: inSplitwise
      ? {
          description: months ? words('house.page.splitwiseDescriptionFor', { months }) : words('house.page.splitwiseDescription'),
          amount: plain,
          copy: words('house.page.copyAmount', { plain }),
          spoken: words('house.page.copyAmountFrom', said),
        }
      : null,
  };
}

/** Money I owe someone: nothing to press, they mark it once it's come. */
function owingRow(t: Transfer, input: SettleInput, words: Words): SettleRow {
  const { me, members } = input;
  const name = firstNameMid(members, t.to, words);
  const months = owedFor(input, me, words);
  const amount = formatMoney(t.amount, input.currency, words);
  const inSplitwise = input.settleIn === "splitwise" && members.some((m) => m.userId === t.to);
  return {
    key: `${t.from}-${t.to}`,
    userId: t.to,
    name: nameIn(members, t.to, words),
    owedToYou: false,
    amount: t.amount,
    title: months ? words('house.page.youOweFor', { name, amount, months }) : words('house.page.youOwe', { name, amount }),
    meta: inSplitwise ? words('house.page.splitwiseWaiting', { name }) : settleMeta(t, me, members, words),
    action: null,
    spoken: null,
    primary: false,
    splitwise: null,
  };
}

/**
 * Each settle-up between you and a housemate, from your side: what's owed to
 * you first (each with its button, the first one amber), then what you owe.
 * Nothing when you're square. Someone who has left gets no button: the
 * database only takes a payment from a housemate.
 */
export function settleRows(input: SettleInput, words: Words): SettleRow[] {
  const { transfers, me } = input;
  const owed = transfers.filter((t) => t.to === me && t.from !== me).map((t) => owedRow(t, input, words));
  const first = owed.find((row) => row.action);
  if (first) first.primary = true;
  const owing = transfers.filter((t) => t.from === me && t.to !== me).map((t) => owingRow(t, input, words));
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
}, words: Words): TableLine[] {
  const { members, me, projection } = input;
  return input.rows.map((row) => {
    const member = members.find((m) => m.userId === row.userId);
    const name = nameIn(members, row.userId, words);
    const record = input.monthRows?.find((r) => r.userId === row.userId);
    const period = input.away ? currentOrNext(input.away, row.userId, input.today) : null;
    const extras: MetaPart[][] = [
      record && (record.late || record.missed)
        ? [lateMissedPart(record.late, record.missed, words), { text: words('house.page.inMonth', { month: monthAbbr(input.month, words) }) }]
        : [],
      record && record.covered ? [{ text: words('house.page.covered', { n: record.covered }) }] : [],
      period ? [{ text: words('house.page.away', { range: dateRange(period.startsOn, period.endsOn, words) }) }] : [],
      member && member.streak > 0 ? [{ text: words('house.page.streak', { weeks: member.streak }) }] : [],
      member && member.immunityTokens > 0 ? [{ text: words('house.page.immunity', { skips: member.immunityTokens }) }] : [],
      member && member.swapTokens > 0 ? [{ text: words('house.page.swap') }] : [],
    ].filter((parts) => parts.length > 0);
    const net = projection ? (projection.find((p) => p.userId === row.userId)?.net ?? 0) : null;
    const money = net === null ? null : formatSigned(net, input.currency, words);
    const fit = tableMetaFit(input.column ?? NARROWEST, money);
    // The most important first; after the first, only what still fits.
    const said: MetaPart[][] = [[{ text: pointsLabel(row.points, words) }]];
    for (const extra of extras) {
      if (said.length > TABLE_EXTRAS) break;
      if (said.length > 1 && letters(joinParts([...said, extra])) > fit) break;
      said.push(extra);
    }
    return {
      userId: row.userId,
      me: row.userId === me,
      title: called(members, row.userId, me, words),
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
  awayMakeup: number, words: Words,
): { label: string; body: string }[] {
  const money = (minor: number) => formatMoney(minor, rules.currency, words);
  return [
    { label: words('house.page.rulesPoints'), body: words('house.page.rulesPointsBody') },
    {
      label: words('house.page.rulesStake'),
      body: words('house.page.rulesStakeBody', { stake: money(rules.stakeMinor), late: money(rules.lateForfeitMinor), missed: money(rules.missedForfeitMinor) }),
    },
    { label: words('house.page.rulesImmunity'), body: words('house.page.rulesImmunityBody', { every: IMMUNITY_EVERY, cap: IMMUNITY_CAP }) },
    { label: words('house.page.rulesSwap'), body: words('house.page.rulesSwapBody') },
    {
      label: words('house.page.rulesShares'),
      body: words('house.page.rulesSharesBody', { makeup: words(`house.page.makeup.${makeupKey(awayMakeup)}`) }),
    },
  ];
}
