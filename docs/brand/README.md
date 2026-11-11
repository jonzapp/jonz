# The Jonz brand

<img alt="Jonz" src="readme-banner.png" width="640">

Jonz wears Bin Night, the app's house style: council signage on a street at
night. This page is how the brand is used outside the app's own screens, and
where every image goes. Every image here is drawn from one mark by
`npm run brand` (`scripts/brand.mjs`); change the mark in
`packages/core/src/mark.ts` or a colour in `packages/core/src/bin-night.ts`
and run it again.

## The logo

| | |
| --- | --- |
| ![The sign](icon-512.png) | **The sign** is the J in its road-sign frame on hi-vis amber. It stands alone wherever the name is already said: the app icon, the favicon, a profile picture, a notification. |
| ![The lockup](lockup.png) | **The lockup** is the sign beside JONZ in Overpass Black, in caps. Use it where people meet Jonz for the first time: the front door, a card, an email, the README. On dark grounds use `lockup-on-dark.png`, where the sign is drawn in amber on the ground. |

- Give it clear space all round about one J stroke wide, the frame's corner radius.
- Never recolour, stretch or rotate the sign. On amber it is inked in tarmac. On a dark ground it is drawn in amber with no tile, as the dark app icon and the app's own lockup after dark are.
- Never put an amber box with black or white words on black. That pairing is another brand's logo (an adult site's), and an amber sign on black reads as it at a chat's thumbnail size. Signs go on the pavement.
- Below 48px the small-size master takes over (`SIGN_SMALL`), with a heavier frame and a bigger J, so the lines hold up in a browser tab. `favicon.svg`, `favicon.ico` and the app's own lockup at small sizes use it.
- The name is "Jonz" in a sentence and JONZ in the lockup. One chore is a John.

## The sign

Anything Jonz says out loud is posted as a road sign: a link's card, the
README banner, the email header, a store headline. The amber plate carries
the J at its left like a route shield, and the legend in Overpass Black
caps; under it hangs a pale plate with the small print, as a
supplementary plate hangs under a road sign. Both plates have an ink border
inset from the edge (`PLATE` in `packages/core/src/mark.ts`), and the
assembly is posted on the pavement, never on black.

