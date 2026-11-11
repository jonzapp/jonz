import { TZDate, tz } from "@date-fns/tz";
import { format, startOfDay } from "date-fns";
import { dateIn } from "./format";
import { wordsFor, type Words } from "./words-for";

/** The owner's lists are written in English (their searches read English words), so their times are too. */
const ENGLISH = wordsFor("en", "housemates");

/**
 * How every owner admin list is searched and filtered, the same on every
 * page: one search box, with the page's filters (and When) as tags in it.
 * The page keeps what's set in its address, so Back, a refresh and a
 * bookmark all come back to the same rows. The server does the searching
 * and the filtering; these only say what was asked for.
 */

/** When, as the drop-down offers it. `any` is no limit. */
export type WhenPreset = "hour" | "today" | "week" | "month" | "any";

export const WHEN_PRESETS: readonly WhenPreset[] = ["hour", "today", "week", "month", "any"];

export const WHEN_LABEL: Record<WhenPreset, string> = {
  hour: "The last hour",
  today: "Today",
  week: "The last 7 days",
  month: "The last 30 days",
  any: "Any time",
};

/** What a list is asked for: the words searched, each drop-down's choice by its key, and When. */
export interface ListQuery {
  q: string;
  /** Each drop-down's choice, by the drop-down's key ("who", "what"); a missing key is its first choice. */
  picks: Record<string, string>;
  when: WhenPreset;
  /** Start from a moment: the list begins here and goes back, instead of at now. */
  from: string | null;
}

/** The window a query reads: newer than `after`, no newer than `before`. Null is no limit. */
export interface ListWindow {
  after: string | null;
  before: string | null;
}

/**
 * The window When asks for, in the owner's zone: Today starts at midnight
 * there. Starting from a moment reads back from it, with no lower limit, so
 * you can keep scrolling past the day you jumped to.
 */
export function listWindow(query: Pick<ListQuery, "when" | "from">, now: Date, zone: string): ListWindow {
  if (query.from) return { after: null, before: query.from };
  const hours = (n: number) => new Date(now.getTime() - n * 3_600_000).toISOString();
  switch (query.when) {
    case "hour":
      return { after: hours(1), before: null };
    case "today":
      // A TZDate writes its own offset; the server wants plain UTC.
      return { after: new Date(startOfDay(now, { in: tz(zone) }).getTime()).toISOString(), before: null };
    case "week":
      return { after: hours(7 * 24), before: null };
    case "month":
      return { after: hours(30 * 24), before: null };
    case "any":
      return { after: null, before: null };
  }
}

/** What a list's reads are asked: the words, each filter's choice, and When's window, fixed at the moment it was asked. */
export interface ListAsk extends ListWindow {
  q: string;
  picks: Record<string, string>;
}

/** A query made concrete: When's window from the moment it was asked, so scrolling on doesn't move it. */
export function listAsk(query: ListQuery, asked: Date, zone: string): ListAsk {
  return { q: query.q.trim(), picks: query.picks, ...listWindow(query, asked, zone) };
}

/**
 * A row's time: "16:41:07" today (or "16:41" where seconds won't fit),
 * "Thu 29 Oct, 23:58" before today. No day headings: in a busy list a day
 * holds thousands of rows, so the date rides in the time column instead.
 */
export function listTime(iso: string, now: Date, zone: string, seconds = true): string {
  const at = new Date(iso);
  const inZone = { in: tz(zone) };
  const sameDay = format(at, "yyyy-MM-dd", inZone) === format(now, "yyyy-MM-dd", inZone);
  if (sameDay) return dateIn(at, seconds ? "timeSeconds" : "time", zone, ENGLISH);
  return momentLabel(iso, zone);
}

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * A query from the page's address. Only the drop-downs the page has are
 * read, and only choices they offer; anything else falls back to the first
 * choice, so an old or mistyped link still opens the list.
 */
