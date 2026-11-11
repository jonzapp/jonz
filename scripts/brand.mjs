// Draws every brand image from one mark (packages/core/src/mark.ts): the app
// icons, the favicons, the link-preview card, the email header, the README
// banner and the files for dashboards that take a logo by hand (Stripe,
// Google, Microsoft, the stores). Run `npm run brand` after changing the mark
// or the colours; it rewrites every file below at its size. docs/brand/README.md
// says where each one goes. The join links' cards are drawn per house on
// request instead (apps/api/app/api/og), from the same mark.
//
// `npm run brand -- --store today.png week.png …` also frames phone
// screenshots for the App Store and Google Play, one headline each, and puts
// the first two iPhone frames side by side for the README.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

import { PLATE, SHIELD, SIGN_SMALL, TILE_RADIUS, signLegendSize, signSvg } from "../packages/core/src/mark.ts";

// Road-sign amber, a little yellow of orange: an amber plate with black words
// on black reads as another brand's logo, so signs are posted on the pavement.
const AMBER = "#f6b800";
const AMBER_DARK = "#ffc21a";
const INK = "#16181a";
const PAVEMENT = "#e7e9e5";
/** The plate under a sign, a shade lighter than the pavement it's posted on. */
const CARD = "#f7f8f5";
const ON_TARMAC = "#edefeb";

const PUBLIC = "apps/client/public";
const IMAGES = "apps/client/assets/images";
const BRAND = "docs/brand";

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// ── Icons: the sign alone, as each platform asks ──────────────────────────

const icon = {
  // A store icon is square and opaque: iOS and Google Play round it themselves.
  square: signSvg({ ink: INK, ground: AMBER }),
  // Android adaptive and PWA maskable icons keep only the middle, whatever
  // shape they crop to.
  maskable: signSvg({ ink: INK, ground: AMBER, safe: 0.78 }),
  foreground: signSvg({ ink: INK, safe: 0.78 }),
  monochrome: signSvg({ ink: "#000000", safe: 0.78 }),
  // iOS 18's dark home screen draws its own dark ground under a clear icon,
  // and tints a grey one to the wallpaper.
  dark: signSvg({ ink: AMBER_DARK, safe: 0.86 }),
  tinted: signSvg({ ink: "#d9d9d9", safe: 0.86 }),
  // Jonz's own rounded tile: the splash, the lockup, the cards.
  tile: signSvg({ ink: INK, ground: AMBER, radius: TILE_RADIUS }),
  // A browser tab: the small-size master, so the lines survive 16px.
  favicon: signSvg({ ink: INK, ground: AMBER, radius: 96, master: SIGN_SMALL }),
};

const SOURCES = {
  "scripts/icon-square.svg": icon.square,
  "scripts/icon-maskable.svg": icon.maskable,
  [`${PUBLIC}/favicon.svg`]: icon.favicon,
};

const ICONS = [
  [`${PUBLIC}/icon-192.png`, 192, icon.square],
  [`${PUBLIC}/icon-512.png`, 512, icon.square],
  [`${PUBLIC}/icon-maskable-512.png`, 512, icon.maskable],
  // iPhone's Add to Home Screen: 180, opaque, square (iOS rounds it).
  [`${PUBLIC}/apple-touch-icon.png`, 180, icon.square],
  [`${IMAGES}/icon.png`, 1024, icon.square],
  [`${IMAGES}/icon-dark.png`, 1024, icon.dark],
  [`${IMAGES}/icon-tinted.png`, 1024, icon.tinted],
  [`${IMAGES}/splash-icon.png`, 1024, icon.tile],
  [`${IMAGES}/favicon.png`, 48, icon.favicon],
  [`${IMAGES}/android-icon-foreground.png`, 1024, icon.foreground],
  [`${IMAGES}/android-icon-monochrome.png`, 1024, icon.monochrome],
  // For dashboards that take a logo by hand (docs/brand/README.md).
  [`${BRAND}/icon-512.png`, 512, icon.square],
  [`${BRAND}/icon-1024.png`, 1024, icon.square],
  [`${BRAND}/logo-120.png`, 120, icon.square],
  [`${BRAND}/profile-400.png`, 400, icon.square],
];

