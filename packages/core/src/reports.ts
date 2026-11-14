import { wordsFor, type Words } from "./words-for";
import { z } from "zod";

import type { ListFacet, ListWhen } from "./admin-list";
import { ASSISTANTS, MCP_ADDRESS } from "./assistants";
import { LEGAL, type LegalPage } from "./legal";

// Report a problem (docs/specs/report-a-problem.md): what someone tells Jonz
// from inside the app, what they see again under Your reports, and how the
// owner's Inbox lists it. The database keeps the same limits
// (supabase/migrations/20270112090000_baseline.sql).

export const REPORT_KINDS = ["problem", "idea", "question"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATES = ["new", "open", "replied", "fixed"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

export const SUPPORT_EMAIL = "support@jonz.app";

/** Where a report came from: the app's sheet, or an email to support@jonz.app. */
export const REPORT_SOURCES = ["app", "email"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

/** How much one report may carry, and how many a day each person may send. */
export const REPORT_LIMITS = {
  perDay: 5,
  words: 2000,
  shots: 3,
  /**
   * The most a screenshot may be: /files takes 4 MB (Vercel's request limit
   * is 4.5), under the bucket's 5. The app shrinks screenshots well under it.
   */
  shotBytes: 4 * 1024 * 1024,
} as const;

/** What the app sends with a report when its sender says so: one short line each. */
export const ReportDetails = z.object({
  pages: z.string().max(300).optional(),
  app: z.string().max(200).optional(),
  house: z.string().max(200).optional(),
  error: z.string().max(300).optional(),
});
export type ReportDetails = z.infer<typeof ReportDetails>;

/** send_report on /v1: send one. Screenshots are uploaded first, to the sender's own folder. */
export const ReportRequest = z.object({
  kind: z.enum(REPORT_KINDS),
  words: z.string().trim().min(1).max(REPORT_LIMITS.words),
  details: ReportDetails.nullable(),
  shots: z.array(z.string().min(1).max(200)).max(REPORT_LIMITS.shots),
});
export type ReportRequest = z.infer<typeof ReportRequest>;

export const ReportResponse = z.object({ ok: z.literal(true), id: z.string() });

/** write_back on /v1 (its sender writes back) and owner_reply_report on /v1 (the owner replies). */
export const ReportMessageRequest = z.object({ body: z.string().trim().min(1).max(REPORT_LIMITS.words) });
export type ReportMessageRequest = z.infer<typeof ReportMessageRequest>;

export const ReportMessageResponse = z.object({ ok: z.literal(true) });

/** owner_fix_report on /v1: mark it (and every report folded into it) fixed, and maybe tell them. */
export const ReportFixRequest = z.object({
  note: z.string().trim().max(REPORT_LIMITS.words).nullable(),
  tell: z.boolean(),
});
export type ReportFixRequest = z.infer<typeof ReportFixRequest>;

export const ReportFixResponse = z.object({ ok: z.literal(true), fixed: z.number(), told: z.number() });

/** A report's first line, short enough for a push or a list row. */
export function reportGist(words: string, max = 80): string {
  const line = words.trim().split("\n")[0].trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  // End on a whole word when one ends near the cut, so it never reads "still o…".
  const whole = /\s/.test(line[max - 1]) || /[\s,;:.!?]$/.test(cut);
  const space = cut.lastIndexOf(" ");
  const end = whole || space < max * 0.6 ? cut : cut.slice(0, space);
  return `${end.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** The pushes a report sends, each said in its reader's words. */
export const REPORT_PUSH = {
  /** To the owner. */
  sent: (kind: ReportKind, name: string | null, words: Words) =>
    words("admin.inbox.push.sent", { name: name ?? words("admin.inbox.push.someone"), what: kind }),
  wroteBack: (name: string | null, words: Words) => words("admin.inbox.push.wroteBack", { name: name ?? words("admin.inbox.push.someone") }),
  emailed: (name: string | null, words: Words) => words("admin.inbox.push.emailed", { name: name ?? words("admin.inbox.push.someone") }),
  /** To its sender. */
  replied: (signed: string | null, words: Words) =>
    signed ? words("common.report.push.repliedBy", { signed }) : words("common.report.push.replied"),
  fixed: (words: Words) => words("common.report.push.fixed"),
} as const;

/** The Inbox's filters: what state it's in, and what kind it is. With no state picked it shows every report, what's waiting for you first. */
export const REPORT_FACETS: readonly ListFacet[] = [
  {
    key: "state",
    label: "State",
    options: [
      { value: "waiting", label: "Waiting", words: ["waiting", "open", "unanswered", "todo"] },
      { value: "new", label: "New", words: ["new", "unread"] },
      { value: "replied", label: "Replied", words: ["replied", "answered"] },
      { value: "fixed", label: "Fixed", words: ["fixed", "done", "closed"] },
      { value: "any", label: "Any state" },
    ],
  },
  {
    key: "source",
    label: "From",
    options: [
      { value: "any", label: "App or email" },
      { value: "app", label: "The app", words: ["app", "in-app"] },
      { value: "email", label: "Email", words: ["email", "mail", "emailed"] },
    ],
  },
  {
    key: "kind",
    label: "Kind",
    options: [
      { value: "any", label: "Any kind" },
      { value: "problem", label: "Problems", words: ["problem", "bug", "broken", "wrong", "crash"] },
      { value: "idea", label: "Ideas", words: ["idea", "feature", "wish", "suggestion"] },
      { value: "question", label: "Questions", words: ["question", "ask", "how"] },
    ],
  },
];

export const REPORT_WHEN: ListWhen = { label: "Sent" };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How long ago, short enough for the Inbox's When column: "4 min", "3 h", "Thu", "12 Oct". */
export function reportAge(iso: string, now: Date): string {
  const at = new Date(iso);
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  if (hours < 24 * 6) return WEEKDAY[at.getDay()];
  return `${at.getDate()} ${MONTH[at.getMonth()]}`;
}

/** Help is in English: the steps for each assistant are the same words You shows. */
const HELP_WORDS = wordsFor("en", "housemates");

/** Each assistant's steps, under its name, from ASSISTANTS and its words. */
const ASSISTANT_STEPS = ASSISTANTS.map(
  ({ id, name }) => `### ${name}

${HELP_WORDS(`people.connectApp.${id}.steps`, { address: MCP_ADDRESS })}

${HELP_WORDS(`people.connectApp.${id}.note`)}`,
).join("\n\n");

/**
 * jonz.app/help: how to reach Jonz, for anyone, signed in or not, and
 * where the README and CONTRIBUTING send people instead of GitHub issues.
 * Each section's body is Markdown (see LegalSection).
 */

export const HELP_PAGE: LegalPage = {
  title: "Help",
  updated: "Jonz support",
  lead: `Something not working, an idea, or a question? Tell us and a person at Jonz reads it and writes back, usually within a day or two.`,
  sections: [
    {
      heading: "From inside Jonz",
      body: `1. Open **House**, then **Help**.
2. Press **Report a problem** or **Send an idea**, and say what happened. Add up to three screenshots if they help.
3. Press **Send**.

Leave **Send the details that help** ticked and it also says which pages you were on, your app or browser and the last error Jonz showed, so we can find it faster. You see exactly what goes before you send.

Our replies arrive under **House**, **Help**, **Your reports**, with a notification and an email. Write back there any time.

If Jonz ever shows “Something went wrong”, press **Tell us what happened** on that screen.`,
    },
    {
      heading: "By email",
      body: `Email [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}) from any address. Say what you were doing and what you saw; you can paste in a screenshot, but we only read the words.

We answer by email. Reply to our answer to keep the conversation going: it stays together with what you first sent.

If you email from the address you sign in with, it shows under **Your reports** in the app too.`,
      links: [{ label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}` }],
    },
    {
      heading: "Use Jonz from your AI assistant",
      body: `${ASSISTANTS.map((a) => a.name).join(" or ")} can read your house and, if you let it, mark Johns done, plan the week or change the rules for you, as you. It does its own thinking, so it doesn’t use up your house’s Ask Jonz.

${ASSISTANT_STEPS}

Anything that can’t be undone, like removing a John, still waits for you to approve it in Jonz. Change what an assistant may do, or disconnect it, on **You** under **Connected apps**.

${HELP_WORDS("people.connectApp.other")}`,
      links: ASSISTANTS.map(({ id, settings }) => ({ label: HELP_WORDS(`people.connectApp.${id}.open`), href: settings })),
    },
    {
      heading: "Your account and your data",
      body: `To delete your account, open **House**, then **Delete my account**, or use the page below. To ask what we keep about you, or to have it corrected, [email us](mailto:${SUPPORT_EMAIL}).`,
      links: [
        { label: "Delete my account", href: "/delete" },
        { label: "Privacy Policy", href: LEGAL.privacyPath },
        { label: "Terms", href: LEGAL.termsPath },
      ],
    },
    {
      heading: "Security problems",
      body: `If you’ve found a way to see or change something you shouldn’t, email [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}) with “Security” in the subject, and please don’t share it until we’ve fixed it.`,
    },
  ],
};

/** "Problem, sent Tue 3 Nov". */
export function reportSentAt(kind: ReportKind, at: string, words: Words): string {
  return words("common.report.sentAt", { what: words(`common.report.kind.${kind}` as const), at });
}
