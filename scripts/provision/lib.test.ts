import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { authEmailTemplates, securityNoticeTemplates } from "../../packages/core/src/auth-email";
import { CONFIG } from "./config.mjs";
import {
  apexDomain,
  authProblems,
  authSettings,
  authorizeProblems,
  envPlan,
  findBranch,
  seedSql,
  stagingApiEnvPlan,
  stagingAuthProblems,
  stagingAuthSettings,
  stagingWebEnvPlan,
  webEnvPlan,
  googleClientIds,
  googleConsoleValues,
  googleSkipsNonce,
  googleSteps,
  googleVerdict,
  migrationVersion,
  missingMigrations,
  parseEnvFile,
  pickKeys,
  domainPlan,
  rootDirectoryProblem,
  setEnvLine,
  summaryMarkdown,
  todoText,
  tokenHint,
  vaultUpsertSql,
} from "./lib.mjs";

/**
 * The decisions `npm run provision` makes before it calls anything. The
 * failures pub-golf hit all reported success on the way in, so most of these
 * are about reading back and refusing what only looks right.
 */

const GOOGLE = { clientId: "123-abc.apps.googleusercontent.com", secret: "shh" };
const REF = "abcdefghijklmnopqrst";
const ANDROID_ONLY = { ...CONFIG, google: { iosClientId: null, androidClientIds: ["android-dev.apps.googleusercontent.com"] } };
const NATIVE = {
  ...CONFIG,
  google: {
    iosClientId: "ios-1.apps.googleusercontent.com",
    androidClientIds: ["android-dev.apps.googleusercontent.com", "android-store.apps.googleusercontent.com"],
  },
};

/** What production's dashboard holds for SMTP once Resend is pasted in. */
const SMTP = { smtp_host: "smtp.resend.com", smtp_port: 465, smtp_user: "resend", smtp_admin_email: "hello@jonz.app" };
const EMAILS = { ...authEmailTemplates(), ...securityNoticeTemplates() };

