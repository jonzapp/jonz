import type { ListFacet, ListWhen } from "./admin-list";
import type { PassPlan } from "./pass";

// The owner's Overview and Houses (docs/specs/owner-admin.md, "Overview" and
// "Houses"). The database counts and finds (supabase/migrations/
// 20261128090000_owner_houses.sql); these are the words, and the figures in
// sentences.

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (count: number) => count.toLocaleString("en-GB");
const day = (iso: string) => {
  const at = new Date(iso);
  return `${at.getUTCDate()} ${MONTH[at.getUTCMonth()]}`;
};
const dayYear = (iso: string) => `${day(iso)} ${new Date(iso).getUTCFullYear()}`;
/** A date with no time ("2026-11-02"), read as that day wherever you are. */
const plainDay = (date: string) => day(`${date}T12:00:00Z`);

/** "2 min ago", "3 h ago", "4 days ago", "12 Oct". */
export function houseAgo(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return days === 1 ? "yesterday" : `${days} days ago`;
  return day(iso);
}

/** "74%", or null when nothing came due. */
export function percentOf(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  return `${Math.round((part / whole) * 100)}%`;
}

// --- Houses ------------------------------------------------------------------------------

/** A house as the list shows it. */
export interface HouseRow {
  id: string;
  name: string;
  joinCode: string;
  people: number;
  passPlan: PassPlan;
  passUntil: string | null;
  lastActive: string | null;
  onTime: number;
  settled: number;
  createdAt: string;
  /** The list's own order: lastActive, or never for a house never used. */
  sortAt: string;
}

/** What a house's Pass is now: a paid Pass, Founding, the free month, or none. */
export type PassNow = "pass" | "founding" | "trial" | "none";

export function passNow(plan: PassPlan, until: string | null, now: Date): PassNow {
  if (plan === "founding") return "founding";
  if (!until || new Date(until) <= now) return "none";
  return plan === "trial" ? "trial" : "pass";
}

/** The Pass column: "Pass", "Founding", "Trial", "None". */
export function passLabel(plan: PassPlan, until: string | null, now: Date): string {
  return HOUSES_COPY.passNow[passNow(plan, until, now)];
}

/** A house's line under its name on a phone: "5 people, Pass, active 2 min ago, 74% on time". */
export function houseMeta(row: HouseRow, now: Date): string {
  const parts = [row.people === 1 ? "1 person" : `${n(row.people)} people`, passLabel(row.passPlan, row.passUntil, now)];
  parts.push(row.lastActive ? `active ${houseAgo(row.lastActive, now)}` : HOUSES_COPY.neverActive.toLowerCase());
  const onTime = percentOf(row.onTime, row.settled);
  if (onTime) parts.push(`${onTime} on time`);
  return parts.join(", ");
}

/** One house, read only. */
export interface HouseDetail {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  firstDealtAt: string | null;
  timezone: string;
  currency: string;
  dealMode: string;
  passPlan: PassPlan;
  passUntil: string | null;
  passBuyer: string | null;
  billed: boolean;
  lastActive: string | null;
  johns: number;
  people: HousePerson[];
}

export interface HousePerson {
  id: string;
  name: string;
  role: "admin" | "member";
  joinedAt: string;
  movingOutOn: string | null;
  onTime: number;
  settled: number;
  awayUntil: string | null;
}

/** Under the house's name: "Started 3 Sep, Priya and Ade are admins". */
export function houseLead(house: HouseDetail): string {
  const admins = house.people.filter((p) => p.role === "admin").map((p) => p.name);
  const parts = [`Started ${day(house.createdAt)}`];
  if (admins.length === 1) parts.push(`${admins[0]} is the admin`);
  else if (admins.length > 1) parts.push(`${admins.slice(0, -1).join(", ")} and ${admins[admins.length - 1]} are admins`);
  return parts.join(", ");
}

/** A person's line: "admin, 6 of 7 on time", "away until 2 Nov", "moving out 3 Dec". */
export function personMeta(person: HousePerson): string {
  const parts: string[] = [];
  if (person.role === "admin") parts.push("admin");
  if (person.awayUntil) parts.push(`away until ${plainDay(person.awayUntil)}`);
  else if (person.settled > 0) parts.push(`${person.onTime} of ${person.settled} on time`);
  else parts.push("nothing due in four weeks");
  if (person.movingOutOn) parts.push(`moving out ${plainDay(person.movingOutOn)}`);
  return parts.join(", ");
}

