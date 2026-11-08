import { cleanCode, cleanEmail, LEGAL } from '@app/core';

import { supabase } from './supabase';

// Email and password sign-in (core's email-sign-in.ts). A new account and a
// forgotten password each prove the address with a 6-digit code by email, so
// nothing here leaves the app for a link. Each throws Supabase's AuthError,
// which core's emailAuthProblem puts into words.

// `captchaToken` is Cloudflare's bot check (components/bot-check): production
// Supabase refuses a sign-in, a new account or a reset email without one.

export async function signInWithEmail(email: string, password: string, captchaToken?: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(email), password, options: { captchaToken } });
  if (error) throw error;
}

/**
 * Makes the account and emails its code. Resolves `signed-in` where an
 * address needs no confirming (local development), else `code-sent`.
 */
export async function signUpWithEmail(email: string, password: string, name: string, captchaToken?: string): Promise<'signed-in' | 'code-sent'> {
  // display_name becomes the new profile's name (the on_auth_user_created trigger);
  // the Terms they ticked, and when, stay with the account.
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail(email),
    password,
    options: { captchaToken, data: { display_name: name.trim(), terms_agreed: LEGAL.updated, terms_agreed_at: new Date().toISOString() } },
  });
  if (error) throw error;
  return data.session ? 'signed-in' : 'code-sent';
}

/** The code from the sign-up email; a right one signs in. */
export async function confirmEmail(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: cleanEmail(email), token: cleanCode(code), type: 'signup' });
  if (error) throw error;
}

/** Sends the sign-up code again. */
export async function resendSignUpCode(email: string, captchaToken?: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail(email), options: { captchaToken } });
  if (error) throw error;
}

/** Emails a reset code. Says nothing about whether the address has an account. */
export async function sendPasswordReset(email: string, captchaToken?: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(email), { captchaToken });
  if (error) throw error;
}

/** The reset code, then the new password: a right code signs in, then the password is saved. */
export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: cleanEmail(email), token: cleanCode(code), type: 'recovery' });
  if (error) throw error;
  try {
    await setPassword(password);
  } catch (reason) {
    // The right code signed in, but there's no password: don't leave them
    // signed in as if it worked. Signed out, the form says why.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    throw reason;
  }
}

/**
 * Adds or changes the signed-in account's password. An account with an
 * authenticator app needs its code first (Supabase answers insufficient_aal
 * without it); a wrong one is `authenticator_wrong`.
 */
export async function setPassword(password: string, authenticatorCode?: string): Promise<void> {
  if (authenticatorCode) {
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    const factorId = factors.totp.find((factor) => factor.status === 'verified')?.id;
    const checked = factorId ? await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanCode(authenticatorCode) }) : null;
    if (!checked || checked.error) throw Object.assign(new Error('the authenticator code was refused'), { code: 'authenticator_wrong' });
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** The signed-in account's email address, and whether it has a password yet (null when signed out). */
export async function emailSignIn(): Promise<{ email: string; hasPassword: boolean } | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return null;
  return { email: user.email, hasPassword: Boolean(user.identities?.some((i) => i.provider === 'email')) };
}