describe("auth settings", () => {
  it("sends only production's fields, never the local config", () => {
    expect(authSettings(CONFIG, null, EMAILS)).toMatchObject({
      site_url: "https://jonz.app",
      uri_allow_list: "https://jonz.app/**",
      external_email_enabled: true,
      mailer_autoconfirm: false,
      mailer_otp_length: 6,
      password_min_length: 8,
      mailer_subjects_confirmation: "Your Jonz code is {{ .Token }}",
    });
    expect((authSettings(CONFIG, null, EMAILS) as Record<string, unknown>).mailer_templates_recovery_content).toContain("{{ .Token }}");
    // SMTP's password is a Resend key pasted in the dashboard, so provision never writes SMTP.
    expect(Object.keys(authSettings(CONFIG, null, EMAILS)).filter((k) => k.startsWith("smtp_"))).toEqual([]);
    expect(authSettings(CONFIG, GOOGLE, EMAILS)).toMatchObject({
      external_google_enabled: true,
      external_google_client_id: GOOGLE.clientId,
      external_google_secret: GOOGLE.secret,
    });
  });

  it("turns on Turnstile with its secret, leaves it alone without one, and notices it off", () => {
    expect(authSettings(CONFIG, null, EMAILS, "turnstile-secret")).toMatchObject({
      security_captcha_enabled: true,
      security_captcha_provider: "turnstile",
      security_captcha_secret: "turnstile-secret",
    });
    expect(Object.keys(authSettings(CONFIG, null, EMAILS)).filter((k) => k.startsWith("security_captcha"))).toEqual([]);
    const read = { ...SMTP, ...authSettings(CONFIG, null, EMAILS) };
    expect(authProblems(read, CONFIG, null, EMAILS)).toEqual([]);
    expect(authProblems({ ...read, security_captcha_enabled: false }, CONFIG, null, EMAILS, "turnstile-secret")).toEqual(["the Turnstile bot check is off"]);
    expect(authProblems({ ...read, security_captcha_enabled: true, security_captcha_provider: "turnstile" }, CONFIG, null, EMAILS, "turnstile-secret")).toEqual([]);
  });

  it("turns on every security notice, in Jonz's words, and notices one left off", () => {
    const body = authSettings(CONFIG, null, EMAILS) as Record<string, unknown>;
    for (const kind of ["password_changed", "email_changed", "mfa_factor_enrolled", "mfa_factor_unenrolled", "identity_linked", "identity_unlinked"]) {
      expect(body[`mailer_notifications_${kind}_enabled`]).toBe(true);
      expect(body[`mailer_templates_${kind}_notification_content`]).toContain("support@jonz.app");
    }
    expect(body.mailer_subjects_password_changed_notification).toBe("Your Jonz password was changed");
    // The sign-in emails have no switch of their own.
    expect(Object.keys(body).filter((k) => k.startsWith("mailer_notifications_"))).toHaveLength(6);
    const read = { ...SMTP, ...body };
    expect(authProblems({ ...read, mailer_notifications_password_changed_enabled: false }, CONFIG, null, EMAILS)).toEqual([
      "the password changed security email is off",
    ]);
  });

  it("accepts the settings it wrote when they read back the same", () => {
    expect(authProblems({ ...SMTP, ...authSettings(CONFIG, GOOGLE, EMAILS), external_google_secret: undefined }, CONFIG, GOOGLE)).toEqual([]);
  });

  it("turns on the OAuth server for connected apps, with Jonz's own consent page, and catches it off", () => {
    const written = { ...SMTP, ...authSettings(CONFIG, null, EMAILS) };
    expect(written).toMatchObject({ oauth_server_enabled: true, oauth_server_authorization_path: "/oauth/consent", oauth_server_allow_dynamic_registration: true });
    expect(authProblems({ ...written, oauth_server_enabled: false }, CONFIG, null, EMAILS)).toEqual(["the OAuth server for connected apps is off"]);
    expect(authProblems({ ...written, oauth_server_authorization_path: "/consent", oauth_server_allow_dynamic_registration: false }, CONFIG, null, EMAILS)).toEqual([
      "the OAuth consent page is /consent, not /oauth/consent",
      "connected apps can't register themselves (dynamic client registration is off)",
    ]);
  });

  it("catches a client ID that is still an unresolved env() placeholder", () => {
    const read = { ...SMTP, ...authSettings(CONFIG, GOOGLE, EMAILS), external_google_client_id: "env(AUTH_GOOGLE_CLIENT_ID)" };
    expect(authProblems(read, CONFIG, GOOGLE)).toEqual([
      "the Google client ID is the unresolved placeholder env(AUTH_GOOGLE_CLIENT_ID)",
    ]);
  });

  it("catches localhost written over the site URL, and email sign-in turned off or auto-confirmed", () => {
    const read = { ...SMTP, ...authSettings(CONFIG, null, EMAILS), site_url: "http://localhost:3205", external_email_enabled: false, mailer_autoconfirm: true };
    expect(authProblems(read, CONFIG, null, EMAILS)).toEqual([
      "site URL is http://localhost:3205, not https://jonz.app",
      "email and password sign-in is off",
      "email sign-ups are confirmed without an email",
    ]);
  });

  it("catches Supabase not sending through Resend, from the wrong address, or with its own emails", () => {
    const written = { ...SMTP, ...authSettings(CONFIG, null, EMAILS) };
    expect(authProblems(written, CONFIG, null, EMAILS)).toEqual([]);
    expect(authProblems({ ...written, smtp_host: null }, CONFIG, null, EMAILS)).toEqual([
      "Supabase doesn't send through Resend (SMTP host unset): set it in Authentication → Emails → SMTP",
    ]);
    expect(authProblems({ ...written, smtp_admin_email: "noreply@mail.app.supabase.io" }, CONFIG, null, EMAILS)).toEqual([
      "Supabase's emails come from noreply@mail.app.supabase.io, not hello@jonz.app",
    ]);
    expect(authProblems({ ...written, mailer_subjects_recovery: "Reset Your Password" }, CONFIG, null, EMAILS)).toEqual([
      "mailer_subjects_recovery isn't Jonz's own email",
    ]);
  });

  it("lists the web client first, then the app's iOS and Android clients", () => {
    expect(googleClientIds(CONFIG, GOOGLE)).toBe(GOOGLE.clientId);
    expect(googleClientIds(NATIVE, GOOGLE)).toBe(
      `${GOOGLE.clientId},ios-1.apps.googleusercontent.com,android-dev.apps.googleusercontent.com,android-store.apps.googleusercontent.com`,
    );
    expect(googleClientIds(ANDROID_ONLY, GOOGLE)).toBe(`${GOOGLE.clientId},android-dev.apps.googleusercontent.com`);
  });

  it("skips Google's nonce check only once there is an iOS client", () => {
    expect(googleSkipsNonce(CONFIG)).toBe(false);
    expect(authSettings(CONFIG, GOOGLE, EMAILS)).toMatchObject({ external_google_skip_nonce_check: false });
    expect(googleSkipsNonce(ANDROID_ONLY)).toBe(false);
    expect(authSettings(NATIVE, GOOGLE, EMAILS)).toMatchObject({
      external_google_client_id: googleClientIds(NATIVE, GOOGLE),
      external_google_skip_nonce_check: true,
    });
  });

  it("catches a client list or nonce setting that doesn't read back", () => {
    const written = { ...SMTP, ...authSettings(NATIVE, GOOGLE, EMAILS), external_google_secret: undefined };
    expect(authProblems(written, NATIVE, GOOGLE)).toEqual([]);
    expect(authProblems({ ...written, external_google_client_id: GOOGLE.clientId }, NATIVE, GOOGLE)).toEqual([
      "the Google client IDs aren't the ones given",
    ]);
    expect(authProblems({ ...written, external_google_skip_nonce_check: false }, NATIVE, GOOGLE)).toEqual([
      "Google's nonce check is on, not skipped (iOS)",
    ]);
    const web = { ...SMTP, ...authSettings(CONFIG, GOOGLE, EMAILS), external_google_secret: undefined };
    expect(authProblems({ ...web, external_google_skip_nonce_check: true }, CONFIG, GOOGLE)).toEqual([
      "Google's nonce check is skipped, not on",
    ]);
  });

  it("finds the app's redirect URL among others", () => {
    const read = { ...SMTP, ...authSettings(CONFIG, null, EMAILS), uri_allow_list: "http://localhost:3205/**, https://jonz.app/**" };
    expect(authProblems(read, CONFIG, null)).toEqual([]);
  });
});

