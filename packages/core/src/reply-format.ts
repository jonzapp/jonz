import type { Words } from "./words-for";
import { Marked, type Token, type Tokens, type TokenizerExtension } from "marked";

import { ADMIN_PAGES } from "./owner-admin";

/**
 * Ask Jonz's replies: Markdown (CommonMark with GitHub's tables), plus
 * Jonz's own pieces. Claude writes Markdown best, and every chat app shows
 * it; the pieces are what make it Jonz's:
 *
 * - A chip inside a sentence is a link with a jonz: address:
 *   [Bins out](jonz:john/3f2a9c1e) (a John by its ref from list_johns),
 *   [Priya](jonz:person/Priya) (someone by first name, "me" for the person
 *   asking), [Time away](jonz:page/away) (a page of the app, PAGES).
 * - A card on a line of its own is a directive (the generic-directives
 *   proposal for CommonMark, as remark-directive reads it): ::week, ::shares,
 *   ::johns, with {attributes}. Cards draw live data from the app, so their
 *   numbers are never words the model typed.
 *
 * This file turns the text into a small tree of blocks the app draws with its
 * own text roles and components. Anything outside it is shown as plain words:
 * raw HTML as text, images as their alt text, web links as their words (Jonz
 * never sends anyone off the app from a chat), and a chip or card the app
 * doesn't know as its words or nothing. Parsing is pure: no code in the text
 * ever runs.
 */

/** A page of the app a chip can open, by the short name Claude writes. */
export const PAGES = {
  today: { label: "Today", href: "/today" },
  week: { label: "Week", href: "/week" },
  shares: { label: "Fair shares", href: "/week/record" },
  house: { label: "House", href: "/house" },
  johns: { label: "The John list", href: "/house/johns" },
  away: { label: "Days and time away", href: "/house/away" },
  history: { label: "History", href: "/house/history" },
  rules: { label: "House rules", href: "/house/rules" },
  groups: { label: "Groups", href: "/house/groups" },
  stake: { label: "Stake", href: "/house/stake" },
  pass: { label: "House Pass", href: "/house/pass" },
  you: { label: "You (name, look, sign-in, help)", href: "/you" },
  wall: { label: "Wall", href: "/house/wall" },
  guide: { label: "Guide", href: "/house/guide" },
} as const;
export type PageName = keyof typeof PAGES;

/** The cards a reply can hold, and what each one's attributes may say. */
export const CARDS = ["week", "shares", "johns"] as const;
export type CardName = (typeof CARDS)[number];

export type ReplyCard =
  /** This week's Johns as live rows: everyone's, one person's ("me" or a first name), and all or only those still to do. */
  | { card: "week"; who: string | null; open: boolean }
  /** Fair shares: everyone's balance against their share. */
  | { card: "shares" }
  /** Johns from the list, by ref; every John when there are none. */
  | { card: "johns"; refs: string[] };

export type Inline =
  | { t: "text"; text: string }
  | { t: "strong"; kids: Inline[] }
  | { t: "em"; kids: Inline[] }
  | { t: "del"; kids: Inline[] }
  | { t: "chip"; kind: ChipKind; ref: string; label: string }
  /** A page's own link (parseDoc only): a web page, an email address, or a path in the app. */
  | { t: "link"; href: string; kids: Inline[] }
  /** Words to type exactly, like an address (parseDoc only). */
  | { t: "code"; text: string }
  | { t: "br" };

export type Block =
  | { t: "p"; kids: Inline[] }
  | { t: "heading"; kids: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "quote"; blocks: Block[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][]; align: ("left" | "right" | "center" | null)[] }
  | { t: "card"; card: ReplyCard }
  /** A fenced line to copy, like an address to paste (parseDoc only): drawn with a Copy button. */
  | { t: "copy"; text: string }
  | { t: "rule" };

export interface ListItem {
  /** A task list's box: true ticked, false not; null for a plain item. */
  checked: boolean | null;
  blocks: Block[];
}

/** How deep lists and quotes nest before what's inside is flattened to words: a phone has no room for more. */
const NEST_MAX = 3;
/** The most cards one reply shows, so a reply can't turn into a page of them. */
export const CARDS_MAX = 3;

