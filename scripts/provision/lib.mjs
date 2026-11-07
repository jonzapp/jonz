// The decisions `npm run provision` makes, as pure functions so a unit test
// can hold them (lib.test.ts, beside this file). Everything that talks to an
// API lives in scripts/provision.mjs.

export const siteUrl = (c) => `https://${c.domain}`;

/** The registrable domain Google's consent screen authorises: jonz.app for jonz.app, glyn.dev for a name like johns.glyn.dev. */
export const apexDomain = (domain) => domain.split(".").slice(-2).join(".");

/** Production's email and password rules; the app checks the same (@app/core's email-sign-in.ts). */
export const EMAIL_AUTH = {
  passwordMin: 8,
  codeLength: 6,
  codeSeconds: 3600,
  /** Supabase's emails an hour, through Resend (its free plan stops at 100 a day). */
  emailsPerHour: 100,
};

/** The SMTP fields Supabase must have to send through Resend (the password, a Resend key, is pasted in the dashboard). */
export const EMAIL_SMTP = { host: "smtp.resend.com", port: "465", user: "resend", sender: (c) => `hello@${c.domain}` };

/**
 * Supabase's emails as Management API fields, from @app/core's
 * authEmailTemplates(): mailer_subjects_<name> and mailer_templates_<name>_content.
 * @param {Record<string, { subject: string; html: string }>} templates
 * @returns {Record<string, string>}
 */
export function mailerFields(templates) {
  /** @type {Record<string, string>} */
  const body = {};
  for (const [name, t] of Object.entries(templates)) {
    body[`mailer_subjects_${name}`] = t.subject;
    body[`mailer_templates_${name}_content`] = t.html;
  }
  return body;
}

/**
 * Production's auth settings. Only these fields are sent, never the local
 * config: `supabase config push` would write localhost over the site URL.
 * Email and password sign-in is on, every new address proven by an emailed
 * code (never auto-confirmed), and Supabase's emails are Jonz's own
 * (`templates`, from @app/core). SMTP itself is left as set in the dashboard.
 */
/** @param {string | null} [captchaSecret] */
export function authSettings(c, google, templates, captchaSecret = null) {
  const body = {
    site_url: siteUrl(c),
    uri_allow_list: `${siteUrl(c)}/**`,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    mailer_otp_length: EMAIL_AUTH.codeLength,
    mailer_otp_exp: EMAIL_AUTH.codeSeconds,
    password_min_length: EMAIL_AUTH.passwordMin,
    rate_limit_email_sent: EMAIL_AUTH.emailsPerHour,
    ...mailerFields(templates),
  };
  // Cloudflare Turnstile on sign-in, sign-up and reset emails; the app sends
  // the token (apps/client's bot-check). Without the secret it's left alone.
  if (captchaSecret) {
    body.security_captcha_enabled = true;
    body.security_captcha_provider = "turnstile";
    body.security_captcha_secret = captchaSecret;
  }
  if (google) {
    body.external_google_enabled = true;
    body.external_google_client_id = googleClientIds(c, google);
    body.external_google_secret = google.secret;
    body.external_google_skip_nonce_check = googleSkipsNonce(c);
  }
  return body;
}

/**
 * Every Google client Supabase accepts an ID token for, comma-separated: the
 * web's first (its OAuth redirect uses the first), then iOS and Android.
 */
export function googleClientIds(c, google) {
  return [google.clientId, c.google.iosClientId, ...c.google.androidClientIds].filter(Boolean).join(",");
}

/**
 * Google's iOS sign-in puts a nonce in its token that the app can't see, so
 * Supabase can only accept it with the nonce check off (Supabase's guide).
 * That weakens replay protection, so it stays on until there is an iOS client.
 */
export const googleSkipsNonce = (c) => Boolean(c.google.iosClientId);

/**
 * What is wrong with the auth settings as read back. Each failure here once
 * reported success on the way in, so nothing counts as done until it reads
 * back right.
 */
/**
 * @param {any} actual
 * @param {any} c
 * @param {any} google
 * @param {any} [templates]
 * @param {string | null} [captchaSecret]
 */