/** The favicon.ico sizes, every one from the small-size master. */
const ICO_SIZES = [16, 32, 48];

// ── Cards: what Jonz says out loud is posted as a sign ────────────────────
//
// An amber plate with an ink border, the J at its left like a route shield
// and the legend in caps; under it, the small print on a pale plate, as a
// supplementary plate hangs under a road sign (PLATE in mark.ts). Posted on
// the pavement, never on black. apps/api/lib/share/card.tsx draws the join
// links' cards the same way.

const FONTS = [
  [400, "Overpass_400Regular"],
  [700, "Overpass_700Bold"],
  [800, "Overpass_800ExtraBold"],
  [900, "Overpass_900Black"],
]
  .map(
    ([weight, file]) =>
      `@font-face{font-family:Overpass;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(
        `apps/client/assets/fonts/${file}.ttf`,
      ).toString("base64")}) format("truetype")}`,
  )
  .join("");

const CSS = `${FONTS}
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
.card{display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Overpass;overflow:hidden}
.lock{display:flex;align-items:center;gap:.32em;line-height:1}
.lock img{width:1.25em;height:1.25em;display:block}
.wm{font-weight:900;text-transform:uppercase;letter-spacing:.02em;transform:translateY(.06em)}
.assembly{display:flex;flex-direction:column}
.plate{display:flex}
.face{flex:1;display:flex;align-items:center;border-style:solid;border-color:${INK};color:${INK}}
.legend{font-weight:900;text-transform:uppercase;line-height:.98;letter-spacing:.01em;padding-top:.08em;overflow-wrap:anywhere}
.line{font-weight:700;line-height:1.1;padding-top:.06em}`;

const BRAND_SIGN = { legend: "Jonz", plate: "Fair shares of the housework." };

/**
 * The lockup on clear: the sign and JONZ beside it, for anywhere it's placed
 * by hand. On dark grounds the sign is drawn in amber on clear, as the dark
 * app icon is, never an amber tile beside a light word.
 */
function lockup({ size, ink, mark = icon.tile }) {
  return `<div class="lock" style="font-size:${size}px;color:${ink}"><img src="${svgUri(mark)}" alt=""><span class="wm">Jonz</span></div>`;
}

/**
 * A sign: `legend` on the amber plate beside the J, and `plate` (if any) on
 * the pavement plate under it. Drawn at a 1200-wide card's sizes times
 * `scale`; `height` is the amber plate's, `legendSize` overrides the size
 * the legend's length picks, and `fit: false` fills `width` whatever the
 * words.
 */
function sign({ legend, plate, width, height = 300, plateHeight = 116, scale = 1, legendSize, shield = 168, fit = true }) {
  const px = (n) => `${Math.round(n * scale)}px`;
  const size = legendSize ?? signLegendSize(legend);
  const face = (padX) =>
    `border-width:${px(PLATE.stroke)};border-radius:${px(PLATE.radius - PLATE.inset)};padding:0 ${px(padX)}`;
  const amber = `<div class="plate" style="background:${AMBER};height:${px(height)};border-radius:${px(PLATE.radius)};padding:${px(PLATE.inset)}">
      <div class="face" style="${face(44)};gap:${px(40)}">
        <img src="${svgUri(signSvg({ ink: INK, safe: SHIELD }))}" alt="" style="width:${px(shield)};height:${px(shield)};flex:none">
        <div class="legend" style="font-size:${px(size)}">${legend}</div>
      </div></div>`;
  const under = plate
    ? `<div class="plate" style="background:${CARD};height:${px(plateHeight)};border-radius:${px(PLATE.radius)};padding:${px(PLATE.inset)}">
      <div class="face" style="${face(40)}"><div class="line" style="font-size:${px(44)}">${plate}</div></div></div>`
    : "";
  // A sign is as wide as its words, up to `width`; the plate under it matches.
  const across = fit ? `width:max-content;max-width:${width}px` : `width:${width}px`;
  return `<div class="assembly" style="${across};gap:${px(PLATE.gap)}">${amber}${under}</div>`;
}