/** "::name{a="b" c}" on a line of its own. */
const directive: TokenizerExtension = {
  name: "jonzCard",
  level: "block",
  start: (src) => src.match(/^::|\n::/)?.index,
  tokenizer(src) {
    const m = /^::([a-z]+)(?:\{([^}\n]*)\})?[ \t]*(?:\n+|$)/.exec(src);
    if (!m) return undefined;
    return { type: "jonzCard", raw: m[0], name: m[1], attrs: attrsOf(m[2] ?? "") };
  },
};

const parser = new Marked({ gfm: true, breaks: false, extensions: [directive] });

/** `who="me" open` → { who: "me", open: "" }. Quotes may be straight or curly. */
export function attrsOf(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z]+)(?:\s*=\s*(?:["“”']([^"“”']*)["“”']|([^\s"“”']+)))?/g;
  for (const m of source.matchAll(re)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? "").trim();
  return out;
}

/** A directive the app knows, its attributes checked; null for anything else. */
export function cardOf(name: string, attrs: Record<string, string>): ReplyCard | null {
  switch (name) {
    case "week": {
      const who = attrs.who?.trim();
      return { card: "week", who: who && who.toLowerCase() !== "all" && who.toLowerCase() !== "everyone" ? who : null, open: "open" in attrs };
    }
    case "shares":
      return { card: "shares" };
    case "johns": {
      const refs = (attrs.refs ?? attrs.ref ?? "").split(/[\s,]+/).filter((r) => /^[0-9a-f]{4,36}$/i.test(r));
      return { card: "johns", refs };
    }
    default:
      return null;
  }
}

/**
 * What a chip can stand for. A house's: a John, someone in the house, a page
 * of the app. The owner's (their Ask Jonz only): a report in the Inbox, an
 * audit entry, an account, an admin page. Each chat's pieces find only their
 * own; anything else is drawn as its words.
 */
export const CHIP_KINDS = ["john", "person", "page", "report", "audit", "account", "admin"] as const;
export type ChipKind = (typeof CHIP_KINDS)[number];

const ID = /^[0-9a-f][0-9a-f-]{3,35}$/i;
const ADMIN_KEYS: readonly string[] = ADMIN_PAGES.map((p) => p.key);

/** A jonz: address as a chip, or null for one the app doesn't know. */
export function chipOf(href: string, label: string): Extract<Inline, { t: "chip" }> | null {
  const m = new RegExp(`^jonz:(${CHIP_KINDS.join("|")})/(.+)$`, "i").exec(href.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase() as ChipKind;
  const ref = decodeURIComponent(m[2]).trim();
  if (!ref || !label.trim()) return null;
  const lower = ref.toLowerCase();
  if (kind === "page" && !(lower in PAGES)) return null;
  if (kind === "admin" && !ADMIN_KEYS.includes(lower)) return null;
  if ((kind === "report" || kind === "account") && !ID.test(ref)) return null;
  if (kind === "audit" && !/^\d{1,18}$/.test(ref)) return null;
  return { t: "chip", kind, ref: kind === "page" || kind === "admin" ? lower : ref, label: label.trim() };
}

function text(t: string): Inline {
  return { t: "text", text: t };
}

/** Runs of plain words side by side become one, so the app draws fewer pieces. */
function merge(kids: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const k of kids) {
    const last = out.at(-1);
    if (k.t === "text" && last?.t === "text") last.text += k.text;
    else if (k.t !== "text" || k.text) out.push(k);
  }
  return out;
}

/** What words a token stands for, for anything drawn as plain words. */
function plain(tokens: readonly Token[] | undefined): string {
  return (tokens ?? [])
    .map((tok) => {
      const t = tok as Tokens.Generic;
      if (t.tokens) return plain(t.tokens);
      if (t.type === "image") return (t as Tokens.Image).text;
      if (t.type === "br") return " ";
      return typeof t.text === "string" ? unescape(t.text) : "";
    })
    .join("");
}

/** marked leaves &amp; and friends in text; the app shows characters. */
function unescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Where a page's link may go: a web page, an email address, or a path in the app. Anything else is its words. */
export function docHref(href: string): string | null {
  return /^(https:\/\/|mailto:)/.test(href) || /^\/(?!\/)/.test(href) ? href : null;
}

/** How the text is read: a chat reply (the default), or one of Jonz's own pages (parseDoc), which may link out and show code to copy. */
interface Mode {
  doc: boolean;
}
const REPLY: Mode = { doc: false };

function inlines(tokens: readonly Token[] | undefined, mode: Mode = REPLY): Inline[] {
  const out: Inline[] = [];
  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case "text":
      case "escape":
        out.push(...((tok as Tokens.Text).tokens ? inlines((tok as Tokens.Text).tokens, mode) : [text(unescape(tok.text))]));
        break;
      case "strong":
        out.push({ t: "strong", kids: merge(inlines(tok.tokens, mode)) });
        break;
      case "em":
        out.push({ t: "em", kids: merge(inlines(tok.tokens, mode)) });
        break;
      case "del":
        out.push({ t: "del", kids: merge(inlines(tok.tokens, mode)) });
        break;
      case "codespan":
        out.push(mode.doc ? { t: "code", text: unescape(tok.text) } : text(unescape(tok.text)));
        break;
      case "br":
        out.push({ t: "br" });
        break;
      case "link": {
        const words = plain(tok.tokens);
        const href = mode.doc ? docHref(tok.href) : null;
        if (href) {
          out.push({ t: "link", href, kids: merge(inlines(tok.tokens, mode)) });
          break;
        }
        out.push(chipOf(tok.href, words) ?? (words ? { t: "strong", kids: [text(words)] } : text("")));
        break;
      }
      case "image":
        out.push(text(tok.text));
        break;
      default:
        // Raw HTML and anything else: its words, never markup.
        out.push(text(unescape("text" in tok && typeof tok.text === "string" ? tok.text : tok.raw)));
    }
  }
  return out;
}

function blocks(tokens: readonly Token[], depth: number, cards: { n: number }, mode: Mode = REPLY): Block[] {
  const out: Block[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case "space":
        break;
      case "paragraph":
      case "text": {
        const kids = merge(inlines((tok as Tokens.Paragraph).tokens ?? [text(tok.text)] as never, mode));
        if (kids.length) out.push({ t: "p", kids });
        break;
      }
      case "heading":
        out.push({ t: "heading", kids: merge(inlines(tok.tokens, mode)) });
        break;
      case "list": {
        const list = tok as Tokens.List;
        if (depth >= NEST_MAX) {
          for (const item of list.items) out.push({ t: "p", kids: [text(plain(item.tokens).trim())] });
          break;
        }
        out.push({
          t: "list",
          ordered: list.ordered,
          start: typeof list.start === "number" ? list.start : 1,
          items: list.items.map((item) => ({
            checked: item.task ? Boolean(item.checked) : null,
            blocks: blocks(item.tokens.filter((t) => t.type !== "checkbox"), depth + 1, cards, mode),
          })),
        });
        break;
      }
      case "blockquote":
        if (depth >= NEST_MAX) out.push({ t: "p", kids: [text(plain(tok.tokens).trim())] });
        else out.push({ t: "quote", blocks: blocks(tok.tokens ?? [], depth + 1, cards, mode) });
        break;
      case "table": {
        const table = tok as Tokens.Table;
        out.push({
          t: "table",
          head: table.header.map((c) => merge(inlines(c.tokens, mode))),
          rows: table.rows.map((r) => r.map((c) => merge(inlines(c.tokens, mode)))),
          align: table.align,
        });
        break;
      }
      case "hr":
        out.push({ t: "rule" });
        break;
      case "code":
        if (mode.doc) {
          if (tok.text.trim()) out.push({ t: "copy", text: tok.text.trim() });
          break;
        }
        // No code in a chat about chores: its lines as words.
        for (const line of tok.text.split("\n").filter((l: string) => l.trim())) out.push({ t: "p", kids: [text(line)] });
        break;
      case "jonzCard": {
        const card = cardOf(tok.name as string, tok.attrs as Record<string, string>);
        if (card && !mode.doc && cards.n < CARDS_MAX) {
          cards.n += 1;
          out.push({ t: "card", card });
        }
        break;
      }
      default: {
        const words = plain("tokens" in tok ? (tok.tokens as Token[]) : undefined) || ("text" in tok ? String(tok.text) : "");
        if (words.trim()) out.push({ t: "p", kids: [text(unescape(words.trim()))] });
      }
    }
  }
  return out;
}

