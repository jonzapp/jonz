import { NOTICE_KINDS, type NoticeKind } from "./notices";

// The owner's admin page (docs/specs/owner-admin.md): its words, how an
// audit entry reads, and the checks a notice passes before it's saved. The
// database checks the same again; these say it first, in a sentence.

export const ADMIN_PATH = "/admin";

export const ADMIN_PAGES = [
  { key: "overview", label: "Overview", path: "/admin/overview" },
  { key: "inbox", label: "Inbox", path: "/admin/inbox" },
  { key: "houses", label: "Houses", path: "/admin/houses" },
  { key: "messages", label: "Messages", path: "/admin/messages" },
  { key: "notices", label: "Notices", path: "/admin/notices" },
  { key: "promotions", label: "Promotions", path: "/admin/promotions" },
  { key: "deletions", label: "Deletions", path: "/admin/deletions" },
  { key: "audit", label: "Audit log", path: "/admin/audit" },
] as const;
export type AdminPage = (typeof ADMIN_PAGES)[number]["key"];

/**
 * The owner's pages grouped by job: one tab each on a phone, a small heading
 * each on the laptop's side list. A tab with more than one page opens its
 * first, with a switch at the top for the rest. A new page joins a group, so
 * the bar stays at five.
 */
export const ADMIN_GROUPS = [
  { key: "overview", label: "Overview", pages: ["overview"] },
  { key: "inbox", label: "Inbox", pages: ["inbox"] },
  { key: "houses", label: "Houses", pages: ["houses"] },
  { key: "send", label: "Send", pages: ["messages", "notices", "promotions"] },
  { key: "records", label: "Records", pages: ["deletions", "audit"] },
] as const satisfies readonly { key: string; label: string; pages: readonly AdminPage[] }[];
export type AdminGroup = (typeof ADMIN_GROUPS)[number]["key"];

/** The group a page is in. */
export function adminGroupOf(page: AdminPage): (typeof ADMIN_GROUPS)[number] {
  return ADMIN_GROUPS.find((g) => (g.pages as readonly AdminPage[]).includes(page)) ?? ADMIN_GROUPS[0];
}

/** A page's label and path, by its key. */
export function adminPage(page: AdminPage): (typeof ADMIN_PAGES)[number] {
  return ADMIN_PAGES.find((p) => p.key === page) ?? ADMIN_PAGES[0];
}

