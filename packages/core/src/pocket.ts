import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import type { Currency } from "./domain";
import { monthWord, shareOutDay } from "./house-page";
import { firstName, monthLabel } from "./format";
import { formatMoney } from "./money";
import type { Words } from "./words-for";

/**
 * Pocket money, family step 3 (docs/specs/family-houses.md): each John a
 * parent OKs earns a kid what it says, up to the family's cap a month (the
 * database works out each earning, pocket_earn). After the month, a parent
 * pays each kid outside Jonz and taps Paid (pay_pocket_money).
 */

/** A John's earning, as read from pocket_earnings. */
export interface PocketEarningRow {
  user_id: string;
  month: string;
  amount_minor: number;
}

/** A payment a parent marked, as read from pocket_pays. */
export interface PocketPayRow {
  user_id: string;
  month: string;
  amount_minor: number;
  paid_by: string | null;
  created_at: string;
}

/** A kid's month that's over and not all paid yet. */
export interface PocketOwed {
  userId: string;
  month: string;
  amount: number;
}

/** One kid's month in the history. */
export interface PocketMonthKid {
  userId: string;
  earned: number;
  paid: number;
  pays: { amount: number; paidBy: string | null; at: string }[];
}

export interface PocketView {
  /** `yyyy-MM`, the house's month now. */
  month: string;
  /** What every kid has earned so far this month. */
  soFar: number;
  /** Each kid's earnings so far this month (kids with none are 0). */
  earned: Record<string, number>;
  /** Months that are over with something still to pay, oldest first. */
  owed: PocketOwed[];
  /** Every month with an earning, newest first, each kid's earned and paid. */
  history: { month: string; kids: PocketMonthKid[] }[];
}

/** Money as a kid says it: "50p" or "50¢" under a pound or a dollar, otherwise as usual. */
export function pocketMoney(minor: number, currency: Currency): string {
  if (minor > 0 && minor < 100) {
    if (currency === "GBP") return `${minor}p`;
    if (currency === "USD" || currency === "CAD") return `${minor}¢`;
  }
  return formatMoney(minor, currency);
}

/** The month card, the Table and the history from what was earned and paid. */
export function pocketView(input: {
  earnings: readonly PocketEarningRow[];
  pays: readonly PocketPayRow[];
  /** The kids, in the house's order. */
  kids: readonly string[];
  month: string;
}): PocketView {
  const { earnings, pays, kids, month } = input;
  const key = (userId: string, m: string) => `${m} ${userId}`;
  const earnedBy = new Map<string, number>();
  const paidBy = new Map<string, number>();
  for (const e of earnings) earnedBy.set(key(e.user_id, e.month), (earnedBy.get(key(e.user_id, e.month)) ?? 0) + e.amount_minor);
  for (const p of pays) paidBy.set(key(p.user_id, p.month), (paidBy.get(key(p.user_id, p.month)) ?? 0) + p.amount_minor);

  const earned: Record<string, number> = {};
  for (const kid of kids) earned[kid] = earnedBy.get(key(kid, month)) ?? 0;
  const soFar = earnings.filter((e) => e.month === month).reduce((sum, e) => sum + e.amount_minor, 0);

  const months = [...new Set([...earnings.map((e) => e.month), ...pays.map((p) => p.month)])].sort();
  // Anyone who earned, kids first in the house's order, then anyone who has since left.
  const people = [...kids, ...new Set(earnings.map((e) => e.user_id).filter((u) => !kids.includes(u)))];
  const owed: PocketOwed[] = [];
  for (const m of months.filter((m) => m < month)) {
    for (const userId of people) {
      const amount = (earnedBy.get(key(userId, m)) ?? 0) - (paidBy.get(key(userId, m)) ?? 0);
      if (amount > 0 && kids.includes(userId)) owed.push({ userId, month: m, amount });
    }
  }
  const history = [...months].reverse().map((m) => ({
    month: m,
    kids: people
      .map((userId) => ({
        userId,
        earned: earnedBy.get(key(userId, m)) ?? 0,
        paid: paidBy.get(key(userId, m)) ?? 0,
        pays: pays
          .filter((p) => p.user_id === userId && p.month === m)
          .map((p) => ({ amount: p.amount_minor, paidBy: p.paid_by, at: p.created_at }))
          .sort((a, b) => a.at.localeCompare(b.at)),
      }))
      .filter((k) => k.earned > 0 || k.paid > 0),
  }));
  return { month, soFar, earned, owed, history };
}

