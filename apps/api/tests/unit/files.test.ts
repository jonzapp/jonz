import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "@/app/files/[what]/[bucket]/[...path]/route";
import { fileUrl } from "@/lib/files";

// Files on our own address (lib/files.ts): the links the API hands out, and
// the route that passes them to Storage without ever reaching anything else.

const STORAGE = "https://db.example";
const params = (what: string, bucket: string, path: string[]) => ({ params: Promise.resolve({ what, bucket, path }) });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", STORAGE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a file's link", () => {
  it("is on the site, with each part of the path kept apart and Storage's token along", () => {
    expect(fileUrl("https://jonz.app", "see", "proofs", "h1/a1/p q.jpg", "t/1")).toBe("https://jonz.app/files/see/proofs/h1/a1/p%20q.jpg?token=t%2F1");
    expect(fileUrl("https://jonz.app", "photo", "avatars", "u1/photo-1.png")).toBe("https://jonz.app/files/photo/avatars/u1/photo-1.png");
  });
});

describe("/files", () => {
  it("shows a private picture from Storage's signed address while its link works", async () => {
    fetchMock.mockResolvedValue(new Response("jpeg", { headers: { "content-type": "image/jpeg" } }));
    const answer = await GET(new Request("https://jonz.app/files/see/proofs/h1/a1/p.jpg?token=t"), params("see", "proofs", ["h1", "a1", "p.jpg"]));
    expect(fetchMock).toHaveBeenCalledWith(`${STORAGE}/storage/v1/object/sign/proofs/h1/a1/p.jpg?token=t`);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(await answer.text()).toBe("jpeg");
  });

  it("shows someone's photo from the private bucket with the server's key, and nothing else that way", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
    fetchMock.mockResolvedValue(new Response("png", { headers: { "content-type": "image/png" } }));
    const answer = await GET(new Request("https://jonz.app/files/photo/avatars/u1/photo-1.png"), params("photo", "avatars", ["u1", "photo-1.png"]));
    // A new secret key is never a Bearer token.
    expect(fetchMock).toHaveBeenCalledWith(`${STORAGE}/storage/v1/object/authenticated/avatars/u1/photo-1.png`, { headers: { apikey: "sb_secret_x" } });
    expect(answer.headers.get("cache-control")).toBe("public, max-age=86400");
    const proof = await GET(new Request("https://jonz.app/files/photo/proofs/h1/a1/p.jpg"), params("photo", "proofs", ["h1", "a1", "p.jpg"]));
    expect(proof.status).toBe(404);
    // A legacy service-role key is a JWT, sent as the Bearer token too.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJlegacy");
    await GET(new Request("https://jonz.app/files/photo/avatars/u1/photo-1.png"), params("photo", "avatars", ["u1", "photo-1.png"]));
    expect(fetchMock).toHaveBeenLastCalledWith(expect.any(String), { headers: { apikey: "eyJlegacy", Authorization: "Bearer eyJlegacy" } });
  });

  it("answers a plain 404 for another bucket, a path that climbs, no token, or anything Storage refuses", async () => {
    const asks: [string, string, string[], string][] = [
      ["see", "secrets", ["x.jpg"], "?token=t"],
      ["see", "proofs", ["..", "x.jpg"], "?token=t"],
      ["see", "proofs", ["h1", "a1", "p.jpg"], ""],
    ];
    for (const [what, bucket, path, query] of asks) {
      const answer = await GET(new Request(`https://jonz.app/files/${what}/${bucket}/${path.join("/")}${query}`), params(what, bucket, path));
      expect(answer.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response('{"error":"InvalidJWT","message":"jwt expired"}', { status: 400, headers: { "content-type": "application/json" } }));
    const expired = await GET(new Request("https://jonz.app/files/see/proofs/h1/a1/p.jpg?token=old"), params("see", "proofs", ["h1", "a1", "p.jpg"]));
    expect(expired.status).toBe(404);
    expect(await expired.text()).toBe("");
  });

  it("puts a picture's bytes at Storage's signed upload address", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const request = new Request("https://jonz.app/files/up/proofs/h1/a1/p.jpg?token=t", { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "jpeg" });
    const answer = await PUT(request, params("up", "proofs", ["h1", "a1", "p.jpg"]));
    expect(answer.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${STORAGE}/storage/v1/object/upload/sign/proofs/h1/a1/p.jpg?token=t`);
    expect(init).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/jpeg", apikey: "anon", "x-upsert": "false" } });
  });

  it("takes only pictures, never an empty or oversized one, and says no when Storage does", async () => {
    const put = (type: string, body: BodyInit) =>
      PUT(new Request("https://jonz.app/files/up/report-shots/u1/s.jpg?token=t", { method: "PUT", headers: { "content-type": type }, body }), params("up", "report-shots", ["u1", "s.jpg"]));
    expect((await put("text/html", "<script>")).status).toBe(415);
    expect((await put("image/jpeg", "")).status).toBe(413);
    expect((await put("image/jpeg", new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    expect((await put("image/jpeg", "jpeg")).status).toBe(403);
  });
});
