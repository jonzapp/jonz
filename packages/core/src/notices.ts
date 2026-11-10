import { z } from "zod";

// Notices: the closable banners at the top of the app, written on the
// owner's admin page (docs/specs/owner-admin.md). Both apps and the API
// read them through these, so which one shows, and when a closed one comes
// back, is decided once.

export const NOTICE_KINDS = ["status", "offer", "news"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** A notice as the app shows it. Times are ISO strings, as the database sends them. */
export const Notice = z.object({
  id: z.string(),
  kind: z.enum(NOTICE_KINDS),
  title: z.string(),
  body: z.string(),
  linkLabel: z.string().nullable(),
  linkUrl: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
});
export type Notice = z.infer<typeof Notice>;

/** GET /api/notices: what's on, and the next few starting soon, so a copy kept on a phone stays right a while. */
export const NoticesResponse = z.object({ notices: z.array(Notice) });
export type NoticesResponse = z.infer<typeof NoticesResponse>;

/** A `notices` row as Supabase returns it. */
export interface NoticeRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link_label: string | null;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
}

/** A row as a Notice; null for a kind this build doesn't know (a newer app wrote it). */
export function noticeFromRow(row: NoticeRow): Notice | null {
  if (!(NOTICE_KINDS as readonly string[]).includes(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind as NoticeKind,
    title: row.title,
    body: row.body,
    linkLabel: row.link_label,
    linkUrl: row.link_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

/** Whether a notice is on at `now`: started, and not yet ended. */
export function isLive(notice: Pick<Notice, "startsAt" | "endsAt">, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(notice.startsAt) <= t && (notice.endsAt === null || Date.parse(notice.endsAt) > t);
}

/** Where a notice is in its life, for the admin page's list. */
export type NoticeState = "live" | "scheduled" | "ended";

export function noticeState(notice: Pick<Notice, "startsAt" | "endsAt">, now: Date): NoticeState {
  if (Date.parse(notice.startsAt) > now.getTime()) return "scheduled";
  return isLive(notice, now) ? "live" : "ended";
}

/** The highest wins: an outage before an offer before news. */
const PRIORITY: Record<NoticeKind, number> = { status: 0, offer: 1, news: 2 };

/**
 * A closed status notice comes back after this long if it's still on: an
 * unresolved problem shouldn't stay hidden. Offers and news, once closed,
 * stay closed.
 */
export const STATUS_RETURNS_AFTER_MS = 24 * 60 * 60 * 1000;

/** When this device closed each notice: notice id → ISO time. */
export type ClosedNotices = Record<string, string>;

/**
 * The one notice to show at `now`, or null. One at a time: the most urgent
 * kind, then the newest. A notice this device closed is skipped, unless it's
 * a status that has stayed on a day since.
 */
export function noticeToShow(notices: readonly Notice[], closed: ClosedNotices, now: Date): Notice | null {
  const showing = notices.filter((notice) => {
    if (!isLive(notice, now)) return false;
    const closedAt = closed[notice.id];
    if (closedAt === undefined) return true;
    return notice.kind === "status" && now.getTime() - Date.parse(closedAt) >= STATUS_RETURNS_AFTER_MS;
  });
  showing.sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || Date.parse(b.startsAt) - Date.parse(a.startsAt) || a.id.localeCompare(b.id),
  );
  return showing[0] ?? null;
}

/** Closed notices worth remembering: ones still in the list. Keeps the device's record from growing forever. */
export function pruneClosed(closed: ClosedNotices, notices: readonly Notice[]): ClosedNotices {
  const ids = new Set(notices.map((notice) => notice.id));
  return Object.fromEntries(Object.entries(closed).filter(([id]) => ids.has(id)));
}

/**
 * Whether a notice's link may be followed: a path inside the app, or https.
 * The database checks the same, so a notice can never carry another scheme.
 */
export function safeNoticeLink(url: string | null): string | null {
  if (url === null) return null;
  return /^(\/[^/\\]|\/$|https:\/\/)/.test(url) ? url : null;
}

/** Ready-made status notices for the common outages, so one is a tap away. */
export const NOTICE_PRESETS: readonly { label: string; kind: NoticeKind; title: string; body: string }[] = [
  {
    label: "Database slow",
    kind: "status",
    title: "Jonz is slow right now",
    body: "Our database host is fixing a problem. Nothing you’ve done is lost.",
  },
  {
    label: "Site down",
    kind: "status",
    title: "Some of Jonz is down",
    body: "We’re on it. Ticks you make now may not save, so try again soon.",
  },
  {
    label: "Payments paused",
    kind: "status",
    title: "House Pass payments are paused",
    body: "Our payment provider has a problem. Your Pass keeps working.",
  },
  {
    label: "Offer",
    kind: "offer",
    title: "",
    body: "",
  },
];
