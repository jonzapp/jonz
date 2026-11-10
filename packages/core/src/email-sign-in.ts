// Signing in with an email address and a password, beside Google, Microsoft
// and Apple: the words, and the checks the app makes before it asks
// Supabase. A new account and a forgotten password each prove the address
// with a 6-digit code by email (auth-email.ts), so the same steps work in the
// app and on the web.

import { DisplayName } from "./schemas";
import type { Words } from "./words-for";

/** Where the email part of the sign-in sign is. */
export type EmailStep = "sign-in" | "sign-up" | "confirm" | "forgot" | "reset";

/** Passwords shorter than this are refused here and by Supabase (provision sets the same). */
export const PASSWORD_MIN = 8;

/** How many digits an emailed code has (provision sets Supabase's to match). */
export const CODE_LENGTH = 6;

/** A sign-up's name: what housemates see, 1 to 60 characters, as renaming yourself allows. */
export function nameProblem(name: string, words: Words): string | null {
  if (!name.trim()) return words('door.email.noName');
  const parsed = DisplayName.safeParse(name);
  return parsed.success ? null : parsed.error.issues[0].message;
}

/** A plain check, not RFC 5322: something@something.tld, with no spaces. */
export function emailLooksRight(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** The address as Supabase should get it: trimmed and in lower case. */
export const cleanEmail = (email: string) => email.trim().toLowerCase();

export function passwordProblem(password: string, words: Words): string | null {
  return password.length < PASSWORD_MIN ? words("door.email.shortPassword", { min: PASSWORD_MIN }) : null;
}

/** Just the digits someone typed or pasted ("123 456" and "123-456" are fine). */
export const cleanCode = (code: string) => code.replace(/\D/g, "");

export function codeProblem(code: string, words: Words): string | null {
  return cleanCode(code).length === CODE_LENGTH ? null : words("door.email.badCode", { length: CODE_LENGTH });
}

/**
 * What to tell someone when Supabase refuses, from its error code (or, for
 * older responses, its status). Never says whether an address has an
 * account.
 */
export function emailAuthProblem(error: { code?: string | null; status?: number | null } | null | undefined, words: Words): string {
  switch (error?.code) {
    case "invalid_credentials":
      return words('door.email.wrongPassword');
    case "email_not_confirmed":
      return words('door.email.unconfirmed');
    case "otp_expired":
    case "otp_disabled":
      return words('door.email.wrongCode');
    case "weak_password":
      return words('door.email.weakPassword');
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return words('door.email.tooMany');
    case "email_address_invalid":
      return words('door.email.badEmail');
    case "insufficient_aal":
      return words('door.email.needsAuthenticator');
    case "signup_disabled":
    case "email_provider_disabled":
      return words('door.email.notOpen');
  }
  if (error?.status === 429) return words('door.email.tooMany');
  return words('door.email.failed');
}
