import { APP_NAME } from "./app";
import type { Currency } from "./domain";
import { LEGAL } from "./legal";
import type { NoticeKind } from "./notices";
import { refTag } from "./inbound-email";
import { offerSmallPrint, promotionPrices, promotionSentence, promotionTitle, type PromotionTerms } from "./promotions";
import { type ReportKind, reportGist } from "./reports";
import { escapeHtml } from "./share";
import type { Language } from "./locales";
import { wordsFor, type Words } from "./words-for";

// The emails' words (locales/en/email.json), in the language the person it's
// to reads Jonz in: `language` on each email, English when it's left out
// (someone without an account, or before they've opened the app).
const wordsIn = (language: Language = "en") => wordsFor(language, "housemates");

// Jonz's emails, drawn once for every sender: the API sends them through
// Resend, and Supabase's sign-in emails are written from the same parts.
// The look is B, "Notice" (docs/specs/email.md): a small JONZ sign over an
// ink rule, a black-caps headline, plain words on white. A notice from the
// owner is a Panel in its banner's colours instead of the headline.
//
// Email is not a web page. Mail apps drop <style> blocks, scripts and our
// font, so every style is inline, the layout is tables, the fonts fall back
// to Arial, and the pictures (the sign, a notice's icon) are PNGs on
// jonz.app drawn by `npm run brand`. Every word that comes in is escaped:
// nothing a person typed can add markup.

/** One email, ready to send: Resend takes these four as they are. */
export interface EmailMessage {
  subject: string;
  /** The line a mail app shows under the subject. Never shown in the email itself. */
  preheader: string;
  html: string;
  text: string;
}

/** Where the pictures live: the web build serves apps/client/public/email/ here. */
export const EMAIL_ASSETS = `${LEGAL.site}/email`;

/** Who Jonz's emails come from, and where a reply goes. */
export const EMAIL_ADDRESSES = {
  from: `${APP_NAME} <hello@jonz.app>`,
  replyTo: "support@jonz.app",
} as const;

// Bin Night, as fixed values: an email can't read the app's theme. The dark
// ones are for mail apps that follow the phone's dark mode (Apple Mail,
// Outlook), through the one <style> block that those apps keep.
const C = {
  paper: "#ffffff",
  ink: "#16181a",
  muted: "#596066",
  line: "#c5c9c3",
  card: "#f7f8f5",
  hivis: "#f6b800",
  night: "#1a1d20",
  nightInk: "#edefeb",
  nightMuted: "#99a0a5",
  hazard: "#c8410c",
  darkPaper: "#16181a",
  darkLine: "#33383d",
  darkMuted: "#a3aaa6",
} as const;

const FONT = "Arial, Helvetica, sans-serif";
/** The headline's face: Overpass where the mail app loads it (Apple Mail does), Arial Black elsewhere. */
const DISPLAY = "Overpass, 'Arial Black', Arial, Helvetica, sans-serif";

/** A block of an email's body, in order. */
export type EmailBlock =
  | { type: "text"; text: string; strong?: boolean }
  | { type: "small"; text: string }
  | { type: "button"; label: string; url: string }
  | { type: "code"; code: string }
  | { type: "rows"; rows: readonly (readonly [string, string])[] };

/** A notice from the owner, shown as a Panel in its banner's colours. */
export interface EmailPanel {
  kind: NoticeKind;
  title: string;
  body: string;
}

export interface EmailSpec {
  subject: string;
  preheader: string;
  /** The black-caps headline, five words or so. Left out when there's a panel. */
  headline?: string;
  /** The one sentence under the headline, in bold. */
  lead?: string;
  panel?: EmailPanel;
  blocks: readonly EmailBlock[];
  /** Why this person got this email, said plainly at the foot. */
  why: string;
  /** For optional email: a link that turns this kind off. */
  unsubscribe?: { label: string; url: string };
  /** The language it's written in, for the words at its foot. English when left out. */
  language?: Language;
}

