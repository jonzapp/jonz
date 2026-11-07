// Make production match scripts/provision/config.mjs, then prove it does.
//
//   npm run provision              do everything that can be done, then check
//   npm run provision -- --check   change nothing; read back and check
//   npm run provision -- --no-deploy
//
// Run it on your own machine: it needs tokens this repo must never hold.
// They come from the environment or from .env.provision.local (gitignored):
//
//   SUPABASE_ACCESS_TOKEN   supabase.com/dashboard/account/tokens
//   VERCEL_TOKEN            vercel.com/account/settings/tokens
//   GOOGLE_CLIENT_ID        from the Google console; leave both unset on the
//   GOOGLE_CLIENT_SECRET    first run and this prints what to paste there
//   SUPABASE_DB_PASSWORD    written here when this script creates the project
//   TURNSTILE_SECRET        Cloudflare Turnstile's secret key (the bot check on
//                           email sign-in); unset leaves the check as it is
//
// Safe to run again and again: every step looks before it writes, and no
// secret it generates is ever printed.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG as C } from "./provision/config.mjs";
import { loadCore } from "./provision/core.mjs";
import {
  authProblems,
  authSettings,
  authorizeProblems,
  domainPlan,
  envPlan,
  googleClientIds,
  googleConsoleValues,
  googleSteps,
  googleVerdict,
  migrationVersion,
  missingMigrations,
  parseEnvFile,
  pickKeys,
  rootDirectoryProblem,
  setEnvLine,
  siteUrl,
  summaryMarkdown,
  todoText,
  tokenHint,
  vaultUpsertSql,
  webEnvPlan,
} from "./provision/lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_FILE = path.join(ROOT, ".env.provision.local");
// Local development is set up when the app has its settings; `supabase start`
// reads the Google client for local sign-in from its own directory.
const APP_ENV = path.join(ROOT, "apps", "api", ".env.local");
const SUPABASE_ENV = path.join(ROOT, "supabase", ".env.local");
const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const DEPLOY = !CHECK_ONLY && !args.has("--no-deploy");
// Run from the "Provision production" workflow, the tokens are repository
// secrets and the summary is written to the run's page for a phone to read.
const IN_ACTIONS = Boolean(process.env.GITHUB_ACTIONS);
const SECRETS_PAGE = `https://github.com/${process.env.GITHUB_REPOSITORY ?? "jonzapp/jonz"}/settings/secrets/actions`;

const env = { ...(existsSync(LOCAL_FILE) ? parseEnvFile(readFileSync(LOCAL_FILE, "utf8")) : {}), ...process.env };
const results = [];
const todo = [];

const say = (msg) => console.log(msg);
const pass = (msg) => (results.push({ ok: true, msg }), say(`  ✓ ${msg}`));
const fail = (msg) => (results.push({ ok: false, msg }), say(`  ✗ ${msg}`));
const step = (title) => say(`\n${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secret = () => randomBytes(32).toString("base64url");
/** Keep a value out of the Actions log even if something were to print it. */
const mask = (value) => {
  if (IN_ACTIONS && value) console.log(`::add-mask::${value}`);
  return value;
};

/**
 * End the run early. In a workflow the reason also goes on the run's summary
 * page and as an annotation, since a phone sees those before it sees the log.
 */
function stop(reason, code = 1) {
  console.error(reason);
  if (IN_ACTIONS) {
    const escaped = reason.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
    console.log(`::error title=Provisioning stopped::${escaped}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown({ app: C.app, site: siteUrl(C), results, todo, stopped: reason }));
  }
  process.exit(code);
}
process.on("uncaughtException", (e) => stop(e.message));

function need(name, where) {
  if (!env[name]) {
    stop(
      IN_ACTIONS
        ? `${name} is not set. Create one at ${where}, then add it as a repository secret: ${SECRETS_PAGE}/new`
        : `${name} is not set. Create one at ${where}, then put it in .env.provision.local or the environment.`,
      2,
    );
  }
  return env[name];
}

