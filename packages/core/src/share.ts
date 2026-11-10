import { APP_NAME, pageTitle } from "./app";
import type { HouseKind } from "./domain";
import { wordsFor } from "./words-for";

/** A link preview has no reader, so its words are English. */
const PREVIEW_WORDS = wordsFor("en", "housemates");
const words = PREVIEW_WORDS;

/**
 * What a pasted jonz.app link shows in a chat (iMessage, WhatsApp, Slack,
 * X): its card's title, line and picture. The web app is one page that draws
 * itself in the browser, and the bots that make these cards don't run it, so
 * vercel.json sends them to apps/api, which answers with a page of just
 * these tags (apps/api/app/api/share).
 *
 * A join link's card names its house and how many live there, the two things
 * the join page shows anyone who signs in. Every other page needs a sign-in
 * to show anything, so its card is the brand's, with the page's name.
 */

/** The site the cards send people to. */
export const SHARE_SITE = "https://jonz.app";

/** Every card is this size, the one iMessage, WhatsApp and X all draw large. */
export const SHARE_IMAGE = { width: 1200, height: 630 } as const;

/**
 * Whether a join link's card names the house. Off, every invite reads "You're
 * invited to a house on Jonz", and the card says nothing a stranger with the
 * link couldn't guess.
 */
export const SHARE_NAMES_HOUSE = true;


/**
 * What a card's sign says (packages/core/src/mark.ts, PLATE): the legend on
 * the amber plate, in caps beside the J, and the line on the pavement plate
 * hung under it.
 */
export interface ShareSign {
  legend: string;
  plate: string;
}

/** The brand's sign: every page's card, the banners. */
export const BRAND_SIGN: ShareSign = { legend: APP_NAME, plate: "Fair shares of the housework." };

/** A join link's sign: the house's own name beside the J, or the brand's when it's kept out. */
export function joinSign(invite: InviteCard | null, namesHouse = SHARE_NAMES_HOUSE): ShareSign {
  if (!invite) return { legend: "Invite expired", plate: words('common.share.expiredLine') };
  if (!namesHouse) return { legend: APP_NAME, plate: "You're invited to a house." };
  return { legend: invite.name, plate: wordsFor("en", invite.kind)("common.joinPlate", { count: invite.members }) };
}

/**
 * An offer link's sign: what it gives on the amber plate ("Half off"), "Your
 * House Pass, a gift from Jonz." under it; "Offer ended" once it's stopped,
 * ended or never was.
 */
export function offerSign(offer: OfferCard | null): ShareSign {
  if (!offer?.live) return { legend: "Offer ended", plate: words('common.share.offerEndedLine') };
  return { legend: offer.legend, plate: offer.plate };
}

/** A promotion as its link's card shows it: what anyone with the link sees, never who it's for. */
export interface OfferCard {
  live: boolean;
  legend: string;
  plate: string;
  title: string;
  sentence: string;
}

/** A house as its join link's card shows it. */
export interface InviteCard {
  name: string;
  members: number;
  /** Housemates or a family: the card says "Join the family" for a family. */
  kind: HouseKind;
}

export interface SharePreview {
  title: string;
  description: string;
  /** The page the card opens, on jonz.app. */
  url: string;
  image: string;
  imageAlt: string;
}

/** Each page's name in a card, by its path on jonz.app (the app's routes). */
const PAGES: [RegExp, string][] = [
  [/^\/today$/, words('common.title.today')],
  [/^\/week$/, words('common.title.week')],
  [/^\/week\/record(\/[^/]+)?$/, PREVIEW_WORDS('week.record.title')],
  [/^\/house$/, words('common.title.house')],
  [/^\/house\/wall$/, PREVIEW_WORDS('wall.page.title')],
  [/^\/house\/stake$/, PREVIEW_WORDS('house.stake.title')],
  [/^\/house\/history$/, PREVIEW_WORDS('wall.history.title')],
  [/^\/house\/johns$/, words('common.title.johnList')],
  [/^\/house\/rules$/, words('common.title.rules')],
  [/^\/house\/away$/, words('common.title.away')],
  [/^\/house\/moving$/, words('common.title.moving')],
  [/^\/house\/groups$/, words('common.title.groups')],
  [/^\/house\/describe$/, words('common.title.describe')],
  [/^\/house\/pass$/, words('common.title.pass')],
  [/^\/house\/new$/, words('common.title.newHouse')],
  [/^\/signin$/, words('common.title.signIn')],
  [/^\/privacy$/, words('common.title.privacy')],
  [/^\/help$/, words('common.title.help')],
  [/^\/welcome$/, words('common.title.welcome')],
];