/** The Pass, as a title and a line: "House Pass, yearly" / "Priya pays, renews 3 Sep 2027". */
export function passDetail(house: HouseDetail, now: Date): { title: string; meta: string } {
  const state = passNow(house.passPlan, house.passUntil, now);
  if (state === "founding") return { title: "Founding Pass", meta: house.passBuyer ? `For life, bought by ${house.passBuyer}` : "For life" };
  if (state === "trial") return { title: "The free month", meta: `Ends ${dayYear(house.passUntil!)}` };
  if (state === "none") return { title: "No House Pass", meta: house.passUntil ? `Ended ${dayYear(house.passUntil)}` : "Never had one" };
  const payer = house.passBuyer ? `${house.passBuyer} pays` : "Paid";
  return {
    title: `House Pass, ${house.passPlan}`,
    meta: `${payer}, ${house.billed ? "renews" : "ends"} ${dayYear(house.passUntil!)}`,
  };
}

/** The settings that help on a support email: "Europe/London, GBP, join code K7P2QX, 9 Johns". */
export function houseFacts(house: HouseDetail): string {
  return [house.timezone, house.currency, `join code ${house.joinCode}`, house.johns === 1 ? "1 John" : `${n(house.johns)} Johns`].join(", ");
}

export const HOUSES_COPY = {
  page: "Houses",
  searchPlaceholder: "House, person, email or join code",
  count: (count: string) => (count === "1" ? "1 house" : `${count} houses`),
  columns: { house: "House", people: "People", pass: "Pass", active: "Last active", onTime: "On time", started: "Started" },
  passNow: { pass: "Pass", founding: "Founding", trial: "Trial", none: "None" } satisfies Record<PassNow, string>,
  neverActive: "Never",
  noneDue: "None due",
  empty: "No houses yet",
  emptyBody: "Houses show here as soon as someone starts one.",
  people: "People",
  money: "Money",
  details: "Details",
  readOnly: "Read only. Nothing here changes the house.",
  gone: "That house isn’t there any more.",
  pick: "Pick a house to see its people and Pass.",
};

/** The Houses list's filters: its Pass and how lately it was used. When is when it started. */
export const HOUSE_FACETS: readonly ListFacet[] = [
  {
    key: "pass",
    label: "Pass",
    options: [
      { value: "any", label: "Any" },
      { value: "paid", label: "Paid", words: ["paid", "pass", "yearly", "monthly", "founding"] },
      { value: "trial", label: "Free month", words: ["trial", "free"] },
      { value: "none", label: "None", words: ["none", "lapsed", "ended", "expired"] },
    ],
  },
  {
    key: "active",
    label: "Active",
    options: [
      { value: "any", label: "Any" },
      { value: "week", label: "This week", words: ["active", "week", "used"] },
      { value: "month", label: "This month", words: ["month"] },
      { value: "quiet", label: "Quiet a month", words: ["quiet", "inactive", "dead", "idle"] },
    ],
  },
];

export const HOUSE_WHEN: ListWhen = { label: "Started", moments: false };

// --- Overview ----------------------------------------------------------------------------

export interface OverviewNeed {
  kind: "report" | "deletion";
  id: string;
  name: string | null;
  words: string | null;
  house: string | null;
  at: string;
}

export interface Overview {
  days: 7 | 30;
  houses: number;
  housesNew: number;
  housesNewBefore: number;
  people: number;
  inHouses: number;
  active: number;
  passes: { monthly: number; yearly: number; founding: number; trial: number };
  onTime: { onTime: number; late: number; missed: number };
  ask: { turns: number; failed: number };
  weeks: { ends: string; active: number }[];
  clock: string | null;
  reports: number;
  needs: OverviewNeed[];
}

/** One figure on the Overview: what it counts, the number, and what it means. */
export interface Figure {
  key: string;
  label: string;
  value: string;
  meta: string;
}