describe("the Google console", () => {
  it("lists exactly what to paste", () => {
    const v = googleConsoleValues(CONFIG, REF);
    expect(v.redirectUris).toEqual([`https://${REF}.supabase.co/auth/v1/callback`, "http://127.0.0.1:54341/auth/v1/callback"]);
    expect(v.javascriptOrigins).toEqual(["https://jonz.app", "http://localhost:3205"]);
    expect(v.authorizedDomains).toEqual(["jonz.app", "supabase.co"]);
    expect(v.privacyPolicy).toBe("https://jonz.app/privacy");
    expect(apexDomain("jonz.app")).toBe("jonz.app");
    expect(apexDomain("johns.glyn.dev")).toBe("glyn.dev");
  });

  it("checks where Supabase sends a browser to sign in", () => {
    const good = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE.clientId}&redirect_uri=${encodeURIComponent(`https://${REF}.supabase.co/auth/v1/callback`)}`;
    expect(authorizeProblems(good, REF, GOOGLE.clientId)).toEqual([]);
    expect(authorizeProblems(good.replace(GOOGLE.clientId, "env(AUTH_GOOGLE_CLIENT_ID)"), REF, GOOGLE.clientId)).toEqual([
      "the redirect carries a different Google client ID",
    ]);
    expect(authorizeProblems(null, REF, GOOGLE.clientId)).toEqual(["Supabase didn't redirect to Google"]);
  });

  it("reads Google's refusals by name", () => {
    expect(googleVerdict(400, "Error 400: redirect_uri_mismatch")).toBe("redirect_uri_mismatch");
    expect(googleVerdict(401, "Error 401: invalid_client The OAuth client was not found.")).toBe("invalid_client");
    expect(googleVerdict(302, "")).toBe("ok");
    expect(googleVerdict(500, "")).toBe("unknown");
  });
});

describe("keys and environment", () => {
  const keys = [
    { name: "anon", type: "legacy", api_key: "eyJ.anon" },
    { name: "service_role", type: "legacy", api_key: "eyJ.service" },
    { name: "default", type: "publishable", api_key: "sb_publishable_x" },
    { name: "default", type: "secret", api_key: "sb_secret_x" },
  ];

  it("prefers the keys local dev runs on, and falls back to the new ones", () => {
    expect(pickKeys(keys)).toEqual({ anon: "eyJ.anon", service: "eyJ.service" });
    expect(pickKeys(keys.slice(2))).toEqual({ anon: "sb_publishable_x", service: "sb_secret_x" });
    expect(pickKeys([])).toEqual({ anon: null, service: null });
  });

  it("keeps secrets sensitive and everything on production only", () => {
    const plan = envPlan(CONFIG, {
      supabaseUrl: `https://${REF}.supabase.co`,
      anonKey: "a",
      serviceKey: "s",
      cronSecret: "c",
      vapid: { publicKey: "p", privateKey: "k" },
    });
    const sensitive = plan.filter((e) => e.type === "sensitive").map((e) => e.key);
    expect(sensitive.sort()).toEqual(["CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PRIVATE_KEY"]);
    expect(plan.every((e) => e.target.length === 1 && e.target[0] === "production")).toBe(true);
    expect(plan.find((e) => e.key === "NEXT_PUBLIC_SITE_URL")!.value).toBe("https://jonz.app");
  });

  it("leaves existing push keys alone, since new ones orphan every subscribed phone", () => {
    const plan = envPlan(CONFIG, { supabaseUrl: "u", anonKey: "a", serviceKey: "s", cronSecret: "c", vapid: null });
    expect(plan.some((e) => e.key.includes("VAPID_P"))).toBe(false);
  });
});