/** A reply as the app draws it. Never throws: text it can't read comes back as one paragraph of its words. */
export function parseReply(source: string): Block[] {
  try {
    return blocks(parser.lexer(source), 0, { n: 0 });
  } catch {
    return source.trim() ? [{ t: "p", kids: [text(source.trim())] }] : [];
  }
}

/**
 * One of Jonz's own pages (Help, the Privacy Policy, the Terms), written in
 * Markdown and drawn like a reply, plus what only Jonz's own words may hold:
 * links to web pages, email addresses and the app's paths, `code` for words
 * to type exactly, and a fenced line to copy. No cards: a page has no house.
 */
export function parseDoc(source: string): Block[] {
  try {
    return blocks(parser.lexer(source), 0, { n: 0 }, { doc: true });
  } catch {
    return source.trim() ? [{ t: "p", kids: [text(source.trim())] }] : [];
  }
}

/** A page's Markdown as plain words, a line a block (see replyText). */
export function docText(source: string): string {
  return wordsOf(parseDoc(source));
}

/**
 * A reply as plain words, a line a block: what a screen reader's summary,
 * a notification or a copy to the clipboard gets. Chips are their words;
 * cards say nothing (their rows speak for themselves).
 */
export function replyText(source: string): string {
  return wordsOf(parseReply(source));
}

