// Signing in with an email address and a password, beside Google, Microsoft
// and Apple: the words, and the checks the app makes before it asks
// Supabase. A new account and a forgotten password each prove the address
// with a 6-digit code by email (auth-email.ts), so the same steps work in the
// app and on the web.

import { DisplayName } from "./schemas";

/** Where the email part of the sign-in sign is. */
export type EmailStep = "sign-in" | "sign-up" | "confirm" | "forgot" | "reset";

/** Passwords shorter than this are refused here and by Supabase (provision sets the same). */
export const PASSWORD_MIN = 8;

/** How many digits an emailed code has (provision sets Supabase's to match). */
export const CODE_LENGTH = 6;

export const EMAIL_SIGN_IN_COPY = {
  or: "or use your email",
  name: "Your name",
  nameHint: "What your housemates call you, like Sam or Sam Lee. You can change it later.",
  noName: "Add your name, so your housemates know it’s you.",
  /** The tick box on making an account: agreeing is a tick, not a line under the button. */
  agree: "I agree to the Terms and Privacy Policy",
  agreeMeta: "And I’m 13 or older.",
  /** Cloudflare's bot check hasn't finished (or couldn't run). */
  notChecked: "Still checking you’re not a bot. Try again in a moment.",
  noAgree: "Tick the box to agree to the Terms and say you’re 13 or older.",
  email: "Email",
  password: "Password",
  newPassword: "New password",
  passwordHint: `At least ${PASSWORD_MIN} characters.`,
  code: "Code",
  codeHint: (email: string) => `We sent a ${CODE_LENGTH}-digit code to ${email}. It may take a minute, and can land in spam.`,
  signIn: "Sign in",
  signInBusy: "Signing in…",
  signUp: "Make an account",
  signUpBusy: "Sending your code…",
  confirm: "Confirm",
  confirmBusy: "Checking…",
  sendReset: "Send me a code",
  sendResetBusy: "Sending…",
  reset: "Save the new password",
  resetBusy: "Saving…",
  toSignUp: "New to Jonz? Make an account",
  toSignIn: "Have an account? Sign in",
  toForgot: "Forgot your password?",
  back: "Back",
  resend: "Send a new code",
  resent: "A new code is on its way.",
  forgotBody: "We’ll email you a code. Type it in here, then choose a new password.",
  resetBody: (email: string) => `We sent a ${CODE_LENGTH}-digit code to ${email}, if it has an account.`,
  /** After sign-up: an address that already has an account gets no code, and can't be told apart (Supabase doesn't say). */
  existingHint: "Already have an account with this email? Sign in, or reset your password.",
  badEmail: "That doesn’t look like an email address.",
  shortPassword: `Use at least ${PASSWORD_MIN} characters.`,
  badCode: `Type the ${CODE_LENGTH}-digit code from the email.`,
  wrongPassword: "That email and password don’t match. Try again, or reset your password.",
  unconfirmed: "That account isn’t confirmed yet. We’ve sent a new code.",
  wrongCode: "That code is wrong or has run out. Check the newest email, or send a new code.",
  weakPassword: "Pick a harder password. That one is too easy to guess.",
  tooMany: "Too many tries. Wait a few minutes, then try again.",
  failed: "That didn’t work. Try again.",
  notOpen: "Email sign-in isn’t open yet. Use Google or Microsoft for now.",
  /** A reset on an account with an authenticator app: Supabase wants that code too, which this form doesn't ask for. */
  needsAuthenticator: "This account has an authenticator app, so the password wasn’t saved. Sign in with Google or Microsoft, then add a password on your House page under You.",
} as const;

/** A sign-up's name: what housemates see, 1 to 60 characters, as renaming yourself allows. */
export function nameProblem(name: string): string | null {
  if (!name.trim()) return EMAIL_SIGN_IN_COPY.noName;
  const parsed = DisplayName.safeParse(name);
  return parsed.success ? null : parsed.error.issues[0].message;
}

/** A plain check, not RFC 5322: something@something.tld, with no spaces. */
export function emailLooksRight(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** The address as Supabase should get it: trimmed and in lower case. */
export const cleanEmail = (email: string) => email.trim().toLowerCase();

export function passwordProblem(password: string): string | null {
  return password.length < PASSWORD_MIN ? EMAIL_SIGN_IN_COPY.shortPassword : null;
}

/** Just the digits someone typed or pasted ("123 456" and "123-456" are fine). */
export const cleanCode = (code: string) => code.replace(/\D/g, "");

export function codeProblem(code: string): string | null {
  return cleanCode(code).length === CODE_LENGTH ? null : EMAIL_SIGN_IN_COPY.badCode;
}

/**
 * What to tell someone when Supabase refuses, from its error code (or, for
 * older responses, its status). Never says whether an address has an
 * account.
 */
export function emailAuthProblem(error: { code?: string | null; status?: number | null } | null | undefined): string {
  switch (error?.code) {
    case "invalid_credentials":
      return EMAIL_SIGN_IN_COPY.wrongPassword;
    case "email_not_confirmed":
      return EMAIL_SIGN_IN_COPY.unconfirmed;
    case "otp_expired":
    case "otp_disabled":
      return EMAIL_SIGN_IN_COPY.wrongCode;
    case "weak_password":
      return EMAIL_SIGN_IN_COPY.weakPassword;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return EMAIL_SIGN_IN_COPY.tooMany;
    case "email_address_invalid":
      return EMAIL_SIGN_IN_COPY.badEmail;
    case "insufficient_aal":
      return EMAIL_SIGN_IN_COPY.needsAuthenticator;
    case "signup_disabled":
    case "email_provider_disabled":
      return EMAIL_SIGN_IN_COPY.notOpen;
  }
  if (error?.status === 429) return EMAIL_SIGN_IN_COPY.tooMany;
  return EMAIL_SIGN_IN_COPY.failed;
}

/** House → You: a password beside Google, Microsoft or Apple, or a new one. */
export const PASSWORD_SETTING_COPY = {
  label: "Password",
  add: "Add a password",
  change: "Change your password",
  addBody: (email: string) => `Then you can also sign in with ${email} and a password.`,
  changeBody: (email: string) => `You sign in with ${email} and this password.`,
  save: "Save the password",
  busy: "Saving…",
  saved: "Password saved.",
  /** Asked only when Supabase wants it: an account with an authenticator app (the owners'). */
  authenticator: "Authenticator code",
  authenticatorBody: "Your account has an authenticator app. Type its code to save the password.",
  wrongAuthenticator: "That code didn’t work. Type the newest one from your authenticator app.",
} as const;