/**
 * A link's address, if it's one an email may carry: https, or a template's
 * placeholder (Supabase's `{{ .ConfirmationURL }}`). Anything else is
 * refused, so a notice can never carry another scheme.
 */
export function safeEmailUrl(url: string): string {
  if (/^https:\/\//.test(url) || /^\{\{[^}]+\}\}$/.test(url.trim())) return url;
  throw new Error(`An email link must be https: ${url}`);
}

/** A notice's colours, the same as its banner in the app (apps/client/src/components/notice-banner.tsx). */
const PANEL = {
  status: { ground: C.night, ink: C.nightInk, soft: C.nightMuted, border: "" },
  offer: { ground: C.hivis, ink: C.ink, soft: C.ink, border: `border:3px solid ${C.ink};` },
  news: { ground: C.card, ink: C.ink, soft: C.ink, border: `border:1px solid ${C.line};` },
} satisfies Record<NoticeKind, { ground: string; ink: string; soft: string; border: string }>;

/** A notice's icon on its tile, as drawn by `npm run brand`. News has a light copy for dark mode. */
export const EMAIL_IMAGES = {
  sign: { path: "sign.png", width: 85, height: 34, alt: APP_NAME },
  icon: (kind: NoticeKind) => ({ path: `notice-${kind}.png`, size: 48 }),
  newsDark: "notice-news-dark.png",
  tape: "hazard-tape.png",
} as const;

const img = (path: string, width: number, height: number, alt: string, extra = "", className = "") =>
  `<img${className ? ` class="${className}"` : ""} src="${EMAIL_ASSETS}/${path}" width="${width}" height="${height}" alt="${escapeHtml(alt)}" style="display:block;border:0;outline:none;text-decoration:none;${extra}">`;

function panelHtml(panel: EmailPanel): string {
  const p = PANEL[panel.kind];
  const icon = EMAIL_IMAGES.icon(panel.kind);
  const tape =
    panel.kind === "status"
      ? `<tr><td style="height:12px;line-height:12px;font-size:0;background:${C.hazard} url(${EMAIL_ASSETS}/${EMAIL_IMAGES.tape}) repeat-x;">&nbsp;</td></tr>`
      : "";
  const iconImg =
    panel.kind === "news"
      ? img(icon.path, icon.size, icon.size, "", "", "jz-light") +
        img(EMAIL_IMAGES.newsDark, icon.size, icon.size, "", "display:none;", "jz-dark")
      : img(icon.path, icon.size, icon.size, "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="jz-panel-${panel.kind}" style="border-collapse:separate;background:${p.ground};${p.border}border-radius:10px;">
${tape}<tr><td style="padding:22px 22px 20px;">
${iconImg}
<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
<div class="jz-panel-title" style="font-family:${DISPLAY};font-weight:900;font-size:26px;line-height:1.08;text-transform:uppercase;letter-spacing:0.01em;color:${p.ink};">${escapeHtml(panel.title.replace(/\.$/, ""))}</div>
<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
<div class="jz-panel-body" style="font-family:${FONT};font-size:16px;line-height:1.45;color:${p.soft};">${escapeHtml(panel.body)}</div>
</td></tr>${tape}</table>`;
}

function blockHtml(block: EmailBlock): string {
  const p = (inner: string, style = "") =>
    `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.ink};${style}" class="jz-ink">${inner}</p>`;
  switch (block.type) {
    case "text":
      return p(block.strong ? `<strong>${escapeHtml(block.text)}</strong>` : escapeHtml(block.text));
    case "small":
      return `<p style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.muted};" class="jz-muted">${escapeHtml(block.text)}</p>`;
    case "code":
      return `<p style="margin:4px 0 18px;font-family:${DISPLAY};font-weight:900;font-size:36px;line-height:1;letter-spacing:0.14em;color:${C.ink};" class="jz-ink">${escapeHtml(block.code)}</p>`;
    case "button":
      // A table cell carries the amber, so Outlook draws it too; the inset ink line is the app's button edge.
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td style="background:${C.hivis};border:2px solid ${C.ink};border-radius:6px;">
<a href="${escapeHtml(safeEmailUrl(block.url))}" style="display:inline-block;padding:12px 22px 11px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${C.ink};text-decoration:none;">${escapeHtml(block.label)}</a>
</td></tr></table>`;
    case "rows":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;">${block.rows
        .map(
          ([k, v]) =>
            `<tr><td valign="top" class="jz-ink jz-rule" style="width:38%;padding:9px 10px 9px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:1.45;font-weight:700;color:${C.ink};">${escapeHtml(k)}</td><td valign="top" class="jz-ink jz-rule" style="padding:9px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:1.45;color:${C.ink};">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.type) {
    case "text":
    case "small":
      return block.text;
    case "code":
      return block.code;
    case "button":
      return `${block.label}: ${block.url}`;
    case "rows":
      return block.rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  }
}

/** The address at the head and foot of every email; its tagline is in the email's language. */
const EMAIL_SITE = "jonz.app";

/** The one <style> block: dark mode where the mail app follows the phone, and a narrower gutter on a phone. */
const STYLE = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.jz-body,.jz-paper{background:${C.darkPaper}!important}
.jz-ink{color:${C.nightInk}!important}
.jz-muted,.jz-muted a{color:${C.darkMuted}!important}
.jz-rule{border-color:${C.darkLine}!important}
.jz-headrule{border-color:${C.nightInk}!important}
.jz-panel-news{background:${C.night}!important;border-color:${C.darkLine}!important}
.jz-panel-news .jz-panel-title,.jz-panel-news .jz-panel-body{color:${C.nightInk}!important}
.jz-light{display:none!important}
.jz-dark{display:block!important}
}
@media (max-width:620px){.jz-pad{padding-left:20px!important;padding-right:20px!important}}
</style>`;

/** An email, drawn: its HTML and the plain-text copy beside it. */
export function renderEmail(spec: EmailSpec): EmailMessage {
  const tagline = wordsIn(spec.language)("email.foot.tagline");
  const sign = EMAIL_IMAGES.sign;
  const top = spec.panel
    ? panelHtml(spec.panel)
    : `${spec.headline ? `<h1 class="jz-ink" style="margin:0 0 8px;font-family:${DISPLAY};font-weight:900;font-size:30px;line-height:1.05;text-transform:uppercase;letter-spacing:0.01em;color:${C.ink};">${escapeHtml(spec.headline)}</h1>` : ""}${
        spec.lead ? `<p class="jz-ink" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.45;font-weight:700;color:${C.ink};">${escapeHtml(spec.lead)}</p>` : ""
      }`;
  const unsubscribe = spec.unsubscribe
    ? `<p style="margin:0 0 6px;" class="jz-muted"><a href="${escapeHtml(safeEmailUrl(spec.unsubscribe.url))}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(spec.unsubscribe.label)}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(spec.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Overpass:wght@900&amp;display=swap" rel="stylesheet">
