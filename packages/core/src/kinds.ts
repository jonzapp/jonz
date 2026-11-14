import type { JohnDef } from "./board";
import { CATEGORIES, type Category } from "./domain";

// Each house's own kinds of John (john_kinds): the John list's sections and
// the lid colour of the Johns in each. A kind changes nothing in the deal:
// that's a group (who shares a John). A house starts with six, named in its
// maker's language; its admins add, rename, recolour, order and delete them.

/** One of a house's kinds of John. */
export interface KindDef {
  id: string;
  name: string;
  /** Its lid colour by day, `#rrggbb`. After dark `lidColour` lifts it to read. */
  colour: string;
  /** Its place on the list, from 0. */
  position: number;
  /** The starting kind it began as (a starter list's Johns go in it); null for one the house made. */
  preset: Category | null;
}

/**
 * The ready colours a kind can take, in the kind sheet's order: the six
 * starting kinds' lids first. The same list is public.kind_colours().
 */
export const KIND_COLOURS = ["#7a4e2d", "#1f5fae", "#2a2d30", "#0f7c7a", "#6a3d9a", "#8a9096", "#c2417a", "#2b8fc7", "#4f9a2e", "#b08840", "#4a4fc4"] as const;

/** Each ready colour's name, as a screen reader says it (house.kinds.colourName.<name>). */
export const KIND_COLOUR_NAMES = {
  "#7a4e2d": "brown",
  "#1f5fae": "blue",
  "#2a2d30": "charcoal",
  "#0f7c7a": "teal",
  "#6a3d9a": "purple",
  "#8a9096": "grey",
  "#c2417a": "pink",
  "#2b8fc7": "sky",
  "#4f9a2e": "green",
  "#b08840": "ochre",
  "#4a4fc4": "indigo",
} as const satisfies Record<(typeof KIND_COLOURS)[number], string>;

/** Each ready colour after dark, picked by eye to read on the night ground (the first six are the old lids'). */
export const KIND_NIGHT: Readonly<Record<string, string>> = {
  "#7a4e2d": "#c08a5e",
  "#1f5fae": "#5e9be8",
  "#2a2d30": "#8d959c",
  "#0f7c7a": "#4fbdb9",
  "#6a3d9a": "#a97fd6",
  "#8a9096": "#6b7378",
  "#c2417a": "#e27aa8",
  "#2b8fc7": "#6cc3ee",
  "#4f9a2e": "#86c95f",
  "#b08840": "#d8b46e",
  "#4a4fc4": "#9195f0",
};

/** A `#rrggbb` colour's red, green and blue, 0 to 255. */
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** How light a colour looks (WCAG's relative luminance), 0 to 1. */
export function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG's contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue (0 to 360), saturation and value (0 to 1): what the colour square and the hue track show. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** A colour code as typed ("4f9a2e", "#4F9A2E", "#4f9"), as `#rrggbb`; null if it isn't one. */
export function colourCode(typed: string): string | null {
  const t = typed.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  if (/^[0-9a-f]{3}$/.test(t)) return `#${[...t].map((c) => c + c).join("")}`;
  return null;
}

/** What a lid bar must reach against the card it sits on: WCAG's 3 to 1 for things that aren't words. */
const LID_CONTRAST = 3;

/**
 * A kind's colour as its lid shows on a card: a ready colour wears its own
 * shade after dark; any other is made lighter (after dark) or darker (by
 * day) until it stands out from the card, keeping its hue.
 */
export function kindLid(colour: string, card: string): string {
  const c = colour.toLowerCase();
  const night = luminance(card) < 0.2;
  if (night && KIND_NIGHT[c]) return KIND_NIGHT[c];
  if (contrast(c, card) >= LID_CONTRAST) return c;
  const hsv = hexToHsv(c);
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    // After dark towards a paler shade; by day towards a deeper one.
    const next = hsvToHex(night ? { h: hsv.h, s: hsv.s * (1 - t * 0.5), v: hsv.v + (1 - hsv.v) * t } : { ...hsv, v: hsv.v * (1 - t) });
    if (contrast(next, card) >= LID_CONTRAST) return next;
  }
  return night ? "#ffffff" : "#000000";
}

/** Whether a mark on this colour (a tick) should be dark, not white. */
export const lightColour = (colour: string) => luminance(colour) > 0.4;

/** The house's kinds in their order on the list. */
export function kindsInOrder(kinds: readonly KindDef[]): KindDef[] {
  return [...kinds].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** A John's kind, by its kind id: null when it has none. */
export function kindOf(john: Pick<JohnDef, "kindId">, kinds: readonly KindDef[]): KindDef | null {
  return kinds.find((k) => k.id === john.kindId) ?? null;
}

/** The kinds' ids in order with one moved a place up (-1) or down (1): what order_kinds takes. */
export function moveKind(kinds: readonly KindDef[], id: string, by: -1 | 1): string[] {
  const ids = kindsInOrder(kinds).map((k) => k.id);
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/** A ready colour no kind has yet, for a new kind; the first when all are taken. */
export function freeColour(kinds: readonly KindDef[]): string {
  const taken = new Set(kinds.map((k) => k.colour.toLowerCase()));
  return KIND_COLOURS.find((c) => !taken.has(c)) ?? KIND_COLOURS[kinds.length % KIND_COLOURS.length];
}

/** The six starting kinds, as a house without its own list read (a test, a sample) has them. */
export function startingKinds(names: Readonly<Record<Category, string>>): KindDef[] {
  return CATEGORIES.map((preset, position) => ({ id: preset, name: names[preset], colour: KIND_COLOURS[position], position, preset }));
}
