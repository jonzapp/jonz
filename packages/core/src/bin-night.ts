import { CATEGORIES, type Category } from "./domain";
import { kindLid } from "./kinds";

/**
 * Bin Night, the house style, as data: pavement and tarmac grounds, ink,
 * hi-vis amber for the one thing to do, hazard for late and missed, and a
 * bin-lid colour per kind of John.
 *
 * The Expo app's theme (iOS, Android and the web) reads them from here.
 * Names are CSS variables' in camelCase: `cardForeground` is
 * `--card-foreground`.
 */
export interface BinNightScheme {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  hivis: string;
  onHivis: string;
  hazard: string;
  onHazard: string;
  good: string;
  /** `--bin-<category>`: the lid colour for each kind of John. */
  bin: Record<Category, string>;
}

export const BIN_NIGHT: { light: BinNightScheme; dark: BinNightScheme; radius: number } = {
  // Daylight: pavement ground, tarmac ink, hi-vis amber.
  light: {
    background: "#e7e9e5",
    foreground: "#16181a",
    card: "#f7f8f5",
    cardForeground: "#16181a",
    popover: "#f7f8f5",
    popoverForeground: "#16181a",
    primary: "#f6b800",
    primaryForeground: "#16181a",
    secondary: "#dde0db",
    secondaryForeground: "#16181a",
    muted: "#dde0db",
    mutedForeground: "#596066",
    accent: "#dde0db",
    accentForeground: "#16181a",
    destructive: "#c8410c",
    border: "#c5c9c3",
    input: "#c5c9c3",
    ring: "#16181a",
    hivis: "#f6b800",
    onHivis: "#16181a",
    hazard: "#c8410c",
    onHazard: "#ffffff",
    good: "#2e7d32",
    bin: {
      kitchen: "#7a4e2d",
      bathroom: "#1f5fae",
      bins: "#2a2d30",
      // Teal, not green: green means done, so a lid never shares a status's hue.
      floors: "#0f7c7a",
      errands: "#6a3d9a",
      other: "#8a9096",
    },
  },
  // After dark: wet tarmac, the same amber, lids lifted to read.
  dark: {
    background: "#111315",
    foreground: "#edefeb",
    card: "#1a1d20",
    cardForeground: "#edefeb",
    popover: "#1a1d20",
    popoverForeground: "#edefeb",
    primary: "#ffc21a",
    primaryForeground: "#111315",
    secondary: "#24282c",
    secondaryForeground: "#edefeb",
    muted: "#24282c",
    mutedForeground: "#99a0a5",
    accent: "#24282c",
    accentForeground: "#edefeb",
    destructive: "#ff7a3d",
    border: "#2c3135",
    input: "#2c3135",
    ring: "#ffc21a",
    hivis: "#ffc21a",
    onHivis: "#111315",
    hazard: "#ff7a3d",
    onHazard: "#1c0b03",
    good: "#6cc070",
    bin: {
      kitchen: "#c08a5e",
      bathroom: "#5e9be8",
      bins: "#8d959c",
      floors: "#4fbdb9",
      errands: "#a97fd6",
      other: "#6b7378",
    },
  },
  /** `--radius` (0.375rem) in pixels, at the usual 16px root. */
  radius: 6,
};

/**
 * The lid colour for a kind of John: its own colour (`#rrggbb`, a house's
 * kind) made to read on the scheme's cards, or one of the six starting
 * kinds' by its category. Anything unknown wears `other`'s.
 */
export function lidColour(scheme: BinNightScheme, lid: string): string {
  if (lid.startsWith("#")) return kindLid(lid, scheme.card);
  return (CATEGORIES as readonly string[]).includes(lid) ? scheme.bin[lid as Category] : scheme.bin.other;
}

/** A scheme as the web's CSS variables: `{ "--card-foreground": "#16181a", … }`. */
export function cssVariables(scheme: BinNightScheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(scheme)) {
    if (key === "bin") continue;
    vars[`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value as string;
  }
  for (const category of CATEGORIES) vars[`--bin-${category}`] = scheme.bin[category];
  return vars;
}

/** `#rrggbb` at an opacity, as `#rrggbbaa`: the web's `bg-hazard/15`. */
export function withAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return `${hex}${alpha.toString(16).padStart(2, "0")}`;
}