export function authProblems(actual, c, google, templates, captchaSecret = null) {
  const problems = [];
  if (captchaSecret && (!actual.security_captcha_enabled || actual.security_captcha_provider !== "turnstile")) {
    problems.push("the Turnstile bot check is off");
  }
  if (actual.site_url !== siteUrl(c)) problems.push(`site URL is ${actual.site_url || "unset"}, not ${siteUrl(c)}`);
  const allowed = String(actual.uri_allow_list ?? "")
    .split(",")
    .map((s) => s.trim());
  if (!allowed.includes(`${siteUrl(c)}/**`)) problems.push(`redirect URLs don't include ${siteUrl(c)}/**`);
  if (!actual.external_email_enabled) problems.push("email and password sign-in is off");
  if (actual.mailer_autoconfirm) problems.push("email sign-ups are confirmed without an email");
  if (actual.mailer_otp_length !== EMAIL_AUTH.codeLength) problems.push(`emailed codes are ${actual.mailer_otp_length} digits, not ${EMAIL_AUTH.codeLength}`);
  if ((actual.password_min_length ?? 0) < EMAIL_AUTH.passwordMin) problems.push(`passwords may be ${actual.password_min_length ?? 0} characters, not at least ${EMAIL_AUTH.passwordMin}`);
  if (actual.smtp_host !== EMAIL_SMTP.host || String(actual.smtp_port) !== EMAIL_SMTP.port || actual.smtp_user !== EMAIL_SMTP.user) {
    problems.push(`Supabase doesn't send through Resend (SMTP host ${actual.smtp_host || "unset"}): set it in Authentication → Emails → SMTP`);
  }
  if (actual.smtp_admin_email !== EMAIL_SMTP.sender(c)) problems.push(`Supabase's emails come from ${actual.smtp_admin_email || "unset"}, not ${EMAIL_SMTP.sender(c)}`);
  if (templates) {
    for (const [key, value] of Object.entries(mailerFields(templates))) {
      if (actual[key] !== value) problems.push(`${key} isn't Jonz's own email`);
    }
  }
  if (google) {
    const id = String(actual.external_google_client_id ?? "");
    if (!actual.external_google_enabled) problems.push("Google sign-in is off");
    if (id.startsWith("env(")) problems.push(`the Google client ID is the unresolved placeholder ${id}`);
    else if (id !== googleClientIds(c, google)) problems.push("the Google client IDs aren't the ones given");
    if (Boolean(actual.external_google_skip_nonce_check) !== googleSkipsNonce(c)) {
      problems.push(`Google's nonce check is ${actual.external_google_skip_nonce_check ? "skipped" : "on"}, not ${googleSkipsNonce(c) ? "skipped (iOS)" : "on"}`);
    }
  }
  return problems;
}

/** What to paste into the Google console, which has no API for any of it. */
export function googleConsoleValues(c, ref) {
  return {
    redirectUris: [
      `https://${ref}.supabase.co/auth/v1/callback`,
      `http://127.0.0.1:${c.local.apiPort}/auth/v1/callback`,
    ],
    javascriptOrigins: [siteUrl(c), `http://localhost:${c.local.appPort}`],
    authorizedDomains: [apexDomain(c.domain), "supabase.co"],
    homePage: siteUrl(c),
    privacyPolicy: `${siteUrl(c)}/privacy`,
  };
}

/**
 * The browser key and the server key. Prefers the legacy JWT keys, which is
 * what local dev runs on, and falls back to the publishable and secret keys a
 * newer project may have instead.
 */
export function pickKeys(keys) {
  const legacy = (name) => keys.find((k) => k.type === "legacy" && k.name === name && k.api_key);
  const anon = legacy("anon") ?? keys.find((k) => k.type === "publishable" && k.api_key);
  const service = legacy("service_role") ?? keys.find((k) => k.type === "secret" && k.api_key);
  return { anon: anon?.api_key ?? null, service: service?.api_key ?? null };
}

/**
 * Vercel's production environment. Previews get nothing: Johns has no
 * preview database, and a preview writing to production's would be worse
 * than one that doesn't start. `vapid` is null when the existing keys stay,
 * since new ones would orphan every phone already subscribed.
 */