![The JONZ sign, every jonz.app link's card](../../apps/client/public/og.png)

- A sign is as wide as its words. The legend is a name or five words at
  most; the plate under it is one short sentence.
- The house's own sign swaps JONZ for the house's name: the J says it's
  Jonz.
- No eyebrows, no labels over the legend, and no strings of words joined
  with dots. If the small print needs two ideas, it is two sentences.

## Colour

| Colour | Hex | Job |
| --- | --- | --- |
| Hi-vis amber | `#F6B800` (`#FFC21A` after dark) | The one thing to do, the sign, buttons that matter. A fill with tarmac on it, never text on a light ground (1.5:1). Road-sign amber, kept on the yellow side of orange. |
| Tarmac | `#16181A` | Ink. Never the ground of a sign. |
| Pavement | `#E7E9E5` | The light ground, and the ground every sign is posted on. |
| Wet tarmac | `#111315` | The dark ground. |
| Hazard | `#C8410C` | Late and missed only. |
| Done | `#2E7D32` | Done only. |

The bin-lid colours (one per kind of John) live in the app and stay out of
marketing. Tarmac on amber is 10:1, tarmac on pavement 14.6:1.

## Type

Overpass, the one family (open licence, `apps/client/assets/fonts`). Black
900 in caps for the wordmark, screen titles and headlines of five words at
most; Bold 700 for leads and row titles; Regular 400 for sentences;
ExtraBold 800 in tracked caps for small labels. Figures are tabular. Where
the font can't load (an email), headlines go in an image and text falls
back to Arial or the system's sans.

## Voice

A good council notice written by a housemate: plain, short and fair, with a
dry joke now and then. It states the rule and never scolds.

| Say | Not |
| --- | --- |
| Bins out tonight. | Don't forget to take the bins out!! |
| Sam's John is 3 hours late. | Sam failed to do the dishes. |
| Your Johns for the week | Your assigned tasks |
| The bathroom moves around. | Say goodbye to chore drama forever |

No emoji and no exclamation marks, in the app or out of it. The tagline is
"Fair shares of the housework, and a house that keeps score."; the short
form is "Fair shares of the housework." The social handle is @jonz.app.

## Where each image goes

| Where | File | Size |
| --- | --- | --- |
| iOS app icon, light, dark and tinted | `apps/client/assets/images/icon.png`, `icon-dark.png`, `icon-tinted.png` | 1024 |
| Android adaptive icon (and themed) | `android-icon-foreground.png`, `android-icon-monochrome.png`, amber background in `app.json` | 1024 |
| Splash | `splash-icon.png`, the rounded tile on the ground colour | 1024, shown at 96 |
| Browser tab | `apps/client/public/favicon.svg`, `favicon.ico` (16, 32, 48) | |
| iPhone's Add to Home Screen | `apple-touch-icon.png` | 180 |
| Installed web app | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | 192, 512 |
| Any jonz.app link pasted in a chat | `og.png` | 1200×630 |
| A join link pasted in a chat | drawn per house by `apps/api/app/api/og/join/[code]` | 1200×630 |
| Email header | `email-header.png`, shown at 600×120 | 1200×240 |
| An email's top bar, a notice's icon, hazard tape | `apps/client/public/email/sign.png` (shown 85×34), `notice-*.png` (48), `hazard-tape.png` (a 16×12 tile); served from jonz.app/email | 3x |
| Repo social preview | `social-preview.png` | 1280×640 |
| README banner | `readme-banner.png`, the same in GitHub's light and dark | 1280×360 |
| README's app pictures | `readme-screens.png`, the first three iPhone frames side by side, shown at 720 so a phone shrinks it whole | 1880×1300 |
| Stripe, App Store and Play icon | `icon-512.png`, `icon-1024.png` | 512, 1024 |
| Google sign-in screen | `logo-120.png` | 120 |
| Profile picture (Instagram, TikTok, X) | `profile-400.png` | 400 |
| Google Play feature graphic | `play-feature.png` | 1024×500 |
| Store screenshots | `store/ios-*.png` (6.9-inch iPhone), `store/play-*.png` | 1290×2796, 1080×1920 |

The store frames put a five-word headline over a phone screenshot. Make them
from fresh screenshots of the app (the e2e run takes them) with
`npm run brand -- --store today.png week.png …`; each screenshot gets the
next headline in `STORE_HEADLINES`, and the first three make
`readme-screens.png` (Today, Ask Jonz, a family's Today).

## Link previews

A jonz.app link pasted into iMessage, WhatsApp, Slack, Telegram, Discord or X
shows a card. Every page's card is `og.png`, the JONZ sign, titled with the
page's name ("The Wall · Jonz"). A join link's card is the house's own sign:
its name beside the J, and "Join 4 housemates on Jonz." on the plate under
it, the two things the join page shows anyone who signs in. It never shows
the code. A reset or dead link's sign says "Invite expired". The bots that
draw cards don't run the app, so `apps/client/vercel.json` sends them, by
user agent, to `/api/share/*` on the API, which answers with just the card's
tags. `SHARE_NAMES_HOUSE` in `packages/core/src/share.ts` keeps the house's
name off, and the card shows the JONZ sign instead.

Chat apps keep a card for a while. To see a changed one, paste the link with
`?v=2` on the end.

## Outside the app, by hand

These take a logo by upload. Each works from a phone except where it says.
For GitHub in Safari, tap **aA**, then **Request Desktop Website**.

1. **Stripe** (Checkout, the billing page and receipts). Open
   [Branding settings](https://dashboard.stripe.com/settings/branding):
   icon `icon-512.png`, logo `lockup.png`, brand colour `#F6B800`, accent
   `#16181A`. Do the same in the sandbox. Under
   [Emails](https://dashboard.stripe.com/settings/emails), turn on
   successful payment receipts so they carry the brand.
2. **Google sign-in** (the "Jonz" Google Cloud project). Open
   [Branding](https://console.cloud.google.com/auth/branding): app name
   Jonz, logo `logo-120.png`, home page `https://jonz.app`, privacy policy
   `https://jonz.app/privacy`. Adding a logo sends the app to Google's brand
   check, which takes a few days; sign-in keeps working meanwhile.
3. **Microsoft sign-in**. Open
   [App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade),
   then Jonz, then **Branding & properties**: logo `icon-512.png`, home page
   `https://jonz.app`, terms `https://jonz.app/terms`, privacy
   `https://jonz.app/privacy`. Under **Publisher domain**, choose Update,
   then Verify a new domain, and enter `jonz.app`: Microsoft reads
   `/.well-known/microsoft-identity-association.json` (in
   `apps/client/public`). The consent screen still says "unverified" until
   the publisher is verified, which needs a business Microsoft AI Cloud
   Partner Program account and an `@jonz.app` email.
4. **GitHub**. Open the repo's
   [Settings](https://github.com/jonzapp/jonz/settings), then **Social
   preview**, then **Edit**, and upload `social-preview.png`.
5. **App Store Connect and Google Play**, once the accounts exist: icon
   `icon-1024.png` (Apple) or `icon-512.png` (Play), the store frames and
   `play-feature.png`.
6. **Instagram, TikTok and X** as @jonz.app: profile picture
   `profile-400.png`, which every app crops to a circle safely.
