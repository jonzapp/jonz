# Security

Jonz holds people's houses, their housemates and a ledger of who owes whom,
so a security report goes to the front of the queue.

## Reporting a problem

Please don't open a public issue. Report it privately instead, either way:

- **GitHub:** the repo's [Security tab](https://github.com/jonzapp/jonz/security/advisories/new),
  then **Report a vulnerability**.
- **Email:** support@jonz.app, with "Security" in the subject.

Say what you found, how to reproduce it, and what someone could do with it.
You'll hear back within three days, and you'll be told when it's fixed.
Please give it time to be fixed before you talk about it publicly.

## What's in scope

- The app at [jonz.app](https://jonz.app) and the API at api.jonz.app.
- This repository: the Supabase migrations and Row Level Security, the API
  routes, the clock and the engine.

Out of scope: denial of service, spam, social engineering, and problems in
Supabase, Vercel, Stripe, Google or Microsoft themselves (report those to
them). Please test only against a house you made yourself, never against
other people's data.

Jonz never moves money. The House Pass is paid through Stripe Checkout, and
Jonz never sees a card number.

## Versions

Only what's live at jonz.app is supported. It deploys from `main`.