export function listQueryFromParams(
  params: Params,
  dropDowns: Record<string, readonly string[]>,
  defaultWhen: WhenPreset = "any",
): ListQuery {
  const picks: Record<string, string> = {};
  for (const [key, choices] of Object.entries(dropDowns)) {
    const pick = one(params[key]);
    // The first choice is no filter at all (Anyone), so it isn't kept.
    if (pick && pick !== choices[0] && choices.includes(pick)) picks[key] = pick;
  }
  const when = one(params.when);
  const from = one(params.from);
  return {
    q: (one(params.q) ?? "").slice(0, 200),
    picks,
    when: when && (WHEN_PRESETS as readonly string[]).includes(when) ? (when as WhenPreset) : defaultWhen,
    from: from && !Number.isNaN(Date.parse(from)) ? new Date(from).toISOString() : null,
  };
}

/** The page's address for a query: only what differs from the page's defaults, so a plain list has a plain address. */
export function listQueryToParams(query: ListQuery, defaultWhen: WhenPreset = "any"): Record<string, string> {
  const params: Record<string, string> = {};
  const q = query.q.trim();
  if (q) params.q = q;
  for (const [key, pick] of Object.entries(query.picks)) params[key] = pick;
  if (query.from) params.from = query.from;
  else if (query.when !== defaultWhen) params.when = query.when;
  return params;
}

/** Whether anything is set, for Clear. */
export function listQueryIsSet(query: ListQuery, defaultWhen: WhenPreset = "any"): boolean {
  return Object.keys(listQueryToParams(query, defaultWhen)).length > 0;
}

/** "2,481", "about 48,000": exact up to ten thousand, then rounded, because past that the database estimates. */
export function listCount(count: number, exact: boolean): string {
  if (exact || count < 10_000) return count.toLocaleString("en-GB");
  return `about ${(Math.round(count / 1000) * 1000).toLocaleString("en-GB")}`;
}

// --- The audit log's search and drop-downs ---------------------------------------------

export const AUDIT_WHO = ["anyone", "you", "others", "jonz"] as const;
export type AuditWho = (typeof AUDIT_WHO)[number];
export const AUDIT_WHAT = ["anything", "notices", "accounts"] as const;
export type AuditWhat = (typeof AUDIT_WHAT)[number];

/** What each What reads: the start of the entries' action. */
export const AUDIT_WHAT_ACTION: Record<AuditWhat, string | null> = { anything: null, notices: "notice.", accounts: "account." };

/** What was typed, kept to letters, digits, spaces and @ . _ ' -, so nothing typed can change a filter itself. */
function searchWords(q: string): string {
  return q
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} @._'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

const like = (column: string, pattern: string) => `${column}.ilike."${pattern}"`;

/**
 * The search box's words as the database's `or` filter: an entry number
 * finds that entry (and any account id starting with those digits); words
 * find an account id that starts with them, or a notice's title or a
 * reason that has them. Only letters, digits, spaces and @ . _ ' - are
 * kept, so nothing typed can change the filter itself. Null when there is
 * nothing to search for.
 */
export function auditSearchFilter(q: string): string | null {
  const words = searchWords(q);
  if (!words) return null;
  if (/^#?\d{1,15}$/.test(words)) {
    const id = words.replace("#", "");
    return [`id.eq.${id}`, like("target_id", `${id}*`)].join(",");
  }
  return [
    like("target_id", `${words}*`),
    like("reason", `*${words}*`),
    like("after->>title", `*${words}*`),
    like("before->>title", `*${words}*`),
  ].join(",");
}

/** A way from one entry to more like it: a label, what it sets, and the address it leads to. */
export interface LikeThis {
  label: string;
  meta: string;
  params: Record<string, string>;
}

/**
 * Show more like this, on an entry: everything by the same Who, everything
 * of the same What, and the list around its moment. Each is a whole query
 * (it clears the search), so it reads the same wherever it is opened from.
 */
