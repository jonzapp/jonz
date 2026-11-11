# Deploying Jonz

The same arrangement as Pub Golf: Vercel's git integration builds the apps
(the Next.js workspace in `apps/api` as the `jonz-api` project, and from the
cutover below the Expo app's web build in `apps/client` as `jonz-web`;
they were `johns` and `johns-web` until the move to jonz.app below),
Supabase's GitHub integration applies the migrations, and CI only proves.
`main` is production. Previews never get production's keys (a preview
writing to production's data would be worse than one that doesn't start):
they run on staging, a copy of the whole stack with a database of its own
(below, "Staging").

Because the two integrations do not wait for each other, migrations must be
additive and readable by the code already deployed.

## Setting up production: `npm run provision`

Production is described in `scripts/provision/config.mjs` (project names,
region, domain, Vercel team) and one command makes the accounts match it,
then checks that they do. Run it on your own machine: it needs tokens this
repo must never hold, and every secret it generates goes straight to where
it is used without being printed.

```sh
# .env.provision.local (gitignored), or the environment:
SUPABASE_ACCESS_TOKEN=…   # supabase.com/dashboard/account/tokens
VERCEL_TOKEN=…            # vercel.com/account/settings/tokens

npm run provision                 # do what's missing, then check everything
npm run provision -- --check      # change nothing; read back and check
npm run provision -- --no-deploy  # skip the production deploy at the end
```

It is safe to run again and again: each step looks before it writes.

**From a phone, run it on GitHub instead.** The **Provision production**
workflow (`.github/workflows/provision.yml`) runs the same command on a
runner, with the tokens as repository secrets (`SUPABASE_ACCESS_TOKEN`,
`VERCEL_TOKEN`, later `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`). Start it
from the Actions tab: <https://github.com/jonzapp/jonz/actions/workflows/provision.yml>
→ Run workflow. Its summary page lists every check and what's left, each step
a link and each value to paste on its own line. A database password made by a
workflow run lives only for that run, which is enough: everything after
creating the project goes through the Management API, and the dashboard can
reset the password if you ever need a direct connection.

| Step | What it does | How it checks |
| --- | --- | --- |
| Supabase project | Creates `Johns` in London at the smallest compute (Micro) if it doesn't exist, saving the database password to `.env.provision.local` first, and waits for it to be healthy | Finds it by name |
| Migrations | Pushes any `supabase/migrations` the database hasn't recorded (`supabase db push`, with the saved password) | Compares versions both ways |
| The clock | Writes the two Vault secrets `request_tick()` reads. The tick secret is reused if it exists, so it never drifts from Vercel's `CRON_SECRET` | Reads both back; finds the `johns-tick` pg_cron job |
| Sign-in | Sets only production's auth fields through the Management API: site URL, redirect URLs, email and password sign-in on (every new address proven by a 6-digit emailed code, passwords of 8 or more), Jonz's own sign-in emails from `@app/core`'s `authEmailTemplates()`, and Google once its client is given, with the app's iOS and Android clients from `config.mjs` listed after it (nonce check skipped only once there is an iOS client) | Reads them back and refuses auto-confirmed sign-ups, SMTP that isn't Resend from hello@jonz.app, an email that isn't Jonz's own, an unresolved `env(...)` client ID, a different client list or nonce setting |
| Vercel | Upserts the production environment (Supabase URL and keys, site URL, `CRON_SECRET`, VAPID keys, made once and then kept, since new ones would orphan every subscribed phone) and deploys `main` | Reads the variables back; checks the project builds from `apps/api` (its Root Directory, which it never sets: that one is by hand) and that its own name, `api.jonz.app`, is attached and verified; waits for the deploy |
| The web build | Upserts `jonz-web`'s production environment (public values only: Supabase's URL and anon key, and the VAPID public key read back from `jonz-api`) and deploys `main` | Finds the project (made by hand, never by provision); checks it builds from `apps/client`, reads the variables back, and that `jonz.app` is attached to it and verified; waits for the deploy |
| End to end | | `/signin` answers; the clock's tick, sent to `jonz.app` and passed on to `apps/api`, is accepted (so Vercel and the Vault share one secret); Supabase sends sign-in to Google with this client and back to `/signin`, and Google doesn't refuse it |

It never runs `supabase config push`. That would write `config.toml`'s
localhost over the production site URL and switch off the emailed code that
proves a new address, which is exactly what local development needs and
production must not have. SMTP is the one sign-in setting set by hand: the
password is a Resend key, pasted in the dashboard (Email, below).

### What stays manual, and why