${STYLE}</head>
<body class="jz-body" style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(spec.preheader)}${"&#847; &zwnj; &nbsp; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="jz-paper" style="background:${C.paper};"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td class="jz-pad" style="padding:28px 32px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="jz-headrule" style="border-bottom:3px solid ${C.ink};"><tr>
<td style="padding:0 0 18px;">${img(sign.path, sign.width, sign.height, sign.alt)}</td>
<td align="right" class="jz-muted" style="padding:0 0 18px;font-family:${FONT};font-size:13px;color:${C.muted};">${EMAIL_SITE}</td>
</tr></table>
<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
${top}
<div style="height:22px;line-height:22px;font-size:0;">&nbsp;</div>
${spec.blocks.map(blockHtml).join("\n")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="jz-rule" style="border-top:1px solid ${C.line};margin-top:8px;"><tr><td class="jz-muted" style="padding:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.55;color:${C.muted};">
<p style="margin:0 0 6px;">${escapeHtml(spec.why)}</p>${unsubscribe}
<p style="margin:0 0 6px;">${escapeHtml(tagline)}</p>
<p style="margin:0;"><a href="${LEGAL.site}" style="color:${C.muted};text-decoration:none;">${EMAIL_SITE}</a></p>
</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>
`;
  const head = spec.panel ? [spec.panel.title, spec.panel.body] : [spec.headline ?? "", spec.lead ?? ""];
  const text = [
    ...head.filter(Boolean),
    "",
    ...spec.blocks.map(blockText).flatMap((t) => [t, ""]),
    "--",
    spec.why,
    ...(spec.unsubscribe ? [`${spec.unsubscribe.label}: ${spec.unsubscribe.url}`] : []),
    tagline,
    LEGAL.site,
    "",
  ].join("\n");
  return { subject: spec.subject, preheader: spec.preheader, html, text };
}

// ── The emails ──────────────────────────────────────────────────────────────

/** Hi, by first name when there is one. */
const hi = (name: string | null | undefined, words: Words) => {
  const first = name?.trim().split(/\s+/)[0];
  return first ? words("email.hi", { name: first }) : words("email.hiAnon");
};

/** When an account is deleted, to the address it had. Sent once, after the delete has finished. */
export function accountDeletedEmail(args: { name: string | null; deletedOn: string; language?: Language }): EmailMessage {
  const words = wordsIn(args.language);
  return renderEmail({
    language: args.language,
    subject: words("email.deleted.subject"),
    preheader: words("email.deleted.preheader"),
    headline: words("email.deleted.headline"),
    lead: words("email.deleted.lead", { date: args.deletedOn }),
    blocks: [
      { type: "text", text: hi(args.name, words) },
      { type: "text", text: words("email.deleted.gone") },
      { type: "text", text: words("email.deleted.again") },
      { type: "small", text: words("email.deleted.notYou") },
    ],
    why: words("email.deleted.why"),
  });
}

/** Where someone reads a report and its replies in the app. */
export const reportUrl = (id: string) => `${LEGAL.site}/house/reports/${id}`;

/**
 * A reply to someone's report, to the address they sign in with beside the
 * push, or to the address an emailed one came from. Replying to the email
 * reaches support@jonz.app, and the "(ref …)" in the subject puts the
 * answer back on the same report. `url` is where to read it in the app:
 * none when it came by email from someone without an account. `fixed` is
 * the "it's fixed" message, sent to everyone who reported it.
 */
export function reportReplyEmail(args: {
  id: string;
  name: string | null;
  signed: string | null;
  kind: ReportKind;
  words: string;
  subject?: string | null;
  reply: string;
  url: string | null;
  fixed?: boolean;
  language?: Language;
}): EmailMessage {
  const words = wordsIn(args.language);
  const who = args.signed ? words("email.report.signed", { name: args.signed }) : APP_NAME;
  const paragraphs = args.reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const about = args.subject?.trim() ? args.subject.trim().replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").replace(/\(ref [0-9a-f]{8}\)/gi, "").trim() : "";
  const topic = about ? reportGist(about, 60) : reportGist(args.words, 60);
  return renderEmail({
    language: args.language,
    subject: words("email.report.subject", { fixed: Boolean(args.fixed), topic, ref: refTag(args.id) }),
    preheader: reportGist(args.reply, 90),
    headline: args.fixed ? words("email.report.headlineFixed") : words("email.report.headline"),
    lead: args.fixed ? words("email.report.leadFixed", { who }) : words("email.report.lead", { who }),
    blocks: [
      { type: "text", text: hi(args.name, words) },
      ...paragraphs.map((text) => ({ type: "text" as const, text })),
      ...(args.url ? [{ type: "button" as const, label: words("email.report.open"), url: args.url }] : []),
      { type: "small", text: words("email.report.youWrote", { words: reportGist(args.words, 140) }) },
    ],
    why: args.url ? words("email.report.why", { about: args.kind }) : words("email.report.whyEmailed", { address: EMAIL_ADDRESSES.replyTo }),
  });
}

/** Who gets a notice by email: a status goes to everyone, offers and news only to those who said yes. */
const noticeEmailWhy = (kind: NoticeKind, words: Words) => (kind === "status" ? words("email.notice.whyStatus") : words("email.notice.whyNews"));

/**
 * A notice from the owner, by email: the same title, words and link as its
 * banner in the app, as a Panel. `more` is an optional longer note under it.
 */
export function noticeEmail(args: {
  kind: NoticeKind;
  title: string;
  body: string;
  name: string | null;
  more?: string | null;
  link?: { label: string; url: string } | null;
  unsubscribeUrl?: string | null;
  language?: Language;
}): EmailMessage {
  const words = wordsIn(args.language);
  const blocks: EmailBlock[] = [{ type: "text", text: hi(args.name, words) }];
  if (args.more) blocks.push({ type: "text", text: args.more });
  if (args.link) blocks.push({ type: "button", label: args.link.label, url: args.link.url });
  return renderEmail({
    subject: args.title.replace(/\.$/, ""),
    preheader: args.body,
    panel: { kind: args.kind, title: args.title, body: args.body },
    blocks,
    why: noticeEmailWhy(args.kind, words),
    language: args.language,
    unsubscribe:
      args.kind !== "status" && args.unsubscribeUrl ? { label: words("email.notice.stop"), url: args.unsubscribeUrl } : undefined,
  });
}

/**
 * A message from the owner (docs/specs/owner-admin.md, "Messages"), by
 * email: the subject, then the words as they were written, paragraph by
 * paragraph, and a way back to the app. Replying reaches support@jonz.app.
 */
export function ownerMessageEmail(args: {
  name: string | null;
  subject: string;
  body: string;
  url: string;
  test?: boolean;
  language?: Language;
}): EmailMessage {
  const words = wordsIn(args.language);
  const paragraphs = args.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return renderEmail({
    subject: args.test ? words("email.message.testSubject", { subject: args.subject }) : args.subject,
    preheader: args.body.slice(0, 90),
    headline: args.subject,
    blocks: [
      { type: "text", text: hi(args.name, words) },
      ...paragraphs.map((text) => ({ type: "text" as const, text })),
      { type: "button", label: words("email.message.open"), url: args.url },
    ],
    why: args.test ? words("email.message.whyTest") : words("email.message.why"),
    language: args.language,
  });
}

/**
 * A promotion, to someone it names (Email them on its page): its offer in
 * the amber panel, the owner's line, what each plan costs with it, and the
 * one button to its link. The small print says which email it works for.
 */
export function offerEmail(args: {
  name: string | null;
  email: string;
  terms: PromotionTerms;
  note: string | null;
  currency?: Currency;
  url: string;
  zone: string;
  language?: Language;
}): EmailMessage {
  const words = wordsIn(args.language);
  const currency = args.currency ?? "USD";
  const title = promotionTitle(args.terms, currency);
  const sentence = promotionSentence({ ...args.terms, endsAt: null }, args.zone, currency);
  const until = args.terms.endsAt ? new Intl.DateTimeFormat(words.locale, { day: "numeric", month: "long", timeZone: args.zone }).format(args.terms.endsAt) : null;
  const rows = promotionPrices(args.terms, currency).map((p) => [p.label, p.then ? `${p.first}, ${p.then}` : p.first] as const);
  return renderEmail({
    subject: title,
    preheader: args.note ?? sentence,
    panel: { kind: "offer", title: `${title}.`, body: sentence },
    blocks: [
      { type: "text", text: hi(args.name, words) },
      ...(args.note ? [{ type: "text" as const, text: args.note }] : []),
      ...(rows.length ? [{ type: "rows" as const, rows }] : []),
      { type: "button", label: words('house.promotion.useIt'), url: args.url },
      { type: "small", text: offerSmallPrint(args.email, until, args.terms.kind === "gift", words) },
    ],
    why: words('house.promotion.emailWhy'),
    language: args.language,
  });
}
