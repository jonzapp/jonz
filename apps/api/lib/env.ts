// What the API's route handlers read from the environment, in one place.
// Values come from .env.local locally and from Vercel's environment when
// deployed. (The engine's service-role key is read by lib/supabase/admin.ts.)

import { EMAIL_ADDRESSES } from "@app/core";

import { originAllowed } from "./cors";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  /**
   * Supabase's secret key ("sb_secret_…"), for sign-in on our own address
   * (app/auth): with it, and IP Address Forwarding on, Supabase Auth limits
   * each person by their own address. Unset, sign-in still passes through
   * on the anon key, and everyone shares the API's addresses' limits.
   */
  supabaseSecretKey: () => process.env.SUPABASE_SECRET_KEY || null,
  /**
   * Web origins allowed to call /api/* from another origin, comma-separated:
   * the Expo app's web build on 8205 locally. The phones send no Origin, and
   * once the Expo web build serves jonz.app it calls the API from the
   * same origin. On staging, the staging site and its previews, as
   * patterns (lib/cors.ts).
   */
  allowedOrigins: () =>
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  /**
   * The app's own web address (the Expo web build), where Stripe sends a
   * buyer back after Checkout or the billing page: https://jonz.app.
   */
  appUrl: () => required("APP_URL").replace(/\/+$/, ""),
  /**
   * Where to send a browser back to after Stripe: the page that asked, when
   * it's one of ALLOWED_ORIGINS (staging, or a preview of the web build),
   * otherwise APP_URL. Production lists no origins, so it is always APP_URL.
   */
  appUrlFor: (request: Request) => env.appUrlForOrigin(request.headers.get("origin")),
  /** appUrlFor, from the Origin header alone (a /v1 handler has that, not the request). */
  appUrlForOrigin: (origin: string | null) => (originAllowed(origin, env.allowedOrigins()) ? origin : env.appUrl()),
  /**
   * Where file links point (lib/files.ts): the site, which passes /files on
   * to this API, unless FILES_URL names another address that serves
   * /files. Staging's site passes /files to production, so staging sets it.
   */
  filesSiteForOrigin: (origin: string | null) => process.env.FILES_URL?.replace(/\/+$/, "") || env.appUrlForOrigin(origin),
  /**
   * Resend's key for sending email (lib/email.ts), "Sending access" only.
   * Unset locally and on staging, where emails are logged, not sent.
   */
  resendApiKey: () => process.env.RESEND_API_KEY || null,
  /**
   * Email to support@jonz.app (lib/inbound.ts): the secret Resend signs its
   * inbound webhook with ("whsec_…"), and a Resend key that may read
   * received mail. Without both, the webhook answers 503 and the mail
   * waits in Resend.
   */
  resendWebhookSecret: () => process.env.RESEND_WEBHOOK_SECRET || null,
  resendReceivingKey: () => process.env.RESEND_RECEIVING_KEY || null,
  /** Who emails come from: Jonz <hello@jonz.app>, unless EMAIL_FROM says otherwise. */
  emailFrom: () => process.env.EMAIL_FROM || EMAIL_ADDRESSES.from,
  /**
   * Which copy of Jonz this is, from Vercel's own VERCEL_ENV: production, or
   * staging (every preview shares the staging database), or local. Stripe
   * purchases carry it, so each copy's webhook leaves the other's alone.
   */
  stage: (): Stage =>
    process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "staging" : "local",
};

export type Stage = "production" | "staging" | "local";