/** The join code in a join link's path, as typed (the API checks it), or null. */
export function joinCodeIn(path: string): string | null {
  const match = /^\/join\/([^/?#]+)\/?$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

/** A path cut to its route: no query, no fragment, no trailing slash. */
function route(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? "/";
  const trimmed = bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** The brand card, named for the page (or just "Jonz" for the front door and anything unknown). */
export function pagePreview(path: string): SharePreview {
  const at = route(path);
  const page = PAGES.find(([pattern]) => pattern.test(at))?.[1];
  return {
    title: pageTitle(page),
    description: words('common.share.description'),
    url: `${SHARE_SITE}${at === "/" ? "" : at}`,
    image: `${SHARE_SITE}/og.png`,
    imageAlt: words('common.share.imageAlt'),
  };
}

/**
 * A join link's card. `invite` is the house its code opens, or null when it
 * opens nothing; `code` is already checked, so it is safe in a URL.
 */
export function joinPreview(code: string, invite: InviteCard | null, namesHouse = SHARE_NAMES_HOUSE): SharePreview {
  const url = `${SHARE_SITE}/join/${code}`;
  const image = `${SHARE_SITE}/api/og/join/${code}`;
  if (!invite) {
    return { title: words('common.share.expiredTitle'), description: words('common.share.expiredLine'), url, image, imageAlt: words('common.share.expiredTitle') };
  }
  if (!namesHouse) {
    return { title: words('common.share.joinGeneric'), description: words('common.share.joinLine'), url, image, imageAlt: words('common.share.joinGeneric') };
  }
  const title = words('common.share.joinTitle', { house: invite.name });
  return {
    title,
    description: `${wordsFor("en", invite.kind)("common.members", { count: invite.members })}. ${words('common.share.joinLine')}`,
    url,
    image,
    imageAlt: title,
  };
}

/**
 * An offer link's card. `offer` is its promotion, or null when the code opens
 * nothing; `code` is already checked (offerCode), so it is safe in a URL.
 */
export function offerPreview(code: string, offer: OfferCard | null): SharePreview {
  const url = `${SHARE_SITE}/offer/${code}`;
  const image = `${SHARE_SITE}/api/og/offer/${code}`;
  if (!offer?.live) {
    return { title: words('common.share.offerEnded'), description: words('common.share.offerEndedLine'), url, image, imageAlt: words('common.share.offerEnded') };
  }
  return { title: offer.title, description: offer.sentence, url, image, imageAlt: offer.title };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text made safe inside an HTML attribute or element: a house's name is whatever its admin typed. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * The page a link-preview bot gets: the card's tags and a link on to the
 * app, nothing else. Only bots are sent here; a person opening the same link
 * gets the app.
 */
export function shareHtml(preview: SharePreview): string {
  const tag = (attr: "property" | "name", key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(preview.title)}</title>`,
    tag("name", "description", preview.description),
    `<link rel="canonical" href="${escapeHtml(preview.url)}" />`,
    tag("property", "og:site_name", APP_NAME),
    tag("property", "og:type", "website"),
    tag("property", "og:url", preview.url),
    tag("property", "og:title", preview.title),
    tag("property", "og:description", preview.description),
    tag("property", "og:image", preview.image),
    tag("property", "og:image:type", "image/png"),
    tag("property", "og:image:width", String(SHARE_IMAGE.width)),
    tag("property", "og:image:height", String(SHARE_IMAGE.height)),
    tag("property", "og:image:alt", preview.imageAlt),
    tag("name", "twitter:card", "summary_large_image"),
    tag("name", "twitter:title", preview.title),
    tag("name", "twitter:description", preview.description),
    tag("name", "twitter:image", preview.image),
    "</head>",
    "<body>",
    `<p><a href="${escapeHtml(preview.url)}">${escapeHtml(preview.title)}</a></p>`,
    "</body>",
    "</html>",
  ].join("\n");
}
