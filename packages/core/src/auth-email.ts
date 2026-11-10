import { renderEmail, type EmailBlock } from "./email";
import { LEGAL } from "./legal";
import { wordsFor } from "./words-for";

// In English: Supabase sends one template to everyone, whatever their language.
const words = wordsFor("en", "housemates");

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
  const notYou = { type: "small", text: words("email.auth.notYou") } as const;
  const lasts = { type: "small", text: words("email.auth.minutes", { n: AUTH_CODE_MINUTES }) } as const;
  const code = { type: "code", code: TOKEN } as const;
  // Each email's words, by its id in email.json: email.auth.<name>.*.
  const coded = (name: "confirmation" | "magicLink" | "recovery" | "emailChange" | "reauthentication", last: EmailBlock) =>
    template({
      subject: words(`email.auth.${name}.subject`, { code: TOKEN }),
      preheader: words(`email.auth.${name}.preheader`),
      headline: words(`email.auth.${name}.headline`),
      lead: words(`email.auth.${name}.lead`),
      blocks: [code, lasts, last],
      why: words(`email.auth.${name}.why`),
    });
  return {
    confirmation: coded("confirmation", notYou),
    magic_link: coded("magicLink", notYou),
    recovery: coded("recovery", { type: "small", text: words("email.auth.recovery.notYou") }),
    email_change: coded("emailChange", { type: "small", text: words("email.auth.emailChange.notYou") }),
    reauthentication: coded("reauthentication", notYou),
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
  const reset = { type: "button", label: words("email.security.reset"), url: `${LEGAL.site}/signin` } as const;
  const fine = { type: "text", text: words("email.security.wasYou") } as const;
  const resetNow = { type: "small", text: words("email.security.notYouReset", { support }) } as const;
  const why = words("email.security.why");
  // Each notice's words, by its id in email.json: email.security.<name>.*.
  const notice = (name: "password" | "email" | "mfaAdded" | "mfaRemoved" | "identityAdded" | "identityRemoved", blocks: EmailBlock[]) => {
    const lead = words(`email.security.${name}.lead`);
    return template({ subject: words(`email.security.${name}.subject`), preheader: lead, headline: words(`email.security.${name}.headline`), lead, blocks, why });
  };
  return {
    password_changed_notification: notice("password", [fine, resetNow, reset]),
    email_changed_notification: notice("email", [fine, { type: "small", text: words("email.security.notYouWrite", { support }) }]),
    mfa_factor_enrolled_notification: notice("mfaAdded", [fine, resetNow, reset]),
    mfa_factor_unenrolled_notification: notice("mfaRemoved", [fine, resetNow, reset]),
    identity_linked_notification: notice("identityAdded", [fine, resetNow, reset]),
    identity_unlinked_notification: notice("identityRemoved", [fine, resetNow, reset]),
  };
}
