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
  - `destructive`: it can't be undone, or it reaches people (push, email, notice), so an MCP client needs the person's approval in Jonz first;
  - `entitlement`: the House Pass feature it needs once the Pass is enforced. That is a plan feature, not a permission.
- `guard` is one of:
  - `permission`: a named `resource:level`, asked with `can()` or `can_app()`;
  - `member`: anyone in the house;
  - `own`: the caller's own row;
  - `signed_in`: anyone, about their own account;
  - `check`: a yes/no helper.

  `member` and `own` are the ones still to name. Step 3 gives each a permission, and `unnamedGuards()` falls to zero.
- `TABLES`: every table signed-in people reach directly, its grants, and who may read and change it.
- `SYSTEM_ROUTES`: API routes that aren't one person's operation (cron, webhooks, push buttons, public pages), each with how it proves who is calling.

## How it's held to the truth

- `supabase/checks/registry.sql` is generated from the registry. A core test keeps it equal; refresh it with `npx vitest run -u` in `packages/core`.
- The database standards check (`npm run db:standards`, run in CI) fails if:
  - a function signed-in people may call isn't listed;
  - a listed function is gone;
  - a table grant (whole table or some columns, signed in or out) isn't listed.
- `apps/api/tests/unit/operations.test.ts` fails on an API route that is in neither list.
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
- [ ] Step 3: every `member` and `own` guard is a named permission.
