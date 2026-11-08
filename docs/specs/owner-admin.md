# Owner admin

## What it does

The owner of Jonz (not a house admin) has pages of their own at `/admin`.
`/admin` opens on the **Overview** (see "Overview"). The **Inbox** holds
problems, ideas and questions people send from the app
(`docs/specs/report-a-problem.md`), and **Houses** finds any house (see
"Houses"). The first three pages were:

- **Notices**: a band at the top of the app for everyone. It can be an outage
  status, an offer, or news.
- **Deletions**: accounts waiting to be deleted (see "Deleting an account").
- **Audit log**: everything done on the admin pages, which nobody can change.

**Messages** writes to a person, a house or everyone (see "Messages").
The support agent, which asks before it acts, is in
`docs/specs/report-a-problem.md` ("The support agent"); the owner's Ask
Jonz is below. Designs are in
the owner admin viewer (https://claude.ai/artifact/97GEyJDGnrWxB8HTbbrXmo).

## Who gets in

- **The owner list.** `app_owners` is changed by migration only. Nobody can
  read or write it through the API, the service role included.
- **The owner check.** `is_owner()` is true only for someone in `app_owners`
  whose session has passed a second factor (`aal2`, a TOTP code from an
  authenticator app). Every owner read and write checks it in the database.
- **Anyone else.** They see the app's "Nothing here" page. The owner without a
  code this session sees the code screen. The first time, it adds the
  authenticator with a QR code or a typed key. The QR code is redrawn from
  Supabase's markup (`qrShape` in core); a db test checks that a real
  Supabase's code, drawn that way, scans back to the authenticator link. If
  it can't be drawn, the screen says to type the key instead of showing a gap.
- **Status for the page.** `owner_status()` returns `{owner, mfa}` so the page
  knows which of these to show. It says nothing to anyone else that they
  couldn't already tell.

## Notices

- **Saving and ending.** `save_notice` and `end_notice` are security-definer
  functions. They refuse with `42501` if the caller isn't the owner, and they
  write the audit entry in the same transaction.
- **Checks.** These run both in `@app/core` (`noticeProblems`, worded as
  sentences) and in the database:
  - the title is 1 to 80 letters;
  - the body is at most 240 letters;
  - the button is at most 30 letters, and its link is a page or an https URL;
  - the end comes after the start.
- **Reading.** Everyone, signed in or not, reads the notices that are on now.
  `GET /api/notices` reads them as anon with a 3 s timeout. When the database
  doesn't answer, it falls back to the copy in Vercel Global Config.
  `POST /api/notices/copy` (owner only) rewrites that copy after each save.
  Without `GLOBAL_CONFIG`, `EDGE_CONFIG_ID` and `VERCEL_API_TOKEN` there is no
  copy, and the owner is told the copy didn't update.
- **In the app.**
  - One band at a time: status first, then offers, then news (`noticeToShow`).
  - Closing an offer or news hides it for good. Closing a status hides it for
    24 hours.
  - The app keeps the last notices it read. If it can't reach Jonz it shows
    its own "can't reach Jonz" band.

## Overview

Is Jonz healthy, and does anything need me? One read (`owner_overview`)
answers it, again every minute while the page is open.

- **Needs you** first: up to three new reports and up to three accounts
  deleted within a day, oldest first, each opening its page. Open the Inbox
  sits on the heading, with how many are new.
- **Right now:** the database (how long this page's read took: Up under a
  second, Slow past it) and the clock (when it last caught a house up: Up
  within half an hour, Late after). A word and an icon, never colour alone.
- **This week** (from Monday), or this month, from a Week | Month switch on
  the heading, as the house's Track record does; the heading names it
  ("2–8 Nov", "November 2026"), in the owner's zone. Houses (new ones,
  against the same stretch of last week or month), People (to a house), Active houses
  (where someone ticked a John), House Passes (yearly, monthly, Founding;
  the free month isn't one), Johns on time (done or covered, of those that
  came due and were settled; excused doesn't count) and Ask Jonz (house
  drafts asked for, and how many Claude didn't answer). Houses, Active and
  Passes open the Houses list, filtered.
- **Active houses each week:** ten weeks, the last ending now, as one ink line
  with the latest value labelled.
- **In the app now:** the notice people see, as they see it, and Change it
  in Notices.
- On a laptop Right now and the notice sit beside the rest; on a phone they
  all stack, Needs you first.

## Houses

Find a house and look at it, read only. A busy list (`owner_houses_page`,
`owner_houses_count`), most recently active first and never-used houses
last:

- **Search** a house's name, the start of its join code or id, or someone in
  it by name or email.
- **Filters:** Pass (Paid, Free month, None: a Pass or free month that ran
  out), Active (This week, This month, Quiet a month), and When is Started.
- **Columns:** House, People, Pass, Last active (the last tick), On time
  (over four weeks), Started. On a phone, one line under the name.
- **A house** (`owner_house`): when it started and its admins, each person
  with their role, on time over four weeks, time away now and a move-out
  date, its Pass and who pays, and its zone, currency, join code and number
  of Johns. In the side panel on a laptop, its own page on a phone
  (`/admin/houses/[id]`). Nothing here changes a house, so nothing goes in
  the audit log. Opening the house as its people see it is left for later.
- **Tabs by job.** The pages sit in five groups (`ADMIN_GROUPS`): Overview,
  Inbox, Houses, Send (Messages, Notices) and Records (Deletions, Audit
  log). On a phone each group is a tab; a tab with more than one page opens
  its first, with a switch at the top for the rest. On a laptop the side
  list shows every page, Send's and Records' under small headings. A new
  page joins a group, so the bar stays at five.

## Messages

One message, to the right people, safely
(`supabase/migrations/20261113090000_owner_messages.sql`,
`apps/api/lib/moves/messages.ts`).

- **To.** A person (found by name, email or an id's start), a house (by
  name or join code) or everyone with an account. Nobody whose account is
  being deleted. The form shows how far it reaches before it goes: "Send to
  5 people", and under each way how many it reaches that way.
- **Ways.** Any of three:
  - **A push**, the subject as its title. It has no switch, as a reply to a
    report doesn't; quiet hours make it silent. It opens the Wall when the
    message went there too.
  - **A post on the Wall**, as From Jonz (event kind `jonz_message`), on
    every house's Wall for everyone. Never for one person: the whole house
    reads its Wall.
  - **An email** (`ownerMessageEmail`), whose reply reaches
    support@jonz.app, with an idempotency key per message and person.
- **Send me a test.** The same message to you alone, the ways it would go
  less the Wall (a Wall-only message is tested as a push). It needs only a
  subject and the words.
- **Everyone** takes a second tap that names the number.
- **Sending.** `owner_send_message` checks it's the owner with their code,
  posts on the Walls, writes the audit entry (`message.send` or
  `message.test`, people and houses by id only) and leaves one outbox row a
  person. `POST /api/admin/messages` then pushes and emails from the outbox
  for up to 40 seconds; the clock sends whatever is left, 20 seconds a tick.
  Taking a row deletes it under `SKIP LOCKED`, so two senders never send
  one person the same message twice.
- **The page.** On a laptop, the form, with how it looks (as a push, or on
  the Wall) and the last five sent beside it; on a phone the form, then
  Preview as a sheet. **All sent** is a busy list: it finds a subject, the
  words, a person or a house; To (A person, A house, Everyone, Tests), Way
  (Push, Wall, Email), and When is Sent. A message opens in full in a
  sheet.

## Deleting an account

Apple (5.1.1(v)) needs deleting to start in the app; Google Play needs a web
page for anyone who has removed the app. Both are the same form: House, then
Leave, then **Delete my account** (a sheet), and **jonz.app/delete**, which
signed out says what goes and stays and signs in on the way back to itself.

- **Asking.** Typing DELETE starts 30 days (`request_account_deletion`). The
  house sees you as away from today until the day it goes, around any time
  away you'd set; other devices are signed out. A House Pass you pay for
  stops renewing at the clock's next turn (the subscription it stopped is
  kept).