/** A card: a sign posted on `ground`, the pavement wherever it's ours to choose. */
const card = (width, height, ground, inner, style = "") =>
  `<div class="card" style="width:${width}px;height:${height}px;background:${ground};${style}">${inner}</div>`;

const CARDS = [
  // Every jonz.app link's card in a chat, and the repo's own.
  [`${PUBLIC}/og.png`, 1200, 630, card(1200, 630, PAVEMENT, sign({ ...BRAND_SIGN, width: 1056 }))],
  [`${BRAND}/social-preview.png`, 1280, 640, card(1280, 640, PAVEMENT, sign({ ...BRAND_SIGN, width: 1100 }))],
  // The README's banner: on the pavement in GitHub's light and dark alike.
  [`${BRAND}/readme-banner.png`, 1280, 360, card(1280, 360, PAVEMENT, sign({ ...BRAND_SIGN, width: 860, scale: 0.62 }))],
  // An email's header strip, shown at 600×120: the amber plate alone.
  [`${BRAND}/email-header.png`, 1200, 240, card(1200, 240, PAVEMENT, sign({ legend: "Jonz", width: 560, scale: 0.55 }), "align-items:flex-start;padding:0 64px")],
  // Google Play's feature graphic, which it shows over the listing.
  [`${BRAND}/play-feature.png`, 1024, 500, card(1024, 500, PAVEMENT, sign({ ...BRAND_SIGN, width: 900, scale: 0.86 }))],
];

const LOCKUPS = [
  [`${BRAND}/lockup.png`, INK, icon.tile],
  // On a dark ground: the sign in amber with no tile, its frame out to the tile's edge.
  [`${BRAND}/lockup-on-dark.png`, ON_TARMAC, signSvg({ ink: AMBER_DARK, safe: SHIELD })],
].map(([path, ink, mark]) => [path, 1200, 300, `<div style="width:1200px;height:300px;display:flex;align-items:center;justify-content:center;font-family:Overpass">${lockup({ size: 150, ink, mark })}</div>`]);

// ── Email pictures ────────────────────────────────────────────────────────
//
// What an email can't draw itself (packages/core/src/email.ts): the small
// JONZ sign at the top, a notice's icon on its tile, and the hazard tape over
// a status notice. Served from jonz.app/email/; drawn at 3x so they stay sharp.

const EMAIL = `${PUBLIC}/email`;
const HAZARD = "#c8410c";
const NIGHT_HAZARD = "#ff7a3d";
// The notice banner's icons (lucide, as apps/client/src/components/notice-banner.tsx uses them).
const LUCIDE = {
  status: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  offer: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  news: '<path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>',
};
/** A notice's icon on its square tile, the tile's edge in the icon's colour: 48 shown, 144 drawn. */
const noticeTile = (kind, color) =>
  `<div style="width:144px;height:144px;border:7.5px solid ${color};border-radius:21px;display:flex;align-items:center;justify-content:center">
    <svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[kind]}</svg></div>`;
/** Hazard tape, as one tile that repeats across: 45° stripes, 8px of each, 12px tall. */
const tapeTile = `<svg width="16" height="12" viewBox="0 0 16 12" style="display:block"><rect width="16" height="12" fill="${INK}"/>${[-16, 0, 16]
  .map((x) => `<polygon points="${x},12 ${x + 8},12 ${x + 20},0 ${x + 12},0" fill="${HAZARD}"/>`)
  .join("")}</svg>`;

const EMAIL_PICTURES = [
  // The sign alone, as wide as its word: shown 85 wide in the email's top bar.
  [`${EMAIL}/sign.png`, 255, 102, `<div style="display:flex;font-family:Overpass">${sign({ legend: "Jonz", width: 255, scale: 0.34, height: 300, shield: 168 })}</div>`],
  [`${EMAIL}/notice-status.png`, 144, 144, noticeTile("status", NIGHT_HAZARD)],
  [`${EMAIL}/notice-offer.png`, 144, 144, noticeTile("offer", INK)],
  [`${EMAIL}/notice-news.png`, 144, 144, noticeTile("news", INK)],
  [`${EMAIL}/notice-news-dark.png`, 144, 144, noticeTile("news", ON_TARMAC)],
  [`${EMAIL}/hazard-tape.png`, 16, 12, tapeTile],
];