export const ADMIN_COPY = {
  owner: "Owner",
  signedInWithCode: "Signed in with a code",
  /** The way back: the rail's foot on a laptop, Overview's foot on a phone. */
  backToHouse: "Back to my house",
  // Getting in.
  lockTitle: "Lock the admin page",
  lockBody:
    "The admin page can change what everyone sees, so it needs a code from an authenticator app as well as your sign-in. Use 1Password, Google Authenticator or the iPhone Passwords app.",
  addToPasswords: "Add to your passwords app",
  copyKey: "Or type this key into the app",
  copyKeyButton: "Copy key",
  keyCopied: "Key copied",
  /** In place of copyKey when the code to scan can’t be drawn. */
  noQr: "The code to scan didn’t load, so type this key into the app instead.",
  codeTitle: "Enter your code",
  codeBody: "The 6 numbers from your authenticator app.",
  codeLabel: "Code",
  open: "Open the admin page",
  added: "Check the code",
  wrongCode: "That code didn’t work. Codes change every 30 seconds, so try the newest one.",
  // Notices.
  tellEveryone: "Tell everyone",
  /** The ways in to a new notice, named by what's happening, outages first. */
  start: {
    status: { title: "Something’s wrong", meta: "an outage" },
    offer: { title: "An offer", meta: "a price or a deal" },
    news: { title: "News", meta: "something new" },
  } satisfies Record<NoticeKind, { title: string; meta: string }>,
  editNotice: "Edit notice",
  whatPeopleSee: "What people see now",
  nothingShowing: "Nothing is showing. People see the app as usual.",
  onePerScreen: "One shows at a time: status first, then offers, then news. A status notice still shows when the database is down.",
  startFrom: "Start from",
  kind: "Kind",
  title: "Title",
  more: "More, optional",
  button: "Button, optional",
  buttonLabel: "Button words",
  buttonLink: "Where it goes: a page like /house/pass, or an https link",
  starts: "Starts",
  ends: "Ends",
  startsNow: "Now",
  startsLater: "Later",
  startsAtLabel: "Starts at, your time: 2026-11-30 09:00",
  endsAtLabel: "Ends at, your time: 2026-11-30 23:59",
  save: "Save",
  saveAndShow: "Show it",
  endNow: "End it now",
  saved: "Saved.",
  ended: "Ended.",
  copyFailed: "Saved, but the copy for outages didn’t update. Save again to retry.",
  auditNote: "Saving writes to the audit log with your name.",
  noNotices: "No notices yet",
  noNoticesBody: "A notice shows at the top of the app for everyone: an outage, an offer or news.",
  // The audit log.
  auditMeta: (count: number) => (count === 1 ? "1 entry" : `${count} entries`),
  noAudit: "Nothing yet",
  noAuditBody: "Everything you do here is written down, and can’t be changed or removed.",
  whatChanged: "What changed",
  appendOnly: "Entries can’t be changed or removed, not even by you.",
  you: "You",
  entry: "Entry",
  details: "Details",
  action: "Action",
  when: "When",
  openNotice: "Open the notice",
  noEntry: "That entry isn’t in the log.",
  // Deletions.
  noDeletions: "Nobody is waiting to be deleted",
  noDeletionsBody:
    "When someone deletes their account it waits here for 30 days, in case they change their mind. Signing in again and pressing Keep my account stops it.",
  goesIn: (days: number) => (days <= 0 ? "Goes within 10 minutes" : days === 1 ? "Goes tomorrow" : `Goes in ${days} days`),
  askedInApp: "asked in the app",
  startedByYou: "you started it",
  noHouse: "in no house",
  deleteNow: "Delete now",
  deleteNowAsk: (name: string) => `Delete ${name} now?`,
  deleteNowBody: "Their account goes within 10 minutes instead of waiting out the 30 days. Only do this when they’ve asked you to.",
  stop: "Stop",
  stopAsk: (name: string) => `Stop deleting ${name}?`,
  stopBody: "Their account stays, the time away it put in ends, and a House Pass they pay for renews again.",
  reason: "Why, for the audit log",
  reasonPlaceholder: "They emailed on 31 Oct",
  byEmail: "Delete an account someone emailed about",
  byEmailBody:
    "For someone who can’t sign in to do it themselves. Only when the email came from the address on the account. It waits 30 days like any other.",
  email: "Their email",
  startDeleting: "Start the 30 days",
  started: "Started. It’s in the list.",
  deletingSoon: "It goes within 10 minutes.",
  stopped: "Stopped. Their account stays.",
} as const;

/** Whole days until a deletion is due, from now; 0 or less is due now. */
export function daysUntil(iso: string, now: Date): number {
  return Math.ceil((Date.parse(iso) - now.getTime()) / 86_400_000);
}

/** Someone waiting to be deleted, as the Deletions page lists them. */
export interface PendingDeletion {
  userId: string;
  name: string;
  email: string | null;
  house: string | null;
  requestedAt: string;
  deleteAfter: string;
  requestedBy: "self" | "owner";
}

/** How long a new notice runs: the choices on the Ends switch. */
export const NOTICE_ENDS = ["never", "2h", "tomorrow", "date"] as const;
export type NoticeEnds = (typeof NOTICE_ENDS)[number];
export const NOTICE_ENDS_LABEL: Record<NoticeEnds, string> = {
  never: "When I end it",
  "2h": "In 2 hours",
  tomorrow: "Tomorrow",
  date: "On a date",
};