function wordsOf(top: Block[]): string {
  const line = (kids: Inline[]): string =>
    kids
      .map((k) => (k.t === "text" || k.t === "code" ? k.text : k.t === "chip" ? k.label : k.t === "br" ? "\n" : line(k.kids)))
      .join("");
  const walk = (bs: Block[], indent = ""): string[] =>
    bs.flatMap((b) => {
      switch (b.t) {
        case "p":
        case "heading":
          return [indent + line(b.kids)];
        case "list":
          return b.items.flatMap((item, i) => {
            const [first, ...rest] = walk(item.blocks, `${indent}  `);
            const mark = item.checked === null ? (b.ordered ? `${b.start + i}.` : "•") : item.checked ? "☑" : "☐";
            return [`${indent}${mark} ${(first ?? "").trimStart()}`, ...rest];
          });
        case "quote":
          return walk(b.blocks, indent);
        case "table":
          return [b.head, ...b.rows].map((r) => indent + r.map(line).join(", "));
        case "copy":
          return [indent + b.text];
        default:
          return [];
      }
    });
  return walk(top).join("\n");
}

/** What each card shows, for the prompt. */
const CARD_GUIDE: Record<CardName, string> = {
  week: `::week shows this week's Johns as live rows (who has each, when it's due, whether it's done). ::week{who="me"} or ::week{who="Priya"} for one person's; add open for only those still to do: ::week{open}.`,
  shares: `::shares shows fair shares: everyone's balance against their share.`,
  johns: `::johns{refs="ref ref"} shows those Johns from the list, with how often, when and points; ::johns alone shows the whole list.`,
};

/**
 * How the app draws a reply, for both chats' instructions: what each bit of
 * Markdown turns into on the screen, so Claude writes for the screen it has.
 * Each line says what parseReply and components/reply do; change them
 * together.
 */
