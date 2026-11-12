# Jonz in Claude's and ChatGPT's directories

## What it does

Lists Jonz in Claude's connector directory and ChatGPT's app directory, so anyone can add Jonz to their assistant from a list instead of pasting `https://api.jonz.app/mcp` as a custom connector. Nothing changes in Jonz itself. The connector is the same /mcp server either way (docs/specs/operation-registry.md, "MCP").

## Inputs and outputs

What both directories check, and where Jonz meets it:

- **Every tool says what it does, outright.** Each tool has a title (the registry's `about`) and all four hints as true or false, never left out (`toolAnnotations` in `apps/api/lib/mcp/server.ts`):
  - `readOnlyHint`: true for a read.
  - `destructiveHint`: true for every write that changes or takes away something already there, even one that can be undone (MCP's own meaning: false only for "additive updates"). An operation marked `additive` in the registry (a tick, a new John, a flag, a reaction) is the only write marked false. Claude asks the person before each destructive tool.
  - `idempotentHint`: true for a read.
  - `openWorldHint`: false. Jonz is the person's own house, never the open web.
- **This is apart from Jonz's own approval.** `destructive` in the registry (can't be undone, or reaches other people) still means the person approves the request in Jonz before it runs.
- **Tool names are 64 characters or fewer.**
- **Nothing is sold.** Buying the House Pass, opening its billing and stopping it (`pass_checkout`, `pass_billing`, `leave_pass`) are `firstParty`: no connected app sees them, and the executor refuses them to one. People buy and manage the Pass in Jonz and on jonz.app as before. Neither the tool descriptions nor the instructions name a price, a trial, a discount or an upgrade. ChatGPT forbids selling subscriptions or digital goods inside an app; Claude forbids money moving through a connector.
- **Privacy, terms and help** are at jonz.app/privacy, jonz.app/terms and jonz.app/help (`LEGAL` in `@app/core`).

ChatGPT also needs:

- **The package** in `integrations/chatgpt/`: `plugin.json` (name, descriptions, developer name, category, links, brand colour, logo, starter prompts, five positive and three negative test cases, countries), `mcp.json` (the server address) and `assets/logo.png`. `npm run package:chatgpt` zips them into `jonz-chatgpt.zip` at the repo root; that zip is what's uploaded.
- **Proof we own api.jonz.app**: the portal shows a token, which goes in `OPENAI_APPS_CHALLENGE` in jonz-api's environment on Vercel. `GET https://api.jonz.app/.well-known/openai-apps-challenge` then answers it as plain text (404 while it's unset).
- **A verified developer**: the portal's individual verification, under the same name as `developerName` ("Glyn Finck", `LEGAL.operator`).
- **A demo video** (a link) of the test cases working in ChatGPT.

Claude also needs:

- **The submission form** with the server address, a short description, the privacy link, three example prompts and the logo.

Both need:

- **A reviewer account**: an email and password with no two-step sign-in, in a house with a few weeks of history, so every tool has something to show. Making it is a write to production, so only with the owner's yes.

## Steps

1. Merge this. Check `https://api.jonz.app/mcp` lists no Pass tools.
2. ChatGPT: verify as an individual on platform.openai.com, start a plugin, copy the domain token into `OPENAI_APPS_CHALLENGE` on jonz-api, redeploy, then verify the domain.
3. Make the reviewer account and its house.
4. Record the demo video (each positive test case, in ChatGPT). Put its link in `plugin.json` as `demo_recording_url`.
5. `npm run package:chatgpt`, upload `jonz-chatgpt.zip`, add the reviewer's email and password, submit.
6. Claude: fill in Anthropic's connector directory form with the same account.

## Edge cases

- A new operation is a write with no `additive`: it's marked destructive. Mark it `additive` only if it changes and removes nothing already there; the test rejects `additive` on any name that starts with a word that changes things (remove, cancel, undo, set, change and so on), and on any operation that needs approving.
- A new operation that sells or pays is `firstParty`, or the test fails.
- A tool named in the test cases that /mcp doesn't serve fails the test, so a renamed tool can't leave the listing stale.
- The token unset answers 404, so nothing reads as verified by accident.

## Platforms

Server only. The app is unchanged.

## Done when

- [x] `apps/api/tests/unit/directories.test.ts` holds every served tool and the package to both directories' rules.
- [ ] Domain verified in OpenAI's portal.
- [ ] Reviewer account made.
- [ ] Submitted to both directories.
