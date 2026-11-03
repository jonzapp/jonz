This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## This app (apps/client)

The rules above are Expo's template. These are specific to Johns; the root
AGENTS.md has the project-wide rules (the game, the words, the data, the
ask-first list), and `docs/specs/native-migration.md` says which screen
arrives in which phase.

Expo SDK 58, React Native 0.88, React 19.3 (one copy for the whole repo,
pinned by the root `overrides`). The app's name, slug and scheme are `Jonz`,
`jonz` and `jonz`; the bundle ID and Android package are `dev.glyn.jonz`,
permanent once a store has seen them.

- Run `npx expo install <package>` from this directory: it picks the SDK's
  version and installs into this workspace through the root lockfile.
- `npm run dev:client` from the root starts Metro on **8205**, beside the web
  app on 3205.
- Shared logic, types and words come from `@app/core`; never duplicate them
  here. Every rule of the game lives there or in the database.
- `src/app/`: screens and layouts only. No calculations, data shaping or
  network calls inline, and nothing else at all: Expo Router makes every
  script there a route and ships it, tests included. Screen tests live in
  `src/__tests__/app/`, and `src/routes.test.ts` fails on anything else.
- The root layout reads the saved session and its house behind the splash
  screen and splits the routes with `Stack.Protected` three ways: signed
  out (front door, sign-in), signed in with no house (`welcome`,
  `house/new`), and in a house (the `(house)` group). Signing in or out, or creating a
  house, moves you by itself; screens never navigate after auth. Signing in
  with no house goes where sign-in's `?next=` was carrying you, when
  `afterSignIn` (core) allows it: `/house/new`, `/welcome` or a join link,
  on every platform. A join link
  (`join/[joinCode]`, which is `jonz://join/CODE` on a phone) sits outside
  the guards and signs you in in place, so the code survives. So do
  `privacy` and `+not-found` (anything not a route, `/_sitemap` included:
  the router plugin's `sitemap` is off), open to anyone. The root layout's
  `ErrorBoundary` is the web's error page: a screen that throws shows it,
  with "Try again".
- `src/api/`: every network call.
  - `supabase.ts`: the Supabase client, typed with `Database` from
    `@app/core`, publishable key only; `storage.ts` / `storage.web.ts` keep
    the session on each platform.
  - `auth.ts`: all sign-in and sign-out, and what screens import. Behind
    it: `google.ts` (Google's native sheet on iOS and Android, an ID token to
    `signInWithIdToken`), `google.web.ts` (the web build: Supabase's PKCE
    redirect back to `/signin`), `apple.ts` (Sign in with Apple, iOS only,
    with the nonce from `nonce.ts`; keeps the name Apple sends once) and
    `profile.ts` (your display name, and renaming yourself from House).
  - `http.ts`: `apiPost` for calls to `apps/api`, sending the user's access
    token and parsing the answer with its schema from `@app/core`; a refusal
    throws `ApiRequestError` with the API's sentence. One small module per
    resource beside it: `house.ts` (your house, join codes, creating and
    joining through RPC, and `catchUp` through `POST /api/fresh`),
    `board.ts` (`loadHouse`: one read of a house's rules, people and this
    week's rows), `johns.ts` (ticking, undoing, spending immunity, a swap),
    `disputes.ts` (disputing and voting, through apps/api), `wall.ts` (the
    Wall's events with their photos signed for an hour, your reactions, and
    `signPhoto`: one receipt signed on its own, for a settled John's sheet),
    `table.ts` (the month's Table and the fair shares, summed by core as the
    deal sums them), `stake.ts` (the ledger, built by core's `buildStake`,
    and "Mark received" through `confirm_payment`), `settings.ts` (House:
    the John list and the house rules through the admins' column grants,
    roles and leaving through RPC, and the deal through `POST /api/deal`)
    `away.ts` (time away: reading it, and booking and cancelling through
    `set_away` and `cancel_away`), `push.web.ts` (reminders on this browser:
    the service worker, `PushManager` with `EXPO_PUBLIC_VAPID_PUBLIC_KEY`,
    and your `push_subscriptions` row; `push.ts` is the native stub until
    Phase 12) and `photos.ts` (receipts: below). RLS filters a write that isn't an
    admin's to no rows rather than refusing it, so `settings.ts` asks for
    the written row back and says "Only the house admins can do that." when
    there is none.
- **Writes go through the database, as the web's do.** A move is one named
  SQL function (`supabase.rpc('mark_done', …)`) or one column-granted write;
  the database decides, and the client only translates a refusal with
  `humanError` from `@app/core` and refreshes. `apps/api` is called only for
  the moves that need a server: `POST /api/deal`, `POST /api/disputes`,
  `POST /api/disputes/:id/votes`, `POST /api/fresh`, `POST /api/flags` and
  `POST /api/setup/draft` (`draft.ts`: `sendChat`, one turn of the
  setup chat, answered as the API would by `offlineTurn` if the API can't
  be reached, and `applyDraft` (`keepDraft` for a new house),
  which applies the changes an admin ticked through `settings.ts`).
- `src/hooks/`: connect `@app/core` and `src/api/` to screens (e.g.
  `use-session.ts`). `use-membership.tsx` is the session and the house it's
  in, read behind the splash screen, with `refresh()` for after creating or
  joining a house. `look.tsx` is the Day/Night/Auto choice for this device
  (`LookProvider` in the root layout, `useLook()`), saved in storage under
  `theme`, the key the web's next-themes uses.
- `src/components/`: the pieces every house screen is built from, Focus's
  kit: `Screen` (a house screen's page; `spreads` for Today, Week and
  House in `Columns`, `fills` for House's other pages, whose sections sit
  side by side on a laptop in `Pair` and `Flow` from `page-columns.tsx`),
  `TitleBar` (with `MoreButton` for
  "•••"), `PageTitle` (the browser tab's title on the web from core's
  `pageTitle`, nothing on a phone), `Section`, `Group`, `Row` (the one row,
  everywhere), `Fold`, `Card` (at most one stand-alone card a screen),
  `TickBox`, `StatusMark` and `Chip` (core's `STATUS_MARK`, drawn),
  `LidBar`, `Avatar`, `CountBadge`, `Button`, `ButtonRow` (buttons side by
  side: equal, stacking when narrow), `IconButton` (every icon-only control),
  `TextButton`, `TextLink`,
  `Field`, `SignInForm` and `HiddenUsername` (sign-in and password boxes
  as a real form on the web, for password managers), `Alert`, `Segmented`,
  `EmptyState`, `Reading` and `ReadFailed`
  (a first read on its way, or "Try again"), toasts, and the brand pieces
  (`Wordmark`, `HazardTape`, `SignInPanel`). `john-row.tsx` is a John as a
  row wherever one is drawn (Today, Week's groups and its table): core's
  `johnRow` decides the circle, the meta line and the one trailing item for
  anyone's John and whoever is looking, and `DoneFold` folds the finished
  ones with how many were late. `CodeBoxes` is every 6-digit code (the
  admin code, the codes we email). Then one folder per place:
  - `today/`: Next up (`NextUp`, or `SetupCard`, an admin's checklist
    before the first deal), Needs you, the rest of your week and the page's
    tappable lines (`PageLine`).
  - `week/`: the summary bar and its legend's filter, one `PersonSection`
    per housemate, `WeekTable` from `WIDE`, `WeekEmpty`, the "•••" menu
    (`WeekMenu`) and the fairness footer with its fair shares sheet.
  - `house-page/`: House's sections, in the page's order: the month card
    and settling up, the Table with its invite and rules sheets, the Wall's
    latest, House setup, You, and Leave; and `StakeHistory` and `MetaLine`
    / `Money` (a row's meta parts and an amount, hazard marks included).
  - `house/`: the setup pages' editors (`JohnList`, `RulesForm` with its
    `RulesFoot`, `GroupsList`, `AdminsList`, your `PrefsForm`, time away's
    `AwayCalendar`, `MyTrips` and `AwayForm`, and `Reminders`),
    `DealButton`, and `HousePage`, the frame of every page House pushes.
  - `person/`: a housemate's page (`PersonSections`, `PersonLines`), and
    for admins Make admin and Remove (`PersonAdmin`).
  - `wall/`: a Wall row with its reactions control, and `WallEventSheet`,
    an event in full.
  - `setup/`: the setup pages' own rows (`PickRow`, a short select that
    opens in place; `ChoiceRow`, a radio or checkbox row), `AwayDates` (the
    calendar for booking time away, drawn by the app, no native date
    module) and `DealFoot`.
  - `front-door/`: the pages from before you have a house (`Door`, `Sign`,
    `SignHeading`), and `DefaultsLine`, a new house's defaults with Change.
  - `shell/`: `HouseTabBar`, the tabs and the rail.
- **Sheets:** `Sheet` rises from the bottom on a phone and sits in the
  middle from `WIDE`, over a full scrim; it changes its own content rather
  than opening a second sheet, and `openAt` opens it scrolled to a
  `SheetAnchor`. On it: `ConfirmSheet` ("Are you sure?" for a move that
  costs something), `ActionMenu` (the "•••" menu, which runs its action
  once it has gone), the invite sheet, the rules sheet, the fair shares, a
  Wall event, the reminders, and the John sheet.
- **The John sheet** (`components/john-sheet/`) holds every John action:
  tick, photo, undo, immunity, swap, dispute and vote. `JohnSheetProvider`
  is mounted once, in the house layout, and any screen opens it with
  `useJohnSheet().open(assignmentId, focus?)`, `focus` being what it was
  opened for (the vote, a dispute, "If you can't", the swap). It reads the
  John live from the house's board by id, so it follows ticks and votes as
  they land and puts itself away if the John goes (a re-deal). Its header
  is the kind, points and how often (the board item's `everyWeeks`, from
  the John it was dealt from), the name, and while it's to do when it's due
  and what lateness costs (capped at the stake, once a screen has read the
  Stake, which `useCached` takes from the cache alone); once settled, what
  happened. Under it, by whose it is and where it has got to (core's
  `johnSheetMode`): `open.tsx`, `checking.tsx`, `vote.tsx` and
  `settled.tsx` (the photo, signed by `usePhoto`).
- **A house is three places, as tabs** (`src/app/(house)/_layout.tsx`, Expo
  Router's JS tabs from `expo-router/js-tabs`): Today, Week and House,
  labelled from `SECTION_LABEL` in core. `HouseTabBar` draws them along the
  bottom of a phone and as a left rail from `WIDE` on the web. There is no
  header strip: each screen draws its own `TitleBar`. The layout follows the
  house live (`useLiveHouse`) once for every tab, and mounts the John sheet
  and the toasts for all of them. JS tabs makes every file in `(house)` a
  tab, so nothing else goes there: House is a stack
  (`(house)/house/_layout.tsx`): the group page (`index.tsx`) and the pages
  it pushes, `wall`, `stake`, `people/[userId]` (a housemate's page) and
  the setup pages `johns` (with the house's groups), `rules` (with its
  admins), `away` (Days and time away: your preferences beside the house's
  time away) and `describe`
  (Describe your house, or Ask Jonz once there's a list, opened from the
  title bar's sparkles, `TitleBar`'s `ask`, through `useAskJonz()`, which from
  `WIDE` opens the same chat as a right-hand panel, `AskPanel`, instead; a chat:
  `components/house/setup-chat.tsx`, the one
  setup page not on `HousePage`, as its message box stays put under the chat). A new page goes in
  `(house)/house/`, built on `HousePage` (whose back goes to `/house`),
  keeping the tabs; one opened straight from a link still has House under
  it (the stack's `anchor`). The
  old `/wall`, `/stake` and `/table` links are the router's redirects in
  `app.json` (a phone, and links inside the app) and, the same three, the
  host's in `vercel.json` (a web page opened cold on one, where the router's
  own redirect screen would leave `/house/house/wall` in the address bar);
  `vercel.test.ts` keeps the two lists alike. The pages merged into
  others on 1 Nov (`groups`, `admins`, `prefs` and `history`) stay as route
  files that only `<Redirect>` to the page they joined, with an absolute
  href (so no `/house/house/…`): History's lands on the Wall with
  `?view=history`, a query the router's redirects can't carry.
- **What a house screen shows comes through React Query**
  (`@tanstack/react-query`; `QueryProvider` in `hooks/query.tsx` wraps the
  root layout). One cache entry per house, `houseKey(id)` from
  `hooks/keys.ts`, holds `loadHouse`'s rows; `useHouse(houseId, userId)`
  builds the week from them with core's `buildWeekBoard` and `todayView` at
  the current minute (`useNow`), so statuses move on with the clock between
  reads, and the web and the app can't disagree. Screens never shape rows
  themselves.
- **A move** goes through `useMove(houseId).run(...)`: it runs, then reads the
  house again, and holds the refusal's sentence in `problem`.
- **Everything a house's screens read is keyed under `houseKey(id)`**
  (`hooks/keys.ts`): the Wall (`wallKey`), a receipt signed on its own
  (`photoKey`), the Table (`tableKey`), the Stake (`stakeKey`), the John
  list and its groups (`listKey`) and time away (`awayKey`) sit beneath it,
  so reading the house again (a move, a Realtime change, catching up)
  refreshes them too. A reaction (`useReact` in `use-wall.ts`) shows at once and goes back
  if the database says no: React Query's optimistic update.
- **Live:** `useLiveHouse(houseId)` listens on Realtime to what
  `supabase_realtime` publishes (`events`, `assignments`, `disputes`; never
  `members`) with the user's token, and folds a burst into one read. Coming
  back to the app refetches anyway (`QueryProvider` turns AppState into
  React Query's focus).
- **Screens that show a house catch it up as they come into view** with
  `useCatchUp(houseId)` (`useFocusEffect` → `catchUp`), as a web page load
  does, and use the function it returns for pull to refresh. The server ticks
  at most once a minute per house, so calling it freely is fine. When the
  server did something, a read already on its way is started again (React
  Query would otherwise fold the new read into the old one).
- **Photo receipts** (`api/photos.ts`): `expo-image-picker` for the camera or
  the library (on the web, the browser's file chooser), shrunk with
  `expo-image-manipulator` to core's `proofSize` as a JPEG, uploaded to the
  private `proofs` bucket at core's `proofPath`, then `mark_done` with that
  path. The camera and photos permission sentences are the image picker
  plugin's options in `app.json`; the microphone is never asked for. A
  refusal is a sentence on the card, never a crash.
- Shared code by default. Use platform files (`.ios.tsx`, `.android.tsx`,
  `.web.tsx`) or `Platform.OS` only where behaviour truly differs.
- Web is a single-page build: keep `"web": { "output": "single" }` in
  app.json. Vercel's `jonz-web` project serves it from `vercel.json`
  (`src/__tests__/vercel.test.ts` says why each line is there), taking over
  the site from `apps/api`'s pages at the hosting cutover (Phase 13,
  DEPLOYMENT.md). With `EXPO_PUBLIC_API_URL` unset, as in production, the
  web build calls `/api/*` on its own origin, which passes it on to
  `apps/api`; the e2e serves it the same way (`e2e/serve-client.mjs`
  follows `vercel.json`).
- `public/` is copied to the web build's root. `index.html` is the page
  every route is served from (Expo fills in `%LANG_ISO_CODE%` and
  `%WEB_TITLE%`): the description, theme colours and home-screen tags the
  web's layout has. Beside it the web's `manifest.webmanifest`, icons and
  `sw.js`, at the same paths and scope, so a phone that installed the site
  or turned on reminders keeps both. `src/__tests__/web-files.test.ts`
  checks them against core's words and colours. They are the only copies:
  `apps/api` has no pages or `public/` since Phase 14.
- A pasted jonz.app link's card (iMessage, WhatsApp, Slack): `index.html`
  carries the brand card's tags for every page, but the bots that draw cards
  don't run the app, so `vercel.json` sends them by user agent to
  `apps/api`'s `/api/share/*`, which answers with the page's own card: a join
  link's names its house, drawn per house by `/api/og/join/[code]`. The words
  and paths are in `packages/core/src/share.ts`.
- When a change adds a native module or config plugin, say clearly that a
  new development build is needed. The image picker and manipulator (Phase
  6) are native modules: a build from before them can't take a photo.
- Environment: copy `.env.example` to `.env.local`. Only `EXPO_PUBLIC_`
  values go here: Supabase's URL and publishable key, Google's web and
  iOS client IDs (public; DEPLOYMENT.md says where they come from), and the
  VAPID public key for reminders on the web (without it, House offers none;
  never the private key, which stays in `apps/api`'s Vercel environment).
  `app.config.ts` turns the iOS client ID into Google's URL scheme; without
  it the build works, minus Google sign-in on iOS.
- Sign-in uses native modules, so Expo Go can't sign in: use a development
  build (`npx expo run:ios` / `run:android`). The web build signs in as-is.
- Store releases are switched off in the root `release-targets.json`, and
  `npm run release:ios` / `release:android` refuse until they're on. Never
  run them, `eas build` with a production profile, `eas submit` or
  `eas update` without being asked.

- Help and tours (`src/components/tour/`, spec
  `docs/specs/help-and-tours.md`): the title bar's question mark opens
  `HelpSheet`; `TourProvider` in the house layout plays tours. A new tour is
  a `TOURS` entry in `@app/core` plus `<TourSpot id=…>` round each part it
  lights; never position a tour card by hand. Light components import
  `useTour` from `tour-context.ts`, not the provider.

### Bin Night in React Native

The rules themselves (what to use where, on a phone and a laptop) are in
`docs/style/`; this section says where they live in this app's code.

- **One theme file**, `src/theme.ts`. Colours come from `useTheme()`, which
  reads `BIN_NIGHT` from `@app/core`; never write a colour anywhere else.
- **Type:** Overpass, loaded behind the splash screen in `_layout.tsx`. Text
  goes through six roles (`useTheme().type`, drawn by `components/text.tsx`):
  `Title` (once per screen, in the title bar), `Lead`, `SectionLabel`,
  `RowTitle`, `Body` and `Meta`, never an inline size. Only the title is in
  caps: a section is named in sentence case, as a heading, never a small
  tracked-caps label over it. `type.caps` (12 tracked caps) is only a grid's
  small print (a calendar's weekdays, a table's column heads) and a
  `StatusMark`'s word. A meta line joins its facts with commas, or makes them
  a sentence, never " · ". `Heading` stays for
  the brand pages (the front door, sign-in, joining) and the pages for a
  missing link or a screen that failed to draw. On iOS and Android each
  weight is its own family, so a style names the family from `FONT`;
  `fontWeight` alone falls back to the system font.
- **The fonts are patched copies**, in `assets/fonts`: Overpass 400, 700,
  800 and 900 from `@expo-google-fonts/overpass`, with one change. Overpass
  calls its middle dot a mark, and a text shaper gives a mark no width, so
  a " · " drew its dot on the space after it ("Bathroom ·tomorrow"). In
  these copies the dot is a base glyph and keeps its width; nothing else
  differs. (Meta lines no longer use the dot, but anything that does draws
  it right.) The README there has the command that made
  them (run it again after upgrading the package), and `theme.test.ts`
  checks the dot in each.
- **Signage:** `Wordmark` (the road sign) and the full `HazardTape` belong to
  the brand pages and the invite sheet (`Sheet`'s `tape`, with the code in
  big caps). Inside the house the sign shows in three places: Today's next
  John on a `StreetPlate` (white, the inset ink border, the name in
  `type.plate`; the border turns hazard once it's overdue), each John's
  `TickBox` (a small square plate with the sign's border) and the tab icons,
  stroked as the J is. Tape is otherwise only a row's 4pt edge on an overdue
  or missed John, a lid colour only a `LidBar` before a John's category, and
  where a John has got to a `StatusMark`. Decoration is `aria-hidden`.
- **Controls** are at least `TAP` (48) tall; links get the same target
  (`TextLink`, or `Button` with `href`, which is an anchor on the web).
- **`Link asChild` merges its child's style by spreading it**, so a child
  given a style function or array loses it all. Give it one flat object
  (`StyleSheet.flatten`), as `Button` does.
- **Light and dark** both ship and follow the system, unless you choose
  Day or Night under House, You (`hooks/look.tsx`); `useTheme()` reads that
  choice.
- **A chosen, ticked or pressed state is an `aria-*` prop**
  (`aria-checked`, `aria-selected`, `aria-disabled`; `aria-pressed` on the
  web only, which React Native lacks), never `accessibilityState`, which
  react-native-web ignores: a screen reader on the web would hear nothing
  chosen.
- **Icons: lucide on every platform, an override of the template.** The
  template asks for native tabs with SF Symbols on iOS and Material on
  Android. Johns uses `expo-router`'s JS `Tabs` with `lucide-react-native`
  icons everywhere, because a native tab bar needs SF Symbols or bitmaps,
  which breaks "lucide icons only" and the Bin Night look. It gives up the
  system tab bar's Liquid Glass on iOS 26. This is deliberate: don't "fix"
  it, and don't add `expo-symbols`, `expo-glass-effect` or `@expo/ui`.
- **No emoji**, reactions included: `src/no-emoji.test.ts` scans `src/` and
  `app.json` and fails on any.
- Responsive: tabs along the bottom on a phone; on web from 1024px (`WIDE`) a
  left rail of the same three, the content capped at 680 (`CONTENT_MAX`) on
  every tab, and Week as a table.

### Tests

Jest with `jest-expo` and React Native Testing Library (`npm test -w
apps/client`, or `npm test` from the root for everything). Tests sit beside
what they test (`<name>.test.ts(x)`), except screens', which live in
`src/__tests__/app/` (see `src/app/` above). Pure logic belongs in
`@app/core` with Vitest; tests here cover screens, components, the theme and
`src/api` with Supabase and the sign-in modules mocked. A screen that uses
the router renders through `renderRouter` from `expo-router/testing-library`;
the root layout's guard is tested that way with stand-in screens.

- `jest.setup.js` swaps in `react-native-safe-area-context`'s own Jest mock,
  so a component that reads the safe area renders alone, and an in-memory
  `authStorage` for `src/api/storage` (the real one opens SQLite, a native
  module); a test that reads what's saved clears it first.
- A layout that reads the window's width is tested at both sizes by
  mocking `react-native/Libraries/Utilities/useWindowDimensions` (see
  `week.test.tsx`).
- `src/testing/`: what tests share, never imported by the app.
  `testQueryClient()` gives each test its own cache with no retries and no
  garbage collection (its five-minute timer would keep Jest running after a
  test that leaves a read pending); `house.ts` builds a house as `loadHouse`
  reads it, dated around the real clock. A screen that reads a house renders
  under a stand-in `_layout` with `QueryClientProvider` and `Slot`.

The web build also runs end to end, in `apps/api`'s Playwright
(`e2e/client-*.spec.ts`): it is exported against the local stack and served
on 8205, and `e2e/auth.ts`'s `signInToClient` puts a session in
localStorage; `dealtHouseInClient` sets up a house with this week dealt,
housemates included. The tabs keep a screen you've left laid out (just not
shown), so a test that counts something two screens show scopes itself to
one screen's `testID` (`Screen` takes one).

This project uses `@testing-library/react-native`. Its APIs and testing conventions can differ from your training data.
Before writing or changing RNTL tests, read the relevant guide in
`node_modules/@testing-library/react-native/docs/`, starting with
`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`.
Prefer those package docs over stale assumptions, and follow deprecation notices.

- RNTL 14: `render`, `rerender`, `fireEvent` and `act` are async. Await them.
- Queries skip `aria-hidden` elements; pass `{ includeHiddenElements: true }`
  to find decoration such as a `LidBar`.
- `jest.config.js` maps `lucide-react-native` to its CommonJS build, because
  its React Native entry is an ES module Jest can't load.
- TypeScript 6 no longer loads every `@types` package, so `tsconfig.json`
  names `jest` and `node`.