describe("the Vercel projects", () => {
  it("builds the Next app from apps/api, however the path is written", () => {
    expect(rootDirectoryProblem("apps/api", CONFIG.vercel)).toBeNull();
    expect(rootDirectoryProblem("./apps/api/", CONFIG.vercel)).toBeNull();
  });

  it("names where it builds from instead", () => {
    expect(rootDirectoryProblem(null, CONFIG.vercel)).toBe("jonz-api builds from the repository root, not `apps/api`");
    expect(rootDirectoryProblem("", CONFIG.vercel)).toBe("jonz-api builds from the repository root, not `apps/api`");
    expect(rootDirectoryProblem("apps/client", CONFIG.vercel)).toBe("jonz-api builds from `apps/client`, not `apps/api`");
  });

  it("builds the web from apps/client", () => {
    expect(rootDirectoryProblem("apps/client", CONFIG.web)).toBeNull();
    expect(rootDirectoryProblem("apps/api", CONFIG.web)).toBe("jonz-web builds from `apps/api`, not `apps/client`");
  });

  it("puts the site on the web build and apps/api on a name of its own", () => {
    expect(domainPlan(CONFIG)).toEqual([
      { project: "jonz-web", domain: "jonz.app" },
      { project: "jonz-api", domain: "api.jonz.app" },
    ]);
  });

  it("passes /api/* on to that same name", () => {
    const web = JSON.parse(readFileSync(new URL("../../apps/client/vercel.json", import.meta.url), "utf8"));
    const api = web.rewrites.find((r: { source: string }) => r.source === "/api/:path*");
    expect(new URL(api.destination).host).toBe(CONFIG.vercel.domain);
  });

  it("gives the web build public values only, and no API URL, since it calls its own origin", () => {
    const plan = webEnvPlan({ supabaseUrl: `https://${REF}.supabase.co`, anonKey: "a", vapidPublicKey: "p" });
    expect(plan.map((e) => [e.key, e.value])).toEqual([
      ["EXPO_PUBLIC_SUPABASE_URL", `https://${REF}.supabase.co`],
      ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "a"],
      ["EXPO_PUBLIC_VAPID_PUBLIC_KEY", "p"],
    ]);
    expect(plan.every((e) => e.type === "plain" && e.target.join() === "production")).toBe(true);
  });
});

