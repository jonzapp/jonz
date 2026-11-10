import { describe, expect, it } from "vitest";

import { authEmailTemplates, securityNoticeTemplates } from "./auth-email";
import {
  CODE_LENGTH,
  PASSWORD_MIN,
  cleanCode,
  cleanEmail,
  codeProblem,
  emailAuthProblem,
  emailLooksRight,
  nameProblem,
  passwordProblem,
} from "./email-sign-in";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

describe("email sign-in checks", () => {
  it("takes plain addresses and refuses obvious typos", () => {
    expect(emailLooksRight(" sam@example.com ")).toBe(true);
    expect(emailLooksRight("sam@example")).toBe(false);
    expect(emailLooksRight("sam example.com")).toBe(false);
    expect(cleanEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it("wants 8 characters of password and 6 digits of code", () => {
    expect(passwordProblem("1234567", words)).toBe(words("door.email.shortPassword", { min: PASSWORD_MIN }));
    expect(passwordProblem("12345678", words)).toBeNull();
    expect(cleanCode("123 456")).toBe("123456");
    expect(codeProblem("123-456", words)).toBeNull();
    expect(codeProblem("12345", words)).toBe(words("door.email.badCode", { length: CODE_LENGTH }));
  });

  it("puts Supabase's refusals into words, never saying whether an address has an account", () => {
    expect(emailAuthProblem({ code: "invalid_credentials" }, words)).toBe(words('door.email.wrongPassword'));
    expect(emailAuthProblem({ code: "otp_expired" }, words)).toBe(words('door.email.wrongCode'));
    expect(emailAuthProblem({ code: "insufficient_aal", status: 401 }, words)).toBe(words('door.email.needsAuthenticator'));
    expect(emailAuthProblem({ code: "weak_password" }, words)).toBe(words('door.email.weakPassword'));
    expect(emailAuthProblem({ code: "signup_disabled" }, words)).toBe(words('door.email.notOpen'));
    expect(emailAuthProblem({ status: 429 }, words)).toBe(words('door.email.tooMany'));
    expect(emailAuthProblem({}, words)).toBe(words('door.email.failed'));
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
    expect(nameProblem("  ", words)).toBe(words('door.email.noName'));
    expect(nameProblem("Sam", words)).toBeNull();
    expect(nameProblem("x".repeat(61), words)).toMatch(/1 to 60/);
  });
});
