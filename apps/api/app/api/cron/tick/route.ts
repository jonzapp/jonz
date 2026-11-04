import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runDeletions } from "@/lib/account/deletions";
import { sendEmail } from "@/lib/email";
import { tickAll } from "@/lib/engine/tick";
import { sendOutbox } from "@/lib/moves/messages";
import { stopCarriedPasses } from "@/lib/pass/moves";
import { passStripe } from "@/lib/pass/stripe";
import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The clock's endpoint. pg_cron calls it every ten minutes through pg_net
 * (supabase/migrations/*_tick_schedule.sql) with the shared secret; Vercel
 * Cron can call it too, with the same header. It is the only caller that
 * sends pushes.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function tick(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createAdminClient();
  const now = new Date();
  const results = await tickAll(db, now, pushNotifier(db));
  // A House Pass its buyer left behind or carried too long stops renewing (lib/pass/moves.ts).
  const stripe = passStripe();
  if (stripe) {
    try {
      await stopCarriedPasses(db, stripe, now);
    } catch (e) {
      results.push({ houseId: "moving_pass", error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Accounts being deleted: their Pass stops (or starts again), and on the day they go (lib/account/deletions.ts).
  try {
    const run = await runDeletions(db, stripe, now);
    for (const error of run.errors) results.push({ houseId: "deletions", error });
  } catch (e) {
    results.push({ houseId: "deletions", error: e instanceof Error ? e.message : String(e) });
  }
  // The owner's messages still to push and email, for up to 20 seconds (lib/moves/messages.ts).
  try {
    await sendOutbox({ db, notify: pushNotifier(db), email: sendEmail }, { until: Date.now() + 20_000 });
  } catch (e) {
    results.push({ houseId: "messages", error: e instanceof Error ? e.message : String(e) });
  }
  const failed = results.filter((r) => r.error);
  return NextResponse.json(
    { houses: results.length, failed: failed.length, errors: failed.slice(0, 5) },
    { status: failed.length ? 500 : 200 },
  );
}

export const POST = tick;
export const GET = tick;