export function auditLikeThis(entry: { actor: string | null; action: string; at: string }, ownerId: string | null, words: Words): LikeThis[] {
  const who: AuditWho = entry.actor === null ? "jonz" : entry.actor === ownerId ? "you" : "others";
  const whoLabel = who === "you" ? words('admin.audit.byYou') : who === "jonz" ? words('admin.audit.byJonz') : words('admin.audit.byThem');
  const like: LikeThis[] = [{ label: whoLabel, meta: `${words('admin.audit.who')}: ${words(`admin.audit.whoLabel.${who}` as const)}`, params: { who } }];
  const what = AUDIT_WHAT.find((kind) => AUDIT_WHAT_ACTION[kind] !== null && entry.action.startsWith(AUDIT_WHAT_ACTION[kind]!));
  if (what) {
    const label = words(`admin.audit.whatLabel.${what}` as const);
    like.push({ label: words('admin.audit.ofKind', { what: label.toLowerCase() }), meta: `${words('admin.audit.what')}: ${label}`, params: { what } });
  }
  const from = new Date(Date.parse(entry.at) + 5 * 60_000).toISOString();
  like.push({ label: words('admin.audit.around'), meta: words('admin.audit.aroundMeta'), params: { from } });
  return like;
}

// --- One smart search box ---------------------------------------------------------------

/**
 * A filter the search box can turn words into: Who, What, and so on. Its
 * first option is no filter at all (Anyone, Anything), so it is never a
 * tag. `words` are other words that find an option ("me" finds You).
 */
export interface ListFacet {
  key: string;
  label: string;
  options: readonly { value: string; label: string; words?: readonly string[] }[];
}

/** What a suggestion under the box does when it's chosen. */
export type ListSuggestion =
  | { kind: "pick"; key: string; value: string; label: string }
  | { kind: "when"; when: WhenPreset; label: string }
  | { kind: "from"; from: string; label: string }
  | { kind: "words"; q: string; label: string };

/** A tag in the box: what's set, and the key that takes it away. */
export interface ListTag {
  key: string;
  label: string;
}

const WHEN_WORDS: Record<Exclude<WhenPreset, "any">, readonly string[]> = {
  hour: ["last", "hour", "60", "minutes"],
  today: ["today", "day"],
  week: ["last", "7", "days", "week"],
  month: ["last", "30", "days", "month"],
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Every typed word starts one of the candidate's words. */
function matches(tokens: readonly string[], words: readonly string[]): boolean {
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

const wordsOf = (...texts: readonly string[]) =>
  texts.flatMap((text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter(Boolean);

/**
 * A moment typed into the box, in your zone: "23:30" (today), "yesterday"
 * or "yesterday 18:00", "29 oct" or "oct 29" (this year, or last if that's
 * still to come) with or without a time, or "2026-10-29 23:30". A day
 * without a time means its end, so the list starts with that day's last
 * entry. Null for anything else, or a moment still to come.
 */
export function parseMoment(text: string, now: Date, zone: string): Date | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  const today = format(now, "yyyy-MM-dd", { in: tz(zone) }).split("-").map(Number);
  const at = (y: number, m: number, d: number, time?: string[]) => {
    const h = time ? Number(time[0]) : 23;
    const mi = time ? Number(time[1]) : 59;
    if (m < 0 || m > 11 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    const moment = new TZDate(y, m, d, h, mi, time ? 0 : 59, zone);
    if (moment.getDate() !== d) return null;
    return new Date(moment.getTime());
  };
  const clock = (s: string | undefined) => (s ? s.split(":") : undefined);
  let found: Date | null = null;
  let match: RegExpMatchArray | null;
  if ((match = t.match(/^(\d{1,2}:\d{2})$/))) found = at(today[0], today[1] - 1, today[2], clock(match[1]));
  else if ((match = t.match(/^yesterday(?: (\d{1,2}:\d{2}))?$/))) {
    const y = new Date(Date.UTC(today[0], today[1] - 1, today[2] - 1));
    found = at(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate(), clock(match[1]));
  } else if ((match = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}:\d{2}))?$/)))
    found = at(Number(match[1]), Number(match[2]) - 1, Number(match[3]), clock(match[4]));
  else {
    const dayFirst = t.match(/^(\d{1,2}) ([a-z]{3})[a-z]*(?: (\d{1,2}:\d{2}))?$/);
    const monthFirst = t.match(/^([a-z]{3})[a-z]* (\d{1,2})(?: (\d{1,2}:\d{2}))?$/);
    const [day, month, time] = dayFirst
      ? [Number(dayFirst[1]), dayFirst[2], dayFirst[3]]
      : monthFirst
        ? [Number(monthFirst[2]), monthFirst[1], monthFirst[3]]
        : [0, "", undefined];
    const m = MONTHS.indexOf(month);
    if (m >= 0) {
      found = at(today[0], m, day, clock(time));
      if (found && found > now) found = at(today[0] - 1, m, day, clock(time));
    }
  }
  return found && found <= now ? found : null;
}

