# Operation registry

## What it does

One list of everything a person can do on Jonz, whichever way they reach it: the app, the API, Ask Jonz, and later MCP. Nothing anyone using Jonz sees changes. It makes sure a new database function, table grant or API route can't go live without someone deciding who may use it.

## Inputs and outputs

`packages/core/src/operations.ts`:

- `OPERATIONS`: each operation has
  - `about`: one plain sentence, used later for Ask Jonz and MCP tool descriptions;
  - `scope`: `house`, `app` (the admin pages) or `account`;
  - `effect`: `read` or `write`;
  - `guard`: how the database decides who may do it;
  - `rpc`: the database function it runs (`server` when only the API's service role may call it, after the server checks);
  - `server`: true when it needs the server's own code after the database has decided (a push, an email, Stripe, Claude), which /v1 runs;
  - `tables`: for an operation the app does today straight on the tables (the John list, the Wall, saved chats…), which ones, read or changed as the caller under each table's rules. It has no function or route of its own; under API-only, the /v1 server runs it;
  - `screen`: a read of everything one screen shows at once (Today, the Table, Track record, the Stake), in one round trip where the app makes several today;
  - `destructive`: it can't be undone, or it reaches people (push, email, notice), so an MCP client needs the person's approval in Jonz first;
  - `additive`: a write that only adds something new, changing or removing nothing already there, so a connected app is told it isn't destructive;
  - `entitlement`: the House Pass feature it needs. That is a plan feature, not a permission.
- `guard` is one of:
  - `permission`: a named `resource:level`, asked with `can()` (house) or `can_app()` (admin pages);
  - `check`: a yes/no helper;
  - `member` or `own`, for a table only: anyone you share a house with, or your own rows.

  Every operation names a permission or is a check; the `OperationGuard` type allows nothing else. Account permissions (`account:read`, `account:write_own`) are anyone signed in, about their own rows. `member` and `own` remain only for a few tables: profiles (people you share a house with) and own-row tables.
- `TABLES`: every table signed-in people reach directly, its grants, and who may read and change it.
- `SYSTEM_ROUTES`: API routes that aren't one person's operation (cron, webhooks, push buttons, public pages), each with how it proves who is calling.

`packages/core/src/operation-io.ts`, `OPERATION_IO`: each operation's contract, which the versioned API (/v1), MCP and Ask Jonz's tools are built from. It's a Record over every operation, so a new one without it doesn't compile.

- `input`: a Zod schema in camelCase, ids named for what they are (`houseId`, `assignmentId`). An operation that runs a database function passes it as that function's arguments (`rpcArgs`): `p_` and the key in snake_case without its `Id` (`houseId` is `p_house`), unless `args` names another.
- `output`: what it answers when it works, camelCase all the way down (`camelKeys` turns the database's rows into it). A refusal is an error, not an output.
- `http`: `METHOD /v1/path`. Reads are GET, writes POST, PATCH or DELETE. A house's things live under `/v1/houses/{houseId}/…`, anything with its own id at the top (`/v1/assignments/{assignmentId}`), your own under `/v1/me/…`, the admin pages under `/v1/admin/…`.
- `page`: a list read a page at a time takes `limit` and `startingAfter` and answers `{ data, hasMore, startingAfter }`; pass the last as `startingAfter` for the next page (`fromPage`, `pageCursor`).
- `toRequest`: for an operation whose server code names things differently (a reset's `week`, `user`, `assignment`), that code's request from the input.

Outputs are made from `TABLE_ROWS` (`packages/core/src/table-rows.ts`): a row of each registry table, camelCase, written from the database's own description of its columns. `apps/api/tests/db/table-rows.test.ts` keeps it equal to the database; after a migration that changes a table, refresh it with `npx vitest run --project db tests/db/table-rows.test.ts -u` in `apps/api`.

Every input and output turns into JSON Schema (`z.toJSONSchema`), for the API's OpenAPI document and MCP's tool definitions.

## Ask Jonz's card

Every house write is something Ask Jonz can do, built from the registry (`packages/core/src/ask-operations.ts`). Each house write is exactly one of:

- on the generic card (`ASK_CARD_OPERATIONS`): a tool named after the operation, its input the operation's own (`askToolInput`) except that
  - an id is a ref (`ASK_REFS`: the first 8 characters of the id, as Jonz's reads show it, and which table it's in),
  - a record keyed by ids (preferences' `rather`) is keyed by refs (`ASK_REF_RECORDS`),
  - the house is the chat's and a photo is the app's to take (`ASK_FILLED_KEYS`),
  - a whole row of settings (house rules, your preferences) takes only what changes, and the rest is read from the row as it is now (`ASK_KEEP_CURRENT`);
- one with a tool of its own that builds a richer card (`ASK_OWN_TOOLS`: the John list, groups, resets);
- not a move someone asks for (`ASK_NOT_MOVES`, with why: catch-up, Ask Jonz itself, an answer that needs a photo).

A tool is given only to someone with the operation's permission. When Jonz calls one, the API (`apps/api/lib/moves/ask-operations.ts`) finds the one row each ref stands for in this house, as the person, so a ref only reaches what they can see, and checks the whole input against `OPERATION_IO` before the move goes on the card with the names of what it touches. Nothing is done before they tap; the card (`MovesCard`, `apps/client/src/api/operations.ts`) makes the same call the app's own button does, which checks again. That map is exhaustive, so a new house write doesn't build until it says which call does it. Every permission says how Ask Jonz handles it (`ASK_COVERAGE`): by reading, or on the card.

## MCP

`api.jonz.app/mcp` (`apps/api/lib/mcp/server.ts`, served by `app/mcp/route.ts`) is Jonz for MCP clients, on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`).

- One tool per operation /v1 serves (`V1_OPERATIONS`), named after it, its input the operation's own, its description the registry's `about`. Reads are marked read-only; a write is marked destructive unless it's `additive` (it only adds, such as a tick or a new John), which is MCP's own meaning of the hint and what Claude's and ChatGPT's directories check (docs/specs/assistant-directories.md). The `firstParty` operations (approving, below, setting what an app may do, Ask Jonz, and buying or paying for the House Pass) aren't offered: they're for the person in Jonz itself.
- Each call runs through the same executor as /v1 (`v1Instance()`, one pool per instance), with `via: "mcp"`: the same token check, rate limit, permission, House Pass and audit row. A refusal is a tool error starting with its problem code (`forbidden: …`).
- Stateless: each request gets a fresh server instance and nothing is kept between requests, so any instance answers any request.
- Signing in: with no bearer token it answers 401 with `WWW-Authenticate: Bearer resource_metadata=…`, and `/.well-known/oauth-protected-resource/mcp` names Supabase Auth as the authorization server (RFC 9728). Its `scopes_supported` lists only scopes Supabase's OAuth server can issue (`openid email profile offline_access`), because clients such as Claude ask for every scope listed and Supabase turns away a sign-in with any it doesn't know. What a connected app may do is what the person's role holds, checked on every call, not the token's scopes.
- Connecting an app: Supabase's OAuth 2.1 server is on, with dynamic client registration (`supabase/config.toml`; production and staging by Provision, `OAUTH_SERVER`). Its consent page is Jonz's own, jonz.app/oauth/consent (`apps/client/src/app/oauth/consent.tsx`): open to anyone and signing in in place, it names the app and its site, asks what it may do (Read only, picked first, or Read and change), and Allow or Don't allow sends you back to the app. An app already allowed goes straight back. Your apps are listed on You under Connected apps, each saying what it may do; tapping one opens its sheet, which changes that or disconnects it (signing it out at once).
- What an app may do (`connected_apps`, one row per person and app; no row is Read only): Allow saves the pick first (`set_app_access`), then lets the app in. The executor reads it as the API before anything else runs, for every write from a token with a `client_id`, through /mcp or /v1, and refuses with `forbidden` ("This app can only read…") unless it's `write`, so a read-only app can't even ask for an approval. Read and change is what the person's role allows, with anything that can't be undone still waiting for approval (below). `set_app_access` and `my_app_access` refuse a token with a `client_id` (`require_first_party`), so an app can't raise its own access; nobody can write the table directly.
- A connected app's tokens come from Supabase's OAuth server and carry a `client_id` claim. PostgREST refuses any request with one (`api_pre_request`, run before every request), so a connected app reaches Jonz only through /mcp.

### Approvals: what can't be undone waits for the person

An operation marked `destructive` (it can't be undone, or it reaches people outside the caller's screen) doesn't run for a connected app until the person approves that exact request in Jonz. The executor holds it whenever the call comes by MCP or the token has a `client_id` (`needsApproval`); the person using the app is never asked.

1. The executor runs the usual checks first, as the person: the house, the permission, the Pass. Someone who couldn't do it anyway is refused, not asked.
2. It looks for an approved, unused, unexpired approval of the same request: the same person, operation and checked input (`requestHash`). Finding one, it marks it used and runs the operation in the same transaction, so a write that fails leaves the approval unused.
3. Otherwise it writes a pending row to `api_approvals` (or finds the one already waiting for the same request) and refuses with `forbidden` (403) and an `approvalUrl` in the problem body, `https://jonz.app/approve/<id>`. A request declined within the last 15 minutes is refused with `forbidden` ("You said no to this in Jonz.").
4. /mcp sends the person to that page by URL elicitation (MCP 2025-11-25): on the 2026-07-28 revision as an `input_required` result when the client declares `elicitation.url`; on 2025 revisions as the `urlElicitationRequired` error (-32042); otherwise as a tool error carrying the link, which any client can show.
5. At jonz.app/approve/<id> (`apps/client/src/app/approve/[approvalId].tsx`, open to anyone, signing in in place), the person sees what the app asked in the registry's words, the house and the details, and approves or declines (`api_approval`, `answer_api_approval`). Both functions refuse a token with a `client_id`, so an app can't approve its own request.
6. The client retries, and step 2 finds the approval. A request waits 15 minutes (`APPROVAL_TTL_MS`), and the approval is good until then; rows are cleared after a day.

## How it's held to the truth

- `supabase/checks/registry.sql` is generated from the registry. A core test keeps it equal; refresh it with `npx vitest run -u` in `packages/core`.
- `packages/core/generated/operations.json` is the registry as plain JSON, for code that isn't TypeScript (a Go service generates its types from it): each operation's about, scope, effect, guard, entitlement (and `entitlementWhen`, the input key that turns it on: a tick is free, a tick with a photo needs the Pass), destructive, method, path, database function and argument names, tables, page cursor, and input and output as JSON Schema 2020-12. `operations-json.test.ts` keeps it equal; refresh it the same way.
- The database standards check (`npm run db:standards`, run in CI) fails if:
  - a function signed-in people may call isn't listed;
  - a listed function is gone;
  - a table grant (whole table or some columns, signed in or out) isn't listed.
- `apps/api/tests/unit/operations.test.ts` fails on an API route that isn't in `SYSTEM_ROUTES` (people's operations are all on /v1), and on a table the app reads or changes (`.from('…')`) that no operation names.
- `packages/core/src/ask-coverage.test.ts`: every house write is in exactly one of the card's three lists, every id a card operation takes has a ref or is filled in, no card operation needs a photo, and kept settings are columns their row has. `apps/api/tests/db/ask-card-operations.test.ts` puts moves on the card against a real house: refs become this house's ids, unchanged settings come from the row, a ref from another house or a move the person may not make is refused, and nothing is written.
- `apps/api/tests/unit/mcp.test.ts`: one MCP tool per served operation but approving, destructive ones marked, a call reaching the executor as the caller by MCP, input checked first, a refusal as a tool error, an approval asked for in each MCP revision's way, and the sign-in challenge. `apps/api/tests/db/mcp.test.ts` runs MCP calls on two instances with their own pools against the real database: a destructive one held, approved as the person, then run from the other instance; and PostgREST refusing a connected app's token.
- `apps/api/tests/db/house-pass-column.test.ts` is the House Pass column of the matrix, through /v1 and /mcp, with the Pass enforced: every operation the registry gates behind a Pass feature is refused with `pass_required` in a house without one (before anything is held for approval), gets through to the operation itself in a house with one, and is free without the input that turns its feature on (a tick with no photo). It also fails if a gated operation isn't served or has no case.
- `apps/api/tests/db/mcp-oauth.test.ts` connects an app against the local stack's own OAuth server: it registers itself, the consent page's calls let it in, asking the way Claude does (every listed scope, `resource`, `prompt=consent`); its token carries its `client_id`, PostgREST refuses it, /mcp serves it reads but refuses every change while it's Read only, the app can't raise its own access (straight to the database or through /v1), Read and change lets it make one as the person, and disconnecting it ends its session.
- `packages/server/tests/db/executor.test.ts` holds approvals to the database: only a connected app is held, someone who can't do it isn't asked, the app's own token and other people can't approve, an approval is used once and only for the same request, a decline is said, and an approval left too long isn't used. It holds what an app may do too: never picked is Read only, every write refused before anything runs (no approval asked), through /mcp or /v1; the app's own token and another app can't set or read it; nobody writes the table directly; only the two choices; Read and change lets that one app (not the person's other apps) write from its next call, and back to Read only stops it; the person's own token is never held to it. `apps/client/src/__tests__/app/approve.test.tsx` covers the page; `consent.test.tsx` and `connected-apps-section.test.tsx` the choice on the consent page and Connected apps; `e2e/client-connect.spec.ts` the whole thing in the web build.
- `packages/core/src/operation-io.test.ts`: one /v1 route each, GET only for reads, every id a path names is in the input, admin pages only under /v1/admin, ids end in `Id`, and every schema turns into JSON Schema.
- `apps/api/tests/db/operation-io.test.ts` holds each contract to the database:
  - an operation that runs its function straight takes exactly its arguments, by name, type and whether they can be left out, as PostgREST describes them;
  - every read, called for real by an owner who is also the house's admin, answers what its output says, and so do the writes that go through.
- `apps/api/tests/db/operations.test.ts` calls every listed function against a real house, with arguments taken from the database's own description of it:
  - every house operation must refuse someone outside the house (a read may show them nothing instead);
  - every admin page operation must refuse a housemate and an owner without the code;
  - every admin page operation outside support's permissions must refuse support.

## Edge cases

- A read refuses a stranger by showing nothing, as table rules do. A write must raise an error.
- Ids the test can't find in the house (a dispute, a report) are random, so those refusals come from the guard or from not finding the row. Which roles may do each operation is tested in `permission-matrix.test.ts`.

## Platforms

Same on every platform: it's the server's list.

## Done when

- [x] Every callable function, table grant and API route is listed, and CI fails on one that isn't.
- [x] Every guarded operation refuses people it isn't for, against the real database.
- [x] Step 3: every operation names its permission, and the database asks it (a test takes each one away from members and checks they're refused).
- [x] Step 3: reading a house is one permission per resource (`johns:read`, `wall:read`, `payments:read`…), and each table rule asks its own.
- [x] Supabase's security and performance advisors run in CI (`npm run db:advisors`); any warning fails.
- [x] Step 4: every operation has its input, output and /v1 route, held to the database.
- [x] Step 4: the app's direct table reads and writes are operations too.
- [x] Step 4: Ask Jonz's house tools are built from the registry, and every house permission can be done from the chat.
- [x] Step 4: the owner's Ask Jonz tools are built from the registry: every admin write is on the owner's card or says why it isn't a move (`owner-ask-operations.ts`).
- [x] Step 6: /mcp serves every /v1 operation as a tool through the same executor, stateless, with sign-in by Supabase's OAuth server.
- [x] Step 6: connecting an app goes through Jonz's own consent page, and you can see and disconnect your connected apps.
- [x] Step 6: what can't be undone waits for the person's approval in Jonz (URL elicitation), and a connected app's token can't go around /mcp.
- [x] Every operation gated by the House Pass is refused without one and allowed with one, through /v1 and /mcp, against the real database.
