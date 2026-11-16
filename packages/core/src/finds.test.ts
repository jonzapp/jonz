import { describe, expect, it } from "vitest";

import type { BoardItem } from "./board";
import { weekItemOf } from "./board-views";
import { finds } from "./finds";

describe("finds", () => {
  it("finds a name when each word typed starts one of its words", () => {
    expect(finds("bin", "Bins out")).toBe(true);
    expect(finds("out bi", "Bins out")).toBe(true);
    expect(finds("ins", "Bins out")).toBe(false);
    expect(finds("new y", "New York, United States")).toBe(true);
  });

  it("reads past case and accents either way", () => {
    expect(finds("sao", "São Paulo")).toBe(true);
    expect(finds("ÉTÉ", "ete cleaning")).toBe(true);
  });

  it("finds everything when nothing is typed", () => {
    expect(finds("", "Bins out")).toBe(true);
    expect(finds("   ", "Bins out")).toBe(true);
  });
});

describe("weekItemOf", () => {
  const item = (id: string, johnId: string, userId: string) => ({ id, johnId, userId }) as BoardItem;
  const items = [item("sams-bins", "bins", "sam"), item("my-bins", "bins", "me"), item("sams-hob", "hob", "sam")];

  it("finds your own place on the board first, else anyone's", () => {
    expect(weekItemOf(items, "bins", "me")?.id).toBe("my-bins");
    expect(weekItemOf(items, "hob", "me")?.id).toBe("sams-hob");
  });

  it("finds none for a John that isn't this week's", () => {
    expect(weekItemOf(items, "fridge", "me")).toBeNull();
  });
});