const change = (now: number, before: number, days: number) => {
  const span = days === 7 ? "last week" : "the 30 days before";
  if (now === before) return `the same as ${span}`;
  return now > before ? `up ${n(now - before)} on ${span}` : `down ${n(before - now)} on ${span}`;
};

/** The six figures, in reading order. */
export function ownerFigures(o: Overview): Figure[] {
  const paid = o.passes.monthly + o.passes.yearly + o.passes.founding;
  const settled = o.onTime.onTime + o.onTime.late + o.onTime.missed;
  const perHouse = o.houses > 0 ? (o.inHouses / o.houses).toFixed(1) : "0";
  return [
    { key: "houses", label: "Houses", value: n(o.houses), meta: `${n(o.housesNew)} new, ${change(o.housesNew, o.housesNewBefore, o.days)}` },
    { key: "people", label: "People", value: n(o.people), meta: `${perHouse} to a house` },
    { key: "active", label: "Active houses", value: percentOf(o.active, o.houses) ?? "0%", meta: `${n(o.active)} of ${n(o.houses)}` },
    {
      key: "passes",
      label: "House Passes",
      value: n(paid),
      meta: `${n(o.passes.yearly)} yearly, ${n(o.passes.monthly)} monthly, ${n(o.passes.founding)} Founding`,
    },
    {
      key: "onTime",
      label: "Johns on time",
      value: percentOf(o.onTime.onTime, settled) ?? HOUSES_COPY.noneDue,
      meta: `${n(o.onTime.late + o.onTime.missed)} late or missed`,
    },
    {
      key: "ask",
      label: "Ask Jonz",
      value: n(o.ask.turns),
      meta: o.ask.failed === 0 ? "every one answered" : `${n(o.ask.failed)} didn’t answer`,
    },
  ];
}

/** How the clock is: it ticks every ten minutes, so more than half an hour quiet is late. */
export function clockState(clock: string | null, now: Date): { up: boolean; meta: string } {
  if (!clock) return { up: false, meta: "hasn’t ticked yet" };
  const quiet = now.getTime() - new Date(clock).getTime();
  return { up: quiet <= 30 * 60_000, meta: `ticked ${houseAgo(clock, now)}` };
}

/** How long a read of the database took: under a second is fine. */
export function databaseState(ms: number): { up: boolean; meta: string } {
  const took = ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
  return { up: ms < 1000, meta: `this page read in ${took}` };
}

/** A need's row: "Ava: The bins page is stuck" / "Ben goes in 3 h". */
export function needRow(need: OverviewNeed, now: Date): { title: string; meta: string; href: string } {
  const who = need.name ?? "Someone who left";
  if (need.kind === "report") {
    return {
      title: `${who} wrote in`,
      meta: [need.words, need.house, houseAgo(need.at, now)].filter(Boolean).join(", "),
      href: `/admin/inbox/${need.id}`,
    };
  }
  const left = Math.max(0, Math.round((new Date(need.at).getTime() - now.getTime()) / 3_600_000));
  return {
    title: `${who}’s account is deleted ${left < 1 ? "within the hour" : `in ${left} h`}`,
    meta: [need.house ?? "No house", "unless they change their mind"].join(", "),
    href: "/admin/deletions",
  };
}

export const OVERVIEW_COPY = {
  page: "Overview",
  needsYou: "Needs you",
  nothingNeeds: "Nothing needs you",
  nothingNeedsBody: "New reports and deletions due within a day show here.",
  openInbox: (count: number) => (count === 0 ? "Open the Inbox" : `Open the Inbox, ${n(count)} new`),
  rightNow: "Right now",
  database: "Database",
  clock: "The clock",
  up: "Up",
  late: "Late",
  slow: "Slow",
  thisWindow: (days: 7 | 30) => (days === 7 ? "This week" : "This month"),
  windowLabel: "Over",
  windows: { 7: "Last 7 days", 30: "Last 30 days" } as const,
  chart: "Active houses each week",
  chartNote: "a house is active when someone ticks a John",
  thisWeek: "This week",
  inTheApp: "In the app now",
  noNotice: "No notice is showing.",
  changeNotice: "Change it in Notices",
};
