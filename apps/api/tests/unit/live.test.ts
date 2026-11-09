import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Live updates through our own server (docs/specs/api.md, C3): the stream a
// house's screens listen on, and what it says when a change comes in.

const execute = vi.fn();
const listeners = new Map<string, (change: { house: string; id: number }) => void>();
const stopped = vi.fn();

vi.mock("v1", () => ({ v1Instance: () => Promise.resolve({ execute }) }));
vi.mock("@/lib/live", () => ({
  listen: vi.fn(async (house: string, listener: (change: { house: string; id: number }) => void) => {
    listeners.set(house, listener);
    return () => {
      listeners.delete(house);
      stopped();
    };
  }),
}));

const { GET, OPTIONS } = await import("@/app/v1/houses/[houseId]/live/route");

const HOUSE = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ houseId: HOUSE }) };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ALLOWED_ORIGINS", "https://staging.jonz.app");
  execute.mockReset();
  stopped.mockReset();
  listeners.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function open(headers: Record<string, string> = {}, query = "") {
  const abort = new AbortController();
  const request = new Request(`https://api.jonz.app/v1/houses/${HOUSE}/live${query}`, { headers: { authorization: "Bearer t", ...headers }, signal: abort.signal });
  return { abort, answer: GET(request, params) };
}

/** Everything the stream has said so far, once it has said `count` things. */
async function read(response: Response, count: number) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < count; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  reader.releaseLock();
  return text;
}

describe("/v1/houses/{houseId}/live", () => {
  it("asks house_live as the person, then says each change to the house as it comes", async () => {
    execute.mockResolvedValue({ status: 200, body: { latest: 40 } });
    const { abort, answer } = open({ "jonz-client": "web/1" });
    const response = await answer;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(execute).toHaveBeenCalledWith("house_live", expect.objectContaining({ authorization: "Bearer t", client: "web/1", via: "api" }), { houseId: HOUSE });

    // A first stream hears nothing it already read: only what comes after.
    listeners.get(HOUSE)!({ house: HOUSE, id: 40 });
    listeners.get(HOUSE)!({ house: HOUSE, id: 41 });
    expect(await read(response, 2)).toBe("retry: 1000\n\nid: 41\nevent: change\ndata: {}\n\n");
    abort.abort();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it("coming back with Last-Event-ID, hears at once that it missed something", async () => {
    execute.mockResolvedValue({ status: 200, body: { latest: 57 } });
    const response = await open({ "last-event-id": "41" }).answer;
    expect(execute).toHaveBeenCalledWith("house_live", expect.anything(), { houseId: HOUSE, after: 41 });
    expect(await read(response, 2)).toBe("retry: 1000\n\nid: 57\nevent: change\ndata: {}\n\n");
  });

  it("coming back with nothing missed, says nothing until the next change", async () => {
    execute.mockResolvedValue({ status: 200, body: { latest: null } });
    const response = await open({}, "?after=41").answer;
    expect(execute).toHaveBeenCalledWith("house_live", expect.anything(), { houseId: HOUSE, after: 41 });
    listeners.get(HOUSE)!({ house: HOUSE, id: 42 });
    expect(await read(response, 2)).toBe("retry: 1000\n\nid: 42\nevent: change\ndata: {}\n\n");
  });

  it("ignores a Last-Event-ID that isn't a number", async () => {
    execute.mockResolvedValue({ status: 200, body: { latest: null } });
    await open({ "last-event-id": "1; drop" }).answer;
    expect(execute).toHaveBeenCalledWith("house_live", expect.anything(), { houseId: HOUSE });
  });

  it("refuses someone who isn't a member, stops listening, and lets the browser read why", async () => {
    execute.mockRejectedValue(Object.assign(new Error("not a member"), { status: 403, code: "forbidden" }));
    const response = await open({ origin: "https://staging.jonz.app" }).answer;
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("content-type")).not.toContain("event-stream");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://staging.jonz.app");
    expect(stopped).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it("pings a quiet stream, and ends it before the time limit so the app opens the next", async () => {
    execute.mockResolvedValue({ status: 200, body: { latest: null } });
    const response = await open().answer;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await read(response, 2)).toBe("retry: 1000\n\n: ping\n\n");
    await vi.advanceTimersByTimeAsync(280_000);
    expect(stopped).toHaveBeenCalledOnce();
  });

  it("lets the staging site listen from its own origin, and no other", () => {
    const ok = OPTIONS(new Request("https://api.staging.jonz.app/v1/houses/x/live", { method: "OPTIONS", headers: { origin: "https://staging.jonz.app" } }));
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://staging.jonz.app");
    expect(ok.headers.get("access-control-allow-headers")).toContain("Last-Event-ID");
    const other = OPTIONS(new Request("https://api.staging.jonz.app/v1/houses/x/live", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
