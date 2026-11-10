import "server-only";

import { wordsFor, type DeleteHouseRequest, type DeleteHouseResponse } from "@app/core";

import type { PassStripe } from "@/lib/pass/stripe";

import type { Caller, Refusal } from "./disputes";
import { messageOutbox, sendOutbox, type MessageOutbox } from "./messages";

/** The owner's admin pages, and what they send, are in English for now. */
const words = wordsFor("en", "housemates");

/**
 * The owner deletes a whole house (docs/specs/owner-admin.md, "Houses";
 * houses:write). The owner's own call to the database
 * (owner_delete_house) checks it's an owner with their code, leaves the
 * message to everyone in it in the outbox, writes the audit entry and
 * deletes the house; then this sends that message and stops the Pass it
 * paid with renewing in Stripe. A Pass that can't be stopped is said so
 * (the house is gone either way); the clock sends any message left.
 */
export async function deleteHouse(
  caller: Caller,
  houseId: string,
  request: DeleteHouseRequest,
  stripe: PassStripe | null,
  out: MessageOutbox = messageOutbox(),
  until = Date.now() + 30_000,
): Promise<{ refusal: Refusal } | Omit<DeleteHouseResponse, "ok">> {
  const { data: house } = await caller.db.rpc("owner_house", { p_house: houseId });
  const name = (house as { name?: string } | null)?.name;
  if (!name) return { refusal: { message: "not_found" } };

  const { data, error } = await caller.db.rpc("owner_delete_house", {
    p_house: houseId,
    p_reason: request.reason,
    p_subject: request.tell ? words('admin.deleteHouse.subject', { name }) : undefined,
    p_body: request.tell ? words('admin.deleteHouse.message', { name }) : undefined,
  });
  if (error || !data) return { refusal: error ?? { message: "not_found" } };
  const done = data as { name: string; people: number; subscription: string | null; message: string | null };

  let told = 0;
  if (done.message) {
    try {
      told = await sendOutbox(out, { message: done.message, until });
    } catch (e) {
      // The clock sends what's left; the house is gone either way.
      console.error("house_delete_tell_failed", e instanceof Error ? e.message : e);
    }
  }

  let passStopped: boolean | null = null;
  if (done.subscription) {
    try {
      if (!stripe) throw new Error("no Stripe here");
      const view = await stripe.subscription(done.subscription);
      if (!view.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(view.status)) await stripe.stopRenewing(done.subscription);
      passStopped = true;
    } catch (e) {
      console.error("house_delete_pass_failed", done.subscription, e instanceof Error ? e.message : e);
      passStopped = false;
    }
  }
  return { name: done.name, people: done.people, told, passStopped };
}
