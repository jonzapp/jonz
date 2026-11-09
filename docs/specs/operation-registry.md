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
  - `rpc`: the database function it runs (`server` when only the API's service role may call it, after the route checks);
  - `route`: the API route in front of it;
  - `tables`: for an operation the app does today straight on the tables (the John list, the Wall, saved chats…), which ones, read or changed as the caller under each table's rules. It has no function or route of its own; under API-only, the /v1 server runs it;
  - `screen`: a read of everything one screen shows at once (Today, the Table, Track record, the Stake), in one round trip where the app makes several today;
  - `destructive`: it can't be undone, or it reaches people (push, email, notice), so an MCP client needs the person's approval in Jonz first;
  - `entitlement`: the House Pass feature it needs once the Pass is enforced. That is a plan feature, not a permission.
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
- `toRequest`: for an operation behind an API route whose request names things differently (a reset's `week`, `user`, `assignment`), the route's request from the input.

Outputs are made from `TABLE_ROWS` (`packages/core/src/table-rows.ts`): a row of each registry table, camelCase, written from the database's own description of its columns. `apps/api/tests/db/table-rows.test.ts` keeps it equal to the database; after a migration that changes a table, refresh it with `npx vitest run --project db tests/db/table-rows.test.ts -u` in `apps/api`.

Every input and output turns into JSON Schema (`z.toJSONSchema`), for the API's OpenAPI document and MCP's tool definitions.

## How it's held to the truth

- `supabase/checks/registry.sql` is generated from the registry. A core test keeps it equal; refresh it with `npx vitest run -u` in `packages/core`.
- The database standards check (`npm run db:standards`, run in CI) fails if:
  - a function signed-in people may call isn't listed;
  - a listed function is gone;
  - a table grant (whole table or some columns, signed in or out) isn't listed.
- `apps/api/tests/unit/operations.test.ts` fails on an API route that is in neither list, and on a table the app reads or changes (`.from('…')`) that no operation names.
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
- [ ] Step 4: Ask Jonz's tools, the house's and the owner's, are built from the registry, and every house permission can be done from the chat.
