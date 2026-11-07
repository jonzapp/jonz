import { accountDeletedEmail } from "@app/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/email";

const message = accountDeletedEmail({ name: "Sam", deletedOn: "31 October 2026" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("sends nothing without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    expect(await sendEmail("sam@example.com", message, { tag: "account-deleted" }, fetchImpl)).toEqual({ sent: false, reason: "no-key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never writes to a kid without a sign-in", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchImpl = vi.fn();
    expect(await sendEmail("kid-1@kids.jonz.invalid", message, { tag: "notice" }, fetchImpl)).toEqual({ sent: false, reason: "no-address" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the email to Resend from hello@, replies to support@", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const result = await sendEmail("sam@example.com", message, { tag: "account-deleted", idempotencyKey: "del-1" }, fetchImpl);
    expect(result).toEqual({ sent: true, id: "em_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test", "Idempotency-Key": "del-1" });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: "Jonz <hello@jonz.app>",
      to: ["sam@example.com"],
      reply_to: "support@jonz.app",
      subject: "Your Jonz account is deleted",
      tags: [{ name: "kind", value: "account-deleted" }],
    });
    expect(body.html).toContain("Account deleted");
    expect(body.text).toContain("We deleted your account on 31 October 2026.");
  });

  it("reports a refusal instead of throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("domain not verified", { status: 403 }));
    expect(await sendEmail("sam@example.com", message, { tag: "account-deleted" }, fetchImpl)).toEqual({
      sent: false,
      reason: "refused",
      detail: "domain not verified",
    });
  });
});