/** The end a choice means, from `start`; `date` is the typed one. Null for no end. */
export function noticeEndsAt(choice: NoticeEnds, start: Date, typed: Date | null): Date | null {
  if (choice === "never") return null;
  if (choice === "2h") return new Date(start.getTime() + 2 * 3_600_000);
  if (choice === "tomorrow") return new Date(start.getTime() + 24 * 3_600_000);
  return typed;
}

/**
 * A typed local date and time, "2026-11-30 09:00" (a T between them is fine
 * too), as the moment it names on this device; null when it isn't one.
 */
export function parseLocalDateTime(text: string): Date | null {
  const match = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
  return date;
}

/** A moment as parseLocalDateTime reads it, for a field's starting text. */
export function formatLocalDateTime(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export interface NoticeDraft {
  kind: NoticeKind;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** What's wrong with a draft, field by field; empty when it can be saved. */
export function noticeProblems(draft: NoticeDraft, now: Date): Partial<Record<keyof NoticeDraft, string>> {
  const problems: Partial<Record<keyof NoticeDraft, string>> = {};
  if (!NOTICE_KINDS.includes(draft.kind)) problems.kind = "Pick status, offer or news.";
  const title = draft.title.trim();
  if (title.length === 0) problems.title = "Give it a title.";
  else if (title.length > 80) problems.title = "Keep the title to 80 letters.";
  if (draft.body.trim().length > 240) problems.body = "Keep it to 240 letters.";
  const label = draft.linkLabel.trim();
  const url = draft.linkUrl.trim();
  if (label && !url) problems.linkUrl = "Say where the button goes.";
  if (url && !label) problems.linkLabel = "Give the button some words.";
  if (label.length > 30) problems.linkLabel = "Keep the button to 30 letters.";
  if (url && !/^(\/[^/\\]|\/$|https:\/\/)/.test(url)) problems.linkUrl = "Use a page like /house/pass, or an https link.";
  const start = draft.startsAt ?? now;
  if (draft.endsAt && draft.endsAt.getTime() <= start.getTime()) problems.endsAt = "It has to end after it starts.";
  return problems;
}

/** A notice's window as its row says it: "since Fri 30 Oct, 16:05, until you end it". */
export function noticeWindow(notice: { startsAt: string; endsAt: string | null }, now: Date, zone?: string): string {
  const start = Date.parse(notice.startsAt);
  const end = notice.endsAt ? Date.parse(notice.endsAt) : null;
  if (end !== null && end <= now.getTime()) return `ended ${formatWhen(notice.endsAt!, zone)}`;
  const from = start <= now.getTime() ? `since ${formatWhen(notice.startsAt, zone)}` : `from ${formatWhen(notice.startsAt, zone)}`;
  return `${from}, ${end === null ? "until you end it" : `until ${formatWhen(notice.endsAt!, zone)}`}`;
}

/**
 * A notice's row in Every notice, saying whether it's on as it says when:
 * "Showing since Mon 2 Nov, 09:05, until you end it", "Starts Mon 9 Nov,
 * 08:00, until Mon 16 Nov, 08:00", "Ended Sun 1 Nov, 10:00".
 */
export function noticeLine(notice: { startsAt: string; endsAt: string | null }, now: Date, zone?: string): string {
  const until = notice.endsAt ? `until ${formatWhen(notice.endsAt, zone)}` : "until you end it";
  if (notice.endsAt && Date.parse(notice.endsAt) <= now.getTime()) return `Ended ${formatWhen(notice.endsAt, zone)}`;
  if (Date.parse(notice.startsAt) > now.getTime()) return `Starts ${formatWhen(notice.startsAt, zone)}, ${until}`;
  return `Showing since ${formatWhen(notice.startsAt, zone)}, ${until}`;
}

// --- The audit log ---------------------------------------------------------------------

export interface AuditEntry {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  targetKind: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

/** One line of an entry's "What changed": a field, its old value, its new one. */
export interface AuditChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

const FIELDS: readonly [string, string][] = [
  // A notice's.
  ["kind", "Kind"],
  ["title", "Title"],
  ["body", "More"],
  ["link_label", "Button"],
  ["link_url", "Button goes to"],
  ["starts_at", "Starts"],
  ["ends_at", "Ends"],
  // An account being deleted's: never a name or an email.
  ["state", "State"],
  ["requested_by", "Asked"],
  ["delete_after", "Goes"],
];

const WORDS: Record<string, Record<string, string>> = {
  state: { pending: "Waiting", kept: "Kept", done: "Deleted" },
  requested_by: { self: "In the app", owner: "By email, started by the owner" },
};

const WHEN_FIELDS = new Set(["starts_at", "ends_at", "delete_after"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function shown(value: unknown, field: string, zone?: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (WHEN_FIELDS.has(field) && typeof value === "string") return formatWhen(value, zone);
  return WORDS[field]?.[String(value)] ?? String(value);
}

/** A moment as the audit log says it: "Fri 30 Oct, 16:41". */
export function formatWhen(iso: string, zone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone,
  })
    .format(new Date(iso))
    .replace(/,? (\d{2}:\d{2})$/, ", $1");
}

/** The fields an entry changed, in the order the page shows them. A new notice lists what it was saved with. */
export function auditChanges(entry: Pick<AuditEntry, "before" | "after">, zone?: string): AuditChange[] {
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);
  if (!after) return [];
  return FIELDS.flatMap(([field, label]) => {
    const from = before ? shown(before[field], field, zone) : null;
    const to = shown(after[field], field, zone);
    if (before && from === to) return [];
    if (!before && to === null) return [];
    return [{ field, label, from, to }];
  });
}

const KIND_WORD: Record<string, string> = { status: "a status notice", offer: "an offer", news: "a news notice" };

/**
 * An entry in parts, for a table's columns: who did it, what they did,
 * where (the page or the account it was done to), and a detail (a
 * notice's title). The log names an account by its id only: once it's
 * deleted, nothing else is left.
 */
export interface AuditParts {
  who: string;
  what: string;
  where: string;
  detail: string;
}

export function auditParts(entry: AuditEntry, ownerId: string | null): AuditParts {
  const who = entry.actor !== null && entry.actor === ownerId ? ADMIN_COPY.you : "The owner";
  const after = asRecord(entry.after);
  const kind = KIND_WORD[String(after?.kind ?? "")] ?? "a notice";
  const title = typeof after?.title === "string" ? after.title : "";
  const account = accountMeta(entry);
  switch (entry.action) {
    case "notice.save":
      return { who, what: `${entry.before ? "changed" : "wrote"} ${kind}`, where: "Notices", detail: title };
    case "notice.end":
      return { who, what: `ended ${kind}`, where: "Notices", detail: title };
    case "account.delete_request":
      return after?.requested_by === "owner"
        ? { who, what: "started deleting an account", where: account, detail: "" }
        : { who: "Someone", what: "asked to delete their account", where: account, detail: "" };
    case "account.delete_keep":
      return { who: "Someone", what: "kept their account", where: account, detail: "" };
    case "account.delete_stop":
      return { who, what: "stopped a deletion", where: account, detail: "" };
    case "account.delete_now":
      return { who, what: "deleted an account sooner", where: account, detail: "" };
    case "account.delete_done":
      // The clock does it, on the day.
      return { who: "Jonz", what: "deleted an account", where: account, detail: "" };
    default:
      return { who: entry.actor === null ? "Jonz" : who, what: entry.action, where: entry.targetId ?? "", detail: "" };
  }
}

/** How an entry reads in a list of rows: who did what as its title, and its detail (or where) under it. */
export function auditLine(entry: AuditEntry, ownerId: string | null): { title: string; meta: string } {
  const parts = auditParts(entry, ownerId);
  const known = parts.what !== entry.action;
  return { title: known ? `${parts.who} ${parts.what}` : `${parts.who}: ${entry.action}`, meta: parts.detail || parts.where };
}

function accountMeta(entry: AuditEntry): string {
  return entry.targetId ? `Account ${entry.targetId.slice(0, 8)}` : "";
}
