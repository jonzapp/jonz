import { Marked, type Token, type Tokens, type TokenizerExtension } from "marked";

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
  you: { label: "You (name, look, sign-in, help)", href: "/house/you" },
  wall: { label: "Wall", href: "/house/wall" },
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
  | { t: "chip"; kind: "john" | "person" | "page"; ref: string; label: string }
  | { t: "br" };

export type Block =
  | { t: "p"; kids: Inline[] }
  | { t: "heading"; kids: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "quote"; blocks: Block[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][]; align: ("left" | "right" | "center" | null)[] }
  | { t: "card"; card: ReplyCard }
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

/** A jonz: address as a chip, or null for one the app doesn't know. */
export function chipOf(href: string, label: string): Extract<Inline, { t: "chip" }> | null {
  const m = /^jonz:(john|person|page)\/(.+)$/i.exec(href.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase() as "john" | "person" | "page";
  const ref = decodeURIComponent(m[2]).trim();
  if (!ref || !label.trim()) return null;
  if (kind === "page" && !(ref.toLowerCase() in PAGES)) return null;
  return { t: "chip", kind, ref: kind === "page" ? ref.toLowerCase() : ref, label: label.trim() };
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

function inlines(tokens: readonly Token[] | undefined): Inline[] {
  const out: Inline[] = [];
  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case "text":
      case "escape":
        out.push(...((tok as Tokens.Text).tokens ? inlines((tok as Tokens.Text).tokens) : [text(unescape(tok.text))]));
        break;
      case "strong":
        out.push({ t: "strong", kids: merge(inlines(tok.tokens)) });
        break;
      case "em":
        out.push({ t: "em", kids: merge(inlines(tok.tokens)) });
        break;
      case "del":
        out.push({ t: "del", kids: merge(inlines(tok.tokens)) });
        break;
      case "codespan":
        out.push(text(unescape(tok.text)));
        break;
      case "br":
        out.push({ t: "br" });
        break;
      case "link": {
        const words = plain(tok.tokens);
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

function blocks(tokens: readonly Token[], depth: number, cards: { n: number }): Block[] {
  const out: Block[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case "space":
        break;
      case "paragraph":
      case "text": {
        const kids = merge(inlines((tok as Tokens.Paragraph).tokens ?? [text(tok.text)] as never));
        if (kids.length) out.push({ t: "p", kids });
        break;
      }
      case "heading":
        out.push({ t: "heading", kids: merge(inlines(tok.tokens)) });
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
            blocks: blocks(item.tokens.filter((t) => t.type !== "checkbox"), depth + 1, cards),
          })),
        });
        break;
      }
      case "blockquote":
        if (depth >= NEST_MAX) out.push({ t: "p", kids: [text(plain(tok.tokens).trim())] });
        else out.push({ t: "quote", blocks: blocks(tok.tokens ?? [], depth + 1, cards) });
        break;
      case "table": {
        const table = tok as Tokens.Table;
        out.push({
          t: "table",
          head: table.header.map((c) => merge(inlines(c.tokens))),
          rows: table.rows.map((r) => r.map((c) => merge(inlines(c.tokens)))),
          align: table.align,
        });
        break;
      }
      case "hr":
        out.push({ t: "rule" });
        break;
      case "code":
        // No code in a chat about chores: its lines as words.
        for (const line of tok.text.split("\n").filter((l: string) => l.trim())) out.push({ t: "p", kids: [text(line)] });
        break;
      case "jonzCard": {
        const card = cardOf(tok.name as string, tok.attrs as Record<string, string>);
        if (card && cards.n < CARDS_MAX) {
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
 * A reply as plain words, a line a block: what a screen reader's summary,
 * a notification or a copy to the clipboard gets. Chips are their words;
 * cards say nothing (their rows speak for themselves).
 */
export function replyText(source: string): string {
  const line = (kids: Inline[]): string =>
    kids.map((k) => (k.t === "text" ? k.text : k.t === "chip" ? k.label : k.t === "br" ? "\n" : line(k.kids))).join("");
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
        default:
          return [];
      }
    });
  return walk(parseReply(source)).join("\n");
}

/** The words around a reply's cards and chips. */
export const REPLY_COPY = {
  /** ::week's heading: whose Johns, and whether only those still to do. */
  weekLabel: (who: string | null, open: boolean) =>
    who === null ? (open ? "Still to do this week" : "This week") : `${who === "You" ? "Your" : `${who}’s`} ${open ? "Johns still to do" : "week"}`,
  weekEmpty: (open: boolean) => (open ? "Nothing left to do this week." : "Nothing dealt this week yet."),
  shares: "Fair shares",
  johns: "On the list",
  johnsEmpty: "None of those are on the list now.",
  /** A chip's spoken words, after its own. */
  spokenJohn: (name: string) => `${name}, John`,
  spokenPage: (name: string) => `${name}, page`,
} as const;

/** What each card shows, for the prompt. */
const CARD_GUIDE: Record<CardName, string> = {
  week: `::week shows this week's Johns as live rows (who has each, when it's due, whether it's done). ::week{who="me"} or ::week{who="Priya"} for one person's; add open for only those still to do: ::week{open}.`,
  shares: `::shares shows fair shares: everyone's balance against their share.`,
  johns: `::johns{refs="ref ref"} shows those Johns from the list, with how often, when and points; ::johns alone shows the whole list.`,
};

/**
 * How Ask Jonz writes, for its instructions: built from PAGES and CARDS, so
 * the prompt can only name chips and cards the app draws.
 */
export const REPLY_FORMAT_GUIDE = [
  "How to write (the app draws your reply as Markdown, with its own pieces):",
  "- Write Markdown like other chat apps: **bold** for the few words that matter, a short bullet or numbered list for steps or several things, a ### heading only when a long reply has parts, a small table only to compare a few numbers side by side. No emoji, code, web links or images.",
  "- Keep it short: most replies are one to three sentences, and none longer than a phone screen.",
  "- Name things as chips people can tap: a John as [its name](jonz:john/REF) with its ref from list_johns; someone in the house as [first name](jonz:person/First name) (never the person you're talking with: that's just “you”); a page of the app as [its name](jonz:page/NAME).",
  `- The pages: ${(Object.keys(PAGES) as PageName[]).map((p) => `${p} (${PAGES[p].label})`).join(", ")}.`,
  "- Show the house's facts as live cards rather than typing them out, each on a line of its own:",
  ...CARDS.map((c) => `  - ${CARD_GUIDE[c]}`),
  `- A card shows the app's own live data: don't repeat its rows in words; say in a sentence what matters about it. At most ${CARDS_MAX} cards a reply.`,
].join("\n");