/** The month card's top: "November so far", "£7.20 earned so far", "Pay day is 1 Dec". */
export function pocketCard(view: Pick<PocketView, "month" | "soFar">, currency: Currency, words: Words) {
  return {
    label: words('house.pocket.monthSoFar', { month: monthWord(view.month) }),
    title: words('house.pocket.earnedSoFar', { money: pocketMoney(view.soFar, currency) }),
    payDay: words('house.pocket.payDay', { day: shareOutDay(view.month) }),
  };
}

/** One kid's month still to pay, as House shows it. */
export interface PayRow {
  key: string;
  userId: string;
  month: string;
  name: string;
  title: string;
  meta: string;
  /** "Paid Maya £6.50", for a parent; null for a kid, who just sees it's on its way. */
  action: string | null;
  /** The page's first Paid is its amber button. */
  primary: boolean;
}

/**
 * What's still to pay, oldest first: for a parent, "Pay Maya £6.50 for
 * September" with Paid under it; for a kid, only their own, on its way.
 */
export function payRows(input: {
  owed: readonly PocketOwed[];
  members: readonly { userId: string; name: string }[];
  me: string;
  parent: boolean;
  currency: Currency;
}, words: Words): PayRow[] {
  const { members, me, parent, currency } = input;
  const owed = parent ? input.owed : input.owed.filter((o) => o.userId === me);
  return owed.map((o, i) => {
    const name = firstName(members.find((m) => m.userId === o.userId)?.name ?? "");
    const money = pocketMoney(o.amount, currency);
    const month = monthWord(o.month);
    return {
      key: `${o.month} ${o.userId}`,
      userId: o.userId,
      month: o.month,
      name,
      title: parent ? words('house.pocket.pay', { kid: name, money, month }) : words('house.pocket.owedYou', { money, month }),
      meta: parent ? words('house.pocket.payHow') : words('house.pocket.payDayKid'),
      action: parent ? words('house.pocket.paid', { kid: name, money }) : null,
      primary: parent && i === 0,
    };
  });
}

/** How pocket money works, in plain words with the family's own cap: the Table's sheet in a family. */
export function pocketRules(capMinor: number, currency: Currency, words: Words): { label: string; body: string }[] {
  return [
    { label: words('house.pocket.earningLabel'), body: words('house.pocket.earningBody', { cap: formatMoney(capMinor, currency) }) },
    { label: words('house.pocket.payDayLabel'), body: words('house.pocket.payDayBody') },
    { label: words('house.pocket.pointsLabel'), body: words('house.pocket.pointsBody') },
  ];
}

/** One kid's month on Pocket money history. */
export interface PocketHistoryLine {
  key: string;
  userId: string;
  name: string;
  /** What they earned that month. */
  value: string;
  /** So far, paid by whom and when, or what's still to pay. */
  meta: string;
}

/** Pocket money history: each month, newest first, each kid's earnings and whether they're paid. */
export function pocketHistory(input: {
  view: Pick<PocketView, "history" | "month">;
  members: readonly { userId: string; name: string }[];
  currency: Currency;
  zone: string;
}, words: Words): { month: string; label: string; lines: PocketHistoryLine[] }[] {
  const { view, members, currency, zone } = input;
  const nameOf = (userId: string | null) => firstName(members.find((m) => m.userId === userId)?.name ?? words('house.pocket.someone'));
  return view.history.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    lines: m.kids.map((k) => {
      const owed = k.earned - k.paid;
      const last = k.pays.at(-1);
      const meta =
        m.month >= view.month
          ? words('house.pocket.historySoFar')
          : owed > 0
            ? words('house.pocket.historyOwed', { money: pocketMoney(owed, currency) })
            : last
              ? words('house.pocket.historyPaid', { parent: nameOf(last.paidBy), day: format(new Date(last.at), "d MMM", { in: tz(zone) }) })
              : words('house.pocket.historySoFar');
      return { key: `${m.month} ${k.userId}`, userId: k.userId, name: nameOf(k.userId), value: pocketMoney(k.earned, currency), meta };
    }),
  }));
}
