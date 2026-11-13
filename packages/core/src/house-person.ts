import { type AwayPeriod } from "./away";
import type { BalanceRow } from "./deal";
import type { Currency } from "./domain";
import { dateRange, dayLabel, formatBalance, monthLabel, pointsLabel } from "./format";
import { formatMoney, formatSigned } from "./money";
import type { TableRow } from "./points";
import type { LedgerRow, StakeView, Transfer } from "./stake";
import { IMMUNITY_CAP, IMMUNITY_EVERY } from "./streak";
import type { Words } from "./words-for";
import { called, COMMA, firstNameIn, firstNameMid, joinParts, lateMissedPart, LedgerMoney, MetaPart, monthAbbr, monthsInWords, monthWord, Named, owedMonths, PageMember, settleMeta, shareOutDay } from "./house-page";

// A person's page on House and the stake's history: their record, share,
// perks, money and time away as lines, and each month's stake as it was settled.

/** One row on a housemate's page: a title, one meta line, and maybe a value trailing. */
export interface PersonLine {
  key: string;
  title: string;
  meta: MetaPart[];
  value?: string;
  /** The value is money lost: it goes in hazard. */
  losing?: boolean;
}

function recordLine(key: string, title: string, row: TableRow, words: Words): PersonLine {
  return {
    key,
    title,
    meta: joinParts([
      [{ text: words('people.person.onTime', { n: row.done }) }],
      row.late || row.missed ? [lateMissedPart(row.late, row.missed, words)] : [],
      row.covered ? [{ text: words('people.person.coveredFor', { n: row.covered }) }] : [],
    ]),
    value: pointsLabel(row.points, words),
  };
}

/** Their week and their month: points, how many on time, and late and missed when there were any. The month once it's read. */
export function recordLines(
  week: TableRow | null | undefined,
  month: TableRow | null | undefined,
  monthKey: string, words: Words,
): PersonLine[] {
  return [
    week ? recordLine("week", words('people.person.thisWeek'), week, words) : null,
    month ? recordLine("month", monthWord(monthKey, words), month, words) : null,
  ].filter((line): line is PersonLine => line !== null);
}

/**
 * Where they stand against their fair share, in words and in points ("−3.5";
 * level has no figure). No balance means nothing has been dealt to them lately: level.
 */
export function shareLine(balance: BalanceRow | null | undefined, you: boolean, words: Words): PersonLine {
  const points = balance?.balance ?? 0;
  const rounded = Math.round(points * 2) / 2;
  const figure = Math.abs(rounded).toString();
  const value = formatBalance(points, words);
  const weeks = balance?.weeksToEven ?? 0;
  if (rounded < 0) {
    const meta = weeks > 0 ? words('people.person.catchingUp', { weeks }) : words('people.person.sinceJoining');
    return { key: "share", title: words('people.person.behind', { points: figure, you }), meta: [{ text: meta }], value };
  }
  if (rounded > 0) return { key: "share", title: words('people.person.ahead', { points: figure, you }), meta: [{ text: words('people.person.easier') }], value };
  // Level says it in the title, so no figure trails it: not the word again, nor a bare 0.
  return { key: "share", title: words('people.person.level', { you }), meta: [{ text: words('people.person.sinceJoining') }] };
}

/** Their streak (and how far to the next immunity token), then the tokens they hold. */
export function perkLines(member: Pick<PageMember, "streak" | "immunityTokens" | "swapTokens">, words: Words): PersonLine[] {
  const lines: PersonLine[] = [
    member.streak > 0
      ? {
          key: "streak",
          title: words('people.person.streak', { weeks: member.streak }),
          meta: [
            {
              text:
                member.immunityTokens >= IMMUNITY_CAP
                  ? words('people.person.fullImmunity')
                  : words('people.person.nextImmunity', { weeks: IMMUNITY_EVERY - (member.streak % IMMUNITY_EVERY) }),
            },
          ],
        }
      : { key: "streak", title: words('people.person.noStreak'), meta: [{ text: words('people.person.startsStreak') }] },
  ];
  if (member.immunityTokens > 0) {
    lines.push({ key: "immunity", title: words('people.person.immunity', { n: member.immunityTokens }), meta: [{ text: words('people.person.immunityMeta') }] });
  }
  if (member.swapTokens > 0) lines.push({ key: "swap", title: words('people.person.swap'), meta: [{ text: words('people.person.swapMeta') }] });
  if (member.immunityTokens <= 0 && member.swapTokens <= 0) {
    lines.push({ key: "tokens", title: words('people.person.noTokens'), meta: [{ text: words('people.person.noTokensMeta') }] });
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
}, words: Words): PersonLine[] {
  const { month, currency, record } = input;
  const p = input.projection ?? { forfeited: 0, forfeitedRaw: 0, received: 0, net: 0 };
  const why: MetaPart[] =
    p.forfeitedRaw > p.forfeited
      ? [{ text: words('people.person.capped', { stake: formatMoney(input.stakeMinor, currency, words) }) }]
      : record && (record.late || record.missed)
        ? [lateMissedPart(record.late, record.missed, words), { text: words('house.page.inMonth', { month: monthAbbr(month, words) }) }]
        : [{ text: words('people.person.noneForfeited') }];
  return [
    {
      key: "forfeited",
      title: words('people.person.forfeited'),
      meta: why,
      value: formatSigned(-p.forfeited, currency, words),
      losing: p.forfeited > 0,
    },
    {
      key: "received",
      title: words('people.person.share'),
      meta: [{ text: words('people.person.sharedOut', { day: shareOutDay(month, words) }) }],
      value: formatSigned(p.received, currency, words),
    },
    { key: "net", title: words('people.person.net'), meta: [{ text: words('people.person.ifNow') }], value: formatSigned(p.net, currency, words), losing: p.net < 0 },
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
}, words: Words): PersonLine[] {
  const { me, members, currency } = input;
  return input.transfers
    .filter((t) => (t.from === input.personId || t.to === input.personId) && (t.from === me || t.to === me) && t.from !== t.to)
    .map((t) => {
      const amount = formatMoney(t.amount, currency, words);
      const months = monthsInWords(owedMonths(input.ledger, input.closedMonths, t.from), words);
      const title =
        t.from === me
          ? months
            ? words('house.page.youOweFor', { name: firstNameMid(members, t.to, words), amount, months })
            : words('house.page.youOwe', { name: firstNameMid(members, t.to, words), amount })
          : months
            ? words('house.page.owesYouFor', { name: firstNameIn(members, t.from, words), amount, months })
            : words('house.page.owesYou', { name: firstNameIn(members, t.from, words), amount });
      return { key: `${t.from}-${t.to}`, title, meta: [{ text: settleMeta(t, me, members, words) }] };
    });
}