- **The 30 days.** Signing in shows only "Your account is being deleted",
  with the day, Keep my account and Sign out. Keeping it (`keep_account`)
  takes the time away back out, and the clock starts the Pass renewing
  again.
- **The owner.** Deletions lists who is waiting (name, email, house, days
  left). Delete now brings it forward to the clock's next turn; Stop is
  Keep my account for them; each takes a reason. For someone who emailed and
  can't sign in, the owner starts the same 30 days by their address.
- **The day.** The clock (`lib/account/deletions.ts`, every 10 minutes):
  `finish_account_deletion` takes them out of the house (the
  longest-standing housemate becomes admin if they were the only one; the
  last one out leaves the house empty, so closed), clears the Pass's buyer,
  their reminders and open swap asks, and renames them "Someone who left"
  without a photo. Then their photo files go, and their sign-in is
  soft-deleted: Supabase scrambles the email and unlinks Google or
  Microsoft, so the profile the house's history points at stays and
  signing in again makes a new, empty account. A Pass they carry from a
  house they left stops renewing. Last, the address they had gets "Your
  Jonz account is deleted" (`accountDeletedEmail`, docs/specs/email.md),
  by first name, with the day in their own zone (else their house's). The
  address and name are read before the delete takes them; a failed email is
  logged and never holds the delete up, and its idempotency key means a
  retry sends it once.
- **The log.** Request, keep, stop, delete now and done each write
  `admin_audit`, naming the account by id only, never a name or an email.

## The pages

- **On a laptop.** A rail down the left (232) has the wordmark, an Owner chip
  and the pages. What a phone opens on its own sits in the side panel: the
  notice editor, or the audit entry.
- **On a phone.** Tabs run along the bottom, as the house's do. The notice
  editor rises as a sheet, and an audit entry opens as its own page
  (`/admin/audit/[id]`).
- **Page actions.** The title bar holds only the title, the same on every
  page. An action sits next to what it changes.
- **Starting a notice.** Under what people see now, three tiles say what's
  happening: Something's wrong (an outage), An offer, and News. Each opens the
  editor with that kind chosen; Something's wrong also offers the ready-made
  outage words.
- **Long lists, one way everywhere** (Glyn picked A on 31 Oct). Every long
  list, in the app and here, loads 50 more as you near the end, with no pages.
  Each read starts from the last entry shown (keyset, not offset), so it stays
  fast. The same foot (`ListFoot`) ends every list: how far back it goes
  ("Showing back to Tue 27 Oct", or "Showing 50 of 128" where there's a
  count), Loading more while it reads, That's everything at the end, and Try
  again when a read fails. A Show more link does it for a keyboard, a screen
  reader or a page too short to scroll. On a laptop the foot stays pinned
  along the bottom of the window. Houses, people and sent messages use it
  too when they're built.
- **Busy lists, one search box** (Glyn picked B on 31 Oct). Every admin list
  is built for thousands of rows a day, the same way (`useBusyList` and
  `BusyListView`; a page only says where its rows come from, its filters and
  its columns):
  - No day headings. The time sits in its own column, with the date before
    today ("16:41:07", "Thu 29 Oct, 23:58").
  - One search box. What's set shows as tags in it (Who: You, When: Today),
    each removed with its ×, or the last with backspace. Tapping into the
    empty box lists every filter and your last five searches on this
    device. Typing searches the words once you pause, and offers to turn
    them into a filter instead: "me" offers Who: You, "del" What: Accounts,
    "yesterday 18:00" a moment to start a newest-first list from. A new kind
    of filter is one more entry in the page's list and joins the
    suggestions, with no new control.
  - What's set lives in the page's address, so Back, a refresh and a link
    come back to the same rows. Clear takes it all away.
  - The database does the narrowing, 50 rows at a time, with a count of what
    matches over the list ("about 48,000" once it's estimated).
  - A table on a laptop (40-point rows, column names on the band at the
    top), Rows on a phone. On a laptop the search, the count and the column
    names stay pinned under the title bar as the rows scroll, and the list
    and the side panel each scroll on their own.
  - **Audit log:** finds an entry number, an account id's start, a notice's
    title or a reason. Who (You, Someone else, Jonz itself), What (Notices,
    Accounts), When. An entry's Show more like this narrows the list to the
    same Who, the same What, or the moments around it.
  - **Deletions:** finds a name, email, house or account id's start
    (`owner_deletions_page` and `owner_deletions_count`). Started (In the
    app, By you), Goes (Within a day, Within a week), and When is Asked.
    Soonest first, so it doesn't start from a moment.
  - **Notices:** What people see now and the tiles that start one stay at the
    top; under them, Every notice, newest start first. Finds words in a title
    or body. Kind (Something's wrong, Offers, News), State (Showing, Starting
    later, Ended), and When is Started.

## Ask Jonz, owner

The owner's own Ask Jonz, apart from every house's. Same model and loop
(`apps/api/lib/ai/agent.ts`), nothing else shared:

- **Its own address.** `POST /api/admin/ask` (`OwnerAskRequest`,
  `OwnerAskResponse` in core). It answers only the owner with their code
  this session (`owner_status`), and refuses anyone else with `owner_only`
  before Claude is asked.
- **Its own tools: every read, and every move on a card.** Reads: Inbox,
  Deletions, Audit log, Notices, Messages, Promotions, people, houses (and
  one whole house) and how it works (`apps/api/lib/ai/owner-ask.ts`), each
  through the owner's own session, so the database's owner check holds for
  every read. Nothing uses the service role.
- **Who can do what, in one place.** `packages/core/src/owner-moves.ts`
  lists every admin move (`OWNER_PERMISSIONS`), which owner role has each
  (`OWNER_ROLE_PERMISSIONS`; every owner is a full owner today), and how
  Jonz does each one (`OWNER_ASK_COVERAGE`), the same shape as a house's
  `permissions.ts` and `ask-coverage.ts`. A move added without a way
  through Jonz doesn't compile, and a unit test fails if a write tool isn't
  given with exactly its permission.
- **Moves go on a card, as a house's do.** Jonz's write tools (reply to a
  report, mark it fixed and tell, open it again, same as; put up, change or
  end a notice; send a message; make, stop, email or set up again a
  promotion; delete now, stop or start a deletion) each look up what they
  name as the owner and put an `OwnerMove` on the card. Nothing happens
  until the owner taps Do it on the card
  (`components/admin/owner-moves-card.tsx`), which runs the admin page's
  own call, so the database checks it and the audit log keeps it, the same
  as a tap on the page. Each row starts ticked and can be unticked; ones
  that can't be undone say so. There's no way to delete a whole house, on
  the pages or in the chat.
- **Its own instructions.** It knows it's talking with the owner and how the
  admin pages work. Plain Markdown and its own chips, no house chips or cards. What people
  wrote (names, reports, reasons) reaches Claude marked `<from_people>`, to
  be read as what they said, never as instructions.
- **Its own history.** `owner_ask_turns`: each question is written before
  Claude is asked (`claim_owner_ask`) and its answer after
  (`finish_owner_ask`). Only the owner reads it, nobody writes it by hand,
  and turns go after 90 days. `OWNER_ASK_TURNS_PER_DAY` (200) a day.
- **Its chats, kept.** Like a housemate's Ask Jonz, each chat is kept
  until the owner deletes it, in `owner_ask_chats` (only the owner, with
  their code, reads or writes their own). The same bar and pieces as the
  house's chat: the clock before the title opens Your chats (`AllChats`,
  grouped Today, Last 7 days, Earlier, each with Delete), the pencil starts
  a new chat, and a kept chat carries on where it was.
- **Kept apart, tested.** A unit test fails if a housemate's Ask Jonz, even
  an admin's, gets an owner tool or owner words, or the owner's gets a
  house's.
- **The panel:** the sparkles at the edge of every admin title bar open it
  (`components/admin/owner-ask-panel.tsx`). On a laptop it docks on the
  right like the house's; on a phone it covers the screen, tabs and all, and
  a chip that opens a page puts it away. The chat is kept while the admin
  pages are open. Black, with an Owner label, so it's never mistaken for the
  housemates' chat.

## Edge cases

- **No notices yet:** an empty state that says what a notice is for.
- **No audit entries yet:** an empty state that says every action is written
  down.
- **The copy didn't update:** the notice is saved anyway, and the toast says
  to save again to retry the copy.
- **The code expires with the session:** the next read is refused and the
  code screen shows again.

## Done when

- [ ] Only the owner, with their code, can open `/admin`, on iOS, Android and the web
- [ ] A status notice shows at the top of the app for everyone, and comes back a day after it's closed
- [ ] Every save and end is in the audit log, and the log can't be edited
