# Promotions

The owner gives out money off the House Pass, some months free, or a free
Pass, with one link. Picked by Glyn on 2026-11-07 (all A on the options
page): the admin page is a form with its preview beside it, like Messages;
each promotion has one link to copy or share, and an Email them button for
the people it names; the link opens a taped sign like a join link, and in a
chat it shows the offer on the sign.

PR 1 was the backend; PR 2 the admin page (below). The link's page and its
picture come next, built on what's here.

## What a promotion gives

| Kind | What it is | Stripe |
| --- | --- | --- |
| `percent` | 1 to 100% off | a coupon and one promotion code |
| `amount` | money off, typed in dollars; the other currencies follow the Yearly price's ratio, to the whole unit (`promotionAmounts`) | a coupon with `currency_options`, and one code |
| `trial` | 1 to 24 months free before the first charge, on Yearly or Monthly | none: a later `trial_end` |
| `gift` | a free Pass with no card: some months (a free month made longer), or for good (a Founding house) | none |

Money off lasts for the first payment (`once`), some months (`months`), or
every payment (`always`). A promotion works on the plans it names (Yearly,
Monthly, Founding house); a free Pass on none of them.

## Who can use it

- **Anyone with the link** (`anyone`), up to a number of houses if the owner
  sets one.
- **Only these people** (`named`): up to 500 emails. It works only for
  someone signed in to Jonz with one of them, once each.

Every promotion works once a house, and can end on a day.

Stripe can only tie a promotion code to one of its own customers, never to
an email, so **Jonz checks the email itself**, at checkout, against the
email the buyer is signed in with (`offerRefusal` in
`packages/core/src/promotions.ts`). Only then does Checkout get the code, as
`discounts: [{ promotion_code }]`. Checkout never shows Stripe's own code box
(`allow_promotion_codes` is off), so no code reaches Stripe any other way.
The Stripe promotion code is named by Stripe and never typed by anyone.

## Where it lives

- `supabase/migrations/20261130090000_promotions.sql`: `promotions`,
  `promotion_people` (the named emails, with when each opened the link, was
  emailed and used it) and `promotion_uses` (one per house, and per Checkout
  Session). Nobody reads them through the API: the owner reads and writes
  through `owner_` functions, which check it's them with their code and write
  `admin_audit` (`promotion.make`, `promotion.stop`, `promotion.email`, by id
  and counts, never the emails); apps/api uses the service role.
- `packages/core/src/promotions.ts`: the words ("Half off", "Half off your
  House Pass", the sentence), what each plan costs with it, the form's checks,
  and the check at checkout. `offerEmail` in `email.ts`.
- `apps/api/lib/moves/promotions.ts`: make, set up in Stripe, stop, email,
  check, give a free Pass, record a use, and the link's view.
- `apps/api/lib/pass/stripe.ts`: `OfferStripe` (a coupon and a code, made
  once however often tried; turning a code off) and Checkout's `discounts`.

## The API

- `POST /api/admin/promotions`: make one (`PromotionRequest`). Money off goes
  live once Stripe has its coupon and code; if Stripe can't be reached it's
  saved as `making` and `ready: false` comes back.
- `POST /api/admin/promotions/:id/retry`: Try again for one still `making`.
- `POST /api/admin/promotions/:id/stop`: it stops working from now, and its
  Stripe code is turned off. Houses that used it keep what they got.
- `POST /api/admin/promotions/:id/email`: Email them. Each named person who
  hasn't been sent it or used it gets the offer email, once however often
  it's pressed.
- `GET /api/offer/:code`: what the link shows (`OfferView`). Anyone sees what
  it gives; signed in, also whether it's for them and on which of their
  houses it works. Never who else it's for. Opening a named one signed in as
  one of its emails is noted for the owner.
- `POST /api/pass/checkout` takes `offer`, the code from the link. A free Pass
  is given there and then and answers the Pass page; anything else goes to
  Stripe Checkout as before.
- The owner's lists read `owner_promotions_page` / `_count` (search by name,
  code or an email on it; filter by who and state) and `owner_promotion` (one,
  with its people and its last 20 uses).

The webhook records a use when Checkout completes with `metadata.promotion`,
once per Checkout Session. Stripe's own limit on the code (as many as it names,
or the owner's limit) holds at checkout; a free Pass is taken under the
database's lock (`promotion_use` with `p_strict`).

## The admin page

Promotions is the third page of the owner's Send tab, after Messages and
Notices (`ADMIN_GROUPS` in `packages/core/src/owner-admin.ts`).

- `/admin/promotions`: the form, with What they get beside it on a laptop
  (the headline and sentence, what each plan costs with it, who can use it)
  and a sheet on a phone; Recent under it. The code in the link is made from
  the name until the owner types their own. Make it opens its page.
- `/admin/promotions/all`: every promotion as a busy list, found by name,
  code or an email on it, filtered by who and state.
- `/admin/promotions/[id]`: what it gives and who can use it, the link to
  copy or share, Email them (named), Try again (still `making`), Stop it, and
  beside it who it's for (Used, Opened, Emailed, Not yet) and the houses that
  used it.

The form's words, the form as typed made into a `PromotionRequest`, and how a
promotion reads in the lists are `packages/core/src/owner-promotions.ts`.

## Before it's live

The live restricted key `jonz-api` needs **Write** on **Coupons** and
**Promotion codes** (Stripe dashboard, Developers, API keys). Without them
money off is saved but stays `making`, and Try again works once they're added.
Months free and a free Pass need nothing from Stripe.