/** Their time away from today on, soonest first; none at all when there is none (the page says so). */
export function awayLines(periods: readonly AwayPeriod[], personId: string, today: string, words: Words): PersonLine[] {
  const theirs = periods
    .filter((p) => p.userId === personId && p.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return theirs.map((p) => ({
    key: p.id,
    title: dateRange(p.startsOn, p.endsOn, words),
    meta: [{ text: [p.startsOn <= today ? words('people.person.awayNow') : words('people.person.booked'), p.note ?? ""].filter(Boolean).join(COMMA) }],
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

function historyLine(row: HistoryRow, input: { me: string; whole: boolean; members: readonly Named[]; currency: Currency; zone: string }, words: Words): HistoryLine {
  const { me, whole, members, currency } = input;
  const day = dayLabel(new Date(happened(row)), input.zone, words);
  const whose = (text: string) => (whole ? [called(members, row.user_id, me, words), text] : [text]).join(COMMA);
  const signed = formatSigned(row.amount_minor, currency, words);
  switch (row.kind) {
    case "forfeit": {
      const outcome = row.john?.outcome;
      const kind: HistoryKind = outcome === "late" ? "late" : outcome === "missed" ? "missed" : "forfeit";
      const word = kind === "late" ? words('house.stake.late') : kind === "missed" ? words('house.stake.missed') : words('house.stake.forfeit');
      return {
        id: row.id,
        kind,
        title: row.john?.name ?? words('house.stake.aJohn'),
        meta: whole ? [called(members, row.user_id, me, words), word.toLowerCase(), day].join(COMMA) : [word, day].join(COMMA),
        amount: signed,
        losing: row.amount_minor < 0,
      };
    }
    case "share":
      return { id: row.id, kind: "share", title: words('house.stake.share'), meta: whose(day), amount: signed, losing: false };
    case "cap_refund":
      return { id: row.id, kind: "cap_refund", title: words('house.stake.capRefund'), meta: whose(day), amount: signed, losing: false };
    case "payment": {
      // Each payment is two rows: + on the payer's side, − on the payee's.
      const payer = row.amount_minor > 0 ? row.user_id : row.counterparty_user_id;
      const payee = row.amount_minor > 0 ? row.counterparty_user_id : row.user_id;
      const to = payee === me ? words('house.stake.yourself') : firstNameMid(members, payee, words);
      return {
        id: row.id,
        kind: "payment",
        title: words('house.stake.paid', { from: called(members, payer, me, words), to }),
        meta: words('house.stake.received', { day }),
        // stakeHistory hands over your own row of a payment you're in.
        // Unsigned: the ledger books it the other way round from the cash, so a sign would read backwards.
        amount: row.user_id === me ? formatMoney(Math.abs(row.amount_minor), currency, words) : null,
        losing: false,
      };
    }
    case "correction":
      // A reset after the month was shared out: the difference, put right this month.
      return {
        id: row.id,
        kind: "correction",
        title: row.john?.name ? words('house.stake.correctionOf', { john: row.john.name }) : words('house.stake.correction'),
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
}, words: Words): HistoryMonth[] {
  const { me } = input;
  const mine = (r: HistoryRow) => r.user_id === me;
  const yours = (r: HistoryRow) => r.user_id === me || r.counterparty_user_id === me;
  const rows = input.ledger
    .filter((r) => (input.whole ? r.kind !== "payment" || (yours(r) ? mine(r) : r.amount_minor > 0) : mine(r)))
    .sort((a, b) => Date.parse(happened(b)) - Date.parse(happened(a)) || b.id - a.id);
  const months = new Map<string, HistoryLine[]>();
  for (const row of rows) {
    const lines = months.get(row.month) ?? [];
    lines.push(historyLine(row, input, words));
    months.set(row.month, lines);
  }
  return [...months.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({ month, label: monthLabel(month, words), lines: months.get(month)! }));
}
