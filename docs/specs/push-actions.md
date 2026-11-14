# Answer notifications without opening the app

## What it does

A reminder says which John is due and when, with a **Done** button that
ticks it. A housemate check ("Vote: was Bins really done?") has **It was
done** and **It wasn't**. Each person chooses which kinds of push they get
and can set quiet hours. The point: a housemate who never opens the app can
still keep up (the most common complaint in competitors' reviews).

This is the first of three steps. Native push on iPhone and Android, with
the same buttons, is the second (Phase 12 of `native-migration.md`). The
home-screen widget is the third, once there's a native build.

## Inputs and outputs

- **The push** (`apps/api/lib/push.ts`, `PushPayload`): `title`, `body`,
  `url`, `tag` (a later push for the same John replaces the earlier one),
  `silent`, `actions` and `token`. Reminders: "Bins is due tomorrow" /
  "Due tomorrow 19:00. Tick it here when it's done." A John that needs a
  photo gets no button and says to tick it in the app.
- **A button** posts `{ token, action }` to `POST /api/push-actions`
  (`PushActionRequest`; `action` is `done`, `held` or `struck`) and gets
  back `{ ok, title, body }` (`PushActionResponse`), which the service
  worker shows in place of the notification ("Bins ticked").
- **The token** (`lib/push-token.ts`): `base64url({ u, a | d, e }).hmac`,
  keyed from the VAPID private key. It lets its holder do one thing, as one
  person, for 8 days. `push_action` (service role only) then calls
  `mark_done` or `cast_vote` as that person, so every rule (their own John,
  a photo, the vote still open, not your own tick) is the app's.
- **Settings** (`notification_prefs`, one row per person, `@app/core`
  `notify.ts`): Johns due soon, housemate checks, on-call flags, the week's
  deal, each on or off; quiet hours Off, 22:00–07:00 or 23:00–08:00, in the
  device's zone. In House → You → Reminders, once reminders are on.

## Edge cases

- Quiet hours: a reminder waits (it isn't claimed) and goes out on the first
  tick after they end, if the John is still due. A dispute, a flag or the
  deal arrives at once, without a sound.
- A kind switched off: reminders are claimed without sending, so they don't
  arrive late if it's switched back on.
- Pressed twice, or on two devices: the second says "Bins was already ticked".
- A refused button (photo needed, vote closed, expired token) replaces the
  notification with the reason; tapping it opens the app.
- No VAPID key: no pushes and no tokens, as before.

## Platforms

- **Web**: Chrome, Edge and Firefox on Android, Windows, macOS and Linux
  show the buttons. **Safari, iPhone home-screen web apps included, shows
  the notification but no buttons**; tapping it opens Today, as now.
- **iOS and Android apps**: step 2. `expo-notifications` categories give the
  same buttons, posting the same token to the same route.

## Done when

- [x] Reminders name the John and its due time, once per stage (db test).
- [x] Done ticks as the owner; a photo John, someone else's John, a forged
      or expired token, or the wrong button are refused (db test).
- [x] A vote from a notification counts, and a majority decides at once
      (db test); the ticker can't vote on their own tick.
- [x] Settings are yours alone (RLS test); off and quiet hours are obeyed.
- [x] The service worker shows buttons, posts them, and shows the answer
      (unit test against a stand-in browser).
- [ ] Checked by hand in Chrome on Android with a real push.

## Where things go

`packages/core/src/notify.ts` (kinds, quiet hours, schemas),
`NOTIFY_COPY` (now the words files), `supabase/migrations/*_notification_prefs.sql`,
`apps/api/lib/push.ts`, `lib/push-token.ts`, `lib/moves/push-actions.ts`,
`app/api/push-actions/route.ts`, the reminders in `lib/engine/remind.ts`,
`apps/client/public/sw.js`, `apps/client/src/api/notification-prefs.ts`,
`src/components/house/notification-settings.tsx`.
