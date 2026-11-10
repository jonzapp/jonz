import "server-only";

import { houseKind, JoinCode, type InviteCard } from "@app/core";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The house a join code opens, as its link's card shows it: its name and how
 * many live there, or null for a code that opens nothing (wrong, reset, or
 * its house is empty, as `house_by_code` treats them).
 *
 * A link-preview bot has no session, and `house_by_code` answers only a
 * signed-in caller, so this reads with the service role. It reads exactly
 * what that function would show anyone who signs in with the link, and
 * nothing else. Never throws: a card has to be drawn even when the database
 * can't be reached, or the chat shows a broken preview.
 */
export async function inviteFor(raw: string): Promise<{ code: string; invite: InviteCard | null } | null> {
  const parsed = JoinCode.safeParse(raw);
  if (!parsed.success) return null;
  const code = parsed.data;
  try {
    const admin = createAdminClient();
    const { data: house } = await admin.from("houses").select("id, name, kind").eq("join_code", code).maybeSingle();
    if (!house) return { code, invite: null };
    const { count } = await admin.from("members").select("user_id", { count: "exact", head: true }).eq("house_id", house.id);
    return { code, invite: count ? { name: house.name, members: count, kind: houseKind(house.kind) } : null };
  } catch {
    return { code, invite: null };
  }
}
