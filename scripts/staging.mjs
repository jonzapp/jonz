// Make staging match scripts/provision/config.mjs's `staging`, then prove it
// does. Staging is a persistent Supabase branch of production's project and
// the `staging` git branch, which both Vercel projects deploy as a preview at
// staging.jonz.app and api.staging.jonz.app; every other preview shares its
// database. DEPLOYMENT.md, "Staging", says how it fits together.
//
//   node scripts/staging.mjs            set up what's missing, then check
//   node scripts/staging.mjs --check    change nothing; read back and check
//   node scripts/staging.mjs --seed     also put the demo house in, if it isn't there
//   node scripts/staging.mjs --reset    wipe staging's database back to the
//                                       migrations, then set up and seed again
//
// Like `npm run provision` it needs tokens this repo must never hold, from the
// environment or .env.provision.local, and it never touches production: it
// writes only to the staging branch and to Vercel's Preview environment.
//
//   SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN      always
//   STAGING_DEMO_PASSWORD                    the demo housemates' password (--seed, --reset)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   Google sign-in, the same client as production
//   AZURE_CLIENT_ID, AZURE_CLIENT_SECRET     Microsoft sign-in, the same app as production
//
// The "Staging" workflow (.github/workflows/staging.yml) runs it from a phone.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG as C } from "./provision/config.mjs";
import {
  findBranch,
  migrationVersion,
  missingMigrations,
  parseEnvFile,
  pickKeys,
  seedSql,
  stagingApiEnvPlan,
  stagingApiUrl,
  stagingAuthProblems,
  stagingAuthSettings,
  stagingUrl,
  stagingWebEnvPlan,
  summaryMarkdown,
  todoText,
  tokenHint,
  vaultUpsertSql,
} from "./provision/lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_FILE = path.join(ROOT, ".env.provision.local");
const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const RESET = args.has("--reset");
const SEED = RESET || args.has("--seed");
const IN_ACTIONS = Boolean(process.env.GITHUB_ACTIONS);

const env = { ...(existsSync(LOCAL_FILE) ? parseEnvFile(readFileSync(LOCAL_FILE, "utf8")) : {}), ...process.env };
const results = [];
const todo = [];
const say = (msg) => console.log(msg);
const pass = (msg) => (results.push({ ok: true, msg }), say(`  ✓ ${msg}`));
const fail = (msg) => (results.push({ ok: false, msg }), say(`  ✗ ${msg}`));
const step = (title) => say(`\n${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secret = () => randomBytes(32).toString("base64url");
const mask = (value) => {
  if (IN_ACTIONS && value) console.log(`::add-mask::${value}`);
  return value;
};

function summary(stopped) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown({ app: `${C.app} staging`, site: stagingUrl(C), results, todo, stopped }));
  }
}

function stop(reason, code = 1) {
  console.error(reason);
  if (IN_ACTIONS) console.log(`::error title=Staging stopped::${reason.replaceAll("\n", "%0A")}`);
  summary(reason);
  process.exit(code);
}
process.on("uncaughtException", (e) => stop(e.message));

function need(name) {
  if (!env[name]) stop(`${name} is not set: add it as a repository secret, or to .env.provision.local.`, 2);
  return env[name];
}

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

const SUPABASE_TOKEN = need("SUPABASE_ACCESS_TOKEN");
const VERCEL_TOKEN = need("VERCEL_TOKEN");
const supa = (method, route, body) => call("https://api.supabase.com", SUPABASE_TOKEN, method, route, body);
const vercel = (method, route, body) =>
  call("https://api.vercel.com", VERCEL_TOKEN, method, `${route}${route.includes("?") ? "&" : "?"}teamId=${C.vercel.teamId}`, body);
const pair = (id, key) => (env[id] && env[key] ? { clientId: env[id].trim(), secret: env[key].trim() } : null);
const providers = { google: pair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"), azure: pair("AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET") };
const password = SEED ? mask(need("STAGING_DEMO_PASSWORD")) : null;

say(`Staging for ${C.app} → ${stagingUrl(C)}${CHECK_ONLY ? " (check only)" : RESET ? " (reset)" : ""}`);

// --- 1. The staging branch ----------------------------------------------------------------

step("Supabase staging branch");
const project = (await supa("GET", "/v1/projects")).find((p) => (p.ref ?? p.id) === C.supabase.ref || (p.name === C.supabase.name && p.organization_id === C.supabase.orgId));
if (!project) stop(`No Supabase project called ${C.supabase.name}: production comes first (npm run provision).`);
const parentRef = project.ref ?? project.id;
let branch = findBranch(await supa("GET", `/v1/projects/${parentRef}/branches`), C.staging.branch);
// A branch made just now has no migrations yet: wait for them as after a reset.
let fresh = false;
if (!branch && !CHECK_ONLY) {
  say(`  · creating ${C.staging.branch} (persistent, from git ${C.staging.branch}; Micro, about $10 a month)`);
  await supa("POST", `/v1/projects/${parentRef}/branches`, {
    branch_name: C.staging.branch,
    git_branch: C.staging.branch,
    persistent: true,
  });
  for (let i = 0; !branch && i < 30; i++) {
    await sleep(10000);
    branch = findBranch(await supa("GET", `/v1/projects/${parentRef}/branches`), C.staging.branch);
  }
  fresh = true;
}
if (!branch) {
  fail(`there's no ${C.staging.branch} branch`);
  todo.push({
    title: `Create a persistent branch called ${C.staging.branch} on ${C.supabase.name}, from the git branch ${C.staging.branch} (Micro, about $10 a month), then run this again`,
    url: `https://supabase.com/dashboard/project/${parentRef}/branches`,
  });
  stop("Nothing to set up until the staging branch exists.");
}
const ref = branch.project_ref;
if (!branch.persistent) fail(`${C.staging.branch} isn't persistent, so it would be deleted with its pull request`);
else pass(`${C.staging.branch} is ${ref}, persistent, from git ${branch.git_branch ?? "?"}`);
const sql = (query) => supa("POST", `/v1/projects/${ref}/database/query`, { query });

