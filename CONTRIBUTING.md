# Contributing

Jonz is a one-person project, built in the open. Bug reports and ideas are
welcome; code is welcome too, but email support@jonz.app first so we can
agree on it before you spend the time.

## Reporting a bug or asking for something

Tell us from inside Jonz (House, then Help: Report a problem or Send an
idea), or email support@jonz.app. [jonz.app/help](https://jonz.app/help)
says how; every report lands in one inbox and gets a reply. For anything
about security, follow [SECURITY.md](SECURITY.md) instead.

## Working on the code

The [README](README.md) says how to run the app and its tests, and
[AGENTS.md](AGENTS.md) says how it fits together and the rules it keeps.
The short version:

- Rules live in `packages/core`, with their tests beside them. The app and
  the API call them; they don't repeat them.
- Every table gets Row Level Security in the same migration that makes it.
  Never change a migration that's already on `main`; add a new one.
- Every feature works on iPhone, Android and the web, in light and dark.
- Words follow the house voice in [docs/brand](docs/brand/README.md): plain
  English, no emoji, no exclamation marks.

Before you open a pull request:

```sh
npm run lint && npm run typecheck && npm test
npm run test:db     # if you touched supabase/ or the engine
npm run test:e2e    # if you touched a screen
```

CI runs all of these on every pull request, and `main` only takes green ones.
Merges to `main` go live at jonz.app, and migrations apply to the database
on merge.

## Licence

See [LICENSE](LICENSE). By opening a pull request you agree your change can
be used under it.