/** A moment as a tag or a suggestion says it: "Thu 29 Oct, 23:30". */
export function momentLabel(iso: string, zone: string): string {
  const at = new Date(iso);
  return ENGLISH("common.date.dayAtTime", { day: dateIn(at, "weekdayDayMonth", zone, ENGLISH), time: dateIn(at, "time", zone, ENGLISH) });
}

/**
 * What the box offers for what's typed, best first: the filters whose
 * names or choices the words start (who → every Who; "me" → Who: You;
 * "del" → What: Accounts), When's spans, a moment to start from, and last,
 * searching the words themselves. With nothing typed, every filter's
 * choices, so you can see what there is to filter by.
 */
/**
 * How a list names When ("Asked" on Deletions, where it's when they asked),
 * and whether a moment typed in starts the list from it: only a list newest
 * first can start from a moment.
 */
export interface ListWhen {
  label?: string;
  moments?: boolean;
}

export function listSuggestions(
  text: string,
  facets: readonly ListFacet[],
  now: Date,
  zone: string,
  { label = "When", moments = true }: ListWhen = {},
): ListSuggestion[] {
  const tokens = wordsOf(text);
  const out: ListSuggestion[] = [];
  for (const facet of facets) {
    for (const option of facet.options.slice(1)) {
      if (tokens.length === 0 || matches(tokens, wordsOf(facet.label, option.label, ...(option.words ?? [])))) {
        out.push({ kind: "pick", key: facet.key, value: option.value, label: `${facet.label}: ${option.label}` });
      }
    }
  }
  for (const when of ["hour", "today", "week", "month"] as const) {
    if (tokens.length === 0 || matches(tokens, ["when", ...wordsOf(label, WHEN_LABEL[when]), ...WHEN_WORDS[when]])) {
      out.push({ kind: "when", when, label: `${label}: ${WHEN_LABEL[when]}` });
    }
  }
  const moment = moments && text.trim() ? parseMoment(text, now, zone) : null;
  if (moment) out.push({ kind: "from", from: moment.toISOString(), label: `Start from ${momentLabel(moment.toISOString(), zone)}` });
  const words = text.trim().replace(/\s+/g, " ");
  if (words) out.push({ kind: "words", q: words, label: `Search for “${words}”` });
  return out;
}

/** The query with a suggestion applied. Turning words into a filter takes them out of the search. */
export function applySuggestion(query: ListQuery, suggestion: ListSuggestion): ListQuery {
  switch (suggestion.kind) {
    case "pick":
      return { ...query, q: "", picks: { ...query.picks, [suggestion.key]: suggestion.value } };
    case "when":
      return { ...query, q: "", when: suggestion.when, from: null };
    case "from":
      return { ...query, q: "", from: suggestion.from };
    case "words":
      return { ...query, q: suggestion.q };
  }
}

/** The tags in the box, in the filters' order, then When or the moment it starts from. */
export function listTags(
  query: ListQuery,
  facets: readonly ListFacet[],
  zone: string,
  defaultWhen: WhenPreset = "any",
  whenLabel = "When",
): ListTag[] {
  const tags: ListTag[] = [];
  for (const facet of facets) {
    const option = facet.options.find((o) => o.value === query.picks[facet.key]);
    if (option && option !== facet.options[0]) tags.push({ key: facet.key, label: `${facet.label}: ${option.label}` });
  }
  if (query.from) tags.push({ key: "from", label: `From ${momentLabel(query.from, zone)}` });
  else if (query.when !== defaultWhen && query.when !== "any") tags.push({ key: "when", label: `${whenLabel}: ${WHEN_LABEL[query.when]}` });
  return tags;
}

