import { describe, expect, it } from "vitest";

import { editDraft, findJohn } from "./draft-edits";
import { tidyReply, REPLY_MAX, type RawDraft } from "./house-draft";

const list: RawDraft = {
  johns: [
    { ref: "aaaa1111", name: "Bathroom", points: 3, everyWeeks: 1, everyMonths: null, weekOfMonth: null, group: null },
    { ref: "bbbb2222", name: "Oven clean", points: 5, everyWeeks: 1, everyMonths: 3, weekOfMonth: 1, group: null },
    { ref: "cccc3333", name: "Bathroom", points: 3, group: "Upstairs" },
  ],
  groups: [{ name: "Upstairs", members: ["me"] }],
  note: null,
};

describe("findJohn", () => {
  it("finds a John by the start of its ref, or by a name only one has", () => {
    expect(findJohn(list, "bbbb")).toBe(1);
    expect(findJohn(list, "oven clean")).toBe(1);
    // Two Bathrooms: the name alone is no good, the ref is.
    expect(findJohn(list, "Bathroom")).toBeNull();
    expect(findJohn(list, "cccc3333")).toBe(2);
    expect(findJohn(list, "")).toBeNull();
  });
});

describe("editDraft", () => {
  it("adds a John without a ref, and refuses one with no name or the same name twice", () => {
    const { raw, result } = editDraft(list, { kind: "add", john: { name: "Bins out", points: 1 } });
    expect(result).toEqual({ ok: true, said: 'Added "Bins out".' });
    expect(raw.johns!.at(-1)).toEqual({ name: "Bins out", points: 1, ref: null });
    expect(editDraft(list, { kind: "add", john: { name: " " } }).result.ok).toBe(false);
    expect(editDraft(list, { kind: "add", john: { name: "bathroom" } }).result.ok).toBe(false);
    // The same name in another group is a different John.
    expect(editDraft(list, { kind: "add", john: { name: "Bathroom", group: "Downstairs" } }).result.ok).toBe(true);
  });

  it("changes only the fields it's given, and never the ref", () => {
    const { raw, result } = editDraft(list, { kind: "change", ref: "aaaa", set: { points: 4, ref: "zzzz" } as never });
    expect(result.ok).toBe(true);
    expect(raw.johns![0]).toEqual({ ...list.johns![0], points: 4 });
    expect(editDraft(list, { kind: "change", ref: "aaaa", set: {} }).result.ok).toBe(false);
  });

  it("moves a John from months to weeks, onto everyone, or on call, clearing what no longer fits", () => {
    expect(editDraft(list, { kind: "change", ref: "bbbb", set: { everyWeeks: 2 } }).raw.johns![1]).toMatchObject({ everyWeeks: 2, everyMonths: null, weekOfMonth: null });
    expect(editDraft(list, { kind: "change", ref: "cccc", set: { group: null } }).raw.johns![2].group).toBeNull();
    expect(editDraft(list, { kind: "change", ref: "bbbb", set: { onCall: true } }).raw.johns![1]).toMatchObject({ onCall: true, everyWeeks: 1, everyMonths: null, crew: 1 });
  });

  it("takes a John off, and says when there's nothing to take", () => {
    const { raw, result } = editDraft(list, { kind: "remove", ref: "aaaa1111" });
    expect(result.said).toBe('Taking off "Bathroom".');
    expect(raw.johns!.map((j) => j.ref)).toEqual(["bbbb2222", "cccc3333"]);
    expect(editDraft(list, { kind: "remove", ref: "nope" }).result.ok).toBe(false);
  });

  it("never changes the draft it's given", () => {
    const before = JSON.stringify(list);
    editDraft(list, { kind: "remove", ref: "aaaa" });
    editDraft(list, { kind: "change", ref: "bbbb", set: { points: 9 } });
    editDraft(list, { kind: "add", john: { name: "New" } });
    expect(JSON.stringify(list)).toBe(before);
  });
});

describe("tidyReply", () => {
  it("keeps line breaks for a short list, tidies spaces and cuts a runaway reply", () => {
    expect(tidyReply("  Bins:   Ava \r\n\n\n\nBathroom:\tBen  ")).toBe("Bins: Ava\n\nBathroom: Ben");
    expect(tidyReply("x".repeat(REPLY_MAX + 50))).toHaveLength(REPLY_MAX);
  });
});
