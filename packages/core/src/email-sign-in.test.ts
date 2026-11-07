import { describe, expect, it } from "vitest";

import { authEmailTemplates, securityNoticeTemplates } from "./auth-email";
import {
  cleanCode,
  cleanEmail,
  codeProblem,
  EMAIL_SIGN_IN_COPY,
  emailAuthProblem,
  emailLooksRight,
  nameProblem,
  passwordProblem,
} from "./email-sign-in";

describe("email sign-in checks", () => {
  it("takes plain addresses and refuses obvious typos", () => {
    expect(emailLooksRight(" sam@example.com ")).toBe(true);
    expect(emailLooksRight("sam@example")).toBe(false);
    expect(emailLooksRight("sam example.com")).toBe(false);
    expect(cleanEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it("wants 8 characters of password and 6 digits of code", () => {
    expect(passwordProblem("1234567")).toBe(EMAIL_SIGN_IN_COPY.shortPassword);
    expect(passwordProblem("12345678")).toBeNull();
    expect(cleanCode("123 456")).toBe("123456");
    expect(codeProblem("123-456")).toBeNull();
    expect(codeProblem("12345")).toBe(EMAIL_SIGN_IN_COPY.badCode);
  });

  it("puts Supabase's refusals into words, never saying whether an address has an account", () => {
    expect(emailAuthProblem({ code: "invalid_credentials" })).toBe(EMAIL_SIGN_IN_COPY.wrongPassword);
    expect(emailAuthProblem({ code: "otp_expired" })).toBe(EMAIL_SIGN_IN_COPY.wrongCode);
    expect(emailAuthProblem({ code: "insufficient_aal", status: 401 })).toBe(EMAIL_SIGN_IN_COPY.needsAuthenticator);
    expect(emailAuthProblem({ code: "weak_password" })).toBe(EMAIL_SIGN_IN_COPY.weakPassword);
    expect(emailAuthProblem({ code: "signup_disabled" })).toBe(EMAIL_SIGN_IN_COPY.notOpen);
    expect(emailAuthProblem({ status: 429 })).toBe(EMAIL_SIGN_IN_COPY.tooMany);
    expect(emailAuthProblem({})).toBe(EMAIL_SIGN_IN_COPY.failed);
  });
});

describe("Supabase's emails", () => {
  const all = authEmailTemplates();

  it("covers every email Supabase sends for sign-in", () => {
    expect(Object.keys(all).sort()).toEqual(["confirmation", "email_change", "magic_link", "reauthentication", "recovery"]);
  });

  it("carries the code, and no link to click", () => {
    for (const t of Object.values(all)) {
      expect(t.html).toContain("{{ .Token }}");
      expect(t.html).not.toContain("{{ .ConfirmationURL }}");
      expect(t.html).toContain("https://jonz.app/email/sign.png");
      expect(t.subject).not.toMatch(/!/);
    }
  });
});

describe("Supabase's security notices", () => {
  const all = securityNoticeTemplates();

  it("tells you about every change to how you sign in", () => {
    expect(Object.keys(all).sort()).toEqual([
      "email_changed_notification",
      "identity_linked_notification",
      "identity_unlinked_notification",
      "mfa_factor_enrolled_notification",
      "mfa_factor_unenrolled_notification",
      "password_changed_notification",
    ]);
  });

  it("says what to do if it wasn't you, in Jonz's look, with no code in it", () => {
    for (const t of Object.values(all)) {
      expect(t.html).toContain("support@jonz.app");
      expect(t.html).toContain("https://jonz.app/email/sign.png");
      expect(t.html).not.toContain("{{ .Token }}");
      expect(t.subject).toMatch(/^(Your|An|A) /);
      expect(t.subject).not.toMatch(/!/);
    }
    expect(all.password_changed_notification.html).toContain("https://jonz.app/signin");
  });
});

describe("nameProblem", () => {
  it("asks for a name, and keeps it to what renaming allows", () => {
    expect(nameProblem("  ")).toBe(EMAIL_SIGN_IN_COPY.noName);
    expect(nameProblem("Sam")).toBeNull();
    expect(nameProblem("x".repeat(61))).toMatch(/1 to 60/);
  });
});
