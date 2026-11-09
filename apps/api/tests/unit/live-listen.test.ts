import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/live: one Realtime connection per instance, on every shard, and each
// change passed only to the streams open for that house.

const subscribed: string[] = [];
let fail = false;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    realtime: { setAuth: async () => {} },
    removeChannel: async () => {},
    channel: (topic: string, options: unknown) => {
      expect(options).toEqual({ config: { private: true } });
      const channel = {
        on: () => channel,
        subscribe: (callback: (status: string, error?: Error) => void) => {
          subscribed.push(topic);
          callback(fail ? "CHANNEL_ERROR" : "SUBSCRIBED");
          return channel;
        },
      };
      return channel;
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  subscribed.length = 0;
  fail = false;
});

describe("lib/live", () => {
  it("listens on all sixteen private shards once, and hands each house only its own changes", async () => {
    const { listen, deliverForTest } = await import("@/lib/live");
    const a = vi.fn();
    const b = vi.fn();
    const stopA = await listen("a", a);
    await listen("b", b);
    expect(subscribed).toEqual(Array.from({ length: 16 }, (_, i) => `live:${i}`));

    deliverForTest({ house: "a", id: 7 });
    deliverForTest({ house: "c", id: 8 });
    deliverForTest({ house: "a", id: "9" });
    deliverForTest(null);
    expect(a).toHaveBeenCalledExactlyOnceWith({ house: "a", id: 7 });
    expect(b).not.toHaveBeenCalled();

    stopA();
    deliverForTest({ house: "a", id: 10 });
    expect(a).toHaveBeenCalledOnce();
  });

  it("when Realtime won't let it in, fails the stream and tries again on the next", async () => {
    const { listen, deliverForTest } = await import("@/lib/live");
    fail = true;
    const a = vi.fn();
    await expect(listen("a", a)).rejects.toThrow();
    deliverForTest({ house: "a", id: 1 });
    expect(a).not.toHaveBeenCalled();

    fail = false;
    subscribed.length = 0;
    await listen("a", a);
    expect(subscribed).toHaveLength(16);
  });
});
