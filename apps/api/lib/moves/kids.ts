import "server-only";

import { type AddKid } from "@app/core";

import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";
import { permitted } from "./permitted";

/** Where a kid's account says it lives: a domain that can't exist, so no email is ever sent there (lib/email.ts). */
export const KID_DOMAIN = "kids.jonz.invalid";

/**
 * A parent adds a child who won't sign in (family step 4). Asked first
 * through the parent's own session, so a kid's account is only ever made
 * for a parent in a family. Then the service makes the account, banned and
 * at an address nobody reads, with the child's name on its profile, and
 * add_kid puts the child in the family; if that refuses, the account goes.
 */
export async function addKid(caller: Caller, kid: AddKid): Promise<{ userId: string } | Refusal> {
  const { data: mine } = await caller.db
    .from("members")
    .select("house_id, houses(kind)")
    .eq("user_id", caller.userId)
    .maybeSingle();
  if (!mine || mine.houses?.kind !== "family" || (await permitted(caller, mine.house_id, "people.kids"))) {
    return { message: "parents_add_kids", code: "42501" };
  }

  const admin = createAdminClient();
  const { data: made, error } = await admin.auth.admin.createUser({
    email: `kid-${crypto.randomUUID()}@${KID_DOMAIN}`,
    email_confirm: true,
    user_metadata: { display_name: kid.name, kid: true },
    // About a hundred years: nobody signs in as a kid; a parent runs the profile.
    ban_duration: "876000h",
  });
  if (error || !made.user) throw new Error(`kid account: ${error?.message ?? "none made"}`);

  const { error: refusal } = await admin.rpc("add_kid", { p_parent: caller.userId, p_kid: made.user.id, p_born: kid.bornYear });
  if (refusal) {
    await admin.auth.admin.deleteUser(made.user.id);
    return refusal;
  }
  return { userId: made.user.id };
}
