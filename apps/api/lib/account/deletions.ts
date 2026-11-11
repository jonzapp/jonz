import { accountDeletedEmail, deletedOnDay, languageOf, wordsFor, type Language } from "@app/core";

import { sendEmail } from "@/lib/email";
import type { AdminClient } from "@/lib/supabase/admin";
import type { PassStripe } from "@/lib/pass/stripe";

/** How the clock sends the last email: Resend in the app, a fake in tests. */
export type SendEmail = typeof sendEmail;

/** The bucket profile photos are kept in, each account's under its own id. */
const PHOTOS = "avatars";
/** Screenshots sent with reports (20261112090000_reports.sql): the database clears their paths, this the files. */
const SHOTS = "report-shots";

/** What one turn of the clock did with accounts being deleted. */
export interface DeletionRun {
  /** House Passes told to stop renewing, for accounts that started the 30 days. */
  stopped: number;
  /** House Passes started again, for accounts kept. */
  resumed: number;
  /** Accounts deleted for good. */
  finished: number;
  /** "Your account is deleted" emails Resend took. One that fails is logged and never holds a delete up. */
  emailed: number;
  /** One line for each account that failed this turn; the next turn tries it again. */
  errors: string[];
}

/**
 * The clock's part in deleting an account
 * (supabase/migrations/*_delete_account.sql), every ten minutes:
 *
 * 1. A House Pass the account pays for stops renewing as the 30 days start,
 *    unless it was stopping already. Which subscription it stopped is kept.
 * 2. If they keep the account, that subscription renews again.
 * 3. On the day (or sooner, when the owner says so), the account goes: a
 *    Pass it's carrying from a house it left stops renewing, the database
 *    takes it out of the house and takes its name away, then its photo
 *    file and its sign-in go, and the audit log says so. Then the address it
 *    had gets one last email saying it's done (docs/specs/email.md).
 *
 * Without Stripe the Pass steps wait, and the deletions still happen.
 */
export async function runDeletions(
  db: AdminClient,
  stripe: PassStripe | null,
  now: Date,
  send: SendEmail = sendEmail,
): Promise<DeletionRun> {
  const run: DeletionRun = { stopped: 0, resumed: 0, finished: 0, emailed: 0, errors: [] };
  if (stripe) {
    await stopPasses(db, stripe, now, run);
    await resumePasses(db, stripe, now, run);
  }
  await finishDue(db, stripe, now, run, send);
  return run;
}

async function stopPasses(db: AdminClient, stripe: PassStripe, now: Date, run: DeletionRun) {
  const { data: rows, error } = await db
    .from("account_deletions")
    .select("id, user_id")
    .eq("state", "pending")
    .is("pass_stopped_at", null);
  if (error) throw new Error(`Couldn't read the accounts being deleted: ${error.message}`);
  for (const row of rows ?? []) {
    try {
      let stoppedSub: string | null = null;
      const { data: houses, error: read } = await db
        .from("houses")
        .select("id, house_pass_billing(stripe_subscription_id)")
        .eq("pass_bought_by", row.user_id)
        .in("pass_plan", ["monthly", "yearly"]);
      if (read) throw new Error(read.message);
      for (const house of houses ?? []) {
        const sub = house.house_pass_billing?.stripe_subscription_id;
        if (!sub) continue;
        const view = await stripe.subscription(sub);
        // Already stopping (they cancelled it themselves) or over: nothing to stop, or to start again later.
        if (view.cancelAtPeriodEnd || !["active", "trialing", "past_due"].includes(view.status)) continue;
        await stripe.stopRenewing(sub);
        stoppedSub = sub;
        run.stopped += 1;
      }
      const { error: written } = await db
        .from("account_deletions")
        .update({ pass_stopped_at: now.toISOString(), stripe_subscription_id: stoppedSub })
        .eq("id", row.id);
      if (written) throw new Error(written.message);
    } catch (e) {
      run.errors.push(`stop pass ${row.id}: ${message(e)}`);
    }
  }
}

async function resumePasses(db: AdminClient, stripe: PassStripe, now: Date, run: DeletionRun) {
  const { data: rows, error } = await db
    .from("account_deletions")
    .select("id, stripe_subscription_id")
    .eq("state", "kept")
    .not("stripe_subscription_id", "is", null)
    .is("pass_resumed_at", null);
  if (error) throw new Error(`Couldn't read the accounts kept: ${error.message}`);
  for (const row of rows ?? []) {
    try {
      const view = await stripe.subscription(row.stripe_subscription_id!);
      // One that has run out by now can't renew again; there's nothing to start.
      if (view.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(view.status)) {
        await stripe.resumeRenewing(row.stripe_subscription_id!);
        run.resumed += 1;
      }
      const { error: written } = await db
        .from("account_deletions")
        .update({ pass_resumed_at: now.toISOString() })
        .eq("id", row.id);
      if (written) throw new Error(written.message);
    } catch (e) {
      run.errors.push(`resume pass ${row.id}: ${message(e)}`);
    }
  }
}

