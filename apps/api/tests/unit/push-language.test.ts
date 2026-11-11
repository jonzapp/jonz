import { wordsFor } from "@app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pushIn, type PushMessage } from "@/lib/engine/tick";
import { payloadFor } from "@/lib/push";

/**
 * A push is said in its reader's language when it's sent (docs/specs/translation.md,
 * step 7): Jonz's lines in their words, what someone wrote as they wrote it.
 */
describe("a push in each reader's language", () => {
  // Buttons come with a token, which needs the push key.
  const saved = process.env.VAPID_PRIVATE_KEY;
  beforeAll(() => {
    process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
  });
  afterAll(() => {
    process.env.VAPID_PRIVATE_KEY = saved;
  });
  const english = wordsFor("en", "housemates");
  const test = wordsFor("en-XA", "housemates");
  const message: PushMessage = {
    title: (w) => w("house.notify.voteTitle", { john: "Bins" }),
    body: "They left the lid open.",
    url: "/week",
    kind: "checks",
    zone: "Europe/London",
  };

  it("says Jonz's lines in the reader's language", () => {
    expect(pushIn(message, "en").title).toBe(english("house.notify.voteTitle", { john: "Bins" }));
    expect(pushIn(message, "en-XA").title).toBe(test("house.notify.voteTitle", { john: "Bins" }));
    expect(pushIn(message, "en-XA").title).not.toBe(pushIn(message, "en").title);
  });

  it("keeps what someone wrote as they wrote it", () => {
    expect(pushIn(message, "en-XA").body).toBe("They left the lid open.");
  });

  it("reads a family's words in a family", () => {
    const ask: PushMessage = { ...message, title: (w) => w("house.notify.kind.checks"), houseKind: "family" };
    expect(pushIn(ask, "en").title).toBe(wordsFor("en", "family")("house.notify.kind.checks"));
    expect(pushIn(ask, "en").title).not.toBe(english("house.notify.kind.checks"));
  });

  it("labels the buttons in the reader's language", () => {
    const now = new Date("2026-11-11T09:00:00Z");
    const tick: PushMessage = { ...message, act: { assignmentId: "00000000-0000-4000-8000-000000000001" } };
    expect(payloadFor("u1", pushIn(tick, "en-XA"), false, now).actions).toEqual([{ action: "done", title: test("house.notify.done") }]);
    expect(payloadFor("u1", pushIn(tick, "en"), false, now).actions).toEqual([{ action: "done", title: english("house.notify.done") }]);
  });
});