- **The Google sign-in client.** Google has no API for creating sign-in
  clients or for the consent screen's branding. The first run prints exactly
  what to paste where (a Cloud project for Johns, its branding page with the
  home page and privacy URLs, and a Web client with these redirect URIs); run
  it again with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set and it
  configures Supabase, writes the same client into `supabase/.env.local` for
  local sign-in, and checks the round trip. The secret itself is only proved by a
  real sign-in: Google checks it when it exchanges the code, after the user
  has chosen an account.
- **Google's clients for the app** (iOS and Android). The Expo app signs in
  with Google's own sheet, which hands Supabase an ID token, so it needs
  clients of its own beside the web one, in the same Cloud project
  ([Clients → Create client](https://console.cloud.google.com/auth/clients/create)):
  1. **iOS**: bundle ID `dev.glyn.jonz` (the Team ID once the Apple
     account exists). Its client ID goes in `scripts/provision/config.mjs`
     (`google.iosClientId`) and in `apps/client/.env.local` as
     `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, which also gives the iOS build its
     URL scheme (`app.config.ts`).
  2. **Android**: package `dev.glyn.jonz` and the SHA-1 of the key the
     build is signed with. One client per key: the development builds' now,
     the store's later. Development builds use React Native's shared debug
     key, whose SHA-1 is
     `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (read
     from a prebuild on 25 October 2026; `keytool -list -v -keystore
     apps/client/android/app/debug.keystore -alias androiddebugkey
     -storepass android` shows it after `npx expo run:android`). Their IDs go
     in `google.androidClientIds`.
  3. The **web** client's ID goes in `apps/client/.env.local` as
     `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: on Android it is the token's
     audience.

  None of these IDs is a secret. Provision then lists them all in Supabase
  (web first), and turns on "Skip nonce check" once the iOS client is
  there: Google's iOS sign-in signs a nonce the app never sees, and
  Supabase's guide says to skip the check for it. That weakens replay
  protection for Google tokens, which is why it waits for iOS.
- **Sign in with Apple** (iOS only), once there is an Apple Developer
  account: turn on the capability for the App ID `dev.glyn.jonz`, then the
  Apple provider in Supabase with `dev.glyn.jonz` as its client ID. The
  app's sign-in is native, so it needs no secret key. It can't be tried on a
  device before then.
- **The Supabase GitHub integration**, so that migrations apply on merge:
  one click in the project's settings, with no API. Its **working
  directory** is `.` (the folder that contains `supabase/`, not `supabase`
  itself), the production branch `main`, with "deploy to production" on and
  automatic branching off. It deploys on every push to `main`, applying any
  new migrations; Auth and API settings in `config.toml` are ignored, which
  is what keeps them local.
- **Claude, for "Describe your house"**. `POST /api/setup/draft` asks
  Claude (`anthropic/claude-haiku-5.5`, `apps/api/lib/ai/house-draft.ts`)
  to draft a new house's John list through Vercel's AI Gateway, as Pub Golf
  does. On Vercel the gateway signs in with the `jonz-api` project's OIDC
  token, so there is no key to set; it bills to the team's AI Gateway
  credits, where a spend limit belongs. If the gateway refuses or is down,
  setup offers the starter lists instead, so nothing breaks. A chat turn costs
  well under a cent, and each house gets thirty a day
  (`CHAT_TURNS_PER_DAY`), counted in `house_drafts`. Locally and in CI there is no gateway, so
  drafts are starter lists unless `AI_GATEWAY_API_KEY` is set.
- **The House Pass on the web (Stripe).** Checkout and the billing page
  come from `POST /api/pass/checkout` and `/api/pass/manage`; Stripe's
  webhook (`POST /api/stripe/webhook`, `apps/api/lib/pass/events.ts`) writes
  the house's `pass_*` columns. The three prices live on the `house_pass`
  product with the lookup keys `pass_yearly`, `pass_monthly` and
  `pass_founding`, each with GBP, EUR and CAD alongside USD, prices
  including tax. The product's tax code is `txcd_10103000` (SaaS, personal
  use): Checkout refuses a product without one while Managed Payments
  (Stripe as merchant of record, collecting and paying the sales tax and
  VAT) is on, as it is by default on a new account. On `jonz-api`
  set `STRIPE_SECRET_KEY` (a restricted key is enough: write on Checkout
  Sessions, Customer portal and Subscriptions, read on Prices),
  `STRIPE_WEBHOOK_SECRET` and `APP_URL=https://jonz.app`. The webhook
  endpoint is `https://api.jonz.app/api/stripe/webhook`, listening for
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`
  and `customer.subscription.*`. The billing page uses the account's default
  Customer portal configuration, "House Pass": cancel at the end of the
  period, change card, and switch between Yearly and Monthly (the sandbox's
  is `bpc_1UVt3gRwTZ2GsMbUO4o3mD4i`; live needs the same one). Then `EXPO_PUBLIC_PASS_CHECKOUT=on` on
  `jonz-web` shows the plans as buttons. Without the key the Pass page shows
  the plans and sells nothing.
- **Email (Resend).** Jonz's emails go out through Resend from
  `Jonz <hello@jonz.app>`, replies to `support@jonz.app`
  (`apps/api/lib/email.ts`, the words and look in
  `packages/core/src/email.ts`, `docs/specs/email.md`). The domain
  `jonz.app` is verified in Resend's Ireland region (eu-west-1) with these
  records on Vercel DNS: the DKIM TXT `resend._domainkey`, the SPF TXT and
  bounce MX on `send`, the receiving MX on the root, and `_dmarc` (starting
  `p=none`, then `p=reject` once two weeks of reports are clean). On
  `jonz-api` set `RESEND_API_KEY` (Production only, a "Sending access" key
  named "Jonz app"); staging and previews have none and log instead. The
  pictures an email shows are `apps/client/public/email/*.png`, drawn by
  `npm run brand`, so they're served from jonz.app. Free plan: 3,000 emails
  a month and 100 a day, incoming mail included; Pro ($20 a month) lifts the
  daily cap.
- **Brand verification.** Opening the app beyond your own house means
  Google's review; the landing page at `/` carries the name, the purpose and
  the privacy link it checks for.

Already done (October 2026): the Vercel project `johns` exists, deploys
`jonzapp/jonz`, runs its functions in London next to the database, and
has `johns.glyn.dev` attached. glyn.dev's DNS is on Vercel, so the domain
needed no record.

The Supabase project `Johns` (ref `mmnmffdpdzrncvwzgjhq`) was created by hand
on 25 October 2026 in London (`eu-west-2`) at the smallest size, so
provision finds it by name and never creates one. Its GitHub integration is
connected as above. Because provision has no database password for it, it
never pushes migrations itself: they arrive through the integration.

The project's **Root Directory** is `apps/api` (Settings → Build and
Deployment), where the Next app moved in Phase 2 of
`docs/specs/native-migration.md`. Vercel installs the whole npm workspace from
the repository root and builds that directory. Changing the setting doesn't
redeploy anything, and a build from the wrong directory fails without
replacing the live deployment, which keeps serving.

## The web build and the cutover (Phase 13)

From the cutover, johns.glyn.dev is the Expo app's web build, in a second
Vercel project, `johns-web` (Root Directory `apps/client`, framework
"Other"). `apps/client/vercel.json` says the rest: it builds with `npm run
export:web` into `dist`, opens every path that isn't a file on the app
(which draws its own not-found), sends the Next app's security headers, and
passes `/api/*` on to `apps/api`, which answers on a name of its own,
`api.johns.glyn.dev`. So:

- **The clock doesn't move.** The Vault's tick URL stays
  `https://johns.glyn.dev/api/cron/tick`; the web project passes it on, with
  its secret, to the same route.
- **The browser needs no CORS**, and no secret moves: the web build calls
  `/api/*` on its own origin, and its environment is public (Supabase's URL
  and the anon key `apps/api` uses, and the VAPID public key `apps/api`
  signs with, copied from `johns`, never made anew).
- **Reminders and installs carry over**: `/sw.js`, the manifest and the
  icons sit at the same paths, and the VAPID key is the same, so phones
  already subscribed keep getting reminders.
- **Sign-in needs no change**: Supabase's site URL stays
  `https://johns.glyn.dev` and its redirect URLs already allow
  `https://johns.glyn.dev/**`, which covers `/signin`, where the web build
  comes back to; Google only ever sees Supabase's callback.
- **Everyone signs in once more** on the web, because the session moves
  from cookies to the browser's storage.

The steps, each asked for and checked before the next:

1. **Give `apps/api` its own name**: attach `api.johns.glyn.dev` to `johns`
   (glyn.dev's DNS is on Vercel, so no record). Check that
   `https://api.johns.glyn.dev/api/cron/tick` refuses a request without the
   secret (401): it's the same deployment as johns.glyn.dev.
2. **Make `johns-web`**: import `jonzapp/jonz`, Root Directory
   `apps/client`, framework Other, Node 24, the same team. Its production
   environment is the three `EXPO_PUBLIC_` values above; previews get
   nothing, as for `johns`. Deploy `main`.
3. **Check it on its own `.vercel.app` URL**, before it has the domain: the
   front door, privacy and a link to nowhere; `/manifest.webmanifest` and
   `/sw.js`; `POST /api/fresh` with no token answers the API's own 401
   (the rewrite reaches `apps/api`), and so does the tick without its secret.
   Signing in there needs that URL in Supabase's redirect URLs for the
   check, and taken out after (provision writes only johns.glyn.dev's back).
4. **Move `johns.glyn.dev`** from `johns` to `johns-web`.
5. **Check production**: sign in with Google on johns.glyn.dev, open the
   house, tick a John, see it on the Wall, turn reminders on; the clock's
   next tick shows 200 (`select * from cron.job_run_details order by
   start_time desc limit 5;`, and `/api/cron/tick` in `johns`'s logs); a
   reminder arrives.

**Rolling back** was step 4 in reverse: move `johns.glyn.dev` back to
`johns`, whose pages still answered. Phase 14 removed those pages on 28
October 2026, so `apps/api` now answers only `/api/*` and sends every other
path to the same path on jonz.app (308). A rollback to the old pages would
mean promoting the project's last deployment that still had them (Vercel
keeps every deployment) and moving a domain to it.

## The move to jonz.app (October 2026)

The app is called Jonz and lives at jonz.app; it was Johns at
johns.glyn.dev. Only the brand moved: the repo, the Supabase project `Johns`,
the database, the Vault names (`johns_tick_url`, `johns_tick_secret`), the
cron job `johns-tick` and the chores themselves keep "Johns". The section
above is the cutover as it happened, under the old names.

In order, each checked before the next:

1. **The new names answer.** jonz.app and www.jonz.app (forwarding to
   jonz.app) on the web project, api.jonz.app on the API project, both over
   HTTPS, and `https://api.jonz.app/api/cron/tick` refuses a request without
   the secret (401). Supabase's redirect URLs gain `https://jonz.app/**`, and
   Google's consent screen is renamed Jonz with jonz.app authorised.
2. **The code moves** in one PR: the name, the app's ids (`dev.glyn.jonz`,
   scheme `jonz`), `SITE_URL`, the web build's `/api` rewrite to
   api.jonz.app, and `scripts/provision/config.mjs`. The web project starts
   calling api.jonz.app the moment it deploys, which is why step 1 comes
   first. Rename the Vercel projects to `jonz-web` and `jonz-api` in the same
   hour: provision finds them by name.
3. **The switch-over.** The Vault's `johns_tick_url` becomes
   `https://jonz.app/api/cron/tick` and Supabase's site URL
   `https://jonz.app`. Running `npm run provision` after step 2 writes both
   (and the site URL and VAPID subject in Vercel), so don't run it until this
   step is wanted. Then johns.glyn.dev and api.johns.glyn.dev forward (308,
   path kept) to the new names.
4. **Tell the house.** A browser keeps sign-in, the home-screen install and
   reminders per address, so everyone signs in again on jonz.app, re-adds it
   to the home screen and turns reminders back on.

Rolling back before step 3 is reverting the PR; the old names still answer.
After it, take the forwards off in the Vercel dashboard. About three months
on, remove the old names and their Supabase redirect URLs.

## Staging

A copy of the whole stack for trying UI and the game's mechanics before
anything reaches `main`: **https://staging.jonz.app**, on a database of its
own with a demo house in it.

| Layer | Production | Staging |
| --- | --- | --- |
| Database | Supabase project `Johns` | Its persistent branch `staging` (Micro, about $10 a month; branching compute isn't covered by the plan's credits) |
| Code | git `main` | git `staging`: main, or main with one PR merged in |
| Web | `jonz-web`, jonz.app | `jonz-web`'s `staging` branch, staging.jonz.app (also every PR preview) |
| API | `jonz-api`, api.jonz.app | `jonz-api`'s `staging` branch, api.staging.jonz.app (also every PR preview) |
| Vercel environment | Production | Preview |
| Sign-in | Google, Microsoft, Apple | Google and Microsoft (same clients), plus four demo housemates with a password |
| Stripe | Jonz (live, once it's on) | The Jonz sandbox, with a webhook of its own |
| Reminders | Its VAPID pair | Its own pair, so staging never reminds a real phone |
| The clock | Vault → jonz.app | Vault → api.staging.jonz.app |
| Ask Jonz | AI Gateway (OIDC) | The same, on the preview's own OIDC token |
| House Pass | Enforced; every house made before 11 Nov 2026 is a Founding house | Enforced: the Demo House has no Pass, so it shows the locked app; buy one in the sandbox to unlock it |

How it works:

- **Every PR's preview runs on staging's data.** The web build's preview
  calls staging's API, api.staging.jonz.app
  (`apps/client/scripts/build-web.mjs`), cross-origin: `apps/api` lets
  staging's origins in through `ALLOWED_ORIGINS`, which takes `*` for one
  DNS label. Always staging's, never the PR's own preview of `apps/api`,
  so one API serves every preview. To try a PR that changes `apps/api`,
  put it on staging (below). Production's web
  build is unchanged: `/api/*` on its own origin.
- **The `staging` branch follows `main`.** The **Staging** workflow
  (`.github/workflows/staging.yml`) puts `main` on it after every merge.
  To try a PR that changes the database, run the workflow with "Put a PR on
  staging" and its number: staging becomes main with that PR merged in, and
  Supabase applies its migrations to staging's database only. It stays until
  the next merge to main. A PR put there and then dropped leaves its tables
  behind, so staging's database then lags git until "Reset the database".
- **One stage per purchase.** Checkout tags each House Pass purchase with
  its stage (`production`, `staging` or `local`, from `VERCEL_ENV`) and each
  webhook ignores the other's, so both may listen to one Stripe sandbox.
  After Checkout or the billing page Stripe sends the buyer back to the page
  that asked, when it's an allowed origin, else `APP_URL`.
- **Demo sign-in.** Builds with `EXPO_PUBLIC_STAGE=staging` (Vercel's Preview
  environment only) show a ribbon across the top and, under the usual
  sign-in buttons, the demo house's housemates (`DEMO_HOUSEMATES` in
  `@app/core`): type the staging password once and be any of them. Their
  accounts and the house come from `supabase/seeds/staging.sql`. Sign in as
  Alex, the admin, to hand out the first week.
- **staging.jonz.app is public**, like jonz.app, and sends
  `X-Robots-Tag: noindex`. Only the demo password and your own Google or
  Microsoft account get in; strangers' email sign-ups can't be confirmed.

Setting it up, and keeping it right, is `node scripts/staging.mjs`, run from
the Staging workflow ("Set up and check"). Like provision it looks before it
writes, writes only to the staging branch and Vercel's Preview environment,
and reads everything back. It needs the repository secrets
`SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN`, `STAGING_DEMO_PASSWORD` (8
characters or more, your choice) to seed, and for sign-in the same
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and `AZURE_CLIENT_ID`/
`AZURE_CLIENT_SECRET` as production. What stays by hand, once:

1. Nothing for the database: "Set up and check" creates the persistent branch
   `staging` of `Johns` from the git branch `staging` if it isn't there (the
   workflow's first run makes the git branch).
2. In `jonz-api`, make `APP_URL` and `STRIPE_WEBHOOK_SECRET` Production only,
   and give Preview the sandbox key and the webhook secret of a second
   sandbox endpoint, `https://api.staging.jonz.app/api/stripe/webhook`.
3. Attach staging.jonz.app to `jonz-web` and api.staging.jonz.app to
   `jonz-api`, each for the git branch `staging`. Vercel Authentication:
   on for `jonz-web` (the site and every preview stay behind your Vercel
   sign-in), off for `jonz-api`. Vercel's wall covers a branch's custom
   domain too, and a browser can't pass it when the site calls the API
   from another origin (preflights carry no cookies). The API needs a
   Jonz sign-in or a secret on every call anyway, like api.jonz.app.
4. Add staging's callback, `https://<staging ref>.supabase.co/auth/v1/callback`,
   to the Google web client's redirect URIs and the Azure app's.

"Seed the demo house" adds it if it isn't there. "Reset the database" wipes
staging back to its migrations, then sets up and seeds again (a new clock
secret, so it builds both projects again).

## Day to day

- Work on a branch, open a PR; CI must be green to merge.
- Merging to `main` deploys both halves. A migration that drops or renames
  anything the running code reads is an outage for the minute the deploys
  take; split it into an additive step and a later cleanup.
- `npm run provision -- --check` says whether production still looks right;
  the Staging workflow's "Check only" does the same for staging.
- `TICK_URL=https://jonz.app/api/cron/tick CRON_SECRET=… npm run tick`
  runs the clock by hand (through the web project's rewrite;
  `https://api.jonz.app/api/cron/tick` goes straight there). Check the cron job with
  `select * from cron.job_run_details order by start_time desc limit 5;`.