export function envPlan(c, { supabaseUrl, anonKey, serviceKey, cronSecret, vapid }) {
  const plain = (key, value) => ({ key, value, type: "plain", target: ["production"] });
  const secret = (key, value) => ({ key, value, type: "sensitive", target: ["production"] });
  const plan = [
    plain("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    plain("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey),
    secret("SUPABASE_SERVICE_ROLE_KEY", serviceKey),
    plain("NEXT_PUBLIC_SITE_URL", siteUrl(c)),
    secret("CRON_SECRET", cronSecret),
    plain("VAPID_SUBJECT", siteUrl(c)),
  ];
  if (vapid) {
    plan.push(plain("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid.publicKey), secret("VAPID_PRIVATE_KEY", vapid.privateKey));
  }
  return plan;
}

/**
 * The web build's production environment: public values only, since the
 * export bakes them into the page. No API URL: on the web the app calls
 * /api/* on its own origin. Without the VAPID public key (the one apps/api
 * signs with) it offers no reminders.
 */
export function webEnvPlan({ supabaseUrl, anonKey, vapidPublicKey }) {
  const plain = (key, value) => ({ key, value, type: "plain", target: ["production"] });
  return [
    plain("EXPO_PUBLIC_SUPABASE_URL", supabaseUrl),
    plain("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", anonKey),
    plain("EXPO_PUBLIC_VAPID_PUBLIC_KEY", vapidPublicKey),
  ];
}

/** Which Vercel project answers on which name: the site on the web build, apps/api on its own. */
export function domainPlan(c) {
  return [
    { project: c.web.project, domain: c.domain },
    { project: c.vercel.project, domain: c.vercel.domain },
  ];
}

/**
 * What is wrong with a Vercel project's Root Directory, or null. `project`
 * is `c.vercel` (the Next app, in `apps/api`) or `c.web` (the Expo app, in
 * `apps/client`); built from anywhere else a deploy fails (the live one keeps
 * serving, but nothing new ships). Vercel reads back `null` for the
 * repository's root.
 */
export function rootDirectoryProblem(actual, project) {
  const clean = (dir) => String(dir ?? "").replace(/^\.?\/*/, "").replace(/\/+$/, "");
  if (clean(actual) === clean(project.rootDirectory)) return null;
  const now = clean(actual) ? `\`${clean(actual)}\`` : "the repository root";
  return `${project.project} builds from ${now}, not \`${project.rootDirectory}\``;
}

/** Local migrations the database hasn't recorded, by version. */
export function missingMigrations(localVersions, remoteVersions) {
  const applied = new Set(remoteVersions);
  return localVersions.filter((v) => !applied.has(v));
}

/** The version a migration file name starts with: 20261012000000_groups.sql → 20261012000000. */
export const migrationVersion = (file) => file.match(/^(\d+)_/)?.[1] ?? null;

export const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** Create a Vault secret, or overwrite it if it exists. */
export function vaultUpsertSql(name, value) {
  return `do $provision$
declare existing uuid;
begin
  select id into existing from vault.secrets where name = ${sqlString(name)};
  if existing is null then
    perform vault.create_secret(${sqlString(value)}, ${sqlString(name)});
  else
    perform vault.update_secret(existing, ${sqlString(value)});
  end if;
end
$provision$;`;
}

/**
 * Where Supabase sends a browser to start Google sign-in, checked without a
 * browser: it must go to Google, with this client, back to this project.
 */
export function authorizeProblems(location, ref, clientId) {
  if (!location) return ["Supabase didn't redirect to Google"];
  let url;
  try {
    url = new URL(location);
  } catch {
    return [`Supabase redirected somewhere unreadable: ${location}`];
  }
  const problems = [];
  if (url.hostname !== "accounts.google.com") problems.push(`Supabase redirected to ${url.hostname}, not Google`);
  if (url.searchParams.get("client_id") !== clientId) problems.push("the redirect carries a different Google client ID");
  const back = `https://${ref}.supabase.co/auth/v1/callback`;
  if (url.searchParams.get("redirect_uri") !== back) problems.push(`Google is told to return to ${url.searchParams.get("redirect_uri")}, not ${back}`);
  return problems;
}

/**
 * What Google said about the sign-in request. It refuses an unknown client or
 * an unregistered redirect on the spot, by name, before anyone signs in.
 */
export function googleVerdict(status, body) {
  if (/redirect_uri_mismatch/i.test(body)) return "redirect_uri_mismatch";
  if (/invalid_client|OAuth client was not found|deleted_client/i.test(body)) return "invalid_client";
  if (status >= 200 && status < 400) return "ok";
  return "unknown";
}

/** KEY=value lines, as in .env files. Quotes are stripped; comments and blanks skipped. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** Set KEY=value in .env text, replacing the line if the key is there. */
export function setEnvLine(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`;
}

/** The Google console steps, in order, each with the page it happens on. */
export function googleSteps(c, ref, secretsUrl) {
  const v = googleConsoleValues(c, ref);
  return [
    { text: `Create a Google Cloud project called ${c.app}`, url: "https://console.cloud.google.com/projectcreate" },
    {
      text: `Branding: app name ${c.app}, your email, home page ${v.homePage}, privacy policy ${v.privacyPolicy}, authorised domains ${v.authorizedDomains.join(" and ")}`,
      url: "https://console.cloud.google.com/auth/branding",
    },
    { text: "Audience: External, then Publish app", url: "https://console.cloud.google.com/auth/audience" },
    {
      text: `Create client → Web application, with the JavaScript origins and redirect URIs below`,
      url: "https://console.cloud.google.com/auth/clients/create",
    },
    {
      text: "Save its client ID and secret as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then run this again",
      url: secretsUrl,
    },
  ];
}

/** A to-do list as plain text, for a terminal. */
export function todoText(todo) {
  return todo
    .map((t) => {
      const lines = [`- ${t.title}${t.url ? `: ${t.url}` : ""}`];
      (t.steps ?? []).forEach((s, i) => lines.push(`  ${i + 1}. ${s.text}${s.url ? `: ${s.url}` : ""}`));
      for (const [label, values] of t.values ?? []) lines.push(`     ${label}: ${values.join("  ")}`);
      return lines.join("\n");
    })
    .join("\n");
}

/** What a refused token means, by which API refused it. */
export function tokenHint(base, status) {
  if (status !== 401 && status !== 403) return "";
  if (base.includes("supabase")) return " (check SUPABASE_ACCESS_TOKEN)";
  if (base.includes("vercel")) return " (check VERCEL_TOKEN, and that its scope is the team that owns the project)";
  return "";
}

/**
 * The run as a GitHub job summary: what passed, then what's left, every step
 * a link, and every value to paste in its own code span so a phone can copy it.
 * `stopped` is why a run ended early, which otherwise only the log would say.
 */
export function summaryMarkdown({ app, site, results, todo, stopped = "" }) {
  const failed = results.filter((r) => !r.ok).length;
  const verdict = stopped ? "stopped" : failed === 0 ? "all checks passed" : `${failed} check${failed === 1 ? "" : "s"} failed`;
  const out = [`## ${app}: ${verdict}`, ""];
  if (stopped) out.push(...stopped.split("\n").map((line) => `> ${line}`), "");
  out.push(`[Open ${site}](${site})`, "");
  for (const r of results) out.push(`- ${r.ok ? "✅" : "❌"} ${r.msg}`);
  if (todo.length > 0) {
    out.push("", "### Still yours to do", "");
    todo.forEach((t, i) => {
      out.push(`${i + 1}. **${t.title}**${t.url ? ` · [open](${t.url})` : ""}`);
      (t.steps ?? []).forEach((s, j) => out.push(`   ${j + 1}. ${s.url ? `[${s.text}](${s.url})` : s.text}`));
      for (const [label, values] of t.values ?? []) {
        out.push("", `   ${label}:`, "");
        for (const v of values) out.push(`   \`${v}\``, "");
      }
    });
  }
  return `${out.join("\n")}\n`;
}

// --- Staging (scripts/staging.mjs) ------------------------------------------------------

export const stagingUrl = (c) => `https://${c.staging.domain}`;
export const stagingApiUrl = (c) => `https://${c.staging.apiDomain}`;

/**
 * The web origins staging's sign-in may return to and its API answers:
 * staging itself, and any preview of the web build.
 */
export const stagingOrigins = (c) => [stagingUrl(c), c.staging.previews];

/**
 * Staging's auth settings. Like production's, plus email and password for
 * the seeded demo housemates. Sign-up stays open for Google and Microsoft,
 * so an email sign-up is possible too, but it waits on a confirmation email
 * that Supabase's own mailer only sends to the organisation's members, so a
 * stranger can't finish one. Redirects may return to any preview.
 */
export function stagingAuthSettings(c, { google, azure }) {
  const body = {
    site_url: stagingUrl(c),
    uri_allow_list: [...stagingOrigins(c).map((o) => `${o}/**`), "jonz://**"].join(","),
    external_email_enabled: true,
    mailer_autoconfirm: false,
    disable_signup: false,
  };
  if (google) {
    body.external_google_enabled = true;
    body.external_google_client_id = googleClientIds(c, google);
    body.external_google_secret = google.secret;
    body.external_google_skip_nonce_check = googleSkipsNonce(c);
  }
  if (azure) {
    body.external_azure_enabled = true;
    body.external_azure_client_id = azure.clientId;
    body.external_azure_secret = azure.secret;
    body.external_azure_url = "";
  }
  return body;
}

/** What is wrong with staging's auth settings as read back. */
export function stagingAuthProblems(actual, c, { google, azure }) {
  const problems = [];
  if (actual.site_url !== stagingUrl(c)) problems.push(`site URL is ${actual.site_url || "unset"}, not ${stagingUrl(c)}`);
  const allowed = String(actual.uri_allow_list ?? "")
    .split(",")
    .map((s) => s.trim());
  for (const origin of stagingOrigins(c)) {
    if (!allowed.includes(`${origin}/**`)) problems.push(`redirect URLs don't include ${origin}/**`);
  }
  if (!actual.external_email_enabled) problems.push("email and password sign-in is off, so the demo housemates can't sign in");
  if (actual.mailer_autoconfirm) problems.push("email sign-ups are confirmed without an email");
  if (google && !actual.external_google_enabled) problems.push("Google sign-in is off");
  if (google && actual.external_google_client_id !== googleClientIds(c, google)) problems.push("the Google client IDs aren't the ones given");
  if (azure && !actual.external_azure_enabled) problems.push("Microsoft sign-in is off");
  return problems;
}

/**
 * apps/api's Preview environment: every preview of it, and staging's own,
 * runs on the staging branch. Stripe's keys are left alone: the sandbox key
 * and staging's webhook secret are set by hand (DEPLOYMENT.md).
 */
export function stagingApiEnvPlan(c, { supabaseUrl, anonKey, serviceKey, cronSecret, vapid }) {
  const plain = (key, value) => ({ key, value, type: "plain", target: ["preview"] });
  const secret = (key, value) => ({ key, value, type: "sensitive", target: ["preview"] });
  const plan = [
    plain("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    plain("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey),
    secret("SUPABASE_SERVICE_ROLE_KEY", serviceKey),
    plain("NEXT_PUBLIC_SITE_URL", stagingUrl(c)),
    plain("APP_URL", stagingUrl(c)),
    plain("ALLOWED_ORIGINS", stagingOrigins(c).join(",")),
    plain("VAPID_SUBJECT", stagingUrl(c)),
  ];
  if (cronSecret) plan.push(secret("CRON_SECRET", cronSecret));
  if (vapid) plan.push(plain("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid.publicKey), secret("VAPID_PRIVATE_KEY", vapid.privateKey));
  return plan;
}

/**
 * The web build's Preview environment: public values only. It calls
 * staging's API (or the same branch's preview of it: apps/client/scripts/
 * build-web.mjs), shows the staging ribbon and demo sign-in, and sells the
 * Pass in Stripe's sandbox.
 */
export function stagingWebEnvPlan(c, { supabaseUrl, anonKey, vapidPublicKey }) {
  const plain = (key, value) => ({ key, value, type: "plain", target: ["preview"] });
  const plan = [
    plain("EXPO_PUBLIC_SUPABASE_URL", supabaseUrl),
    plain("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", anonKey),
    plain("EXPO_PUBLIC_API_URL", stagingApiUrl(c)),
    plain("EXPO_PUBLIC_STAGE", "staging"),
    plain("EXPO_PUBLIC_PASS_CHECKOUT", "on"),
  ];
  if (vapidPublicKey) plan.push(plain("EXPO_PUBLIC_VAPID_PUBLIC_KEY", vapidPublicKey));
  return plan;
}

/** The persistent Supabase branch called `name` from the Management API's list, or null. */
export function findBranch(branches, name) {
  return (branches ?? []).find((b) => (b.name ?? b.branch_name) === name && !b.is_default) ?? null;
}

/**
 * supabase/seeds/staging.sql with the staging password in place, as a SQL
 * string literal inside its dollar-quoted block. Refuses a short password,
 * or one that could end the block early.
 */
export function seedSql(template, password) {
  if (typeof password !== "string" || password.length < 8) throw new Error("the staging password must be 8 characters or more");
  if (password.includes("$seed$")) throw new Error("the staging password can't contain $seed$");
  return template.replaceAll("'{{DEMO_PASSWORD}}'", sqlString(password));
}