// ── Store frames ──────────────────────────────────────────────────────────

/** Headlines for the store frames, in order: five words at most, each on its own sign. */
const STORE_HEADLINES = [
  "Johns, dealt fair.",
  "Just ask Jonz.",
  "Families too.",
  "The bathroom moves around.",
  "Tick it. The house checks.",
  "Away? Your share waits.",
];

const STORES = [
  ["ios", 1290, 2796],
  ["play", 1080, 1920],
];

/** A store screenshot: the headline on a sign, the phone under it, on the pavement. */
function storeFrame(width, height, screen, headline) {
  const scale = width / 1200;
  const margin = Math.round(width * 0.07);
  const phone = Math.round(width * 0.09);
  return `<div class="card" style="width:${width}px;height:${height}px;background:${PAVEMENT};justify-content:flex-start;padding-top:${Math.round(height * 0.04)}px;gap:${Math.round(height * 0.035)}px">
    ${sign({ legend: headline, width: width - margin * 2, scale, height: 380, legendSize: 78, shield: 150, fit: false })}
    <div style="flex:1;align-self:stretch;margin:0 ${phone}px;background:#2c3135;border-radius:${phone}px ${phone}px 0 0;padding:${Math.round(width * 0.024)}px ${Math.round(width * 0.024)}px 0;overflow:hidden">
      <img src="data:image/png;base64,${readFileSync(screen).toString("base64")}" style="width:100%;display:block;border-radius:${Math.round(width * 0.07)}px ${Math.round(width * 0.07)}px 0 0">
    </div></div>`;
}

// ── Drawing ───────────────────────────────────────────────────────────────

/** favicon.ico: each size's PNG, packed into one file (the format allows PNG entries). */
function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(([size, png], i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(([, png]) => png)]);
}

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

const store = process.argv.indexOf("--store");
const screens = store === -1 ? [] : process.argv.slice(store + 1);

for (const [path, text] of Object.entries(SOURCES)) write(path, text);

// A sandbox with its own Chromium points at it (PW_CHROMIUM), as the e2e do.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

async function draw(html, width, height, path) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
  if (path) write(path, png);
  return png;
}

const sized = (svg, size) => svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `);

for (const [path, size, svg] of ICONS) await draw(sized(svg, size), size, size, path);

const icoPngs = [];
for (const size of ICO_SIZES) icoPngs.push([size, await draw(sized(icon.favicon, size), size, size)]);
write(`${PUBLIC}/favicon.ico`, ico(icoPngs));

for (const [path, width, height, html] of [...CARDS, ...LOCKUPS, ...EMAIL_PICTURES]) await draw(html, width, height, path);

const framed = [];
for (const [i, screen] of screens.entries()) {
  const headline = STORE_HEADLINES[i % STORE_HEADLINES.length];
  for (const [store, width, height] of STORES) {
    const png = await draw(storeFrame(width, height, screen, headline), width, height, join(BRAND, "store", `${store}-${i + 1}.png`));
    if (store === "ios") framed.push(png);
  }
}

// One picture, not three: images side by side wrap onto separate lines on
// a phone's narrow README, each pushed off centre by the gap. One shrinks to
// fit whole. The gap is clear, so it is GitHub's own page in light and dark.
if (framed.length >= 3) {
  const [width, height, gap] = [600, 1300, 40];
  const frame = (png) => `<img src="data:image/png;base64,${png.toString("base64")}" style="width:${width}px;height:${height}px;display:block">`;
  await draw(
    `<div style="display:flex;gap:${gap}px">${framed.slice(0, 3).map(frame).join("")}</div>`,
    width * 3 + gap * 2,
    height,
    `${BRAND}/readme-screens.png`,
  );
}

await browser.close();
