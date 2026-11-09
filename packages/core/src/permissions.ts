// Who can do what in a house: one list for the database, the API, the app
// and Ask Jonz. The database holds the same list in `role_permissions`
// (supabase/migrations/20261118090000_permissions.sql) and enforces it with
// `public.can(house, permission)`; a database test checks the two lists
// match, so change both together. Roles are per house: an admin (a Parent
// in a family) and a member (a Kid in a family). The admin pages have their
// own roles and permissions, checked by `can_app()` (owner-moves.ts).

/** A house role, as `members.role` holds it. */
export const HOUSE_ROLES = ["admin", "member"] as const;
export type HouseRole = (typeof HOUSE_ROLES)[number];

/**
 * Permissions are named Stripe's way: a resource and a level,
 * `resource:read`, `resource:write_own` (only your own rows: your ticks,
 * your time away, your flag) or `resource:write` (anyone's). A role that
 * may write a resource may also do the lower levels on it, and the lists
 * below always say so in full (a test checks), so a check never has to
 * work levels out. The same strings will be the scopes an outside app (an
 * MCP client) asks for.
 */
export const PERMISSION_LEVELS = ["read", "write_own", "write"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/**
 * Every permission, with what it lets someone do in plain words (Ask Jonz
 * reads these). The first group is everyone's; the rest are an admin's.
 */
export const PERMISSIONS = {
  // Everyone in the house.
  "house:read": "See the house: its Johns, the week, the Wall, history, balances, time away and people",
  "ticks:write_own": "Tick off your own Johns, and take a tick back",
  "away:write_own": "Book and cancel your own time away",
  "swaps:write_own": "Ask someone to swap a John, answer a swap ask, and cover someone else's overdue John",
  "flags:write_own": "Flag an on-call John, and take back your own flag",
  "disputes:write_own": "Question a tick, and vote on one",
  "wall:write_own": "React on the Wall",
  "perks:write_own": "Use an immunity or a swap token",
  "profile:write_own": "Change your own name, photo, notification settings and preferences",
  "members:write_own": "Leave the house",
  // Admins (Parents in a family).
  "house:write": "Change the house's name and rules, and make a new join code",
  "johns:write": "Add Johns to the list, change them, and take them off",
  "groups:write": "Make, change and delete groups",
  "weeks:write": "Deal the week",
  "history:write": "Put a result, a week or a month's forfeits right, and undo anyone's move from History",
  "flags:write": "Remove anyone's flag",
  "ticks:write": "OK a kid's tick, or send it back",
  "pocket_money:write": "Mark pocket money paid",
  "members:write": "Remove someone from the house, make someone an admin or hand admin over, and add a child without a sign-in and act for them",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

/** The resource a permission is about: `johns` for `johns:write`. */
export function permissionResource(permission: string): string {
  return permission.slice(0, permission.indexOf(":"));
}

/** The level a permission grants: `write` for `johns:write`. */
export function permissionLevel(permission: string): PermissionLevel {
  return permission.slice(permission.indexOf(":") + 1) as PermissionLevel;
}

const EVERYONE: Permission[] = [
  "house:read",
  "ticks:write_own",
  "away:write_own",
  "swaps:write_own",
  "flags:write_own",
  "disputes:write_own",
  "wall:write_own",
  "perks:write_own",
  "profile:write_own",
  "members:write_own",
];

/** What each role may do. An admin may do everything a member may. */
export const ROLE_PERMISSIONS: Record<HouseRole, readonly Permission[]> = {
  member: EVERYONE,
  admin: PERMISSION_NAMES,
};

/** Whether someone with this role (or no role: not in the house) may do it. */
export function can(role: HouseRole | null | undefined, permission: Permission): boolean {
  return role != null && ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether this member of the house (or nobody) may do it: the shape the app's views hold. */
export function memberCan(member: { role: HouseRole } | null | undefined, permission: Permission): boolean {
  return can(member?.role, permission);
}