const SCREEN_RULES = [
  "- The reply shows on a phone, about 40 characters a line, or in a side panel as narrow on a laptop, in the app's own type, light or dark. Lead with the answer, then only what helps. Most replies are one to three sentences; none is longer than a phone screen.",
  "- Paragraphs: a blank line between them. A single line break inside a paragraph is ignored, so never wrap lines by hand.",
  "- **Bold** stands out strongly: use it for the one or two words or numbers that matter most, never a whole sentence. *Italic* shows plain on phones, so never rely on it. ~~Struck~~ words show crossed out: use them only for an old value next to its new one.",
  "- A heading shows as a small bold label, the same at every level: write ### and only when a long reply has two or more parts. Never start a short reply with one.",
  '- Lists: "- " for things side by side, "1. " for steps in order, "- [ ] " and "- [x] " for a to-do list with boxes. Lists nest three deep at most (deeper shows as plain lines); keep each item to a line or two.',
  "- Tables: a phone fits about three short columns. Use one only to compare a few numbers side by side, numbers right-aligned (---:), never for one thing's details.",
  '- "> " shows words with a bar down the side: use it for words someone will copy, like a message to send.',
  "- Code, web links, images and HTML show as their plain words, and emoji look out of place, so never write them.",
  "- A chip is a rounded pill inside the sentence with its own little picture; tapping it opens what it names. Its words stay on one line and are cut short if long, so give it one to four words. Never bold a chip or put one in a heading (it shows as plain words there). A chip whose address the app doesn't know shows as bold words, so use only addresses from your reads.",
  "- Use these pieces with taste, like a good writer, not to decorate: plain sentences are the default, and each piece must earn its place. Reach for one only when it makes the answer quicker to read or act on: a chip for the thing they'll want to open next, a list when there are three or more things or steps, a card when the live rows say it better than words, a table only to compare. A short answer is usually one plain sentence with at most one chip or bold. Never chip the same thing twice in a reply, and never chip or bold in every sentence.",
  "- A list with a chip at the start of each item reads well; a sentence with more than two chips doesn't.",
];

/** How the owner's Ask Jonz writes: Markdown, with chips for what the admin pages hold, and no house's chips or cards. */
export const OWNER_REPLY_GUIDE = [
  "How to write (the app draws your reply as Markdown, with its own pieces):",
  ...SCREEN_RULES,
  "- Name things as chips the owner can tap, with ids from your reads only: a report as [a few words on it](jonz:report/ID), an audit entry as [what happened](jonz:audit/ID), someone's account as [their name](jonz:account/ID), an admin page as [its name](jonz:admin/PAGE). Each shows with an arrow and opens that page.",
  `- The admin pages: ${ADMIN_PAGES.map((p) => `${p.key} (${p.label})`).join(", ")}.`,
  "- For example:",
  "  2 reports are **waiting**:",
  "  1. [Ticks not saving](jonz:report/5c1e9a20) from Sam, this morning",
  "  2. [A dark icon](jonz:report/8b2d4f10) from Priya, yesterday",
  "",
  "  Reply from the [Inbox](jonz:admin/inbox).",
].join("\n");

/**
 * How Ask Jonz writes, for its instructions: built from PAGES and CARDS, so
 * the prompt can only name chips and cards the app draws.
 */
export const REPLY_FORMAT_GUIDE = [
  "How to write (the app draws your reply as Markdown, with its own pieces):",
  ...SCREEN_RULES,
  "- Name things as chips people can tap: a John as [its name](jonz:john/REF) with its ref from list_johns (it shows with the John's colour and opens it); someone in the house as [first name](jonz:person/First name) (it shows with their photo, or their initial, and opens their page; never the person you're talking with: that's just “you”); a page of the app as [its name](jonz:page/NAME) (it shows with an arrow).",
  `- The pages: ${(Object.keys(PAGES) as PageName[]).map((p) => `${p} (${PAGES[p].label})`).join(", ")}.`,
  "- Show the house's facts as live cards rather than typing them out, each on a line of its own with a blank line before and after:",
  ...CARDS.map((c) => `  - ${CARD_GUIDE[c]}`),
  `- A card is a full-width panel with its own heading and the app's own live rows, so never write a heading for it or repeat its rows in words: say in a sentence before it what matters. At most ${CARDS_MAX} cards a reply.`,
  "- For example:",
  "  You have **2 Johns** left this week:",
  "",
  '  ::week{who="me" open}',
  "",
  "  [Bins out](jonz:john/3f2a9c1e) is due tonight. [Priya](jonz:person/Priya) offered to swap if you're busy.",
].join("\n");

/** A week card's heading: "This week", "Your week", "Sam’s Johns still to do". */
export function weekLabel(who: string | null, open: boolean, words: Words): string {
  return words("ask.reply.weekLabel", { whose: who === null ? "none" : who === "You" ? "you" : "name", who: who ?? "", open });
}