/** The query without one tag. */
export function dropTag(query: ListQuery, key: string, defaultWhen: WhenPreset = "any"): ListQuery {
  if (key === "from") return { ...query, from: null };
  if (key === "when") return { ...query, when: defaultWhen };
  const picks = { ...query.picks };
  delete picks[key];
  return { ...query, picks };
}

/** Each filter's choices by its key, for reading a query from the page's address. */
export function facetChoices(facets: readonly ListFacet[]): Record<string, readonly string[]> {
  return Object.fromEntries(facets.map((facet) => [facet.key, facet.options.map((option) => option.value)]));
}

/** The audit log's filters, as the search box offers them. */
export const AUDIT_FACETS: readonly ListFacet[] = [
  {
    key: "who",
    label: "Who",
    options: [
      { value: "anyone", label: "Anyone" },
      { value: "you", label: "You", words: ["me", "mine", "owner"] },
      { value: "others", label: "Someone else", words: ["people", "user", "others"] },
      { value: "jonz", label: "Jonz itself", words: ["clock", "system", "automatic"] },
    ],
  },
  {
    key: "what",
    label: "What",
    options: [
      { value: "anything", label: "Anything" },
      { value: "notices", label: "Notices", words: ["banner", "status", "offer", "news"] },
      { value: "accounts", label: "Accounts", words: ["deletions", "delete", "deleted"] },
    ],
  },
];

// --- Deletions' search and filters ------------------------------------------------------

/** Deletions' filters: who started the 30 days, and how soon it goes. */
export const DELETION_FACETS: readonly ListFacet[] = [
  {
    key: "by",
    label: "Started",
    options: [
      { value: "anyone", label: "By anyone" },
      { value: "self", label: "In the app", words: ["themselves", "user", "app", "asked"] },
      { value: "owner", label: "By you", words: ["me", "mine", "owner", "email", "emailed"] },
    ],
  },
  {
    key: "goes",
    label: "Goes",
    options: [
      { value: "any", label: "Any day" },
      { value: "day", label: "Within a day", words: ["today", "tomorrow", "soon", "24"] },
      { value: "week", label: "Within a week", words: ["week", "7", "days", "soon"] },
    ],
  },
];

/** On Deletions, When is when they asked; the list goes soonest first, so it doesn't start from a moment. */
export const DELETION_WHEN: ListWhen = { label: "Asked", moments: false };

// --- Notices' search and filters --------------------------------------------------------

/** The search box's words as the database's `or` filter on notices: a title or body that has them. */
export function noticeSearchFilter(q: string): string | null {
  const words = searchWords(q);
  if (!words) return null;
  return [like("title", `*${words}*`), like("body", `*${words}*`)].join(",");
}

/** Notices' filters: what kind, and whether it's showing, starting later or over. */
export const NOTICE_FACETS: readonly ListFacet[] = [
  {
    key: "kind",
    label: "Kind",
    options: [
      { value: "any", label: "Any kind" },
      { value: "status", label: "Something’s wrong", words: ["status", "outage", "down", "problem", "broken"] },
      { value: "offer", label: "Offers", words: ["offer", "deal", "price", "sale"] },
      { value: "news", label: "News", words: ["news", "update"] },
    ],
  },
  {
    key: "state",
    label: "State",
    options: [
      { value: "any", label: "Any" },
      { value: "live", label: "Showing", words: ["on", "now", "live", "current"] },
      { value: "scheduled", label: "Starting later", words: ["later", "future", "scheduled", "soon"] },
      { value: "ended", label: "Ended", words: ["over", "off", "past", "old", "finished"] },
    ],
  },
];

/** On Notices, When is when a notice started. */
export const NOTICE_WHEN: ListWhen = { label: "Started" };