describe("migrations and the Vault", () => {
  it("knows which migrations the database hasn't recorded", () => {
    const local = ["20261011000000_init.sql", "20261012000000_groups_and_away.sql"].map(migrationVersion);
    expect(local).toEqual(["20261011000000", "20261012000000"]);
    expect(missingMigrations(local as string[], ["20261011000000"])).toEqual(["20261012000000"]);
    expect(migrationVersion("README.md")).toBeNull();
  });

  it("quotes what goes into SQL", () => {
    const statement = vaultUpsertSql("johns_tick_secret", "it's");
    expect(statement).toContain("'it''s'");
    expect(statement).toContain("vault.update_secret");
  });
});

describe(".env files", () => {
  it("reads and rewrites a line without touching the rest", () => {
    const text = "# comment\nA=1\nB=\"two\"\n";
    expect(parseEnvFile(text)).toEqual({ A: "1", B: "two" });
    expect(setEnvLine(text, "A", "9")).toBe("# comment\nA=9\nB=\"two\"\n");
    expect(setEnvLine("A=1", "C", "3")).toBe("A=1\nC=3\n");
    expect(setEnvLine("", "C", "3")).toBe("C=3\n");
  });
});

describe("the run's summary", () => {
  const todo = [
    { title: "Connect the integration", url: "https://supabase.com/dashboard/project/x/settings/integrations" },
    {
      title: "Create the Google sign-in client",
      steps: googleSteps(CONFIG, REF),
      values: [["Authorised redirect URIs", googleConsoleValues(CONFIG, REF).redirectUris]] as [string, string[]][],
    },
  ];

  it("walks the Google console in order, each step on its own page", () => {
    const steps = googleSteps(CONFIG, REF);
    expect(steps.map((s) => s.url)).toEqual([
      "https://console.cloud.google.com/projectcreate",
      "https://console.cloud.google.com/auth/branding",
      "https://console.cloud.google.com/auth/audience",
      "https://console.cloud.google.com/auth/clients/create",
      undefined,
    ]);
    expect(steps[1].text).toContain("https://jonz.app/privacy");
  });

  it("makes every step a link and every value its own code span, for a phone", () => {
    const md = summaryMarkdown({
      app: "Jonz",
      site: "https://jonz.app",
      results: [
        { ok: true, msg: "healthy" },
        { ok: false, msg: "Google refuses sign-in: invalid_client" },
      ],
      todo,
    });
    expect(md).toContain("## Jonz: 1 check failed");
    expect(md).toContain("- ✅ healthy");
    expect(md).toContain("- ❌ Google refuses sign-in: invalid_client");
    expect(md).toContain("1. **Connect the integration** · [open](https://supabase.com/dashboard/project/x/settings/integrations)");
    expect(md).toContain("[Create a Google Cloud project called Jonz](https://console.cloud.google.com/projectcreate)");
    expect(md).toContain(`\`https://${REF}.supabase.co/auth/v1/callback\``);
  });

  it("says why a run stopped early on the page a phone opens first", () => {
    const md = summaryMarkdown({
      app: "Jonz",
      site: "https://jonz.app",
      results: [{ ok: false, msg: "no project called Johns yet" }],
      todo: [],
      stopped: "SUPABASE_ACCESS_TOKEN is not set.\nAdd it as a repository secret.",
    });
    expect(md).toContain("## Jonz: stopped");
    expect(md).toContain("> SUPABASE_ACCESS_TOKEN is not set.\n> Add it as a repository secret.");
    expect(md).toContain("- ❌ no project called Johns yet");
  });

  it("names the token an API refused", () => {
    expect(tokenHint("https://api.supabase.com", 401)).toBe(" (check SUPABASE_ACCESS_TOKEN)");
    expect(tokenHint("https://api.vercel.com", 403)).toContain("VERCEL_TOKEN");
    expect(tokenHint("https://api.vercel.com", 404)).toBe("");
  });

  it("says the same in a terminal", () => {
    const text = todoText(todo);
    expect(text).toContain("- Connect the integration: https://supabase.com/dashboard/project/x/settings/integrations");
    expect(text).toContain("  3. Audience: External, then Publish app: https://console.cloud.google.com/auth/audience");
    expect(text).toContain(`Authorised redirect URIs: https://${REF}.supabase.co/auth/v1/callback`);
  });
});