const localVersions = readdirSync(path.join(ROOT, "supabase/migrations"))
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

if (RESET && !CHECK_ONLY) {
  // The branch runs its git branch's migrations again from nothing; the
  // demo house, the clock's Vault secrets and everyone's data go with it.
  say("  · resetting the staging database");
  await supa("POST", `/v1/branches/${branch.id}/reset`, {});
  await sleep(15000);
}

for (let i = 0; ; i++) {
  const health = await supa("GET", `/v1/projects/${ref}`).catch(() => null);
  const missing = health?.status === "ACTIVE_HEALTHY" ? missingMigrations(localVersions, await remoteVersions().catch(() => [])) : null;
  if (missing && missing.length === 0) {
    pass(`healthy, with all ${localVersions.length} migrations`);
    break;
  }
  if (i > 60 || (!RESET && !fresh && missing)) {
    if (missing) fail(`not applied yet: ${missing.join(", ")} (they arrive when ${C.staging.branch} is pushed)`);
    else fail(`${ref} is ${health?.status ?? "unreachable"}`);
    break;
  }
  if (i === 0) say("  · waiting for the branch and its migrations");
  await sleep(10000);
}
const supabaseUrl = `https://${ref}.supabase.co`;

// --- 2. The clock -----------------------------------------------------------------------------

step("The clock (pg_cron → staging's /api/cron/tick)");
const tickUrl = `${stagingApiUrl(C)}/api/cron/tick`;
const [existingSecret] = await sql(`select decrypted_secret from vault.decrypted_secrets where name = '${C.vault.secret}'`);
// A new secret has to reach Vercel too; otherwise the one there still matches.
const cronSecret = mask(existingSecret?.decrypted_secret || secret());
const newCronSecret = !existingSecret?.decrypted_secret;
if (!CHECK_ONLY) {
  await sql(vaultUpsertSql(C.vault.url, tickUrl));
  await sql(vaultUpsertSql(C.vault.secret, cronSecret));
}
const vault = await sql(`select name, decrypted_secret from vault.decrypted_secrets where name in ('${C.vault.url}', '${C.vault.secret}')`);
const vaultUrl = vault.find((v) => v.name === C.vault.url)?.decrypted_secret;
if (vaultUrl === tickUrl) pass(`${C.vault.url} points at ${tickUrl}`);
else fail(`${C.vault.url} is ${vaultUrl ?? "missing"}`);
if (vault.some((v) => v.name === C.vault.secret)) pass(`${C.vault.secret} is set`);
else fail(`${C.vault.secret} is missing`);

