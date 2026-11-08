import { describe, expect, it } from "vitest";

import { REPORT_LIMITS } from "./reports";
import { SUPPORT_WHY_MAX, tidySuggestion } from "./support-draft";

const MAIN = "5c1e9a20-0000-4000-8000-000000000001";
const can = { sameAs: (id: string) => id === MAIN, delete: true };

describe("tidySuggestion", () => {
  it("keeps a reply and a step that can be done", () => {
    expect(tidySuggestion({ reply: "Hi Ava,  thanks.\n\n\n\nI'll look.", action: "same_as", same_as: ` ${MAIN} `, why: "Same bins bug." }, can)).toEqual({
      reply: "Hi Ava, thanks.\n\nI'll look.",
      action: "same_as",
      sameAs: MAIN,
      why: "Same bins bug.",
    });
    expect(tidySuggestion({ reply: "Done.", action: "delete", same_as: "", why: "" }, can)).toMatchObject({ action: "delete", sameAs: null });
  });

  it("drops a step that can't be done, and keeps the reply", () => {
    expect(tidySuggestion({ reply: "Hi.", action: "same_as", same_as: "not-a-report", why: "" }, can)).toMatchObject({ reply: "Hi.", action: "none", sameAs: null });
    expect(tidySuggestion({ reply: "Hi.", action: "delete", same_as: "", why: "" }, { ...can, delete: false })).toMatchObject({ action: "none" });
    expect(tidySuggestion({ reply: "Hi.", action: "refund", same_as: "", why: "" }, can)).toMatchObject({ action: "none" });
  });

  it("cuts what's too long and treats what isn't words as nothing", () => {
    const tidy = tidySuggestion({ reply: "a".repeat(5000), action: "none", why: "b".repeat(5000) }, can);
    expect(tidy.reply).toHaveLength(REPORT_LIMITS.words);
    expect(tidy.why).toHaveLength(SUPPORT_WHY_MAX);
    expect(tidySuggestion({ reply: 42, action: null, why: {} }, can)).toEqual({ reply: "", action: "none", sameAs: null, why: "" });
  });
});