async function finishDue(db: AdminClient, stripe: PassStripe | null, now: Date, run: DeletionRun, send: SendEmail) {
  const { data: rows, error } = await db
    .from("account_deletions")
    .select("id, user_id, requested_by")
    .eq("state", "pending")
    .lte("deletes_at", now.toISOString())
    .order("deletes_at")
    .limit(50);
  if (error) throw new Error(`Couldn't read the accounts due to go: ${error.message}`);
  for (const row of rows ?? []) {
    try {
      // Read before it goes: the delete takes the name away and scrambles the address.
      const last = await lastLetter(db, row.user_id);
      if (stripe) await stopCarriedPass(db, stripe, row.user_id, now);
      const { error: finished } = await db.rpc("finish_account_deletion", { p_user: row.user_id });
      if (finished) throw new Error(finished.message);
      await removePhotos(db, row.user_id);
      await removeFolder(db, SHOTS, row.user_id);
      // Soft: Supabase scrambles the email and unlinks the sign-in, and the
      // profile the house's history points at stays.
      const { error: gone } = await db.auth.admin.deleteUser(row.user_id, true);
      if (gone && gone.status !== 404) throw new Error(gone.message);
      const { error: done } = await db
        .from("account_deletions")
        .update({ state: "done", ended_at: now.toISOString() })
        .eq("id", row.id);
      if (done) throw new Error(done.message);
      const { error: logged } = await db.from("admin_audit").insert({
        actor: null,
        action: "account.delete_done",
        target_kind: "account",
        target_id: row.user_id,
        after: { state: "done", requested_by: row.requested_by },
      });
      if (logged) throw new Error(logged.message);
      run.finished += 1;
      if (await sendLastLetter(send, last, row.id, now)) run.emailed += 1;
    } catch (e) {
      run.errors.push(`delete ${row.id}: ${message(e)}`);
    }
  }
}

/** Who the last email goes to, read while the account still has its name and address. */
interface LastLetter {
  address: string | null;
  /** Null on a retry, once the name is already "Someone who left". */
  name: string | null;
  /** Their own zone, else their house's: the day it went is said where they are. */
  zone: string | null;
  /** The language they read Jonz in, for the email's words. */
  language: Language;
}

async function lastLetter(db: AdminClient, userId: string): Promise<LastLetter> {
  const [account, profile, prefs, member] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("profiles").select("display_name, deleted_at, language").eq("id", userId).maybeSingle(),
    db.from("notification_prefs").select("timezone").eq("user_id", userId).maybeSingle(),
    db.from("members").select("houses(timezone)").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  return {
    // A sign-in already deleted (a turn that stopped part way) has a scrambled address: nobody to write to.
    address: account.error || account.data.user?.deleted_at ? null : (account.data.user?.email ?? null),
    name: profile.data && !profile.data.deleted_at ? profile.data.display_name : null,
    zone: prefs.data?.timezone ?? member.data?.houses?.timezone ?? null,
    language: languageOf(profile.data?.language),
  };
}

/**
 * "Your Jonz account is deleted", to the address it had. The account is
 * already gone, so a failed email is logged and nothing else: it never
 * fails the delete, and the idempotency key means a retry sends it once.
 */
async function sendLastLetter(send: SendEmail, last: LastLetter, deletionId: string, now: Date): Promise<boolean> {
  if (!last.address) return false;
  try {
    const result = await send(last.address, accountDeletedEmail({ name: last.name, deletedOn: deletedOnDay(now, wordsFor(last.language, "housemates"), last.zone), language: last.language }), {
      tag: "account-deleted",
      idempotencyKey: `account-deleted-${deletionId}`,
    });
    return result.sent;
  } catch (e) {
    console.error(`email: account-deleted ${deletionId}: ${message(e)}`);
    return false;
  }
}

/** A Pass the account carries from a house it left (lib/pass/moves.ts) stops renewing: nobody is left to place it. */
async function stopCarriedPass(db: AdminClient, stripe: PassStripe, userId: string, now: Date) {
  const { data: rows, error } = await db
    .from("moving_pass_billing")
    .select("move_id, stripe_subscription_id, moves!inner(user_id, pass_state, pass_stopped_at)")
    .eq("moves.user_id", userId)
    .is("moves.pass_stopped_at", null)
    .in("moves.pass_state", ["waiting", "left"])
    .not("stripe_subscription_id", "is", null);
  if (error) throw new Error(error.message);
  for (const row of rows ?? []) {
    await stripe.stopRenewing(row.stripe_subscription_id!);
    const { error: written } = await db
      .from("moves")
      .update({
        pass_stopped_at: now.toISOString(),
        ...(row.moves.pass_state === "waiting" ? { pass_state: "lapsed" } : {}),
      })
      .eq("id", row.move_id);
    if (written) throw new Error(written.message);
  }
}

/** Every file in the account's photo folder. */
async function removePhotos(db: AdminClient, userId: string) {
  await removeFolder(db, PHOTOS, userId);
}

/** Every file in the account's folder of a bucket, a hundred at a time. */
async function removeFolder(db: AdminClient, name: string, userId: string) {
  const bucket = db.storage.from(name);
  for (;;) {
    const { data: files, error } = await bucket.list(userId, { limit: 100 });
    if (error) throw new Error(`${name}: ${error.message}`);
    const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
    if (paths.length === 0) return;
    const { error: removed } = await bucket.remove(paths);
    if (removed) throw new Error(`${name}: ${removed.message}`);
    if (paths.length < 100) return;
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