// --- 3. Sign-in ---------------------------------------------------------------------------------

step("Sign-in (staging's auth settings)");
if (!CHECK_ONLY) await supa("PATCH", `/v1/projects/${ref}/config/auth`, stagingAuthSettings(C, providers));
const authProblems = stagingAuthProblems(await supa("GET", `/v1/projects/${ref}/config/auth`), C, providers);
for (const p of authProblems) fail(p);
if (authProblems.length === 0) {
  pass(`site URL ${stagingUrl(C)}, previews may sign in, demo passwords on${providers.google ? ", Google on" : ""}${providers.azure ? ", Microsoft on" : ""}`);
}
const callback = `${supabaseUrl}/auth/v1/callback`;
if (!providers.google) todo.push({ title: "Google sign-in on staging: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (production's client) as repository secrets, then run this again" });
if (!providers.azure) todo.push({ title: "Microsoft sign-in on staging: add AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (production's app) as repository secrets, then run this again" });
todo.push({
  title: "Once, by hand: let staging's sign-in callback through Google and Microsoft",
  steps: [
    { text: "Google: the Web client → Authorised redirect URIs → add the callback below", url: "https://console.cloud.google.com/auth/clients" },
    { text: "Microsoft: the Jonz app → Authentication → Web redirect URIs → add the callback below", url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
  ],
  values: [["Callback", [callback]]],
});

// --- 4. Vercel's Preview environment --------------------------------------------------------

step("Vercel Preview environment (both projects)");
const keys = pickKeys(await supa("GET", `/v1/projects/${ref}/api-keys?reveal=true`));
if (!keys.anon || !keys.service) throw new Error("Supabase returned no usable API keys for the staging branch");
mask(keys.service);

const api = await vercel("GET", `/v9/projects/${C.vercel.project}`);
const web = await vercel("GET", `/v9/projects/${C.web.project}`);
const envsOf = async (project) => (await vercel("GET", `/v10/projects/${project.id}/env`)).envs ?? [];
const previewOnly = (e) => e.target?.length === 1 && e.target[0] === "preview" && !e.gitBranch;
const apiBefore = await envsOf(api);
let vapid = null;
if (!["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].every((k) => apiBefore.some((e) => e.key === k && previewOnly(e)))) {
  // Staging's own pair, so staging never reminds a real phone.
  const { default: webpush } = await import("web-push");
  vapid = webpush.generateVAPIDKeys();
  mask(vapid.privateKey);
}
const shared = apiBefore.filter((e) => e.target?.includes("preview") && e.target.length > 1).map((e) => e.key);
const apiPlan = stagingApiEnvPlan(C, {
  supabaseUrl,
  anonKey: keys.anon,
  serviceKey: keys.service,
  cronSecret: newCronSecret || !apiBefore.some((e) => e.key === "CRON_SECRET" && previewOnly(e)) ? cronSecret : null,
  vapid,
});
const clash = apiPlan.map((e) => e.key).filter((k) => shared.includes(k));
if (clash.length > 0) {
  fail(`${C.vercel.project} shares ${clash.join(", ")} between production and preview; split them first`);
  todo.push({
    title: `In ${C.vercel.project}, make ${clash.join(", ")} Production only, then run this again`,
    url: `https://vercel.com/${api.accountId}/${C.vercel.project}/settings/environment-variables`,
  });
} else if (!CHECK_ONLY) {
  await vercel("POST", `/v10/projects/${api.id}/env?upsert=true`, apiPlan);
}
const apiAfter = await envsOf(api);
const apiWants = [...apiPlan.map((e) => e.key), "CRON_SECRET", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
const apiAbsent = [...new Set(apiWants)].filter((k) => !apiAfter.some((e) => e.key === k && e.target?.includes("preview")));
if (apiAbsent.length === 0) pass(`${C.vercel.project} previews run on staging`);
else fail(`${C.vercel.project}'s Preview environment is missing ${apiAbsent.join(", ")}`);

let vapidPublicKey = vapid?.publicKey ?? null;
if (!vapidPublicKey) {
  const entry = apiAfter.find((e) => e.key === "NEXT_PUBLIC_VAPID_PUBLIC_KEY" && previewOnly(e));
  if (entry) vapidPublicKey = (await vercel("GET", `/v1/projects/${api.id}/env/${entry.id}`)).value ?? null;
}
const webPlan = stagingWebEnvPlan(C, { supabaseUrl, anonKey: keys.anon, vapidPublicKey });
if (!CHECK_ONLY) await vercel("POST", `/v10/projects/${web.id}/env?upsert=true`, webPlan);
const webAfter = await envsOf(web);
const webAbsent = webPlan.map((e) => e.key).filter((k) => !webAfter.some((e) => e.key === k && e.target?.includes("preview")));
if (webAbsent.length === 0) pass(`${C.web.project} previews run on staging`);
else fail(`${C.web.project}'s Preview environment is missing ${webAbsent.join(", ")}`);

/** Staging's names: attached to the project for the staging git branch. */
async function checkDomain(project, name) {
  const domains = (await vercel("GET", `/v9/projects/${project.id}/domains`)).domains ?? [];
  const found = domains.find((d) => d.name === name);
  if (found?.verified && found.gitBranch === C.staging.branch) pass(`${name} serves ${project.name}'s ${C.staging.branch} branch`);
  else fail(`${name} isn't attached to ${project.name} for the ${C.staging.branch} branch, or isn't verified`);
}
await checkDomain(web, C.staging.domain);
await checkDomain(api, C.staging.apiDomain);

// Environment changes reach a deployment only when it's built again.
if (!CHECK_ONLY) {
  for (const project of [api, web]) {
    say(`  · building ${C.staging.branch} again (${project.name})`);
    let deployment = await vercel("POST", "/v13/deployments?forceNew=1", {
      name: project.name,
      project: project.id,
      gitSource: { type: "github", repoId: project.link?.repoId, ref: C.staging.branch },
    });
    for (let i = 0; !["READY", "ERROR", "CANCELED"].includes(deployment.readyState); i++) {
      if (i > 120) throw new Error(`${project.name} is still building after ten minutes`);
      await sleep(5000);
      deployment = await vercel("GET", `/v13/deployments/${deployment.id}`);
    }
    if (deployment.readyState === "READY") pass(`${project.name} built ${C.staging.branch} (${deployment.url})`);
    else fail(`${project.name}'s ${C.staging.branch} build ended ${deployment.readyState}`);
  }
}

// --- 5. The demo house ------------------------------------------------------------------------

step("The demo house");
if (SEED && !CHECK_ONLY) {
  await sql(seedSql(readFileSync(path.join(ROOT, "supabase/seeds/staging.sql"), "utf8"), password));
}
const [demo] = await sql("select count(*)::int as n from public.houses where name = 'Demo House'");
if (demo?.n > 0) pass("the demo house is there");
else if (SEED) fail("the demo house didn't arrive");
else todo.push({ title: "Put the demo house in: run the Staging workflow with “Seed the demo house”" });

// --- 6. End to end ------------------------------------------------------------------------------

step("End to end");
const page = await fetch(`${stagingUrl(C)}/signin`).catch(() => null);
if (page?.ok) pass(`${stagingUrl(C)}/signin answers ${page.status}`);
else fail(`${stagingUrl(C)}/signin answers ${page?.status ?? "nothing"}`);
const tick = await fetch(tickUrl, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } }).catch(() => null);
if (tick?.ok) pass("staging's clock is accepted, so Vercel and the Vault share one secret");
else fail(`staging's clock answers ${tick?.status ?? "nothing"}`);

const failed = results.filter((r) => !r.ok);
say(`\n${results.length - failed.length} checks passed, ${failed.length} failed.`);
if (todo.length > 0) say(`\nStill yours to do:\n${todoText(todo)}`);
summary();
process.exit(failed.length > 0 ? 1 : 0);