/** JSON over HTTPS with a bearer token. Errors name the call, never the body sent. */
async function call(base, token, method, route, body) {
  const res = await fetch(base + route, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: keep the text for the error.
  }
  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${method} ${route.split("?")[0]} → ${res.status}${tokenHint(base, res.status)}: ${detail.slice(0, 300)}`);
  }
  return data;
}

const SUPABASE_TOKEN = need("SUPABASE_ACCESS_TOKEN", "https://supabase.com/dashboard/account/tokens");
const VERCEL_TOKEN = need("VERCEL_TOKEN", "https://vercel.com/account/settings/tokens");
const supa = (method, route, body) => call("https://api.supabase.com", SUPABASE_TOKEN, method, route, body);
const team = `teamId=${C.vercel.teamId}`;
const vercel = (method, route, body) =>
  call("https://api.vercel.com", VERCEL_TOKEN, method, `${route}${route.includes("?") ? "&" : "?"}${team}`, body);

const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID.trim(), secret: env.GOOGLE_CLIENT_SECRET.trim() }
    : null;

/** The Supabase CLI. Its own output shows; a failure names the command but not its arguments, which carry the password. */
function supabaseCli(cliArgs) {
  try {
    execFileSync("supabase", cliArgs, {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: SUPABASE_TOKEN },
    });
  } catch (e) {
    throw new Error(`supabase ${cliArgs.slice(0, 2).join(" ")} failed (exit ${e.status ?? "unknown"}); its own message is in the log`);
  }
}

say(`Provisioning ${C.app} → ${siteUrl(C)}${CHECK_ONLY ? " (check only)" : ""}`);

// --- 1. The Supabase project -------------------------------------------------------

step("Supabase project");
const findProject = async () =>
  (await supa("GET", "/v1/projects")).find((p) => (p.ref ?? p.id) === C.supabase.ref || (p.name === C.supabase.name && p.organization_id === C.supabase.orgId));
let project = await findProject();
if (!project && CHECK_ONLY) {
  fail(`no project called ${C.supabase.name} yet`);
  stop(`Nothing to check yet: ${IN_ACTIONS ? 'run it again in "set up and check" mode' : "run it without --check"} to create the project.`);
}
if (!project) {
  // The password is saved before the project exists, so a crash between the
  // two can't lose it. In a workflow it lives only for this run: everything
  // after creation goes through the API, and the dashboard can reset it.
  const password = mask(env.SUPABASE_DB_PASSWORD || secret());
  if (!env.SUPABASE_DB_PASSWORD && IN_ACTIONS) {
    env.SUPABASE_DB_PASSWORD = password;
    say("  · database password made for this run only (reset it in Supabase if you ever need it)");
  } else if (!env.SUPABASE_DB_PASSWORD) {
    const before = existsSync(LOCAL_FILE) ? readFileSync(LOCAL_FILE, "utf8") : "";
    writeFileSync(LOCAL_FILE, setEnvLine(before, "SUPABASE_DB_PASSWORD", password), { mode: 0o600 });
    env.SUPABASE_DB_PASSWORD = password;
    say("  · database password saved to .env.provision.local");
  }
  supabaseCli([
    "projects", "create", C.supabase.name,
    "--org-id", C.supabase.orgId,
    "--db-password", password,
    "--region", C.supabase.region,
    "--size", C.supabase.size,
  ]);
  project = await findProject();
  if (!project) throw new Error("the project was created but can't be found by name");
}
const ref = project.ref ?? project.id;
for (let i = 0; project.status !== "ACTIVE_HEALTHY"; i++) {
  if (i === 0) say(`  · waiting for ${ref} to come up (${project.status})`);
  if (i > 120) throw new Error(`${ref} is still ${project.status} after ten minutes`);
  await sleep(5000);
  project = await supa("GET", `/v1/projects/${ref}`);
}
pass(`${C.supabase.name} is ${ref} in ${project.region}, healthy`);
const supabaseUrl = `https://${ref}.supabase.co`;

/** SQL as the project's owner, through the Management API. */
const sql = (query) => supa("POST", `/v1/projects/${ref}/database/query`, { query });

// --- 2. Migrations ---------------------------------------------------------------

step("Database migrations");
const localVersions = readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map(migrationVersion)
  .filter(Boolean)
  .sort();
const remoteVersions = async () => {
  try {
    return (await sql("select version from supabase_migrations.schema_migrations")).map((r) => r.version);
  } catch (e) {
    if (/does not exist/.test(String(e))) return [];
    throw e;
  }
};
let missing = missingMigrations(localVersions, await remoteVersions());
if (missing.length > 0 && !CHECK_ONLY) {
  if (env.SUPABASE_DB_PASSWORD) {
    say(`  · pushing ${missing.length} migration${missing.length === 1 ? "" : "s"}`);
    supabaseCli(["db", "push", "--project-ref", ref, "--password", env.SUPABASE_DB_PASSWORD, "--yes"]);
    missing = missingMigrations(localVersions, await remoteVersions());
  } else {
    todo.push({
      title: "Apply the migrations: connect the Supabase GitHub integration (jonzapp/jonz, branch main), then run this again",
      url: `https://supabase.com/dashboard/project/${ref}/settings/integrations`,
    });
  }
}
if (missing.length === 0) pass(`all ${localVersions.length} migrations applied`);
else fail(`not applied yet: ${missing.join(", ")}`);
if (missing.length === 0) {
  todo.push({
    title: "If you haven't yet, connect the Supabase GitHub integration (jonzapp/jonz, branch main) so later migrations deploy on merge",
    url: `https://supabase.com/dashboard/project/${ref}/settings/integrations`,
  });
}

// --- 3. The clock's Vault secrets -----------------------------------------------------

step("The clock (pg_cron → /api/cron/tick)");
const [existingSecret] = await sql(
  `select decrypted_secret from vault.decrypted_secrets where name = '${C.vault.secret}'`,
);
const cronSecret = mask(existingSecret?.decrypted_secret || secret());
if (!CHECK_ONLY) {
  await sql(vaultUpsertSql(C.vault.url, `${siteUrl(C)}/api/cron/tick`));
  await sql(vaultUpsertSql(C.vault.secret, cronSecret));
}
const vault = await sql(
  `select name, decrypted_secret from vault.decrypted_secrets where name in ('${C.vault.url}', '${C.vault.secret}')`,
);
const vaultUrl = vault.find((v) => v.name === C.vault.url)?.decrypted_secret;
if (vaultUrl === `${siteUrl(C)}/api/cron/tick`) pass(`${C.vault.url} points at ${vaultUrl}`);
else fail(`${C.vault.url} is ${vaultUrl ?? "missing"}`);
if (vault.find((v) => v.name === C.vault.secret)?.decrypted_secret) pass(`${C.vault.secret} is set`);
else fail(`${C.vault.secret} is missing`);
if (missing.length === 0) {
  const jobs = await sql(`select jobname from cron.job where jobname = '${C.cronJob}'`);
  if (jobs.length === 1) pass(`pg_cron runs ${C.cronJob} every ten minutes`);
  else fail(`pg_cron has no ${C.cronJob} job`);
}

// --- 4. Sign-in ---------------------------------------------------------------------

step("Sign-in (Supabase auth settings)");
const emails = (await loadCore("auth-email.ts")).authEmailTemplates();
// Cloudflare Turnstile's secret (the TURNSTILE_SECRET Actions secret); the site key is in apps/client/src/api/turnstile.ts.
const captcha = env.TURNSTILE_SECRET?.trim() || null;
if (captcha) mask(captcha);
if (!CHECK_ONLY) await supa("PATCH", `/v1/projects/${ref}/config/auth`, authSettings(C, google, emails, captcha));
const auth = await supa("GET", `/v1/projects/${ref}/config/auth`);
const problems = authProblems(auth, C, google, emails, captcha);
if (problems.length === 0) pass(`site URL ${siteUrl(C)}, email and password on with Jonz's emails through Resend${google ? ", Google on" : ""}${captcha ? ", Turnstile bot check on" : ""}`);
if (!captcha) say("  · no TURNSTILE_SECRET: the bot check on email sign-in is left as it is");
if (google && !C.google.iosClientId && C.google.androidClientIds.length === 0) {
  say("  · Google signs in on the web only: the app's iOS and Android clients aren't in config.mjs yet (DEPLOYMENT.md)");
}
for (const p of problems) fail(p);
if (!google) {
  const v = googleConsoleValues(C, ref);
  todo.push({
    title: "Create the Google sign-in client (Google has no API for this part)",
    steps: googleSteps(C, ref, IN_ACTIONS ? `${SECRETS_PAGE}/new` : undefined),
    values: [
      ["Authorised JavaScript origins", v.javascriptOrigins],
      ["Authorised redirect URIs", v.redirectUris],
    ],
  });
} else if (!CHECK_ONLY && existsSync(APP_ENV)) {
  // Local sign-in uses the same client, through config.toml's env() names.
  let local = existsSync(SUPABASE_ENV) ? readFileSync(SUPABASE_ENV, "utf8") : "";
  local = setEnvLine(local, "AUTH_GOOGLE_CLIENT_ID", googleClientIds(C, google));
  local = setEnvLine(local, "AUTH_GOOGLE_SECRET", google.secret);
  writeFileSync(SUPABASE_ENV, local, { mode: 0o600 });
  say("  · supabase/.env.local has the Google client for local sign-in (restart supabase to pick it up)");
}

// --- 5. Vercel ------------------------------------------------------------------------

step("Vercel");
const vercelProject = await vercel("GET", `/v9/projects/${C.vercel.project}`);
const repoId = vercelProject.link?.repoId;
if (repoId) pass(`${C.vercel.project} deploys from ${vercelProject.link.org}/${vercelProject.link.repo}`);
else fail(`${C.vercel.project} isn't connected to its GitHub repository`);
// Checked, never set: moving it is a production change made by hand, at the
// moment the code it points at is merged.
const rootProblem = rootDirectoryProblem(vercelProject.rootDirectory, C.vercel);
if (!rootProblem) pass(`${C.vercel.project} builds from ${C.vercel.rootDirectory}`);
else {
  fail(rootProblem);
  todo.push({
    title: `Set the Vercel project's Root Directory to ${C.vercel.rootDirectory} (Settings → Build and Deployment), then run this again`,
    url: `https://vercel.com/${vercelProject.accountId}/${C.vercel.project}/settings/build-and-deployment`,
  });
}

const keys = pickKeys(await supa("GET", `/v1/projects/${ref}/api-keys?reveal=true`));
if (!keys.anon || !keys.service) throw new Error("Supabase returned no usable API keys for the project");
mask(keys.service);
const existing = (await vercel("GET", `/v10/projects/${vercelProject.id}/env`)).envs ?? [];
const has = (key) => existing.some((e) => e.key === key && e.target?.includes("production"));
let vapid = null;
if (!(has("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && has("VAPID_PRIVATE_KEY"))) {
  const { default: webpush } = await import("web-push");
  vapid = webpush.generateVAPIDKeys();
  mask(vapid.privateKey);
}
const plan = envPlan(C, { supabaseUrl, anonKey: keys.anon, serviceKey: keys.service, cronSecret, vapid });
if (!CHECK_ONLY) await vercel("POST", `/v10/projects/${vercelProject.id}/env?upsert=true`, plan);
const after = (await vercel("GET", `/v10/projects/${vercelProject.id}/env`)).envs ?? [];
const absent = [...plan.map((e) => e.key), "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].filter(
  (key) => !after.some((e) => e.key === key && e.target?.includes("production")),
);
if (absent.length === 0) pass(`production has its ${plan.length + (vapid ? 0 : 2)} environment variables`);
else fail(`production is missing ${absent.join(", ")}`);
/**
 * Checked, never moved: which project answers on which name is a production
 * change made on purpose (DEPLOYMENT.md, the cutover).
 */
async function checkDomain(project, name) {
  const domains = (await vercel("GET", `/v9/projects/${project.id}/domains`)).domains ?? [];
  if (domains.some((d) => d.name === name && d.verified)) pass(`${name} is attached to ${project.name} and verified`);
  else fail(`${name} isn't attached to ${project.name}, or isn't verified`);
}

/** Builds main for production and waits for it. */
async function deployMain(project, repo) {
  say(`  · deploying main to production (${project.name})`);
  let deployment = await vercel("POST", "/v13/deployments?forceNew=1", {
    name: project.name,
    project: project.id,
    target: "production",
    gitSource: { type: "github", repoId: repo, ref: "main" },
  });
  for (let i = 0; !["READY", "ERROR", "CANCELED"].includes(deployment.readyState); i++) {
    if (i > 120) throw new Error("the deployment is still building after ten minutes");
    await sleep(5000);
    deployment = await vercel("GET", `/v13/deployments/${deployment.id}`);
  }
  if (deployment.readyState === "READY") pass(`deployed (${deployment.url})`);
  else fail(`the deployment ended ${deployment.readyState}: https://vercel.com/${project.accountId}/${project.name}`);
}

const names = domainPlan(C);
await checkDomain(vercelProject, names.find((n) => n.project === C.vercel.project).domain);

if (DEPLOY && repoId && rootProblem) say("  · not deploying: it would build from the wrong directory and fail");
else if (DEPLOY && repoId) await deployMain(vercelProject, repoId);

// --- 6. The web build ------------------------------------------------------------------

step(`The web build (${C.web.project})`);
// Created by hand, like the first: provision never makes a project. Only a
// 404 means it isn't there yet; any other refusal stops the run.
const webProject = await vercel("GET", `/v9/projects/${C.web.project}`).catch((e) => {
  if (/ → 404/.test(e.message)) return null;
  throw e;
});
if (!webProject) {
  fail(`there's no ${C.web.project} project`);
  todo.push({
    title: `Create the Vercel project ${C.web.project} from jonzapp/jonz with Root Directory ${C.web.rootDirectory} (DEPLOYMENT.md, the cutover), then run this again`,
    url: `https://vercel.com/new`,
  });
} else {
  const webRepo = webProject.link?.repoId;
  if (webRepo) pass(`${C.web.project} deploys from ${webProject.link.org}/${webProject.link.repo}`);
  else fail(`${C.web.project} isn't connected to its GitHub repository`);
  const webRootProblem = rootDirectoryProblem(webProject.rootDirectory, C.web);
  if (!webRootProblem) pass(`${C.web.project} builds from ${C.web.rootDirectory}`);
  else fail(webRootProblem);

  // The public key apps/api signs reminders with, read back rather than
  // made: a new one would orphan every subscribed phone.
  let vapidPublicKey = vapid?.publicKey ?? null;
  if (!vapidPublicKey) {
    const entry = after.find((e) => e.key === "NEXT_PUBLIC_VAPID_PUBLIC_KEY" && e.target?.includes("production"));
    if (entry) vapidPublicKey = (await vercel("GET", `/v1/projects/${vercelProject.id}/env/${entry.id}`)).value ?? null;
  }
  if (!vapidPublicKey) fail("couldn't read the VAPID public key from apps/api's environment");
  else {
    const webPlan = webEnvPlan({ supabaseUrl, anonKey: keys.anon, vapidPublicKey });
    if (!CHECK_ONLY) await vercel("POST", `/v10/projects/${webProject.id}/env?upsert=true`, webPlan);
    const webAfter = (await vercel("GET", `/v10/projects/${webProject.id}/env`)).envs ?? [];
    const webAbsent = webPlan.map((e) => e.key).filter((key) => !webAfter.some((e) => e.key === key && e.target?.includes("production")));
    if (webAbsent.length === 0) pass(`the web build has its ${webPlan.length} public environment variables`);
    else fail(`the web build is missing ${webAbsent.join(", ")}`);
  }
  await checkDomain(webProject, names.find((n) => n.project === C.web.project).domain);

  if (DEPLOY && webRepo && webRootProblem) say("  · not deploying: it would build from the wrong directory and fail");
  else if (DEPLOY && webRepo) await deployMain(webProject, webRepo);
}

// --- 7. End to end ------------------------------------------------------------------------

step("End to end");
const page = await fetch(`${siteUrl(C)}/signin`).catch(() => null);
if (page?.ok) pass(`${siteUrl(C)}/signin answers ${page.status}`);
else fail(`${siteUrl(C)}/signin answers ${page?.status ?? "nothing"}`);

const tick = await fetch(`${siteUrl(C)}/api/cron/tick`, {
  method: "POST",
  headers: { Authorization: `Bearer ${cronSecret}` },
}).catch(() => null);
if (tick?.ok) pass("the clock's tick is accepted, so Vercel and the Vault share one secret");
else fail(`the clock's tick answers ${tick?.status ?? "nothing"}`);

if (google) {
  const start = await fetch(
    `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${siteUrl(C)}/signin`)}`,
    { redirect: "manual" },
  );
  const location = start.headers.get("location");
  const hops = authorizeProblems(location, ref, google.clientId);
  for (const p of hops) fail(p);
  if (hops.length === 0) {
    const answer = await fetch(location, { redirect: "manual" });
    const verdict = googleVerdict(answer.status, answer.status >= 400 ? await answer.text() : "");
    if (verdict === "ok") pass("Google accepts the client and the redirect (the secret is only proved by a real sign-in)");
    else if (verdict === "unknown") fail(`Google answered ${answer.status}; sign in once at ${siteUrl(C)}/signin to see why`);
    else fail(`Google refuses sign-in: ${verdict}`);
  }
}

// --- Summary ------------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
say(`\n${results.length - failed.length} checks passed, ${failed.length} failed.`);
if (todo.length > 0) say(`\nStill yours to do:\n${todoText(todo)}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown({ app: C.app, site: siteUrl(C), results, todo }));
}
process.exit(failed.length > 0 ? 1 : 0);
