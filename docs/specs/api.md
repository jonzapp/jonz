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
   - It becomes the person (`role authenticated` with their claims), then
     checks the permission (`my_permissions` / `my_app_permissions`) and the
     House Pass.
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
  database function raised on purpose reach people; anything unexpected is
  a plain 500.
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
   - `SUPABASE_URL`.
   - `MIN_IOS_BUILD` and `MIN_ANDROID_BUILD`, once the phone apps ship.

## Steps

- **C1 (this):** `@app/server` (the executor), `apps/v1` (the Fastify
  layer), the migration, and the contract check in CI.
- **C2:** the app moves onto `/v1`. Each table-only operation gets its own
  database function (security invoker, so RLS still decides), and each
  `rpc.server` operation's logic moves from `apps/api` into its handler.
- **C3:** realtime as SSE (`/v1/houses/{houseId}/events`), files by short
  links (`files.jonz.app`), and sign-in through `/v1/auth/*`.
- **C4:** MCP (registry PR 6) on the same executor.
- **C5:** revoke the direct grants and turn the Data API off.
- **C6:** the phone version gate goes live.

## Done when

- [ ] Every operation the app uses is served by `/v1` and passes the same
      checks in the API and the database.
- [ ] The Data API is off and the app still works on iOS, Android and web.
