import { describe, expect, it } from "vitest";

import { emailWords, htmlToText, parseAddress, refOf, refTag, reportRef, skipInbound, topicOf } from "./inbound-email";

describe("email to support", () => {
  it("reads who sent it", () => {
    expect(parseAddress("Ava Brown <Ava@Example.com>")).toEqual({ name: "Ava Brown", email: "ava@example.com" });
    expect(parseAddress('"Brown, Ava" <ava@example.com>')).toEqual({ name: "Brown, Ava", email: "ava@example.com" });
    expect(parseAddress("ava@example.com")).toEqual({ name: null, email: "ava@example.com" });
    expect(parseAddress("not an address")).toEqual({ name: null, email: null });
    expect(parseAddress(null)).toEqual({ name: null, email: null });
  });

  it("carries a report's reference in the subject, and finds it again", () => {
    const id = "1A2B3C4D-5e6f-4000-8000-000000000000";
    expect(reportRef(id)).toBe("1a2b3c4d");
    expect(refTag(id)).toBe("(ref 1a2b3c4d)");
    expect(refOf("Re: Re: The bins John vanished (ref 1a2b3c4d)")).toBe("1a2b3c4d");
    expect(refOf("Re: The bins John vanished")).toBeNull();
    expect(topicOf("RE: Fwd: Paying the Stake (ref 1a2b3c4d)")).toBe("paying the stake");
    expect(topicOf("AW:   Two   spaces")).toBe("two spaces");
  });

  it("keeps the words written this time, not the quoted history", () => {
    expect(emailWords({ text: "Thanks, that worked.\n\nOn Tue, 3 Nov 2026 at 10:00, Jonz <hello@jonz.app> wrote:\n> Try again now." })).toBe("Thanks, that worked.");
    // Gmail wraps a long "On … wrote:" line in two.
    expect(emailWords({ text: "Still broken.\n\nOn Tue, 3 Nov 2026 at 10:00, Glyn at Jonz <support@jonz.app>\nwrote:\n> Fixed?" })).toBe("Still broken.");
    expect(emailWords({ text: "Yes please\r\n\r\n-----Original Message-----\r\nFrom: Jonz" })).toBe("Yes please");
    expect(emailWords({ text: "Here it is.\n\nSent from my iPhone" })).toBe("Here it is.");
    expect(emailWords({ text: "Hi,\n\n\n\nThe Table is wrong.\n-- \nAva" })).toBe("Hi,\n\nThe Table is wrong.");
  });

  it("reads an email with only HTML", () => {
    expect(htmlToText("<p>Hello&nbsp;there</p><p>Second &amp; last</p>")).toBe("Hello there\nSecond & last\n");
    expect(emailWords({ text: "", html: "<div>The Stake shows £0</div><blockquote>old words</blockquote>" })).toBe("The Stake shows £0");
  });

  it("cuts long words at the limit", () => {
    const words = emailWords({ text: "a".repeat(2500) });
    expect(words).toHaveLength(2000);
    expect(words.endsWith("…")).toBe(true);
  });

  it("leaves out automatic replies, bounces, Jonz's own mail and mail for other addresses", () => {
    const to = ["support@jonz.app"];
    expect(skipInbound({ from: "Ava <ava@example.com>", to })).toBeNull();
    expect(skipInbound({ from: "ava@example.com", to: ["Jonz support <SUPPORT@jonz.app>"] })).toBeNull();
    expect(skipInbound({ from: "ava@example.com", to: ["hello@jonz.app"] })).toBeNull();
    expect(skipInbound({ from: "ava@example.com", to: ["sales@jonz.app"] })).toBe("not-support");
    expect(skipInbound({ from: "hello@jonz.app", to })).toBe("jonz");
    expect(skipInbound({ from: "MAILER-DAEMON@example.com", to })).toBe("automatic");
    expect(skipInbound({ from: "noreply@example.com", to })).toBe("automatic");
    expect(skipInbound({ from: "ava@example.com", to, headers: { "Auto-Submitted": "auto-replied" } })).toBe("automatic");
    expect(skipInbound({ from: "ava@example.com", to, headers: { "auto-submitted": "no" } })).toBeNull();
    expect(skipInbound({ from: "ava@example.com", to, headers: { precedence: "bulk" } })).toBe("automatic");
    expect(skipInbound({ from: "", to })).toBe("address");
  });
});
