# Report a problem

## What it does

Anyone signed in can tell Jonz about a problem, send an idea or ask a
question from inside the app, without GitHub or an email app. The owner
answers from the admin Inbox. Glyn picked option A on 31 October 2026, from
the options page (https://claude.ai/artifact/9MRXJf6wot9i58tDLEydh6).

It came in three steps: step 1 (the app's sheet, Your reports and the
Inbox), step 2 (email both ways, the From filter and jonz.app/help) and
step 3 (the crash screen, "Same as" and telling everyone when it's fixed).
What's still to come is under "Later".

## In the app

- **Help on House**, between You and Leave: Report a problem, Send an idea,
  and Your reports (with "A reply to read" and a count when one is waiting).
  Under it, "Or email support@jonz.app."
- **The sheet**: Problem, Idea or Question; what happened (up to 2,000
  letters); up to three screenshots from the photo library, shrunk to 1600px
  JPEGs; and "Send the details that help", ticked, listing exactly what goes:
  - the last two pages they were on ("Today, then House", no ids or codes),
  - the app or browser ("Jonz on the web, Safari 18, iPhone"),
  - their house's name,
  - the last error the app showed (from React Query's caches).
  Unticking it sends none of them. One amber button sends; then the report
  opens under Your reports.
- **Your reports**: newest first, each with its state as the sender sees it
  (Sent, Read, Replied, Fixed) or a badge when a reply is unread. Opening one
  shows the conversation in the setup chat's look and marks replies read; a
  box at the bottom writes back.

## The Inbox

- **First admin page.** `/admin` opens on it. It is a busy list
  (`docs/specs/owner-admin.md`): one search box (name, email, house, words or
  an id's start), State (Waiting: new or open; New; Replied; Fixed; Any)
  and Kind, When as "Sent", 50 at a time. With no State picked it opens on
  every report in two groups, each newest first with its count: Needs a
  reply (waiting), then Everything else (answered: replied, fixed, or folded
  into another), so an answered one can be followed up any time. The search
  narrows both groups; a group with no matches is left out. Picking a State
  shows that state as one list.
- **One report**: beside the list on a laptop, a page of its own on a phone.
  Who sent it, their house, role and email; the conversation with
  screenshots; the details; a reply box; Mark fixed (or Open it again).
  Opening a new one marks it read (open), which its sender sees as Read.
- **States**: new (nobody at Jonz has read it, or its sender wrote back),
  open (read, not answered), replied, fixed.

## Telling the other side

`apps/api` sends, writes back and replies (`lib/moves/reports.ts`), each
after the caller's own database call:

- `POST /api/reports`: every owner gets a push, "Ava sent a problem".
- `POST /api/reports/:id/messages`: the sender writes back; every owner gets
  "Ava wrote back".
- `POST /api/reports/:id/reply`: the owner replies; the sender gets a push,
  "Glyn at Jonz replied", and an email (`reportReplyEmail`) whose reply goes
  to support@jonz.app.

These pushes are kind `support`: no switch turns them off (they answer
something you asked), and quiet hours still make them silent.

## Safety

- Only signed-in people can send; five reports a day each, and twenty
  write-backs.
- Screenshots go to the private `report-shots` bucket, in the sender's own
  folder; `send_report` checks each path is theirs and uploaded. Only the
  sender and the owner (with their code) can open them, through links that
  expire after an hour. The bucket takes JPEGs up to 5 MB.
- The owner reads through owner-only functions that check `is_owner()`
  (second factor this session). Every reply, fix and reopen goes in the
  audit log, with the reply's words.
- Deleting an account clears its reports' screenshots (`finish_account_deletion`
  and the API's folder removal); the Inbox then shows "Someone who left", no
  email, and has nobody to reply to.
- The Privacy Policy has a "Reports, ideas and questions" section.

## The data

`supabase/migrations/20261112090000_reports.sql`: `reports`,
`report_messages`, the `report-shots` bucket, `send_report`, `my_reports`,
`see_report`, `write_back`, `owner_reports_find` / `_page` / `_count`,
`owner_open_report`, `owner_reply_report`, `owner_set_report_state`.

## Email both ways (step 2)

- **In.** Resend receives mail for jonz.app and posts `email.received` to
  `POST /api/email/inbound` (`lib/inbound.ts`), signed the Svix way with
  `RESEND_WEBHOOK_SECRET`. The event carries only who and what about, so the
  API reads the email from Resend's Receiving API with
  `RESEND_RECEIVING_KEY` (the sending key can't read mail). Without both
  settings it answers 503 and the mail waits in Resend's own inbox.
- **What's kept.** Only mail to support@ (or hello@, for mail apps that
  ignore Reply-To). Automatic replies, bounces and Jonz's own mail are left
  out, so nothing loops. The words are what was written this time: the text
  part (or the HTML's words), stopping where the quoted history or a
  signature starts (`emailWords` in `packages/core/src/inbound-email.ts`), up
  to 2,000 letters. Attachments aren't kept.
- **New report or write-back.** Every reply email from Jonz carries
  "(ref 1a2b3c4d)" in its subject. An answer carrying a report's reference,
  from that report's own sender, writes back on it (and puts it back in
  Waiting as new). So does an email with the same subject from the same
  address to an emailed report that isn't fixed, within 30 days. Anything
  else is a new report, a question. Resend's retries are one report.
- **Whose it is.** When the email passed DMARC and its address is a Jonz
  account's, the report is that person's: it shows under their Your reports
  and replies reach the app too. Otherwise it belongs to the address alone.
- **Limits.** Ten new reports and thirty write-backs a day from one address.
- **The Inbox.** A From filter (App or email), a By column on a laptop, the
  address and subject on the report, and "Reply to Sam by email" when there's
  no account. The owner hears "Sam emailed support".
- **Out.** A reply to an emailed report goes back by email, under its
  subject with the reference, with no app link.
- **jonz.app/help**, open to anyone: from inside Jonz, by email, your account
  and data, security problems. The README, CONTRIBUTING and GitHub's new
  issue page send people there; the issue templates are gone.

## The crash screen, Same as, and fixed (step 3)

- **Tell us what happened.** The screen that says something went wrong has a
  button that opens the report sheet on a problem, with what broke as its
  last error. Signed out, it gives the support address instead.
- **Same as…** On a report, the owner searches for the one it repeats and
  folds it in. It leaves Waiting; the main one shows "2 more people reported
  this" with each of them, and the folded one shows "Same as Ava's report"
  with Not the same. Folding onto a folded report lands on the one it's
  folded into, and a pile folded into another comes along.
- **Mark fixed** opens a sheet: what changed (optional) and "Tell all 3
  people it's fixed" (ticked). It fixes the report and its pile; with the
  tick, each of them gets the note (or "This is fixed now. Thank you for
  telling us.") in their conversation, a push "Fixed: the problem you
  reported" and an email, or the email alone for an emailed report. Each
  is told once: an already-fixed report isn't told again. The audit log
  keeps how many were fixed and told, and the note.

## The data, steps 2 and 3

`supabase/migrations/20261115090000_reports_email.sql`: on `reports`,
`source`, `from_email`, `from_name`, `subject`, `email_id` and `same_as`; on
`report_messages`, `email_id`; `receive_email` (the server's alone), the
Inbox's reads with `p_from`, `owner_same_as`, `owner_same_as_find`,
`owner_fix_report`; and `finish_account_deletion` also forgets an emailed
report's address and name.

## Setting up email in

Once, in Resend: a webhook for `email.received` to
`https://api.jonz.app/api/email/inbound`, and an API key with full access.
Then, on the jonz-api Vercel project (production), `RESEND_WEBHOOK_SECRET`
(the webhook's signing secret) and `RESEND_RECEIVING_KEY` (that key).

## The support agent

Jonz suggests what to do on each report, and asks before it acts.

- **When.** The owner opens a report that's waiting (new or open, with
  someone to answer, and the sender spoke last). The report shows Jonz
  thinking for a few seconds, then a card, "Jonz suggests", above the reply
  box. Nothing runs before the owner opens it, so there are no new pushes.
- **What it suggests.** A reply in plain words, written as the owner, and
  at most one step with it: fold it into the report it repeats ("Same as
  Ben's report"), or start the 30 days for someone who clearly asked to be
  deleted. Under it, why, with chips, and what it checked: their House
  Pass and who pays, the report it repeats. Money (a refund) is never a
  step: it says to do that in Stripe.
- **Asks before it acts.** One amber button sends the reply and does the
  step ("Send, and fold into Ben's"); starting the 30 days asks again on a
  sheet. "Change it first" puts the words in the reply box. "Not this" sets
  it aside. The steps are the Inbox's own calls, so the database checks and
  the audit log are the same as by hand.
- **As the owner.** `POST /api/reports/:id/draft` answers only the owner
  with their code this session. Every read goes through their session, as
  the owner's Ask Jonz does: their house (`owner_house`), their other
  reports, reports like it (`owner_same_as_find`), Deletions, the Audit log
  and how it works. Nothing uses the service role. The report's words reach
  Claude marked `<from_people>`, never as instructions.
- **The same loop.** `runAgent` in `apps/api/lib/ai/agent.ts` with its own
  instructions, reads-only tools and answer
  (`apps/api/lib/ai/support-draft.ts`, `lib/moves/support-draft.ts`). The
  card draws its reasons with the shared reply pieces and the owner's chips,
  and the thinking indicator while it writes.
- **Kept.** `support_drafts`: one for each thing the sender said, so
  opening it again shows the same one and Claude is asked once; a write-back
  gets a new one. Only the owner reads it, written only by
  `claim_support_draft` and `finish_support_draft`, used or set aside with
  `owner_set_support_draft`. `SUPPORT_DRAFTS_PER_DAY` (200) a day; past it,
  or without Claude, the report just has its reply box.

## Later

- Support agent suggestions in the background, with a push to approve; Ask Jonz filing a report, shake to
  report in the phone apps, automatic crash reports, and keeping email
  attachments.
