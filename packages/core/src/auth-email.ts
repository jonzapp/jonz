import { APP_NAME } from "./copy";
import { renderEmail, type EmailBlock } from "./email";
import { LEGAL } from "./legal";

// Supabase Auth's own emails (sign-up code, password reset, email change,
// reauthentication) in Jonz's look. Supabase fills in Go template tags such
// as {{ .Token }} when it sends; provision writes these into production's
// auth settings (scripts/provision/lib.mjs), so they never drift.
//
// Every one carries a 6-digit code and no link: a code works the same in the
// app and on the web, and a link in a sign-in email is what phishing copies.

/** One Supabase template: the subject line and its HTML body. */
export interface AuthEmailTemplate {
  subject: string;
  html: string;
}

/** Supabase's names for its templates, as the Management API spells them (mailer_templates_<name>_content). */
export type AuthEmailName = "confirmation" | "recovery" | "magic_link" | "email_change" | "reauthentication";

const TOKEN = "{{ .Token }}";

const minutes = (n: number) => `The code works for ${n} minutes.`;

function template(args: {
  subject: string;
  preheader: string;
  headline: string;
  lead: string;
  blocks: EmailBlock[];
  why: string;
}): AuthEmailTemplate {
  const { html } = renderEmail(args);
  return { subject: args.subject, html };
}

/** How long a code lasts, in minutes; provision sets Supabase's OTP expiry to match. */
export const AUTH_CODE_MINUTES = 60;

/** Every Supabase Auth email, ready for the Management API. */
export function authEmailTemplates(): Record<AuthEmailName, AuthEmailTemplate> {
  const notYou = { type: "small", text: "If this wasn’t you, ignore this email. Nothing changes without the code." } as const;
  return {
    confirmation: template({
      subject: `Your ${APP_NAME} code is ${TOKEN}`,
      preheader: "Type it in to finish making your account.",
      headline: "Your code",
      lead: "Type it into Jonz to finish making your account.",
      blocks: [{ type: "code", code: TOKEN }, { type: "small", text: minutes(AUTH_CODE_MINUTES) }, notYou],
      why: "You asked for this when you made a Jonz account with this email address.",
    }),
    magic_link: template({
      subject: `Your ${APP_NAME} code is ${TOKEN}`,
      preheader: "Type it in to sign in.",
      headline: "Your code",
      lead: "Type it into Jonz to sign in.",
      blocks: [{ type: "code", code: TOKEN }, { type: "small", text: minutes(AUTH_CODE_MINUTES) }, notYou],
      why: "You asked for this when you signed in to Jonz with this email address.",
    }),
    recovery: template({
      subject: `Reset your ${APP_NAME} password: ${TOKEN}`,
      preheader: "Type the code in to choose a new password.",
      headline: "Reset your password",
      lead: "Type this code into Jonz, then choose a new password.",
      blocks: [
        { type: "code", code: TOKEN },
        { type: "small", text: minutes(AUTH_CODE_MINUTES) },
        { type: "small", text: "If you didn’t ask to reset it, ignore this email. Your password stays as it is." },
      ],
      why: "You asked to reset the password for this email address on Jonz.",
    }),
    email_change: template({
      subject: `Confirm your new ${APP_NAME} email: ${TOKEN}`,
      preheader: "Type the code in to move your account to this address.",
      headline: "Confirm this address",
      lead: "Type this code into Jonz to move your account here.",
      blocks: [
        { type: "code", code: TOKEN },
        { type: "small", text: minutes(AUTH_CODE_MINUTES) },
        { type: "small", text: "If you didn’t ask for this, ignore this email. Your account stays where it is." },
      ],
      why: "Someone asked to move a Jonz account to this email address.",
    }),
    reauthentication: template({
      subject: `Your ${APP_NAME} code is ${TOKEN}`,
      preheader: "Type it in to confirm it’s you.",
      headline: "Confirm it’s you",
      lead: "Type this code into Jonz to carry on.",
      blocks: [{ type: "code", code: TOKEN }, { type: "small", text: minutes(AUTH_CODE_MINUTES) }, notYou],
      why: "You asked for this while changing your sign-in on Jonz.",
    }),
  };
}

/**
 * Supabase's security notices, as the Management API names them: sent after
 * a change to how an account signs in, so a change someone else made doesn't
 * go unseen. Provision turns each one on (mailer_notifications_<name>_enabled).
 */
export type SecurityNoticeName =
  | "password_changed_notification"
  | "email_changed_notification"
  | "mfa_factor_enrolled_notification"
  | "mfa_factor_unenrolled_notification"
  | "identity_linked_notification"
  | "identity_unlinked_notification";

/** Every security notice, in Jonz's look: what changed, and what to do if it wasn't you. */
export function securityNoticeTemplates(): Record<SecurityNoticeName, AuthEmailTemplate> {
  const support = LEGAL.email;
  const reset = { type: "button", label: "Reset your password", url: `${LEGAL.site}/signin` } as const;
  const fine = { type: "text", text: "If this was you, there’s nothing to do." } as const;
  const notYou = (step: string) => ({ type: "small", text: `If it wasn’t you, ${step}, then write to ${support} so we can help.` }) as const;
  const why = "We send this whenever the way you sign in to Jonz changes.";
  const notice = (subject: string, headline: string, lead: string, blocks: EmailBlock[]) =>
    template({ subject, preheader: lead, headline, lead, blocks, why });
  return {
    password_changed_notification: notice(
      `Your ${APP_NAME} password was changed`,
      "Password changed",
      "The password on your Jonz account was just added or changed.",
      [fine, notYou("reset your password straight away"), reset],
    ),
    email_changed_notification: notice(
      `Your ${APP_NAME} email address was changed`,
      "Email changed",
      "Your Jonz account was just moved to a different email address.",
      [fine, { type: "small", text: `If it wasn’t you, write to ${support} straight away so we can help.` }],
    ),
    mfa_factor_enrolled_notification: notice(
      `An authenticator app was added to your ${APP_NAME} account`,
      "Authenticator added",
      "An authenticator app was just added to your Jonz account.",
      [fine, notYou("reset your password straight away"), reset],
    ),
    mfa_factor_unenrolled_notification: notice(
      `An authenticator app was removed from your ${APP_NAME} account`,
      "Authenticator removed",
      "An authenticator app was just removed from your Jonz account.",
      [fine, notYou("reset your password straight away"), reset],
    ),
    identity_linked_notification: notice(
      `A new way to sign in was added to your ${APP_NAME} account`,
      "Sign-in added",
      "A new way to sign in, like Google or Microsoft, was just added to your Jonz account.",
      [fine, notYou("reset your password straight away"), reset],
    ),
    identity_unlinked_notification: notice(
      `A way to sign in was removed from your ${APP_NAME} account`,
      "Sign-in removed",
      "A way to sign in, like Google or Microsoft, was just removed from your Jonz account.",
      [fine, notYou("reset your password straight away"), reset],
    ),
  };
}
