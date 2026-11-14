import { describe, expect, it } from "vitest";

import { BIN_NIGHT, cssVariables, lidColour, withAlpha } from "./bin-night";
import { LIDS } from "./domain";

describe("Bin Night", () => {
  it("names the same tokens in daylight and after dark", () => {
    expect(Object.keys(BIN_NIGHT.dark).sort()).toEqual(Object.keys(BIN_NIGHT.light).sort());
    expect(Object.keys(BIN_NIGHT.dark.bin).sort()).toEqual([...LIDS].sort());
    expect(Object.keys(BIN_NIGHT.light.bin).sort()).toEqual([...LIDS].sort());
  });

  it("writes every colour as lower-case #rrggbb", () => {
    for (const scheme of [BIN_NIGHT.light, BIN_NIGHT.dark]) {
      for (const value of Object.values(cssVariables(scheme))) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("names tokens as the web's CSS variables", () => {
    const vars = cssVariables(BIN_NIGHT.light);
    expect(vars["--background"]).toBe("#e7e9e5");
    expect(vars["--card-foreground"]).toBe("#16181a");
    expect(vars["--on-hivis"]).toBe("#16181a");
    expect(vars["--bin-errands"]).toBe("#6a3d9a");
    expect(Object.keys(vars)).toHaveLength(23 + LIDS.length);
  });

  it("dresses an unknown kind of John in the other lid", () => {
    expect(lidColour(BIN_NIGHT.light, "kitchen")).toBe("#7a4e2d");
    expect(lidColour(BIN_NIGHT.dark, "bathroom")).toBe("#5e9be8");
    expect(lidColour(BIN_NIGHT.light, "garden")).toBe(BIN_NIGHT.light.bin.other);
    expect(lidColour(BIN_NIGHT.light, "")).toBe(BIN_NIGHT.light.bin.other);
  });

  it("keeps the floors lid teal, so no lid shares the done green", () => {
    expect(BIN_NIGHT.light.bin.floors).toBe("#0f7c7a");
    expect(BIN_NIGHT.dark.bin.floors).toBe("#4fbdb9");
    for (const scheme of [BIN_NIGHT.light, BIN_NIGHT.dark]) {
      expect(Object.values(scheme.bin)).not.toContain(scheme.good);
      expect(Object.values(scheme.bin)).not.toContain(scheme.hazard);
    }
  });

  it("adds an opacity the way the web's /15 does", () => {
    expect(withAlpha("#c8410c", 0.15)).toBe("#c8410c26");
    expect(withAlpha("#c8410c", 1)).toBe("#c8410cff");
    expect(withAlpha("#c8410c", 0)).toBe("#c8410c00");
    expect(withAlpha("#c8410c", 2)).toBe("#c8410cff");
    expect(withAlpha("#c8410c", -1)).toBe("#c8410c00");
  });
});

// docs/style/feel.md, Contrast: WCAG 1.4.3 asks 4.5 to 1 for words, 1.4.11
// asks 3 to 1 for icons, edges and focus rings, in Day and Night.
describe("Bin Night contrast", () => {
  function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a: string, b: string): number {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  for (const scheme of ["light", "dark"] as const) {
    const s = BIN_NIGHT[scheme];
    it(`${scheme}: words read at 4.5 to 1`, () => {
      const words: [string, string, string][] = [
        ["foreground", s.foreground, s.background],
        ["foreground on card", s.foreground, s.card],
        ["muted", s.mutedForeground, s.background],
        ["muted on card", s.mutedForeground, s.card],
        ["muted on the tint", s.mutedForeground, s.secondary],
        ["ink on amber", s.onHivis, s.hivis],
        ["white on hazard", s.onHazard, s.hazard],
        // Hazard and green as words sit on a card or a group, never the bare pavement.
        ["hazard on card", s.hazard, s.card],
        ["good on card", s.good, s.card],
      ];
      for (const [name, a, b] of words) expect([name, contrast(a, b) >= 4.5]).toEqual([name, true]);
    });
    it(`${scheme}: icons, edges and lids read at 3 to 1`, () => {
      const marks: [string, string, string][] = [
        ["hazard icon", s.hazard, s.background],
        ["good tick", s.good, s.background],
        ["outline edge", s.mutedForeground, s.background],
        ["focus ring", s.ring, s.background],
        ...Object.entries(s.bin).map(([k, c]): [string, string, string] => [`lid ${k}`, c, s.card]),
      ];
      for (const [name, a, b] of marks) expect([name, contrast(a, b) >= 3]).toEqual([name, true]);
    });
  }
});
