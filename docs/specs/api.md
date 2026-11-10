# The /v1 API

## What it does

Every Jonz client reaches the data through our own servers, at
`https://api.jonz.app/v1` (and MCP at `/mcp`): the app, Ask Jonz cards,
MCP clients and scripts. Once the app has moved (step C2) and the grants are
revoked (C5), nothing reaches Supabase's Data API directly. Decided 8 November
2026 ("API-only database access: evaluation",
https://claude.ai/artifact/HPsVR7WjYfYLe7gQRfMH2u).

## How a request runs

`packages/server` (`@app/server`) is the one way in. The executor runs the same
checks, in the same order, for every operation in the registry
(`packages/core/src/operations.ts`):

1. The client version gate: `Jonz-Client: ios/1.4.2 (57)` below the
   platform's minimum build gets `426 client_too_old`. The web and MCP aren't
   gated.
2. The token: a Supabase Auth access token (`Authorization: Bearer …`),
   checked on our server with `jose` against the project's signing keys
   (JWKS), with no call to Supabase. The token must be a signed-in person's
   (`role: authenticated`, `aud: authenticated`).
3. The rate limit, per person per minute, counted in Postgres so every
   instance shares it: 300 reads, 60 writes. Over it: `429` with
   `Retry-After`.
4. The input, against the operation's Zod schema.
5. One transaction, which does the following in order:
   - It checks the Idempotency-Key, for writes. The same person and key
     queue on a lock, so two instances can't both run it. A repeat within
     24 hours gets the first answer (`Idempotent-Replayed: true`). The same
     key with a different request is refused (`idempotency_mismatch`).
   - It becomes the person (`role authenticated` with their claims) and
     finds the house: `houseId`, or the house of the row the input names
     (an assignment, a dispute, a John…, by the registry's `ASK_REFS`),
     read under RLS so a row they can't see is `404 not_found`; failing
     those, the one house they're in.
   - It checks the permission in that house (`my_permissions` /
     `my_app_permissions`) and the House Pass: always for the operation's
     `entitlement`, or only when its `entitlementWhen` input is set (a
     tick is free; a tick with a photo needs the Pass).
   - It runs the database function, or the operation's TypeScript handler for
     `rpc.server` ones, still as the person.
   - It checks the output against its contract. A write with a bad answer is
     rolled back.
   - It goes back to the API's role and writes the audit row and the
     idempotency record.

The database checks again: RLS and `can()` decide as they always have, so a
gap in the API is still refused there. The tests check both layers: each
permission is refused by the executor, and refused again by the database
when the executor's check is taken away.

## Contract

- **Versioning.** Major versions go in the path (`/v1`). Within `/v1` a
  change only adds: new operations, new optional inputs and new output
  fields. Anything else is `/v2`. CI compares `apps/v1/openapi.json` with
  `main`'s (oasdiff) and fails on a break. A unit test fails while the file
  is out of date (`npm run openapi`).
- **The OpenAPI document.** It is OpenAPI 3.1, built from the operations
  themselves and served at `/v1/openapi.json`.
- **Retiring an operation.** It gets `Deprecation` (RFC 9745) and `Sunset`
  (RFC 8594) headers, and a `Link` to what replaces it. It stays for at
  least six months; the executor refuses to start with a shorter notice.
- **Errors.** Every refusal is RFC 9457 `application/problem+json`, with a
  stable `title` code (`unauthenticated`, `forbidden`, `pass_required`,
  `invalid_input`, `rejected`, `conflict`, `idempotency_mismatch`,
  `rate_limited`, `client_too_old`, `not_found`, `internal`). Only words a
  database function raised on purpose (`P0001`, `22023`) or a move's own
  refusal word reach people. Postgres's own data and constraint errors get
  plain words; anything unexpected is a plain 500 "Something went wrong on
  our side." with its Request-Id, and the cause only in the logs.
- **One error path.** `@app/server` owns every error answer
  (`internalProblem`, `problemResponse`, `PROBLEM_MEDIA_TYPE`,
  `newRequestId`). `answersSafely` wraps `/v1` and `/mcp` as handlers, so
  a failure before an operation runs (start-up, a library) answers the same
  way; Fastify's error handler covers everything inside.
- **Request-Id.** It is on every response. A caller's own id is kept when it
  looks like one.
- **Inputs.**
  - Path keys come from the path.
  - A GET's other inputs come from the query string, so their schemas
    coerce (`z.coerce.number()`).
  - Other methods take a JSON object body.
  - JSON names are camelCase. Database arguments are `p_snake_case` unless
    the operation maps them itself.

## Stateless

No instance keeps anything between requests. Idempotency keys, the audit
and rate limits live in Postgres. The database is reached through
Supabase's transaction pooler (`prepare: false`). Any number of instances
can run behind the load balancer. `apps/v1/tests/db/stateless.test.ts`
takes turns between two instances, each with its own pool.

## The database side

Migration `20261219090000_api_layer.sql` sets up the following:

- **The `jonz_api` role.** It can log in and has `noinherit`. It is a member
  of `authenticated` so it can become a person, and has none of their rights
  until it does.
- **Three server-only tables:** `api_idempotency_keys`,
  `api_audit_entries` and `api_rate_limits`.
- **An hourly tidy-up** that clears keys older than a day and rate-limit
  windows older than an hour.

### Setup steps (Glyn, once, in the Supabase dashboard)

1. In the SQL editor, run `alter role jonz_api password '<a long random password>';`.
2. Set the API's settings in Vercel:
   - `API_DATABASE_URL`: the transaction pooler (port 6543) as
     `jonz_api.<project ref>`.
   - `SUPABASE_URL` (falls back to `NEXT_PUBLIC_SUPABASE_URL`).
  - Until `API_DATABASE_URL` is set, `/v1` answers `503`.
   - `MIN_IOS_BUILD` and `MIN_ANDROID_BUILD`, once the phone apps ship.

## Steps

- **C1 (this):** `@app/server` (the executor), `apps/v1` (the Fastify
  layer), the migration, and the contract check in CI.
- **C2:** every registry operation that runs a database function is
  served (`apps/v1/src/operations.ts`, built from `OPERATION_IO`), and
  `/v1` is served from jonz-api through `apps/api/app/v1/[...path]/route.ts`.
  Then the app moves onto `/v1`. Each table-only operation gets its own
  database function (security invoker, so RLS still decides), and each
  `rpc.server` operation's logic moves from `apps/api` into its handler.
  - Done as database functions: your account (migration
    `20261221100000`), the house's writes (`20261222090000`), the house's
    reads (`20261223090000`) and the owner's reads and chats
    (`20261224090000`). Each does what the app's own table queries did.
  - Where core works something out (a John's week and month, a chat's
    title), the SQL does the same sums and a test checks the two agree.
  - Path keys and a GET's query are read by their input type, so a
    number in the path (an audit entry) arrives as a number.
  - Done: the server operations (ask_usage, catch_up, deal_week,
    reset_house, add_kid, ask_house, pass_checkout, pass_billing,
    ask_owner, write_notice_copy, retry_promotion). Each has a handler in
    `apps/api/lib/v1/handlers.ts` that runs the move its `/api` route ran,
    after the executor's checks; apps/api hands them to apps/v1
    (`createV1Handler`, `v1Instance`), so /v1 and /mcp both serve them. A
    move's refusal becomes the Problem a database function's would, and
    "Stripe isn't open" is `rejected` (the refusal codes don't grow within
    /v1: a new one breaks clients).
  - Done: the operations whose /api route tells people after the database
    function (a push, an email, Stripe): set_away, send_report,
    write_back, roll_call, offer_swap, raise_flag, raise_dispute,
    cast_vote, answer_tick, owner_reply_report, owner_fix_report,
    claim_support_draft, owner_send_message, owner_make_promotion,
    owner_stop_promotion, owner_promotion_emails, owner_delete_house. Each
    has a handler running its route's move, so /v1 and MCP tell people
    exactly as the app's button does. An operation with a `route` always
    needs its host's handler.
  - Those moves still read and write through supabase-js (the person's
    session, or the service role for the engine, Stripe set-up and new
    kids' accounts), which goes through the Data API. Before C5 they move
    onto the handler's own transaction and postgres.js (C4b below), so
    turning the Data API off breaks nothing.
- **C3:** realtime as SSE (`/v1/houses/{houseId}/events`), files by short
  links (`files.jonz.app`), and sign-in through `/v1/auth/*`.
  - Done: files. /v1 hands out a place to upload a picture
    (`proof_upload`, `file_upload`) and links to see private ones
    (`file_links`), asking Storage as the person so the buckets' own rules
    still decide. The links are on the site, `/files/…`, which passes them
    to apps/api (`app/files`); Storage's own signed token rides in the link,
    so the route needs no secret and a link dies when Storage's token does.
    Your photo is `/files/photo/avatars/<you>/<file>`, which set_my_photo
    now takes. A picture is at most 4 MB (Vercel's request limit is 4.5).
    `FILES_URL` points the links elsewhere (staging, whose site passes
    /files to production). `files.jonz.app` can follow as another name for
    the same route.
  - Sign-in (decided 9 November 2026: pass-through, not our own
    endpoints). The app's auth client points at `/auth/v1` on our address
    (the site passes it to apps/api, `app/auth/v1`), which passes each
    request to Supabase Auth as it came: only the paths a person signs in,
    up and out with (never `/admin`), the person's own `Authorization`, and
    Supabase's answer back, redirects and all. With `SUPABASE_SECRET_KEY`
    and IP Address Forwarding on, Supabase limits each person by their own
    address (`Sb-Forwarded-For`); without, everyone shares the API's. The
    app switches with `EXPO_PUBLIC_AUTH_THROUGH_API=1` (the e2e run with it
    on) and keeps the session under Supabase's own name, so nobody is signed
    out. Google and Microsoft still send the browser back to Supabase's own
    callback, which is Supabase talking to them, not the app. MCP's sign-in
    metadata still names Supabase's address for third-party clients.
  - **Realtime without a new service.** Each change writes a row to an
    events table and sends it on a private Supabase Realtime Broadcast
    channel. Only the API listens: houses are spread across a fixed set of
    shard channels (Supabase allows 100 channels per connection), and each
    API instance passes an event only to that house's open streams. No
    Redis (decided 9 November 2026). Supabase counts our instances as its
    connections, not phones.
  - **Streams on Vercel.** A stream lives until the function's time
    limit. The app opens the next stream just before the old one ends and
    sends `Last-Event-ID`; the API replays what it missed from the events
    table, so no instance remembers anyone.
  - Server side built. Migration `live_changes` notes each change to a
    house's events, assignments and disputes (kept two days) and sends
    `{house, id}` on one of 16 private channels, `live:0` … `live:15`
    (`live_topic`). With no policies on `realtime.messages`, only the
    service role can listen. `GET /v1/houses/{houseId}/live` (apps/api,
    `app/v1/houses/[houseId]/live`) is the stream: it listens first, then
    asks `house_live` (house:read only; also `GET …/live/since`) for the
    newest change after `Last-Event-ID`, says `change` once if anything
    was missed, then each new change, pings every 20 s, and ends after
    280 s. Each `change` only says the house changed; the app reads it
    again through /v1. `lib/live` keeps one Realtime connection per
    instance.
  - App side built, off until the check below: with
    `EXPO_PUBLIC_LIVE_THROUGH_API=1` the app reads that stream
    (`apps/client/src/api/live-stream.ts`, over XMLHttpRequest so it can
    send the token on the web and on a phone) instead of Supabase
    Realtime. The e2e runs with it on.
  - **Before the app switches,** a test times a tick reaching another
    phone, today's Supabase Realtime against the new path (median and
    95th percentile). It switches only if the new path is within about
    100 ms of today's. A load test checks many open streams across houses.
- **C4 (done, #154):** MCP (registry PR 6) on the same executor.
- **C4b:** the server moves and the engine (`apps/api/lib/moves`,
  `lib/engine`) stop going through the Data API. Their supabase-js calls
  stay as they are; `lib/db/rest.ts` answers them straight from Postgres
  (one SQL statement each, rows built as JSON in the database as PostgREST
  builds them, embedded tables followed by foreign key). In a /v1 operation
  the person's client and the server's run in the operation's own
  transaction (`lib/db/scope.ts`): the person's as them, the server's as
  `service_role`, which jonz_api may become (migration api_server_role) and
  people never can. Outside one (the cron tick, Stripe's webhook) the
  server's statements come from the API's pool. Every db test drives the
  engine through it. Kids' accounts stay on Supabase Auth's admin API, and
  files on Storage, neither of which is the Data API.
- **C5: lock-down** ("lock it as much as necessary", Glyn, 9 November
  2026). Where it stands (10 November 2026):
  - Data API off and Realtime private only: done by Glyn, 10 November.
    `anon` and `authenticated` keep their grants: the API itself runs each
    person's statements as `authenticated` (and visitors' as `anon`), so
    RLS and the grants are still how a person is held to their own rows.
    With the Data API off nobody else can reach them.
  - Realtime: channels private (RLS on `realtime.messages`), and only the
    API's role may listen (migration live_changes).
  - Storage: every bucket private (avatars_private); files only through
    the API's short links, and people's photos through
    `/files/photo/avatars/…`, read with the server's key.
  - Keys: the new publishable and secret keys are live (Provision,
    10 November; #176). Left for Glyn: turn the legacy JWT keys off once a
    secret key is confirmed, and change the database password.
  - Network: Vercel Static IPs and Supabase Network Restrictions skipped for
    now (Glyn, 10 November: $100 a month per project for shared addresses);
    revisit before launch.
  - Supabase Auth stays reachable: Google, Microsoft and email sign-up and
    sign-in all go through it.
- **C6:** the phone version gate goes live. The executor already refuses a
  build below `MIN_IOS_BUILD` / `MIN_ANDROID_BUILD` with
  `426 client_too_old`, and the app sends `Jonz-Client`; what's left is the
  app's "Update Jonz" screen, built with the phone apps (paused until Glyn
  decides on the stores).

## Done when

- [ ] Every operation the app uses is served by `/v1` and passes the same
      checks in the API and the database.
- [ ] The Data API is off and the app still works on iOS, Android and web.
- [ ] Live updates reach another phone within about 100 ms of today's
      (median and 95th percentile), and hold up under a load test.
- [ ] Only jonz-api's addresses can reach the database, Realtime channels
      and buckets are private, and the legacy keys are off.
