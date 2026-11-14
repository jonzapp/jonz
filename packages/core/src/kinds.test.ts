import { describe, expect, it } from "vitest";

import { BIN_NIGHT } from "./bin-night";
import { CATEGORY_LABEL } from "./domain";
import {
  colourCode,
  contrast,
  freeColour,
  hexToHsv,
  hsvToHex,
  KIND_COLOUR_NAMES,
  KIND_COLOURS,
  KIND_NIGHT,
  kindLid,
  kindOf,
  kindsInOrder,
  moveKind,
  startingKinds,
  type KindDef,
} from "./kinds";

const KINDS = startingKinds(CATEGORY_LABEL);
const GARDEN: KindDef = { id: "garden", name: "Garden", colour: "#4f9a2e", position: 6, preset: null };

describe("the ready colours", () => {
  it("are eleven, each with a name and a night shade", () => {
    expect(KIND_COLOURS).toHaveLength(11);
    expect(new Set(KIND_COLOURS).size).toBe(11);
    for (const c of KIND_COLOURS) {
      expect(KIND_COLOUR_NAMES[c]).toBeTruthy();
      expect(KIND_NIGHT[c]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("read as lids on the card, by day and after dark", () => {
    for (const c of KIND_COLOURS) {
      expect(contrast(kindLid(c, BIN_NIGHT.light.card), BIN_NIGHT.light.card), `${c} by day`).toBeGreaterThanOrEqual(3);
      expect(contrast(kindLid(c, BIN_NIGHT.dark.card), BIN_NIGHT.dark.card), `${c} after dark`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("kindLid", () => {
  it("dresses a ready colour in its own night shade after dark, and as it is by day", () => {
    expect(kindLid("#2A2D30", BIN_NIGHT.dark.card)).toBe(KIND_NIGHT["#2a2d30"]);
    expect(kindLid("#2a2d30", BIN_NIGHT.light.card)).toBe("#2a2d30");
  });

  it("lightens any other colour after dark, and darkens it by day, until it reads, keeping its hue", () => {
    const pale = "#f4e9a0";
    const day = kindLid(pale, BIN_NIGHT.light.card);
    expect(contrast(day, BIN_NIGHT.light.card)).toBeGreaterThanOrEqual(3);
    expect(Math.abs(hexToHsv(day).h - hexToHsv(pale).h)).toBeLessThan(3);
    const deep = "#101820";
    const night = kindLid(deep, BIN_NIGHT.dark.card);
    expect(contrast(night, BIN_NIGHT.dark.card)).toBeGreaterThanOrEqual(3);
    expect(Math.abs(hexToHsv(night).h - hexToHsv(deep).h)).toBeLessThan(6);
  });

  it("leaves a colour that already reads as it is", () => {
    expect(kindLid("#c0392b", BIN_NIGHT.light.card)).toBe("#c0392b");
  });
});

describe("colours by their code", () => {
  it("reads a code however it's typed, and nothing that isn't one", () => {
    expect(colourCode("4F9A2E")).toBe("#4f9a2e");
    expect(colourCode(" #4f9a2e ")).toBe("#4f9a2e");
    expect(colourCode("#3a7")).toBe("#33aa77");
    expect(colourCode("green")).toBeNull();
    expect(colourCode("#4f9a2")).toBeNull();
  });

  it("goes to hue, saturation and value and back", () => {
    for (const c of [...KIND_COLOURS, "#ffffff", "#000000", "#ff0000"]) expect(hsvToHex(hexToHsv(c))).toBe(c);
  });
});

describe("a house's kinds", () => {
  const kinds = [GARDEN, ...KINDS];

  it("are in their order on the list", () => {
    expect(kindsInOrder(kinds).map((k) => k.id)).toEqual(["kitchen", "bathroom", "bins", "floors", "errands", "other", "garden"]);
  });

  it("give a John its kind by id, or by the starting kind its category began as", () => {
    expect(kindOf({ category: "kitchen", kindId: "garden" }, kinds)).toBe(GARDEN);
    expect(kindOf({ category: "bins" }, kinds)?.id).toBe("bins");
    expect(kindOf({ category: "bins" }, [GARDEN])).toBeNull();
  });

  it("give a John read with no kind, or one that's gone, none at all", () => {
    expect(kindOf({ category: "other", kindId: null }, kinds)).toBeNull();
    expect(kindOf({ category: "other", kindId: "gone" }, kinds)).toBeNull();
  });

  it("move a kind a place up or down, and no further than the ends", () => {
    expect(moveKind(kinds, "garden", -1)).toEqual(["kitchen", "bathroom", "bins", "floors", "errands", "garden", "other"]);
    expect(moveKind(kinds, "kitchen", 1)).toEqual(["bathroom", "kitchen", "bins", "floors", "errands", "other", "garden"]);
    expect(moveKind(kinds, "kitchen", -1)).toEqual(["kitchen", "bathroom", "bins", "floors", "errands", "other", "garden"]);
    expect(moveKind(kinds, "garden", 1)).toEqual(["kitchen", "bathroom", "bins", "floors", "errands", "other", "garden"]);
  });

  it("offer a new kind a ready colour none has yet", () => {
    expect(freeColour(KINDS)).toBe("#c2417a");
    expect(freeColour([...KINDS, { ...GARDEN, colour: "#C2417A" }])).toBe("#2b8fc7");
    const all = KIND_COLOURS.map((colour, position): KindDef => ({ id: colour, name: colour, colour, position, preset: null }));
    expect(KIND_COLOURS).toContain(freeColour(all));
  });
});