describe("staging", () => {
  const google = { clientId: "web.apps.googleusercontent.com", secret: "s" };
  const azure = { clientId: "azure-id", secret: "a" };

  it("lets staging and every preview of the web build sign in, with demo passwords", () => {
    const body = stagingAuthSettings(CONFIG, { google, azure });
    expect(body.site_url).toBe("https://staging.jonz.app");
    expect(body.uri_allow_list.split(",")).toEqual([
      "https://staging.jonz.app/**",
      "https://*-glynfincks-projects.vercel.app/**",
      "jonz://**",
    ]);
    expect(body).toMatchObject({ external_email_enabled: true, mailer_autoconfirm: false, external_google_enabled: true, external_azure_enabled: true });
    expect(stagingAuthProblems(body, CONFIG, { google, azure })).toEqual([]);
    expect(stagingAuthSettings(CONFIG, { google: null, azure: null })).not.toHaveProperty("external_google_enabled");
  });

  it("says what's wrong with staging's sign-in as read back", () => {
    const body = { ...stagingAuthSettings(CONFIG, { google, azure: null }), external_email_enabled: false, mailer_autoconfirm: true, uri_allow_list: "https://staging.jonz.app/**" };
    expect(stagingAuthProblems(body, CONFIG, { google, azure })).toEqual([
      "redirect URLs don't include https://*-glynfincks-projects.vercel.app/**",
      "email and password sign-in is off, so the demo housemates can't sign in",
      "email sign-ups are confirmed without an email",
      "Microsoft sign-in is off",
    ]);
  });

  it("puts only the Preview environment on staging, keeping production's names out of it", () => {
    const api = stagingApiEnvPlan(CONFIG, { supabaseUrl: "https://st.supabase.co", anonKey: "anon", serviceKey: "svc", cronSecret: "tick", vapid: null });
    expect(api.every((e) => e.target.length === 1 && e.target[0] === "preview")).toBe(true);
    const value = (key: string) => api.find((e) => e.key === key)?.value;
    expect(value("APP_URL")).toBe("https://staging.jonz.app");
    expect(value("ALLOWED_ORIGINS")).toBe("https://staging.jonz.app,https://*-glynfincks-projects.vercel.app");
    expect(api.find((e) => e.key === "SUPABASE_SERVICE_ROLE_KEY")?.type).toBe("sensitive");
    expect(api.some((e) => e.key.startsWith("STRIPE_"))).toBe(false);
    expect(stagingApiEnvPlan(CONFIG, { supabaseUrl: "u", anonKey: "a", serviceKey: "s", cronSecret: null, vapid: null }).some((e) => e.key === "CRON_SECRET")).toBe(false);

    const web = stagingWebEnvPlan(CONFIG, { supabaseUrl: "https://st.supabase.co", anonKey: "anon", vapidPublicKey: "pub" });
    expect(Object.fromEntries(web.map((e) => [e.key, e.value]))).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: "https://st.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon",
      EXPO_PUBLIC_API_URL: "https://api.staging.jonz.app",
      EXPO_PUBLIC_STAGE: "staging",
      EXPO_PUBLIC_PASS_CHECKOUT: "on",
      EXPO_PUBLIC_VAPID_PUBLIC_KEY: "pub",
    });
    expect(web.every((e) => e.type === "plain" && e.target[0] === "preview")).toBe(true);
  });

  it("finds the staging branch, never the default one", () => {
    const branches = [
      { name: "main", is_default: true, project_ref: "prod" },
      { name: "staging", is_default: false, persistent: true, project_ref: "st" },
    ];
    expect(findBranch(branches, "staging")?.project_ref).toBe("st");
    expect(findBranch(branches, "main")).toBeNull();
    expect(findBranch(undefined, "staging")).toBeNull();
  });

  it("puts the staging password into the seed as one SQL string, and refuses a weak or dangerous one", () => {
    const template = readFileSync(new URL("../../supabase/seeds/staging.sql", import.meta.url), "utf8");
    const seeded = seedSql(template, "it's-a-secret");
    expect(seeded).toContain("password constant text := 'it''s-a-secret';");
    expect(seeded).not.toContain("'{{DEMO_PASSWORD}}'");
    expect(() => seedSql(template, "short")).toThrow(/8 characters/);
    expect(() => seedSql(template, "long enough $seed$ drop")).toThrow(/\$seed\$/);
  });
});
