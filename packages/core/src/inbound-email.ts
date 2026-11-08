// Email to support@jonz.app (docs/specs/report-a-problem.md, step 2). Resend
// receives it and calls the API's webhook; these turn what came in into what
// the Inbox keeps: who sent it, the words they wrote this time (not the
// quoted history under them), and which report a reply belongs to. Pure, so
// tests can feed them real mail apps' shapes.

/** The addresses at Jonz that take mail: support, and hello in case a mail app ignores Reply-To. */
export const INBOUND_ADDRESSES = ["support@jonz.app", "hello@jonz.app"] as const;

/** A report's short reference, as Jonz's reply emails carry it in their subject: "(ref 1a2b3c4d)". */
export const reportRef = (id: string) => id.replace(/-/g, "").slice(0, 8).toLowerCase();

export const refTag = (id: string) => `(ref ${reportRef(id)})`;

/** The reference a subject carries, if any. */
export function refOf(subject: string | null | undefined): string | null {
  const match = (subject ?? "").match(/\(ref ([0-9a-f]{8})\)/i);
  return match ? match[1].toLowerCase() : null;
}

/** A subject without its "Re:" and "Fwd:" and reference: what the conversation is about. */
export function topicOf(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/\(ref [0-9a-f]{8}\)/gi, "")
    .replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "Ava Smith <ava@example.com>" as its name and address; a bare address has no name. */
export function parseAddress(value: string | null | undefined): { name: string | null; email: string | null } {
  const text = (value ?? "").trim();
  const angled = text.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: name || null, email: angled[2].toLowerCase() };
  }
  return /^[^@\s<>]+@[^@\s<>]+$/.test(text) ? { name: null, email: text.toLowerCase() } : { name: null, email: null };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** An HTML email as plain lines, for mail that came without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n> \n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (all, name: string) => ENTITIES[name.toLowerCase()] ?? (name.startsWith("#") ? String.fromCharCode(Number(name.slice(1))) : all));
}

/** Where the quoted history of a reply starts, in the shapes the big mail apps write it. */
const QUOTE_STARTS: readonly RegExp[] = [
  /^>/,
  /^On .{4,200}wrote:\s*$/i,
  /^Le .{4,200}a écrit\s*:\s*$/i,
  /^Am .{4,200}schrieb .{0,200}:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^From:\s.+/i,
  /^Sent from my (iPhone|iPad|Android|phone|mobile)/i,
  /^Get Outlook for /i,
  /^-- ?$/,
];

/**
 * The words someone wrote this time: the text part (or the HTML's words),
 * stopping where the quoted history or a signature starts, with spare blank
 * lines taken out, cut to `max` letters.
 */
export function emailWords(email: { text?: string | null; html?: string | null }, max = 2000): string {
  const raw = email.text?.trim() ? email.text : email.html ? htmlToText(email.html) : "";
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const two = `${line.trim()} ${lines[i + 1]?.trim() ?? ""}`;
    if (QUOTE_STARTS.some((start) => start.test(line.trim()))) break;
    // Gmail wraps a long "On … wrote:" over two lines.
    if (/^On .{4,200}$/i.test(line.trim()) && /wrote:\s*$/i.test(two) && !/wrote:\s*$/i.test(line)) break;
    kept.push(line);
  }
  const words = kept
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return words.length <= max ? words : `${words.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Why an email should not become a report, or null when it should: it's an
 * automatic reply or a bounce (answering those would loop), it's from Jonz
 * itself, or it wasn't sent to a support address.
 */
export function skipInbound(email: {
  from: string | null;
  to: readonly string[];
  headers?: Record<string, string | undefined> | null;
}): "address" | "jonz" | "automatic" | "not-support" | null {
  const { email: from } = parseAddress(email.from);
  if (!from) return "address";
  if (from.endsWith("@jonz.app") || from.endsWith(".jonz.app")) return "jonz";
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?)([+@])/i.test(from)) return "automatic";
  const header = (name: string) => {
    const headers = email.headers ?? {};
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return (key ? headers[key] : undefined)?.toLowerCase().trim() ?? "";
  };
  const auto = header("auto-submitted");
  if (auto && auto !== "no") return "automatic";
  if (/^(bulk|junk|list|auto_reply)$/.test(header("precedence"))) return "automatic";
  if (header("x-autoreply") || header("x-autorespond")) return "automatic";
  const to = email.to.map((address) => parseAddress(address).email);
  if (!to.some((address) => address && (INBOUND_ADDRESSES as readonly string[]).includes(address))) return "not-support";
  return null;
}
