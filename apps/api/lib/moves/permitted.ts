import "server-only";

import type { Permission } from "@app/core";

import type { Caller, Refusal } from "./disputes";

/**
 * Whether the caller may do `permission` in the house, asked through their
 * own session (public.can, which reads role_permissions), so the API checks
 * exactly what the database does. A refusal says which: not in the house,
 * or in it without the permission (`admins_only`, the words the app
 * already shows for a move only an admin may make).
 */
export async function permitted(caller: Caller, houseId: string, permission: Permission): Promise<Refusal | null> {
  const mine = await myPermissions(caller, houseId);
  // Everyone in a house may see it, so no permissions at all is someone outside it.
  if (mine.length === 0) return { code: "42501", message: "not_in_house" };
  return mine.includes(permission) ? null : { code: "42501", message: "admins_only" };
}

/** Everything the caller may do in the house (none: not in it), asked as `permitted` asks. */
export async function myPermissions(caller: Caller, houseId: string): Promise<Permission[]> {
  const { data, error } = await caller.db.rpc("my_permissions", { h: houseId });
  if (error) throw new Error(`Couldn't read what you may do: ${error.message}`);
  return (data ?? []) as Permission[];
}
